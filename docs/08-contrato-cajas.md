# Contrato del módulo de cajas y corredores

Este documento es el contrato de `apps/api/src/cajas/` (CajaService) y
`apps/api/src/corredores/` (CorredorService). Los tests se escriben leyendo
**solo** este archivo, sin ver la implementación. Si algo aquí es ambiguo,
el contrato está mal, no el test.

Servicios NestJS exportados:

- `CorredorService` — `crear`, `desactivar`, `activar`, `listar`, `listarActivos`, `obtener`
- `CajaService` — `ingresarCajaMadre`, `abrirCaja`, `recargarCaja`, `ejecutarPago`, `anularApertura`, `anularPago`, `obtenerCaja`, `listarCajas`, `saldoCaja`, `alertasCaja`

Ambos reciben `PrismaService` por constructor, así que pueden instanciarse a
mano contra una base de prueba: `new CajaService(prisma)`.

Convención global: **todo monto es `bigint` de centavos** en la moneda de la
caja correspondiente (no siempre GYD: puede ser USDT, BS, BRL, COP, DOP, MXN).
Las tasas viajan como `string` decimal (`"285.4"`). No hay HTTP aquí: las
excepciones son clases planas que la capa de controladores mapeará después.

Reglas innegociables que este contrato hereda de `AGENTS.md`:

1. **Solo-inserción**: `MovimientoCaja` nunca recibe `UPDATE` ni `DELETE`.
   Corregir = insertar un reverso.
2. **Idempotencia por `clientUuid`**: cada escritura de dinero llega con un
   `clientUuid`. La unicidad es **por caja**
   (`@@unique([cajaId, clientUuid])`): un mismo `clientUuid` puede aparecer
   una vez en cada caja involucrada en una doble entrada. Si llega dos veces
   a la misma caja, la segunda devuelve el registro existente sin crear nada
   nuevo.
3. **`FOR UPDATE` sobre la fila de la `Caja`**: serializa escrituras
   concurrentes contra la misma caja para que `saldoCents` (cache) y
   `saldoDespues` no sufran lost-update. **No rechaza** pagos contra cajas
   sin fondos: la caja puede quedar en negativo y se emite alerta.
4. **El saldo es la suma de sus movimientos**: `db:verify` lo comprueba.
5. **Ningún resultado en dinero sale de aritmética con `Decimal`**: la tasa
   viaja como `Decimal`/`string`, pero los montos resultantes se calculan en
   `bigint` de centavos.

---

## Tipos compartidos (`cajas.dto.ts`)

```ts
interface IngresarCajaMadreDto {
  clientUuid: string;            // idempotencia
  cajaMadreId: string;           // la caja madre a la que entra el USDT
  montoCents: bigint;            // en centavos de la moneda de la caja madre (USDT)
  motivo: string;                // obligatorio: "recarga de capital", "venta del día", ...
  registradoPorId: string;       // el admin
}

interface AbrirCajaDto {
  clientUuid: string;            // idempotencia
  cajaId: string;                // la caja del corredor que se abre/recarga
  cajaMadreId: string;           // de dónde sale el USDT
  montoMadreCents: bigint;       // cuánto USDT sale de la caja madre (centavos USDT)
  montoDestinoCents: bigint;     // cuánto entra en la caja destino (centavos de la moneda del corredor)
  tasaConversion: string;        // tasa USDT → moneda del corredor. Se congela.
  registradoPorId: string;       // el admin
}

interface EjecutarPagoDto {
  clientUuid: string;            // idempotencia
  operacionId: string;           // la operación que se paga
  cajaId: string;                // de qué caja del corredor sale la plata
  montoCents: bigint;            // cuánto se descuenta de la caja (centavos de la moneda del corredor)
  tasaEjecucion: string;         // a cómo se ejecutó el cambio (240, 244, 250...). Se congela.
  formaPago: string;             // "pago_movil" | "transferencia" | "efectivo" | ...
  nombreCliente: string;         // el nombre del cliente que recibió
  registradoPorId: string;       // el pagador
}

interface AnularAperturaDto {
  movimientoCajaId: string;      // el movimiento de apertura/recarga a anular
  motivo: string;                // obligatorio
  actorId: string;               // el admin
}

interface CrearCorredorDto {
  pais: string;                  // código ISO-3: "VEN", "BRA", ...
  paisNombre: string;            // "Venezuela"
  moneda: string;                // código ISO-4217: "BS", "USD", "BRL", ...
  monedaNombre: string;          // "Bolívares"
  formaEntrega: string;          // "transferencia" | "efectivo" | ...
  formaEntregaNombre: string;    // etiqueta legible
  creadoPorId: string;           // el admin
}

interface CajaResultado {
  caja: Caja;                    // la caja afectada, con saldoCents actualizado
  movimiento: MovimientoCaja;    // el movimiento insertado (o el existente si yaExistia)
  yaExistia: boolean;            // true si el clientUuid ya estaba
}

interface AperturaResultado {
  cajaDestino: Caja;
  cajaMadre: Caja;
  movimientoDestino: MovimientoCaja;   // tipo apertura/recarga, monto +
  movimientoMadre: MovimientoCaja;     // tipo transferencia, monto −
  yaExistia: boolean;
}

interface PagoResultado {
  operacion: Operacion;          // la operación marcada como pagada
  caja: Caja;                    // la caja descontada
  movimiento: MovimientoCaja;    // el movimiento de pago insertado (o el existente)
  yaExistia: boolean;
}

interface AlertaCaja {
  cajaId: string;
  tipo: 'saldo_bajo' | 'saldo_negativo';
  saldoCents: bigint;
  umbralAlertaCents: bigint | null;
  moneda: string;
  corredorDescripcion: string;   // "Venezuela — Bolívares (Transferencia)" o "Caja madre USDT"
}
```

