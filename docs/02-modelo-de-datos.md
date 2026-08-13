# Modelo de datos — TAV

Este es el contrato. Si el schema está bien, todo lo demás es trabajo mecánico.
Si está mal, se arrastra el error hasta producción y se paga caro.

**Regla que lo gobierna todo:** `movimientos` es un libro de solo-inserción.
El saldo de un cajero es la suma de sus movimientos. Nunca se edita el pasado.

---

## Diagrama conceptual

```
usuarios ──┬── perfiles_cajero ──┬── operaciones ──┐
           │                     │                 ├──> movimientos (append-only)
           ├── perfiles_cobrador ├── cobros ───────┘         │
           │         │           │                           └──> saldo del cajero
           │         │           └── ampliaciones_credito
           │         └── cierres ──> verificados por admin
           └── avisos
```

---

## Schema Prisma

Copiar tal cual en `apps/api/prisma/schema.prisma`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────── USUARIOS ───────────────────────────────

enum Rol {
  cajero
  cobrador
  admin
}

model Usuario {
  id           String   @id @default(uuid())
  rol          Rol
  nombre       String
  telefono     String   @unique
  documento    String?
  passwordHash String
  pinHash      String?
  activo       Boolean  @default(true)
  ultimaVezAt  DateTime?          // para la alerta de "sin conectarse hace 3 días"
  creadoAt     DateTime @default(now())
  creadoPorId  String?

  perfilCajero   PerfilCajero?
  perfilCobrador PerfilCobrador?

  @@index([rol, activo])
}

model PerfilCajero {
  usuarioId       String  @id
  usuario         Usuario @relation(fields: [usuarioId], references: [id])
  limiteCents     BigInt                    // lo fija el admin
  saldoCents      BigInt  @default(0)       // CACHE. Solo se escribe dentro de la transacción del movimiento.
  deudaDesde      DateTime?                 // fecha del cargo más viejo sin saldar → alimenta el eje "días"
  zona            String?
  direccion       String?
  notas           String?

  operaciones   Operacion[]
  cobros        Cobro[]
  movimientos   Movimiento[]
  ampliaciones  AmpliacionCredito[]
  atenciones    Atencion[]
  avisos        Aviso[]
}

model PerfilCobrador {
  usuarioId String  @id
  usuario   Usuario @relation(fields: [usuarioId], references: [id])
  zona      String?

  cobros     Cobro[]
  cierres    Cierre[]
  atenciones Atencion[]
}

// ─────────────────────────────── TASAS ───────────────────────────────

model Tasa {
  id            String   @id @default(uuid())
  par           String                     // "USDT_BS" | "USD_BS" | "ZELLE_BS"
  valor         Decimal  @db.Decimal(18, 6)   // la tasa NO es dinero: aquí Decimal sí es correcto
  vigenteDesde  DateTime @default(now())
  creadaPorId   String

  @@index([par, vigenteDesde])
}

// ─────────────────────────────── OPERACIONES ───────────────────────────────

enum EstadoOperacion {
  en_verificacion
  en_proceso
  completada
  observada
  rechazada
  anulada
}

model Operacion {
  id                String   @id @default(uuid())
  folio             String   @unique          // "TAV-2482"
  clientUuid        String   @unique          // idempotencia
  cajeroId          String
  cajero            PerfilCajero @relation(fields: [cajeroId], references: [usuarioId])

  tipo              String                    // "usdt_bs" | "usd_efectivo_bs"
  montoOrigenCents  BigInt
  monedaOrigen      String                    // "USDT" | "USD"
  tasaAplicada      Decimal  @db.Decimal(18, 6)
  comisionCents     BigInt
  totalCents        BigInt                    // lo que suma a la deuda
  montoDestinoCents BigInt
  monedaDestino     String                    // "BS"

  beneficiario      Json                      // {nombre, documento, banco, cuenta, metodo}
  estado            EstadoOperacion @default(en_verificacion)
  comprobanteUrl    String?

  ampliacionId      String?  @unique          // si consumió una ampliación
  ampliacion        AmpliacionCredito? @relation(fields: [ampliacionId], references: [id])

  creadaPorId       String                    // el cajero, o el admin si la registró por él
  creadaAt          DateTime @default(now())
  anuladaAt         DateTime?
  anuladaPorId      String?
  motivoAnulacion   String?

  @@index([cajeroId, creadaAt])
  @@index([estado])
}

// ─────────────────────────────── COBROS ───────────────────────────────

enum MetodoCobro {
  efectivo_usd
  bolivares
  pago_movil
  usdt
}

