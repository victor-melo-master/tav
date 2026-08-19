# Despliegue de TAV en producción

Servidor: Ubuntu 24.04 con Docker 28, Compose v2 y aaPanel gestionando nginx.

TAV queda encapsulado en Docker. No se instala nada en el sistema del servidor
más allá de lo que ya tiene Docker. aaPanel no se modifica: solo se añade un
sitio con proxy inverso hacia `127.0.0.1:3001`.

---

## Arquitectura

```
Internet → nginx (aaPanel, :80/:443) → 127.0.0.1:3001 (API en Docker)
                                           │
                                   red interna Docker
                                           │
                                    postgres:16 (sin puerto expuesto)
```

- **Postgres** no publica puerto al host. Solo la API la alcanza, dentro de la
  red `tav_internal` de Docker. No es accesible desde internet ni desde otros
  servicios del servidor.
- **API** publica únicamente en `127.0.0.1:3001`. Nunca en `0.0.0.0`. Solo nginx
  puede llegar a ella.
- **nginx** (aaPanel) termina TLS y hace proxy hacia la API.

---

## 1. Clonar el repositorio

```bash
cd /opt
git clone <repo-url> tav
cd tav
```

## 2. Crear .env.prod

```bash
cp .env.prod.example .env.prod
```

Genera secretos fuertes:

```bash
openssl rand -base64 32   # para POSTGRES_PASSWORD
openssl rand -base64 32   # para JWT_SECRET
```

Edita `.env.prod`:

```bash
nano .env.prod
```

Valores a rellenar:

| Variable | Qué es | Ejemplo |
|---|---|---|
| `POSTGRES_PASSWORD` | Password de la base de datos | (generado con openssl) |
| `DATABASE_URL` | URL de conexión (usa la misma password) | `postgresql://tav:PASSWORD@db:5432/tav?schema=public` |
| `JWT_SECRET` | Secreto para firmar tokens JWT | (generado con openssl) |
| `JWT_EXPIRES_IN` | Duración del access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token | `30d` |
| `NODE_ENV` | Entorno | `production` |
| `CORS_ORIGIN` | Dominio del panel admin (sin slash final) | `https://admin.tudominio.com` |

> **Nunca commitea .env.prod.** Está en `.gitignore`.

## 3. Levantar

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

La primera vez tarda unos minutos: descarga imágenes, compila la API,
genera el cliente de Prisma y aplica migraciones.

## 4. Verificar

```bash
# La API responde en localhost:3001
curl http://127.0.0.1:3001/health
# → {"status":"ok","timestamp":"..."}

# Los contenedores están corriendo
docker compose -f docker-compose.prod.yml ps

# Los logs no tienen errores
docker compose -f docker-compose.prod.yml logs api --tail 20
```

## 5. Configurar nginx en aaPanel

1. En aaPanel: **Website → Add site**.
2. Dominio: `admin.tudominio.com` (o el que hayas puesto en `CORS_ORIGIN`).
3. Sin PHP, sin base de datos. Solo nginx.
4. Entra a la configuración del sitio → **Reverse Proxy → Add proxy**.
5. O edita directamente el archivo de configuración nginx del sitio y pega:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket (para futuras notificaciones en tiempo real)
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Timeouts generosos: las operaciones con Prisma pueden tardar
    proxy_connect_timeout 30s;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;

    # Uploads de comprobantes: 10MB
    client_max_body_size 10m;
}
```

6. Activa SSL con Let's Encrypt desde aaPanel (botón **SSL** en el sitio).
7. Verifica desde fuera del servidor:

```bash
curl https://admin.tudominio.com/health
# → {"status":"ok","timestamp":"..."}
```

## 6. Crear el usuario admin

El seed no corre en producción (tiene guarda anti-production). El primer
usuario admin se crea manualmente desde dentro del contenedor:

```bash
# Entrar al contenedor de la API
docker compose -f docker-compose.prod.yml exec api sh

# Crear el admin con un script de una sola vez
node -e "
  const { PrismaClient } = require('@prisma/client');
  const argon2 = require('argon2');
  const prisma = new PrismaClient();
  (async () => {
    const hash = await argon2.hash('CAMBIAR_ESTA_PASSWORD');
    await prisma.usuario.create({
      data: {
        id: require('crypto').randomUUID(),
        rol: 'admin',
        nombre: 'Administrador',
        telefono: '+584120000001',
        passwordHash: hash,
        creadoPorId: null,
      },
    });
    console.log('Admin creado: +584120000001');
    await prisma.\$disconnect();
  })();
"
```

> Cambia `CAMBIAR_ESTA_PASSWORD` por una contraseña real y fuerte.

## 7. Desplegar una actualización

```bash
cd /opt/tav

# Traer el código nuevo
git pull origin main

# Reconstruir y reiniciar
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Verificar
curl http://127.0.0.1:3001/health
docker compose -f docker-compose.prod.yml logs api --tail 20
```

El `prisma migrate deploy` del CMD aplica automáticamente las migraciones
nuevas al arrancar. No hay que correrlo a mano.

## 8. Backup de la base de datos

```bash
# Backup completo
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U tav tav > backup_$(date +%Y%m%d).sql

# Restaurar
cat backup_YYYYMMDD.sql | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U tav tav
```

Programa un cron diario:

```bash
0 3 * * * cd /opt/tav && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U tav tav > /opt/backups/tav_$(date +\%Y\%m\%d).sql
```

---

## Notas de seguridad

- **Postgres no tiene puerto expuesto.** Si alguien escanea el servidor, no ve
  la base de datos.
- **La API solo escucha en 127.0.0.1.** No es accesible directamente desde
  internet; hay que pasar por nginx.
- **JWT_SECRET y POSTGRES_PASSWORD** no tienen valores por defecto. Si faltan,
  el contenedor falla al arrancar en vez de usar algo inseguro.
- **El seed aborta en producción.** Los usuarios con contraseña `tav1234` no
  pueden llegar al servidor.
- **CORS** solo acepta el dominio configurado en `CORS_ORIGIN`.