---

## Orden de precondiciones (todos los métodos)

Los tests se escriben a ciegas contra este contrato. Si un test manda una
caja inexistente **y** un monto cero, ¿qué excepción espera? Sin un orden
fijo, el test no lo sabe y el contrato está incompleto.

Este es el orden **para todos los métodos que escriben dinero**
(`ingresarCajaMadre`, `abrirCaja`, `recargarCaja`, `ejecutarPago`,
`anularApertura`). Los métodos de solo lectura (`obtenerCaja`, `listarCajas`,
`saldoCaja`, `alertasCaja`) solo aplican el paso 3.

1. **Idempotencia por `clientUuid`**: si ya existe un `MovimientoCaja` con
   ese `(cajaId, clientUuid)`, se devuelve el registro existente con
   `yaExistia: true` **sin validar nada más**. Esto es intencional: el
   reintento de red no debe fallar porque el primer intento dejó un campo
   vacío que el segundo sí trae. Ver la sección "Datos distintos con mismo
   `clientUuid`" abajo.
2. **Validación de input** (sin tocar la base): montos > 0, tasa numérica y
   > 0, campos no monetarios no vacíos (`motivo`, `formaPago`,
   `nombreCliente`). Estas son las excepciones `MontoInvalidoException`,
   `TasaInvalidaException`, `CampoRequeridoException`,
   `MotivoRequeridoException`.
3. **Existencia y tipo de las entidades** (queries a la base): la caja
   existe, es del tipo esperado (madre o corredor), la operación existe, el
   corredor existe. Estas son `CajaNoEncontradaException`,
   `CajaMadreInvalidaException`, `OperacionNoEncontradaException`,
   `CorredorNoEncontradoException`.
4. **Reglas de negocio**: corredor activo, estado de la operación, caja
   pertenece al corredor de la operación, movimiento es anulable, movimiento
   no está ya anulado. Estas son `CorredorInactivoException`,
   `OperacionNoPendienteException`, `CajaCorredorMismatchException`,
   `MovimientoNoAnulableException`, `MovimientoYaAnuladoException`.

**Implicación para los tests**: si un test quiere verificar una
precondición del paso 3 o 4, debe mandar valores válidos en el paso 2. Si
quiere verificar una del paso 4, debe mandar entidades que existan y sean
del tipo correcto (paso 3). El contrato no promete qué excepción sale si
se violan dos precondiciones a la vez — solo promete que la del paso
anterior gana.

> **Excepción a este orden**: `ejecutarPago` chequea el estado de la
> operación (paso 4) **antes** de validar el monto y la tasa (paso 2)
> cuando la operación ya está `pagada`. Razón: si el pagador reintenta con
> un `clientUuid` distinto y datos incompletos, el estado `pagada` debe
> devolver el pago existente sin importar qué más traiga el DTO. El
> `clientUuid` no decide nada, pero el estado sí — y el estado se lee antes
> de validar el input para no rechazar un reintento que trae campos
> vacíos. El orden completo de `ejecutarPago` es:
> 1. Idempotencia por `clientUuid` (paso 1).
> 2. Existencia de la operación (paso 3, parcial).
> 3. Estado de la operación: si `pagada` → devuelve el existente; si no es
>    ni `pendiente` ni `pagada` → `OperacionNoPendienteException` (paso 4).
> 4. Existencia y tipo de la caja + `CajaCorredorMismatch` (pasos 3 y 4).
> 5. Validación de input: monto, tasa, `formaPago`, `nombreCliente`
>    (paso 2, retrasado).

---

## Datos distintos con mismo `clientUuid`

Idempotencia significa: mismo `(cajaId, clientUuid)` → mismo resultado, sin
importar qué más traiga el DTO. Si el primer intento creó un movimiento con
`montoCents = 100_00n` y el reintento trae `montoCents = 200_00n`, el
segundo **devuelve el movimiento existente** y **ignora silenciosamente** los
datos nuevos. No lanza error, no registra el cambio, no alerta.

Esto es el comportamiento normal de idempotencia y no va a cambiar: el
reintento de red no puede crear un segundo movimiento ni actualizar el
primero (la tabla es append-only). Pero es justo el caso en el que un bug
del cliente queda invisible: el pagador mandó el monto mal, el servidor lo
asentó, y el reintento con el monto correcto no corrige nada.

**Implicación para los tests**: un test que verifique idempotencia debe
comprobar que el movimiento devuelto tiene los datos del **primer** intento,
no los del segundo. Un test que mande datos distintos en el reintento y
esperee que se actualice el movimiento **va a fallar** — y está bien que
falle: ese no es el contrato.

---

## Excepciones (`cajas.exceptions.ts`)

Todas extienden `CajaException extends Error` y tienen un campo `code: string`.