model Cobro {
  id              String   @id @default(uuid())
  folio           String   @unique            // "COB-0412"
  clientUuid      String   @unique            // idempotencia — CRÍTICO para el modo offline

  cajeroId        String
  cajero          PerfilCajero @relation(fields: [cajeroId], references: [usuarioId])
  cobradorId      String?                     // null si lo registró el admin
  cobrador        PerfilCobrador? @relation(fields: [cobradorId], references: [usuarioId])

  metodo          MetodoCobro
  montoCents      BigInt                      // en la moneda en que se recibió
  moneda          String                      // "USD" | "BS" | "USDT"
  tasaAplicada    Decimal? @db.Decimal(18, 6) // null si ya venía en USD
  montoUsdCents   BigInt                      // equivalente — es lo que descuenta la deuda
  esEfectivo      Boolean                     // true solo para efectivo_usd → suma al cuadre físico

  cierreId        String?
  cierre          Cierre?  @relation(fields: [cierreId], references: [id])

  comprobanteUrl  String?
  nota            String?

  creadoAt        DateTime @default(now())
  sincronizadoAt  DateTime?                   // null mientras vive solo en el teléfono
  anuladoAt       DateTime?
  anuladoPorId    String?
  motivoAnulacion String?

  @@index([cobradorId, creadoAt])
  @@index([cajeroId, creadoAt])
  @@index([cierreId])
}

// ────────────────────── LIBRO CONTABLE (APPEND-ONLY) ──────────────────────

enum TipoMovimiento {
  cargo           // una operación: sube la deuda
  abono           // un cobro: baja la deuda
  reverso_cargo   // anulación de operación
  reverso_abono   // anulación de cobro
  ajuste          // corrección manual del admin, siempre con motivo
}

/// NUNCA se hace UPDATE ni DELETE sobre esta tabla.
/// Corregir = insertar un movimiento de reverso.
model Movimiento {
  id              String   @id @default(uuid())
  cajeroId        String
  cajero          PerfilCajero @relation(fields: [cajeroId], references: [usuarioId])

  tipo            TipoMovimiento
  montoUsdCents   BigInt                      // positivo sube deuda, negativo la baja
  saldoDespues    BigInt                      // foto del saldo tras aplicar este movimiento

  origenTipo      String                      // "operacion" | "cobro" | "ajuste"
  origenId        String
  motivo          String?                     // obligatorio en reversos y ajustes
  registradoPorId String
  creadoAt        DateTime @default(now())

  @@index([cajeroId, creadoAt])
  @@index([origenTipo, origenId])
}

// ─────────────────────────── AMPLIACIÓN DE CUPO ───────────────────────────

enum EstadoAmpliacion {
  pendiente
  aprobada
  rechazada
  consumida
  expirada
}

model AmpliacionCredito {
  id            String   @id @default(uuid())
  cajeroId      String
  cajero        PerfilCajero @relation(fields: [cajeroId], references: [usuarioId])

  montoCents    BigInt                        // cupo extra solicitado
  motivo        String
  estado        EstadoAmpliacion @default(pendiente)

  solicitadaAt  DateTime @default(now())
  resueltaAt    DateTime?
  resueltaPorId String?
  notaAdmin     String?

  operacion     Operacion?                    // la operación que la consumió

  @@index([cajeroId, estado])
  @@index([estado])
}

// ─────────────────────────── CIERRE DIARIO ───────────────────────────

enum EstadoCierre {
  abierto
  enviado
  verificado
  con_diferencia
}

model Cierre {
  id                    String   @id @default(uuid())
  cobradorId            String
  cobrador              PerfilCobrador @relation(fields: [cobradorId], references: [usuarioId])
  fecha                 DateTime @db.Date

  totalRegistradoCents  BigInt   @default(0)
  efectivoDeclaradoCents BigInt  @default(0)  // lo que el cobrador dice llevar en mano
  digitalCents          BigInt   @default(0)

  estado                EstadoCierre @default(abierto)
  entregadoA            String?
  notaCobrador          String?

  enviadoAt             DateTime?
  verificadoAt          DateTime?
  verificadoPorId       String?
  efectivoRecibidoCents BigInt?                // lo que el admin contó de verdad
  diferenciaCents       BigInt?                // recibido − declarado
  notaAdmin             String?

  cobros                Cobro[]

  @@unique([cobradorId, fecha])
  @@index([estado])
}

// ─────────────────────── ATENCIÓN Y AVISOS ───────────────────────

/// "Lo estoy atendiendo" — evita que dos cobradores vayan al mismo cajero.
model Atencion {
  id          String   @id @default(uuid())
  cajeroId    String
  cajero      PerfilCajero @relation(fields: [cajeroId], references: [usuarioId])
  cobradorId  String
  cobrador    PerfilCobrador @relation(fields: [cobradorId], references: [usuarioId])
  iniciadaAt  DateTime @default(now())
  liberadaAt  DateTime?

  @@index([cajeroId, liberadaAt])
}

enum TipoAviso {
  cobro_automatico
  cobro_manual
  cerca_del_limite
  sin_cupo
  vencido
  ampliacion_resuelta
}

