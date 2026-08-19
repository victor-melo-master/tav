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

| Rol | Teléfono | Nombre |
|---|---|---|
| Admin | +584120000001 | Iván Rojas |
| Cobrador | +584120000002 | Carlos Pérez (Centro) |
| Cobrador | +584120000003 | Luis Gómez (Este) |
| Cajero | +584120000010 | José Blanco (bloqueado 100%) |
| Cajero | +584120000011 | Ana Rodríguez (88% cupo) |
| Cajero | +584120000012 | Pedro Mendoza (8 días deuda) |
| Cajero | +584120000013 | María Torres (sin conexión 4 días) |
| Cajero | +584120000014 | Carlos Ruiz (al día) |
| Cajero | +584120000015 | Sofía Díaz (al día, saldo 0) |
| Cajero | +584120000016 | Luis Hernández (al día, saldo bajo) |
| Cajero | +584120000017 | Elena Vargas (deuda moderada) |

```bash
# Verificar login con curl
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"telefono":"+584120000010","password":"tav1234"}'
```

#### Base de tests

```bash
cd apps/api
npm run db:test:setup                  # aplica migraciones sobre tav_test
```

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

# Dispositivo físico Android/iOS (resuelve la IP del Mac automáticamente):
./run-device.sh

# iOS Simulator (localhost = tu Mac):
flutter run --dart-define=API_BASE_URL=http://localhost:3001

# Android Emulator (10.0.2.2 = loopback al host):
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

> **Importante:** `localhost` y `10.0.2.2` no funcionan en un dispositivo físico.
> Usa `./run-device.sh` o pasa la IP de tu Mac con `--dart-define`.
> El `--dart-define` es de tiempo de compilación: un hot reload no lo aplica.

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