| Clase | `code` | Payload | Cuándo |
|---|---|---|---|
| `CajaNoEncontradaException` | `CAJA_NO_ENCONTRADA` | `cajaId: string` | La caja referenciada no existe. |
| `CorredorNoEncontradoException` | `CORREDOR_NO_ENCONTRADO` | `corredorId: string` | El corredor referenciado no existe. |
| `CajaMadreInvalidaException` | `CAJA_MADRE_INVALIDA` | `cajaId: string` | Se pasó una caja que no es madre donde se esperaba una madre, o viceversa: una caja madre donde se esperaba una de corredor (e.g. `ejecutarPago` con `cajaId` de la caja madre USDT). |
| `CorredorInactivoException` | `CORREDOR_INACTIVO` | `corredorId: string` | Se intenta operar sobre un corredor desactivado. |
| `CorredorDuplicadoException` | `CORREDOR_DUPLICADO` | `pais: string`, `moneda: string`, `formaEntrega: string` | Ya existe un corredor **activo** con esa combinación `pais + moneda + formaEntrega`. |
| `OperacionNoEncontradaException` | `OPERACION_NO_ENCONTRADA` | `operacionId: string` | La operación referenciada no existe. |
| `OperacionNoPendienteException` | `OPERACION_NO_PENDIENTE` | `operacionId: string`, `estado: string` | La operación está en un estado que no es ni `pendiente` ni `pagada` (`anulada`, `rechazada`, ...). Una operación ya `pagada` **no** lanza esto: devuelve el pago existente con `yaExistia: true`. |
| `CajaCorredorMismatchException` | `CAJA_CORREDOR_MISMATCH` | `cajaId: string`, `operacionId: string` | La caja no pertenece al corredor de la operación. |
| `MotivoRequeridoException` | `MOTIVO_REQUERIDO` | — | `anularApertura` o `ingresarCajaMadre` con motivo vacío. |
| `MontoInvalidoException` | `MONTO_INVALIDO` | `campo: string`, `valor: bigint` | Monto ≤ 0 en un ingreso/apertura/pago. Solo para campos de dinero. |
| `CampoRequeridoException` | `CAMPO_REQUERIDO` | `campo: string` | Un campo obligatorio que no es monto llegó vacío (`formaPago`, `nombreCliente`). |
| `TasaInvalidaException` | `TASA_INVALIDA` | `valor: string` | `tasaConversion` o `tasaEjecucion` ≤ 0 o no numérica. |
| `ReversoPagoNoDefinidoException` | `REVERSO_PAGO_NO_DEFINIDO` | `movimientoCajaId: string` | Se intenta anular un pago. El flujo no está definido — ver `// PENDIENTE DE DEFINIR`. |
| `MovimientoNoAnulableException` | `MOVIMIENTO_NO_ANULABLE` | `movimientoCajaId: string`, `tipo: string` | Se intenta anular un movimiento que no es `apertura` ni `recarga`. |
| `MovimientoYaAnuladoException` | `MOVIMIENTO_YA_ANULADO` | `movimientoCajaId: string` | Segundo intento de anular el mismo movimiento. Se detecta por **consulta**: ya existe un `reverso_apertura` que apunta al original por `origenId`. |

---

## `CorredorService`

### `crear(dto): Promise<Corredor>`

Crea un corredor y su caja asociada (una caja por corredor, `esMadre=false`).
Ambas operaciones van en la misma transacción: si una falla, ninguna queda.

**Postcondiciones:**
- El corredor queda `activo = true`.
- Existe una `Caja` con `corredorId = corredor.id`, `esMadre = false`,
  `moneda = dto.moneda`, `saldoCents = 0`.
- No se pueden crear dos corredores con la misma combinación
  `pais + moneda + formaEntrega` activos a la vez. (Restricción de unicidad
  de negocio, no de BD — el servicio la valida y rechaza con
  `CorredorDuplicadoException`.)

### `desactivar(corredorId, actorId): Promise<Corredor>`

Marca `activo = false`, `desactivadoAt = now()` y `desactivadoPorId = actorId`.
La caja del corredor **no se toca**: conserva su saldo y su historia. El
corredor desaparece de `listarActivos` pero sigue existiendo para consultas
y referencias.

### `activar(corredorId, actorId): Promise<Corredor>`

Marca `activo = true` y limpia `desactivadoAt` y `desactivadoPorId` (al
reactivar, el último desactivador deja de ser relevante). El corredor
vuelve a `listarActivos`.

### `listar(): Promise<Corredor[]>`

Devuelve todos los corredores, activos e inactivos. Para el panel del admin.

### `listarActivos(): Promise<Corredor[]>`

Devuelve solo los `activo = true`. Para la app del cajero (escoger destino).

### `obtener(corredorId): Promise<Corredor>`

Devuelve un corredor por id. `CorredorNoEncontradoException` si no existe.

---

## `CajaService.ingresarCajaMadre(dto): Promise<CajaResultado>`

Registra una entrada de USDT (o efectivo) a la caja madre. Es lo que hace
que la caja madre tenga saldo del que sacar para abrir cajas de corredor.

### Precondiciones
- `dto.cajaMadreId` existe y es una caja madre (`esMadre = true`). Si no:
  `CajaNoEncontradaException` o `CajaMadreInvalidaException`.
- `dto.montoCents > 0n`. Si no: `MontoInvalidoException`.
- `dto.motivo` no vacío. Si no: `MotivoRequeridoException`.

### Comportamiento
1. **Idempotencia primero**: si ya existe un `MovimientoCaja` con ese
   `clientUuid`, devuelve `{caja, movimiento: elExistente, yaExistia: true}`
   sin escribir nada.