model Aviso {
  id          String   @id @default(uuid())
  cajeroId    String
  cajero      PerfilCajero @relation(fields: [cajeroId], references: [usuarioId])
  tipo        TipoAviso
  titulo      String
  cuerpo      String
  enviadoAt   DateTime @default(now())
  leidoAt     DateTime?                       // el admin necesita saber si lo leyó
  enviadoPorId String?                        // null si lo generó el sistema

  @@index([cajeroId, leidoAt])
}

// ─────────────────────────── AUDITORÍA ───────────────────────────

model AuditLog {
  id         String   @id @default(uuid())
  actorId    String
  accion     String                            // "cobro.anular", "credito.ampliar", ...
  entidad    String
  entidadId  String
  antes      Json?
  despues    Json?
  ip         String?
  creadoAt   DateTime @default(now())

  @@index([entidad, entidadId])
  @@index([actorId, creadoAt])
}

// ─────────────────────────── CONFIGURACIÓN ───────────────────────────

/// Umbrales y parámetros que el cliente puede cambiar sin tocar código.
model Config {
  clave String @id       // "semaforo.dias_ambar" = "4", "semaforo.pct_ambar" = "0.75", ...
  valor String
}
```

---

## Las dos transacciones que importan

Todo lo demás es CRUD. Estas dos son las que hay que escribir con cuidado y cubrir con tests.

### A. Registrar una operación (consume cupo)

```
BEGIN
  SELECT * FROM perfiles_cajero WHERE usuario_id = $1 FOR UPDATE   -- bloquea la fila

  limite_efectivo = limite_cents + (ampliación aprobada y no consumida, si existe)
  disponible      = limite_efectivo − saldo_cents

  IF total_cents > disponible THEN
      ROLLBACK
      → 409 SIN_CUPO { disponible, requerido, faltante }
  END IF

  INSERT operacion
  INSERT movimiento (tipo=cargo, monto=+total, saldo_despues=saldo+total)
  UPDATE perfiles_cajero SET saldo_cents = saldo + total,
                             deuda_desde = COALESCE(deuda_desde, now())
  IF usó ampliación THEN UPDATE ampliacion SET estado='consumida', operacion_id=... END IF
COMMIT
```

El `FOR UPDATE` no es opcional. Sin él, dos operaciones simultáneas pasan el chequeo
las dos y el cajero termina sobregirado.

### B. Registrar un cobro (baja deuda)

```
BEGIN
  -- idempotencia primero
  SELECT * FROM cobros WHERE client_uuid = $uuid
  IF existe THEN COMMIT; devolver el existente (200, no 201)

  SELECT * FROM perfiles_cajero WHERE usuario_id = $1 FOR UPDATE

  monto_usd = (moneda = 'BS') ? monto / tasa : monto

  INSERT cobro (cierre_id = cierre abierto del cobrador para hoy, creándolo si no existe)
  INSERT movimiento (tipo=abono, monto=−monto_usd, saldo_despues=saldo−monto_usd)
  UPDATE perfiles_cajero SET saldo_cents = saldo − monto_usd,
                             deuda_desde = (saldo queda en 0) ? NULL : deuda_desde
  UPDATE cierre SET totales recalculados
COMMIT
→ emitir evento en tiempo real a: el cajero, todos los cobradores, el admin
```

**Anular** es la misma estructura al revés: `INSERT movimiento (reverso_abono, +monto)`
+ `UPDATE cobro SET anulado_at, motivo_anulacion`. El cobro sigue existiendo y visible.

---

## Cálculo del semáforo

Nunca lo dupliques. Escríbelo **una vez** en el backend y que la app y el panel consuman
el estado ya calculado.

```
dias   = deuda_desde ? días transcurridos desde deuda_desde : 0
pct    = limite_efectivo > 0 ? saldo / limite_efectivo : 0

por_dias   = dias >= 7 ? 2 : dias >= 4 ? 1 : 0
por_credito = pct >= 1 ? 2 : pct >= config('semaforo.pct_ambar') ? 1 : 0

estado    = max(por_dias, por_credito)      // 0 verde · 1 ámbar · 2 rojo
bloqueado = pct >= 1
```

`limite_efectivo` incluye la ampliación activa: mientras esté vigente,
el porcentaje se calcula sobre el cupo ampliado.

---

## Notas de implementación

- **BigInt y JSON no se llevan bien.** Serializa montos como string en las respuestas
  de la API, o configura un reemplazo global de `BigInt.prototype.toJSON`. Defínelo una vez.
- **Zona horaria:** todo se guarda en UTC. El cierre diario del cobrador se agrupa
  por fecha en la zona de Venezuela (`America/Caracas`), no en UTC — si no, los cobros
  después de las 8pm caen en el día siguiente.
- **Folios:** genéralos con una secuencia de Postgres, no contando filas.
- **Comprobantes:** guarda solo la ruta en la base. Los archivos van al disco del servidor
  o a un bucket S3-compatible.
