# TAV

Casa de cambio y remesas que opera **a crédito** con revendedores (*cajeros*).
Tres roles, un solo libro de cuentas compartido.

> El dinero de la app es ficticio: no se mueve plata por aquí.
> Todo pago real ocurre por fuera. La app existe para que todos miren el mismo número.

---

## Empieza por aquí

| Archivo | Qué es |
|---|---|
| **`AGENTS.md`** | Reglas que ningún agente de IA puede romper. Léelo primero. |
| `docs/01-reglas-de-negocio.md` | Lo que dijo el cliente. Lo que no está ahí, no está decidido. |
| `docs/02-modelo-de-datos.md` | Schema Prisma y las dos transacciones críticas. |
| `docs/03-plan-de-construccion.md` | Las 8 fases, con los prompts listos para Windsurf. |
| `design/index.html` | Prototipos navegables y sistema de diseño. **Ábrelo en el navegador.** |

---

## Los tres roles

**Cajero** — revendedor. Opera a crédito, tiene un límite que fija el admin.
Al topar el límite se le bloquean las transacciones: eso lo obliga a pagar sin que nadie lo llame.

**Cobrador** — recorre zonas cobrando. Registra cada cobro al instante, cierra su día
y entrega el efectivo. Varios cobradores comparten una sola lista de deudores.

**Admin** — uno solo. Fija límites, aprueba ampliaciones, verifica los cierres diarios.

Cajero y cobrador viven en **la misma app móvil**; el rol decide qué ve al entrar.
El admin usa un panel web.

---

## Stack

```
apps/api      NestJS + Prisma + PostgreSQL 16 + Socket.IO
apps/mobile   Flutter · cajero y cobrador en un binario · Drift para offline
apps/admin    Next.js 15 + shadcn/ui
```

Despliegue con Docker Compose en VPS propio. Menos de 50 usuarios: no hace falta más.

### Despliegue de la API

Hay tres scripts en `scripts/` que automatizan el despliegue desde tu máquina.
Usan el alias `tav` en `~/.ssh/config` (ver `docs/04-despliegue.md`).

```bash
./scripts/deploy.sh        # sincroniza, reconstruye y verifica la API
./scripts/logs.sh          # logs de la API en vivo (Ctrl-C para salir)
./scripts/ssh.sh           # sesión SSH en /opt/tav del servidor
./scripts/ssh.sh --db      # psql dentro del contenedor de Postgres
```

`deploy.sh` hace rsync de `apps/api` y `docker-compose.prod.yml` al servidor
(sin tocar `.env.prod`), reconstruye los contenedores, y verifica que
`/health` responde local y público. Si algo falla, aborta con código != 0
y muestra los últimos 30 renglones del log.

### Despliegue del panel de admin

- URL de producción: `https://panel.tav.rolapro.com`
- Script: `./scripts/deploy-admin.sh`
- Origen CORS: `https://panel.tav.rolapro.com,http://localhost:3000`

---

## Estructura del repo

```
tav/
├── AGENTS.md                  ← reglas innegociables
├── docs/                      ← especificación
├── design/                    ← prototipos navegables = especificación de UI
├── docker-compose.yml         ← Postgres 16 + API
├── package.json               ← workspaces, ESLint y Prettier compartidos
└── apps/
    ├── api/                   NestJS + Prisma + PostgreSQL
    ├── admin/                 Next.js 15 + Tailwind + shadcn/ui
    └── mobile/                Flutter (cajero y cobrador)
```

## Arrancar en local

### 0. Requisitos

- Node.js ≥ 20
- PostgreSQL 15+ nativo en local (Homebrew, Postgres.app, etc.)
- Docker y Docker Compose **solo para el despliegue en el VPS**, no para desarrollo local
- Flutter ≥ 3.6 (solo para la app móvil)

### 1. Variables de entorno