2. En transacción con `FOR UPDATE` sobre la fila de la caja madre:
   - Re-verifica idempotencia dentro de la transacción (misma razón que el
     ledger: dos peticiones simultáneas con el mismo uuid pueden pasar
     ambas el check previo).
   - Inserta `MovimientoCaja` `{tipo: 'ingreso', montoCents: +dto.montoCents,
     saldoDespues, origenTipo: 'ingreso', origenId: movimientoId, clientUuid,
     motivo, registradoPorId}`.
   - Actualiza `caja.saldoCents = saldo + dto.montoCents`.

### Postcondiciones
- `saldoCents` nuevo = saldo anterior + `dto.montoCents`.
- El movimiento no lleva `cajaMadreId`/`montoMadreCents`/`tasaConversion`
  (es un ingreso directo, no una conversión).

---

## `CajaService.abrirCaja(dto): Promise<AperturaResultado>`

Abre (o recarga) una caja de corredor convirtiendo USDT desde la caja madre.
**Doble entrada**: dos movimientos en la misma transacción.

### Precondiciones
- `dto.cajaId` existe y es una caja de corredor (`esMadre = false`). Si no:
  `CajaNoEncontradaException` o `CajaMadreInvalidaException`.
- `dto.cajaMadreId` existe y es una caja madre. Si no: `CajaMadreInvalidaException`.
- `dto.montoMadreCents > 0n` y `dto.montoDestinoCents > 0n`.
  Si no: `MontoInvalidoException`.
- `dto.tasaConversion` > 0 y numérico. Si no: `TasaInvalidaException`.
- El corredor de la caja destino está `activo`. Si no: `CorredorInactivoException`.

### Coherencia aritmética (capa HTTP, no el servicio)

El admin teclea los tres números a mano — `montoMadreCents`,
`montoDestinoCents` y `tasaConversion` — y nada en el servicio comprueba
que cuadren entre sí. Una cifra mal puesta pasaría derecho y dejaría la
caja con un saldo falso.

La validación sigue el precedente del ledger (caso 18 del contrato del
ledger, `CoherenciaAritmeticaConstraint` en `crear-operacion.dto.ts`):
**vive en el DTO de la capa HTTP, no en el servicio**. El servicio asienta
lo que le mandan; el DTO rechaza con 400 antes de tocar la base:

- Se comprueba `montoDestinoCents ≈ montoMadreCents × tasaConversion`,
  con **tolerancia de redondeo**. Fórmula exacta:
  `esperado = round(montoMadreCents × tasaConversion)` y
  `tolerancia = max(1n, esperado / 10_000n)` (división entera; 0,01%).
  Es válido si `abs(montoDestinoCents − esperado) <= tolerancia`.
  (El admin redondea el destino al pactar el cambio; exigir igualdad
  exacta rechazaría conversiones legítimas.)
- El cálculo de referencia se hace en aritmética entera/`bigint` sobre la
  tasa como string decimal — nunca con `float`.

Los tests del servicio **no** cubren esto (el servicio acepta montos
incoherentes); los tests del DTO HTTP sí.

### Comportamiento
1. **Idempotencia primero**: si ya existe un `MovimientoCaja` con ese
   `clientUuid`, devuelve los movimientos existentes (tanto el de la destino
   como el de la madre, vinculados por `origenId`) con `yaExistia: true`.
2. En transacción con `FOR UPDATE` sobre **ambas** cajas (madre y destino,
   siempre en el mismo orden para evitar deadlocks: primero la madre, luego
   la destino):
   - Re-verifica idempotencia dentro de la transacción.
   - Inserta `MovimientoCaja` en la caja destino:
     `{tipo: 'apertura', montoCents: +dto.montoDestinoCents, saldoDespues,
     cajaMadreId: dto.cajaMadreId, montoMadreCents: dto.montoMadreCents,
     tasaConversion: dto.tasaConversion, origenTipo: 'apertura',
     origenId: movimientoDestinoId, clientUuid, registradoPorId}`.
   - Inserta `MovimientoCaja` en la caja madre:
     `{tipo: 'transferencia', montoCents: −dto.montoMadreCents, saldoDespues,
     origenTipo: 'apertura', origenId: movimientoDestinoId,
     clientUuid: dto.clientUuid, registradoPorId}`. **Sin**
     campos de conversión (desde la perspectiva de la madre solo sale USDT).
     **Mismo `clientUuid` que la pata destino**: la unicidad es por caja
     (`@@unique([cajaId, clientUuid])`), no global, así que las dos patas de
     una misma apertura pueden y deben llevar el mismo `clientUuid`. El
     vínculo entre los dos movimientos es el `origenId`.
   - Actualiza ambos `saldoCents`.

> **Nota sobre `recargarCaja`**: es idéntico a `abrirCaja` salvo que el
> `tipo` del movimiento en la destino es `'recarga'` en vez de `'apertura'`.
> La diferencia es semántica: `apertura` es el primer llenado de una caja
> con saldo 0; `recarga` es un llenado posterior. Ambos comparten la misma
> lógica de doble entrada. El contrato los trata como el mismo método con
> un parámetro `esRecarga: boolean` (o dos métodos que delegan en uno).

### Postcondiciones
- `cajaDestino.saldoCents` nuevo = saldo anterior + `dto.montoDestinoCents`.
- `cajaMadre.saldoCents` nuevo = saldo anterior − `dto.montoMadreCents`.
  **Puede quedar en negativo**: la caja madre también sigue la regla de
  "alerta, no bloqueo". No se rechaza.
