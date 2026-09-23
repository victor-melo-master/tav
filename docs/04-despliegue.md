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
| `CORS_ORIGIN` | Orígenes permitidos para CORS: panel admin y localhost de desarrollo (sin slash final) | `https://panel.tav.rolapro.com,http://localhost:3000` |

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

    # Uploads de comprobantes: 5MB (límite del servidor)
    client_max_body_size 5m;
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

Hay tres scripts en `scripts/` que automatizan el despliegue desde tu máquina
local. Usan el alias `tav` configurado en `~/.ssh/config` (ver sección 1.5).

### `scripts/deploy.sh`

Sincroniza `apps/api` y `docker-compose.prod.yml` al servidor con rsync,
reconstruye los contenedores, y verifica que la API responde — local y público.

```bash
./scripts/deploy.sh
```

Qué hace, paso a paso:

1. **rsync** de `apps/api/` a `/opt/tav/apps/api/` y de `docker-compose.prod.yml`
   a `/opt/tav/`. Excluye `node_modules`, `dist`, `.env`, `.env.*`, `.git`,
   `coverage` y `*.log`. **Nunca toca `.env.prod` del servidor**: los secretos
   de producción viven ahí y no se sincronizan desde fuera.
2. **`docker compose up -d --build`** en el servidor, con `--env-file .env.prod`.
   El `prisma migrate deploy` del CMD aplica migraciones nuevas al arrancar.
3. **Espera a que la API responda** en `http://127.0.0.1:3001/health` (hasta 60s).
   Si no responde, aborta con código 2 y muestra los últimos 30 renglones del
   log del contenedor `api`.
4. **Verifica el endpoint público** `https://api.tav.rolapro.com/health`. Si no
   responde, aborta con código 3 y muestra los logs.

Códigos de salida:

| Código | Qué pasó |
|--------|----------|
| 0 | Despliegue OK, `/health` responde local y público. |
| 1 | Error en rsync o build. |
| 2 | La API no respondió en 60s tras el build. |
| 3 | El endpoint público no responde tras el build. |

### `scripts/logs.sh`

Muestra los logs de la API en vivo (`docker compose logs -f api`).

```bash
./scripts/logs.sh                # logs de la API en vivo
./scripts/logs.sh --tail 100     # últimas 100 líneas y sigue
./scripts/logs.sh --db           # logs de Postgres en vivo
```

### `scripts/ssh.sh`

Abre una sesión SSH en `/opt/tav` del servidor.

```bash
./scripts/ssh.sh                 # shell en /opt/tav
./scripts/ssh.sh --db            # psql dentro del contenedor de Postgres
```

### Configuración del alias SSH

Los scripts asumen que `~/.ssh/config` tiene el alias `tav`:

```sshconfig
Host tav
    HostName 46.62.154.26
    Port 49170
    User root
    IdentityFile ~/.ssh/id_ed25519
```

### Procedimiento manual (alternativa)

Si necesitas desplegar a mano sin los scripts:

```bash
# Sincronizar código (sin tocar .env.prod)
rsync -avz --delete \
  --exclude='node_modules' --exclude='dist' \
  --exclude='.env' --exclude='.env.*' --exclude='.git' \
  -e ssh apps/api/ tav:/opt/tav/apps/api/
rsync -avz --exclude='.env' --exclude='.env.*' \
  -e ssh docker-compose.prod.yml tav:/opt/tav/

# Reconstruir y levantar
ssh tav "cd /opt/tav && \
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"

# Verificar
ssh tav "curl -f http://127.0.0.1:3001/health"
curl -f https://api.tav.rolapro.com/health
```

## 8. Migraciones que requieren reset de la base

Algunas migraciones cambian la semántica de los datos, no solo la estructura.
Cuando eso pasa, no se puede migrar in-place: los valores viejos mienten bajo
el esquema nuevo. La base de producción se resetea y se vuelve a sembrar.

### Fase 9 Bloque 1 — moneda base del libro pasa a GYD

**Migración:** `20260908000000_fase9_bloque1_moneda_base_gyd`