Copia los `.env.example` de cada app a `.env`:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
```

### 2. Base de datos local (Postgres nativo)

```bash
# Crear rol y bases (solo la primera vez)
psql -d postgres -c "CREATE ROLE tav WITH SUPERUSER LOGIN PASSWORD 'tav';"
psql -d postgres -c "CREATE DATABASE tav OWNER tav;"
psql -d postgres -c "CREATE DATABASE tav_test OWNER tav;"
```

### 3. Docker (Postgres + API) — solo para despliegue

```bash
docker compose up -d                    # levanta Postgres y la API
curl http://localhost:3001/health       # → {"status":"ok","timestamp":"..."}
```

### 4. API en modo desarrollo

```bash
cd apps/api
npm install
npx prisma generate
npx prisma migrate dev                  # aplica migraciones a la base tav
npm run seed                            # carga datos de desarrollo
npm run db:verify                       # verifica que saldoCents = suma de movimientos
npm run start:dev                       # http://localhost:3001
```

#### Usuarios del seed (contraseña `tav1234` para todos)

| Rol | Correo | Teléfono | Nombre |
|---|---|---|---|
| Admin | admin@tav.test | +584120000001 | Iván Rojas |
| Cobrador | cobrador1@tav.test | +584120000002 | Carlos Pérez (Centro) |
| Cobrador | cobrador2@tav.test | +584120000003 | Luis Gómez (Este) |
| Cajero | cajero.bloqueado@tav.test | +584120000010 | José Blanco (bloqueado 100%) |
| Cajero | ana.rodriguez@tav.test | +584120000011 | Ana Rodríguez (88% cupo) |
| Cajero | pedro.mendoza@tav.test | +584120000012 | Pedro Mendoza (8 días deuda) |
| Cajero | maria.torres@tav.test | +584120000013 | María Torres (sin conexión 4 días) |
| Cajero | carlos.ruiz@tav.test | +584120000014 | Carlos Ruiz (al día) |
| Cajero | sofia.diaz@tav.test | +584120000015 | Sofía Díaz (al día) |
| Cajero | luis.hernandez@tav.test | +584120000016 | Luis Hernández (al día, saldo bajo) |
| Cajero | elena.vargas@tav.test | +584120000017 | Elena Vargas (deuda moderada) |
| Pagador | pagador.ven@tav.test | +584120000020 | Ana Pagadora (Venezuela) |
| Pagador | pagador.bra@tav.test | +551100000020 | Bruno Pagador (Brasil) |

```bash
# Verificar login con curl
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"cajero.bloqueado@tav.test","password":"tav1234"}'
```

#### Base de tests

```bash
cd apps/api
npm run db:test:setup                  # aplica migraciones sobre tav_test
```

La base de tests usa este `DATABASE_URL` (ya lo lleva `db:test:setup`, pero
queda aquí para que no haya que adivinarlo):

```
DATABASE_URL=postgresql://tav:tav@localhost:5432/tav_test?schema=public
```

Todo script de prueba, smoke o exploración se conecta a `tav_test`, **nunca**
a `tav` (ver regla 11 de `AGENTS.md`). La base de desarrollo refleja lo que
ve el cliente; ensuciarla con datos de prueba y luego borrarla es un bug.

#### Resetear la base de desarrollo

```bash
cd apps/api
npm run db:reset                       # prisma migrate reset --force + seed
```

### 5. Panel admin

```bash
cd apps/admin
npm install
npm run dev                             # http://localhost:3000
```

### 6. App móvil

```bash
cd apps/mobile
flutter pub get

# Producción (API ya desplegada):
./run-device.sh

# Desarrollo local — iOS Simulator:
./run-device.sh --local

# Desarrollo local — Android físico por USB:
adb reverse tcp:3001 tcp:3001
./run-device.sh --local
```

> La API de producción está en `https://api.tav.rolapro.com` y es el valor
> por defecto en `app_config.dart`. `--local` la sobreescribe a `localhost:3001`
> para desarrollo. El `--dart-define` es de tiempo de compilación: un hot
> reload no lo aplica.

### Linting y formato

```bash
npm run lint          # ESLint en toda la raíz
npm run format        # Prettier en toda la raíz
```

---

## Las tres reglas que más se rompen

1. **Los montos son enteros de centavos.** Nunca decimales.
2. **`movimientos` es de solo-inserción.** Corregir es insertar un reverso, no editar ni borrar.
3. **El límite de crédito se valida en la base de datos**, dentro de una transacción
   con `FOR UPDATE`. Que el botón esté gris en Flutter no es una validación.

El resto está en `AGENTS.md`.