- Ambos movimientos comparten el mismo `origenId` (el id del movimiento de
  la destino), que es lo que los vincula. **Ambos comparten también el mismo
  `clientUuid`** (`dto.clientUuid`): la unicidad de `clientUuid` es por caja
  (`@@unique([cajaId, clientUuid])`), no global. Una apertura produce dos
  filas con el mismo `clientUuid` en cajas distintas, una por caja.
- `tasaConversion` queda congelada.

### Caso repetido (`yaExistia: true`)
- Cero escrituras. Se devuelven los dos movimientos existentes vinculados
  por `origenId`.

---

## `CajaService.ejecutarPago(dto): Promise<PagoResultado>`

El pagador marca una operación como pagada y descuenta la caja del corredor.

### Precondiciones
- `dto.operacionId` existe. Si no: `OperacionNoEncontradaException`.
- **El estado de la operación manda. El `clientUuid` no decide nada aquí.**
  - Si la operación está `pendiente`: se ejecuta el pago.
  - Si la operación ya está `pagada`: se devuelve el pago existente con
    `yaExistia: true`, **venga el `clientUuid` que venga** (mismo o
    distinto). Razón de producto: el pagador tocó dos veces porque no vio
    respuesta; darle un error tras un pago que sí se ejecutó lo haría
    buscar pagar por otro lado. El pago ya está hecho; se le muestra.
  - Cualquier otro estado (ni `pendiente` ni `pagada`: `anulada`,
    `rechazada`, ...) → `OperacionNoPendienteException` con el estado actual.
- `dto.cajaId` existe. Si no: `CajaNoEncontradaException`.
- `dto.cajaId` es una caja de corredor (`esMadre = false`). Si se pasa la
  caja madre: `CajaMadreInvalidaException`. Es un error de categoría (se
  esperaba una caja de corredor y se pasó una madre), no un desajuste entre
  caja y corredor.
- La caja pertenece al corredor de la operación:
  `caja.corredorId === operacion.corredorId`. Si no:
  `CajaCorredorMismatchException`. (`Operacion.corredorId` se añade por
  migración en el Bloque 2, nullable; una operación sin `corredorId` —
  registrada antes de Fase 9 — no puede pagarse por caja y también lanza
  `CajaCorredorMismatchException`.)
- `dto.montoCents > 0n`. Si no: `MontoInvalidoException`.
- `dto.tasaEjecucion` > 0 y numérico. Si no: `TasaInvalidaException`.
- `dto.formaPago` no vacío. Si no: `CampoRequeridoException` con `campo: 'formaPago'`.
- `dto.nombreCliente` no vacío. Si no: `CampoRequeridoException` con `campo: 'nombreCliente'`.

### Comportamiento
1. **Idempotencia primero (por `clientUuid`)**: si ya existe un
   `MovimientoCaja` con ese `clientUuid`, devuelve
   `{operacion, caja, movimiento: elExistente, yaExistia: true}` sin escribir
   nada. El `operacion` devuelto es la operación ya pagada, con todos sus
   campos de pago (`tasaEjecucion`, `formaPago`, `nombreCliente`, `pagadaAt`).
2. En transacción con `FOR UPDATE` sobre **la fila de la `Operacion`**
   (serializa los dos toques al botón) y luego `FOR UPDATE` sobre **la fila
   de la `Caja`** (serializa escrituras concurrentes al saldo):
   - Re-verifica estado de la operación: si ya está `pagada` → devuelve el
     pago existente con `yaExistia: true`. **No** lanza
     `OperacionNoPendienteException`, sin importar si el `clientUuid` es el
     mismo (reintento de red) o distinto (segundo toque discreto). Si el
     estado no es ni `pendiente` ni `pagada` → `OperacionNoPendienteException`.
   - Re-verifica idempotencia por `clientUuid` dentro de la transacción.
   - Inserta `MovimientoCaja` en la caja del corredor:
     `{tipo: 'pago', montoCents: −dto.montoCents, saldoDespues,
     origenTipo: 'pago', origenId: dto.operacionId, clientUuid,
     registradoPorId}`. **Sin** campos de conversión.
   - Actualiza `caja.saldoCents = saldo − dto.montoCents`.
   - Actualiza la `Operacion`: `estado = 'pagada'`, `pagadaAt = now()`,
     `tasaEjecucion = dto.tasaEjecucion`, `formaPago = dto.formaPago`,
     `nombreCliente = dto.nombreCliente`, `pagadaPorId = dto.registradoPorId`.

### Postcondiciones
- `caja.saldoCents` nuevo = saldo anterior − `dto.montoCents`.
  **Puede quedar en negativo**: no se rechaza. Se emite alerta
  `saldo_negativo` (distinta de `saldo_bajo`).
- La operación queda `pagada` con la `tasaEjecucion` congelada.
- El movimiento de pago tiene monto **negativo** y su `saldoDespues` cuadra
  con el cache.

### Caso repetido (`yaExistia: true`)
- Cero escrituras. Se devuelve el pago existente **completo**: la operación
  con todos sus campos de pago, la caja con su saldo actual, y el
  movimiento existente. El pagador tocó dos veces porque no vio respuesta;
  devolver un éxito sin datos le haría tocar una tercera.

### Doble descuento — cómo se previene

**Capa 1 (la que previene)**: `FOR UPDATE` sobre la fila de la `Operacion`.
El segundo toque espera a que el primero commitee. Cuando le toca, ve
`estado = 'pagada'` y retorna sin tocar la caja.