**Por qué hay que resetear:** la migración renombra `montoUsdCents` →
`montoCents` (Movimiento) y `montoUsdCents` → `montoBaseCents` (Cobro), pero
**no convierte los valores**. Los valores que ya están en la base son
centavos de dólar. Si se dejan, un cajero que debía 500 USD aparece debiendo
500 GYD (≈ 2,5 USD) bajo una columna que dice GYD. El libro deja de cuadrar
y no hay forma de reconstruirlo sin saber qué fila era USD y cuál GYD.

**Procedimiento (obligatorio antes de desplegar esta migración):**

```bash
# 1. Hacer backup por si acaso
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U tav tav > backup_pre_fase9_gyd_$(date +%Y%m%d).sql

# 2. Entrar al contenedor de la API
docker compose -f docker-compose.prod.yml exec api sh

# 3. Resetear la base y aplicar migraciones. El seed aborta en producción
#    por el guarda anti-production (NODE_ENV=production), así que hay que
#    sobreescribir la variable de entorno para que corra:
NODE_ENV=development npx prisma migrate reset --force

# 4. Verificar que los saldos cuadran
npx ts-node prisma/verify.ts

# 5. Salir del contenedor
exit
```

> **Advertencia:** `prisma migrate reset` borra todos los datos de la base.
> Solo se hace cuando la migración cambia la semántica de los valores, no
> la estructura. Si hay datos de producción que no están en el seed (usuarios
> reales, operaciones reales), hay que migrarlos a mano después del reset.
> En el momento de Fase 9, la base de producción todavía no tiene datos
> reales: el sistema no está en uso. Cuando entre en uso, este procedimiento
> ya no aplica y la migración de moneda tendría que ser una conversión
> in-place, no un reset.

---

## 9. Backup de la base de datos

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

---

## Lo que sobrevive a un despliegue

`deploy.sh` reconstruye los contenedores en cada despliegue. Todo lo que viva
dentro del contenedor se pierde. Para que los datos sobrevivan, viven en
**volúmenes de Docker** o **carpetas del servidor** que el contenedor monta al arrancar.

| Qué | Volumen / carpeta | Montado en | Dónde vive en el servidor |
|---|---|---|---|
| Base de datos | `tav_pgdata_prod` (volume de Docker) | `/var/lib/postgresql/data` (contenedor db) | Volume de Docker (gestionado por Docker) |
| Capturas de pago | `/opt/tav-uploads` (bind mount) | `/data/uploads` (contenedor api) | `/opt/tav-uploads` en el host |

### Capturas de pago

Las capturas que suben los pagadores (comprobantes de transferencia, pago
móvil, etc.) se guardan en `/data/uploads` dentro del contenedor de la API,
que es un **bind mount** a `/opt/tav-uploads` en el servidor — fuera de
`/opt/tav/apps`. **Si se guardaran dentro del contenedor, cada `deploy.sh`
las borraría** — y son la única información del sistema que no se puede
regenerar: si un cajero reclama un pago de hace un mes, el comprobante
tiene que seguir ahí.

El bind mount apunta a `/opt/tav-uploads` en el host. Docker crea la
carpeta si no existe. No se borra al reconstruir el contenedor. Los
archivos son visibles directamente desde el servidor:

```bash
ls -la /opt/tav-uploads/
```

> **Backup:** las capturas no están en la base de datos, así que el
> `pg_dump` de la sección 9 no las respalda. Hay que respaldar la carpeta
> por separado:
>
> ```bash
> tar czf /opt/backups/uploads_$(date +%Y%m%d).tar.gz -C /opt/tav-uploads .
> ```

### Verificar que una captura sobrevive a un despliegue

```bash
# 1. Subir una captura de prueba (requiere un token de pagador o admin)
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  -F "file=@/tmp/test.jpg" \
  https://api.tav.rolapro.com/uploads/comprobante
# → {"url":"/uploads/abc-123.jpg","filename":"abc-123.jpg",...}

# 2. Verificar que el archivo está en el servidor
ls /opt/tav-uploads/
# → abc-123.jpg

# 3. Desplegar
./scripts/deploy.sh

# 4. Verificar que el archivo sigue ahí
ls /opt/tav-uploads/
# → abc-123.jpg sigue presente
```