**Capa 2 (cubre reintentos de red)**: `clientUuid` único por caja en
`MovimientoCaja` (`@@unique([cajaId, clientUuid])`). Si el pagador reintenta
con el mismo uuid (perdió señal), el índice único hace que el segundo
`INSERT` falle y la transacción aborte.

Si el pagador genera dos uuid distintos (dos toques discretos), la Capa 1
es la que salva: el segundo ve `pagada` y no hace nada.

---

## `CajaService.anularApertura(dto): Promise<{ movimientoDestino: MovimientoCaja; movimientoMadre: MovimientoCaja }>`

Anula una apertura/recarga insertando los reversos. **Doble entrada al
revés**: reverso del crédito de la destino + reverso del débito de la madre.

### Precondiciones
- `dto.movimientoCajaId` existe. Si no: `CajaNoEncontradaException` (con
  `cajaId = movimientoCajaId` para reutilizar la excepción).
- El movimiento es de tipo `apertura` o `recarga`. Si no:
  `MovimientoNoAnulableException`.
- El movimiento no ha sido ya anulado. Si no: `MovimientoYaAnuladoException`.
  "Ya anulado" es una **consulta**, no un campo: un movimiento está anulado
  si existe un `MovimientoCaja` con `origenTipo = 'reverso_apertura'` y
  `origenId = movimientoOriginalId` (el índice `[origenTipo, origenId]`
  hace esta consulta barata). `MovimientoCaja` **no tiene ni tendrá campos
  de anulación**: la tabla es append-only y nunca recibe `UPDATE`, ni
  siquiera para marcar `anuladoAt`. Esta es la regla #1 de `AGENTS.md`
  aplicada sin excepciones.
- `dto.motivo` no vacío. Si no: `MotivoRequeridoException`.

### Comportamiento
En transacción con `FOR UPDATE` sobre ambas cajas (madre y destino, en ese
orden — el mismo que `abrirCaja`, para no meter deadlocks):

- Re-verifica dentro de la transacción que no exista ya un reverso apuntando
  al original por `origenId` (dos anulaciones simultáneas: la segunda ve el
  reverso de la primera y lanza `MovimientoYaAnuladoException`).
- Localiza el movimiento de `transferencia` en la caja madre vinculado por
  el mismo `origenId` (el id del movimiento de apertura original).
- Inserta `MovimientoCaja` en la caja destino:
  `{tipo: 'reverso_apertura', montoCents: −montoDestinoOriginal, saldoDespues,
  origenTipo: 'reverso_apertura', origenId: movimientoOriginalId, motivo,
  clientUuid: claveReverso, registradoPorId: actorId}`.
- Inserta `MovimientoCaja` en la caja madre:
  `{tipo: 'reverso_apertura', montoCents: +montoMadreOriginal, saldoDespues,
  origenTipo: 'reverso_apertura', origenId: movimientoOriginalId, motivo,
  clientUuid: claveReverso, registradoPorId: actorId}`.
- `claveReverso` es una **clave de deduplicación interna**, no un
  `clientUuid` provisto por el cliente. Se deriva del `origenId` (p. ej.
  `<movimientoOriginalId>:reverso`) y es la misma para ambas patas porque
  van en cajas distintas y la unicidad es por caja. El `AnularAperturaDto`
  no trae `clientUuid`: los reversos son generados internamente. Derivar la
  clave del `origenId` hace que el índice único `@@unique([cajaId,
  clientUuid])` actúe como segunda barrera contra la doble anulación
  concurrente (la primera es la consulta de "ya anulado" por `origenId`).
- El movimiento original **no se toca**: permanece intacto, con sus montos
  y sin ninguna marca. Quien quiera saber si está anulado consulta si
  existe su reverso (por `origenId`). El motivo y el autor de la anulación
  viven en los movimientos de reverso.

### Postcondiciones
- `cajaDestino.saldoCents` nuevo = saldo anterior − montoDestinoOriginal.
- `cajaMadre.saldoCents` nuevo = saldo anterior + montoMadreOriginal.
- Ambos saldos pueden quedar en negativo (no se rechaza).
- Cero `UPDATE` sobre `MovimientoCaja`. Solo inserciones.

---

## `CajaService.anularPago(dto): Promise<never>`

```
// PENDIENTE DE DEFINIR: anular un pago ya ejecutado.
// El reverso de la deuda del cajero es claro (ya existe anular operación),
// pero el de la caja no: ¿vuelve la plata a la caja? Iván no ha respondido.
// El endpoint rechaza con ReversoPagoNoDefinidoException y un mensaje claro.
```

Lanza `ReversoPagoNoDefinidoException` siempre. No escribe nada.

---

## `CajaService.obtenerCaja(cajaId): Promise<Caja>`

Lectura simple. `CajaNoEncontradaException` si no existe.

---

## `CajaService.listarCajas(): Promise<Caja[]>`

Devuelve todas las cajas (madre y de corredor) con su saldo. Para el panel
del admin. Incluye cajas de corredores desactivados (conservan su historia).

---

## `CajaService.saldoCaja(cajaId): Promise<{ saldoCents: bigint; moneda: string }>>

Devuelve el saldo de una caja. Es el `saldoCents` cacheado, que debe ser
igual a la suma de sus `MovimientoCaja`.

---

## `CajaService.alertasCaja(): Promise<AlertaCaja[]>`

Devuelve las alertas activas de todas las cajas. Dos tipos **distintos**:

- `saldo_bajo`: `saldoCents <= umbralAlertaCents` (y `saldoCents > 0`).
  Mensaje: "prepara la recarga".
- `saldo_negativo`: `saldoCents < 0`.
  Mensaje: "se pagó plata que no había, revisa ya".

Una caja en negativo **no** genera también `saldo_bajo`: el negativo es más
urgente y tiene su propio cartel. Si `umbralAlertaCents` es `null`, no hay
alerta de saldo bajo para esa caja (pero sí de negativo si aplica).

---

## Cómo montar el estado inicial para probar

Base de prueba: `npm run db:test:setup` (usa `tav_test`). Los servicios se
instancian directo: `new CajaService(prismaClient)`.

```ts
// Un admin (para los campos registradoPorId / creadoPorId)
const admin = await prisma.usuario.create({ data: {
  rol: 'admin', nombre: 'Admin Test', email: `admin-${uuid()}@tav.test`,
  passwordHash: 'x',
}});

// Un corredor (Venezuela — Bs por transferencia)
const corredor = await prisma.corredor.create({ data: {
  id: uuid(), pais: 'VEN', paisNombre: 'Venezuela',
  moneda: 'BS', monedaNombre: 'Bolívares',
  formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
  creadoPorId: admin.id,
}});

// Su caja (esMadre=false, saldo 0)
const cajaBs = await prisma.caja.create({ data: {
  id: uuid(), corredorId: corredor.id, esMadre: false, moneda: 'BS',
  saldoCents: 0n, umbralAlertaCents: 50_000n,  // 500 Bs
}});

// La caja madre USDT (esMadre=true, corredorId=null)
const cajaUsdt = await prisma.caja.create({ data: {
  id: uuid(), esMadre: true, moneda: 'USDT', saldoCents: 0n,
}});

// Un cajero y una operación pendiente (para probar pagos)
const cajero = await prisma.usuario.create({ data: {
  rol: 'cajero', nombre: 'Cajero Test', email: `cajero-${uuid()}@tav.test`,
  passwordHash: 'x',
  perfilCajero: { create: { limiteCents: 1_000_000n } },
}});

// La operación tiene que estar en estado 'pendiente' para que el pagador
// la pueda ejecutar. El paso de 'registrada' a 'pendiente' es parte del
// Bloque 3 (ciclo de vida); para los tests del Bloque 2 se crea directa:
const operacion = await prisma.operacion.create({ data: {
  id: uuid(), folio: 'TAV-0001', clientUuid: uuid(),
  cajeroId: cajero.id, tipo: 'usdt_bs', corredorId: corredor.id,
  montoOrigenCents: 100_00n, monedaOrigen: 'USDT',
  tasaAplicada: '285.4', comisionCents: 0n, totalCents: 100_00n,
  montoDestinoCents: 28540_00n, monedaDestino: 'BS',
  beneficiario: { nombre: 'Cliente Test' },
  estado: 'pendiente', creadaPorId: cajero.id,
}});
```

Invariante universal a verificar tras cualquier secuencia:

```ts
const suma = await prisma.movimientoCaja.aggregate({
  where: { cajaId }, _sum: { montoCents: true } });
const caja = await prisma.caja.findUnique({ where: { id: cajaId } });
expect(suma._sum.montoCents ?? 0n).toBe(caja.saldoCents);
```

Y por movimiento: cada `saldoDespues` = `saldoDespues` del movimiento
anterior (ordenando por `seq`) + su propio `montoCents`.

---

## Casos borde numerados

Los que la implementación debe cubrir a propósito:

1. **Carrera de saldo de caja**: dos `ejecutarPago` simultáneos contra la
   misma caja. El `FOR UPDATE` sobre la fila de la `Caja` serializa las
   escrituras: ambos pasan (la caja puede quedar en negativo), pero los
   `saldoCents` y `saldoDespues` no se pisan. Sin el lock, el último en
   escribir sobrescribiría el `saldoCents` del primero con un valor
   inconsistente.
2. **Doble descuento — mismo `clientUuid`**: dos `ejecutarPago` con el
   mismo `clientUuid` en `Promise.all`. El índice único tumba a uno; el
   ganador devuelve el pago existente con `yaExistia: true`. La caja se
   descuenta una sola vez.
3. **Doble descuento — `clientUuid` distinto**: el pagador toca dos veces
   con uuids distintos. El `FOR UPDATE` sobre la `Operacion` serializa: el
   segundo ve `estado = 'pagada'` y devuelve el pago existente con
   `yaExistia: true`. La caja se descuenta una sola vez.
4. **Pago contra caja sin fondos**: la caja queda en negativo. No se
   rechaza. Se emite alerta `saldo_negativo`.
5. **Apertura con doble entrada**: la caja madre baja y la destino sube en
   la misma transacción. Si una falla, ninguna queda.
6. **Apertura que deja la caja madre en negativo**: pasa. No se rechaza.
   La caja madre también sigue la regla de "alerta, no bloqueo".
7. **Reintento de apertura con mismo `clientUuid`**: devuelve los dos
   movimientos existentes (destino + madre) con `yaExistia: true`. Cero
   escrituras.
8. **Anular apertura**: inserta dos reversos (destino baja, madre sube).
   Los saldos vuelven a los valores anteriores al movimiento original.
9. **Doble anulación de apertura**: la segunda recibe
   `MovimientoYaAnuladoException`. Se detecta por consulta (existe un
   `reverso_apertura` con `origenId` = movimiento original), no por un
   campo en el original: el original queda intacto, sin ningún `UPDATE`.
10. **Anular un movimiento que no es apertura/recarga** (e.g. un `pago`):
    `MovimientoNoAnulableException`.
11. **Anular un pago** (`anularPago`): siempre lanza
    `ReversoPagoNoDefinidoException`. `// PENDIENTE DE DEFINIR`.
12. **Operación ya pagada, `clientUuid` distinto, sin carrera**: la
    operación ya estaba `pagada` antes de la llamada. `ejecutarPago`
    devuelve el pago existente con `yaExistia: true`, igual que el caso 3.
    El estado de la operación manda; el `clientUuid` no decide nada.
    **Nunca** se lanza `OperacionNoPendienteException` por estar `pagada`.
13. **Operación ni pendiente ni pagada** (e.g. `anulada`, `rechazada`):
    `OperacionNoPendienteException` con el estado actual.
14. **Caja no pertenece al corredor de la operación**:
    `CajaCorredorMismatchException`.
14b. **`ejecutarPago` con la caja madre como `cajaId`**:
    `CajaMadreInvalidaException` (no `CajaCorredorMismatchException`). Es un
    error de categoría, no de desajuste.
15. **Corredor desactivado**: `abrirCaja` contra la caja de un corredor
    inactivo → `CorredorInactivoException`. `ejecutarPago` no valida esto
    (la operación ya fue registrada cuando el corredor estaba activo).
16. **Crear corredor duplicado** (mismo `pais + moneda + formaEntrega`
    activo): `CorredorDuplicadoException`. No hay índice único en BD para
    esto (la unicidad es solo entre activos); el servicio valida antes de
    insertar. Reactivar (`activar`) también valida: no puede dejar dos
    activos con la misma combinación.
17. **Desactivar corredor**: desaparece de `listarActivos`, sigue en
    `listar`. Su caja conserva saldo e historia.
18. **Alerta `saldo_bajo` vs `saldo_negativo`**: una caja en negativo
    genera `saldo_negativo` pero **no** `saldo_bajo`. Son carteles distintos.
19. **Caja sin `umbralAlertaCents`**: no genera `saldo_bajo` por mucho que
    baje, pero sí `saldo_negativo` si pasa de cero.
20. **`ingresarCajaMadre` con monto 0 o negativo**: `MontoInvalidoException`.
21. **`ingresarCajaMadre` sin motivo**: `MotivoRequeridoException`.
22. **`abrirCaja` con tasa ≤ 0**: `TasaInvalidaException`.
23. **Ingreso a una caja que no es madre**: `CajaMadreInvalidaException`.
24. **Apertura a una caja que es madre**: `CajaMadreInvalidaException`.
25. **`ejecutarPago` con `formaPago` o `nombreCliente` vacíos**:
    `CampoRequeridoException` con el `campo` correspondiente. No es
    `MontoInvalidoException`: un nombre faltante no es un monto inválido.
26. **Apertura aritméticamente incoherente** (capa HTTP): el DTO de
    apertura/recarga rechaza con 400 cuando `montoDestinoCents` se aleja
    de `montoMadreCents × tasaConversion` más allá de la tolerancia de
    redondeo (fórmula en la sección de coherencia aritmética de
    `abrirCaja`). El servicio **no** valida esto: los tests del servicio
    pueden pasar montos incoherentes; los del DTO HTTP no.

Los que **no** están resueltos y el que escriba los tests debe saber:

27. **`// PENDIENTE DE DEFINIR:` Anular un pago ya ejecutado.** El reverso
    de la deuda del cajero existe (anular operación), pero el de la caja
    no: ¿vuelve la plata a la caja? `anularPago` rechaza siempre con
    `ReversoPagoNoDefinidoException`. Cuando el cliente decida, se
    implementa y los tests se ajustan.
28. **`// PENDIENTE DE DEFINIR:` `umbralAlertaCents` por defecto.** ¿Lo
    fija el admin caja por caja, o hay un default por moneda? Hoy es
    `null` hasta que el admin lo fije. Sin umbral, no hay alerta de
    saldo bajo (solo de negativo).
29. **`// PENDIENTE DE DEFINIR:` Qué pasa si el pagador de un país no está
    disponible.** Con un solo pagador por país, no hay a quién derivar.
30. **`// PENDIENTE DE DEFINIR:` Retención de comprobantes.** Sigue sin
    definirse desde Fase 1.
31. **Resuelto en Bloque 2**: los campos de pago de la `Operacion`
    (`pagadaAt`, `tasaEjecucion`, `formaPago`, `nombreCliente`,
    `pagadaPorId`), el `corredorId` (nullable) y los estados `pendiente` y
    `pagada` en `EstadoOperacion` se añaden por migración **como parte del
    Bloque 2**, aunque conceptualmente sean del Bloque 3: sin ellos
    `ejecutarPago` no se puede probar. Los tests pueden depender de ellos.

---

## Verificación (`db:verify`)

El script `prisma/verify.ts` ya extendido comprueba para cada caja:

- `suma(MovimientoCaja.montoCents) == caja.saldoCents`
- `saldoDespues` de cada movimiento en secuencia cuadra con el acumulado
- Restricción `esMadre` XOR `corredorId`
- Coherencia de campos de conversión: solo `apertura`/`recarga` los llevan,
  y los tres van juntos o ninguno

Tras cualquier secuencia de tests, `npm run db:verify` debe pasar sin
errores. Si falla, hay un bug en la implementación.
