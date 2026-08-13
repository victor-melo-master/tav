# Contrato del módulo ledger

Este documento es el contrato de `apps/api/src/ledger/`. Los tests se escriben
leyendo **solo** este archivo, sin ver la implementación. Si algo aquí es ambiguo,
el contrato está mal, no el test.

Servicios NestJS exportados por `LedgerModule`:

- `LedgerService` — `registrarOperacion`, `registrarCobro`, `anular`
- `SemaforoService` — `calcular`

Ambos reciben `PrismaService` por constructor, así que pueden instanciarse a mano
contra una base de prueba: `new LedgerService(prisma)`.

Convención global: **todo monto es `bigint` de centavos USD** salvo que se indique
lo contrario. Las tasas viajan como `string` decimal (`"285.4"`). No hay HTTP aquí:
las excepciones son clases planas que la capa de controladores mapeará después.

---

## Tipos compartidos (`ledger.dto.ts`)

```ts
interface RegistrarOperacionDto {
  clientUuid: string;          // idempotencia, generado en el dispositivo
  cajeroId: string;            // PerfilCajero.usuarioId
  tipo: string;                // "usdt_bs" | "usd_efectivo_bs"
  montoOrigenCents: bigint;
  monedaOrigen: string;        // "USDT" | "USD"
  tasaAplicada: string;        // se congela en el registro
  comisionCents: bigint;
  totalCents: bigint;          // lo que suma a la deuda
  montoDestinoCents: bigint;
  monedaDestino: string;       // "BS"
  beneficiario: { nombre; documento; banco; cuenta; metodo: string };
  comprobanteUrl?: string;
  creadaPorId: string;
}

interface RegistrarCobroDto {
  clientUuid: string;
  cajeroId: string;
  cobradorId?: string | null;  // null/ausente si lo registró el admin
  metodo: MetodoCobro;         // 'efectivo_usd' | 'bolivares' | 'pago_movil' | 'usdt'
  montoCents: bigint;          // en la moneda recibida
  moneda: 'USD' | 'BS' | 'USDT';
  tasaAplicada?: string | null; // OBLIGATORIA si moneda === 'BS'
  comprobanteUrl?: string;
  nota?: string;
  registradoPorId: string;
}

interface SemaforoResultado {
  estado: 'verde' | 'ambar' | 'rojo';
  dias: number;
  pct: number;                 // saldo / límite efectivo (number, para presentación)
  bloqueado: boolean;          // pct >= 1
  motivo: string;              // texto legible del eje que manda
  disponibleCents: bigint;     // max(0, límite efectivo − saldo)
}
```

---

## Excepciones (`ledger.exceptions.ts`)

Todas extienden `LedgerException extends Error` y tienen un campo `code: string`.

| Clase | `code` | Payload | Cuándo |
|---|---|---|---|
| `SinCupoException` | `SIN_CUPO` | `payload: {disponible, requerido, faltante}` (los tres `bigint`) | `totalCents` > límite efectivo − saldo. `faltante = requerido − disponible > 0`. `disponible` puede ser negativo si ya estaba sobregirado. |
| `YaAnuladoException` | `YA_ANULADO` | `tipo: 'operacion'\|'cobro'`, `id: string` | Segundo intento de anular el mismo registro. |
| `CierreNoAbiertoException` | `CIERRE_NO_ABIERTO` | `cierreId`, `estado: string` | El cierre de hoy del cobrador existe pero su estado no es `abierto`. |
| `TasaRequeridaException` | `TASA_REQUERIDA` | — | Cobro con `moneda === 'BS'` sin `tasaAplicada`, o con tasa ≤ 0. |
| `MotivoRequeridoException` | `MOTIVO_REQUERIDO` | — | `anular` con motivo vacío o solo espacios. |
| `CajeroNoValidoException` | `CAJERO_NO_VALIDO` | `cajeroId: string` | `cajeroId` no corresponde a un `PerfilCajero`. Se valida **antes** de abrir la transacción. |
| `CobradorNoValidoException` | `COBRADOR_NO_VALIDO` | `cobradorId: string` | `cobradorId` no corresponde a un `PerfilCobrador`. Se valida **antes** de abrir la transacción. |
| `NoEncontradoException` | `NO_ENCONTRADO` | `entidad: string`, `id: string` | Cajero, operación o cobro inexistente. |
| `ConfigFaltanteException` | `CONFIG_FALTANTE` | `clave: string` | Falta una clave `semaforo.*` en la tabla `Config`. |

---

## `LedgerService.registrarOperacion(dto)`

```ts
registrarOperacion(dto: RegistrarOperacionDto):
  Promise<{ operacion: Operacion; yaExistia: boolean }>
```

### Precondiciones
- Existe `PerfilCajero` con `usuarioId = dto.cajeroId` (si no: `NoEncontradoException`).
- `dto.clientUuid` único por intento lógico de operación.

### Comportamiento
1. **Idempotencia primero**: si ya existe una `Operacion` con ese `clientUuid`,
   devuelve `{operacion: laExistente, yaExistia: true}` sin escribir nada.
2. En una única transacción con `FOR UPDATE` sobre la fila del cajero:
   - `limiteEfectivo = limiteCents + montoCents` de la ampliación con
     `estado = 'aprobada'` más antigua por `resueltaAt` (0 si no hay).
   - `disponible = limiteEfectivo − saldoCents`.
   - Si `dto.totalCents > disponible` → `SinCupoException` y **rollback total**:
     ni operación, ni movimiento, ni cambio de saldo, ni folio... nada queda.
   - Si alcanza: inserta la `Operacion` (folio `TAV-<n>` de secuencia Postgres,
     estado inicial `en_verificacion`), inserta `Movimiento`
     `{tipo: 'cargo', montoUsdCents: +totalCents, saldoDespues, origenTipo: 'operacion', origenId}`,
     y actualiza el perfil.

### Postcondiciones (caso éxito, `yaExistia: false`)
- `saldoCents` nuevo = saldo anterior + `totalCents`.
- `deudaDesde`: si era `null` pasa a "ahora"; si ya tenía valor, **no cambia**.
- Existe exactamente un `Movimiento` `cargo` nuevo cuyo `saldoDespues` es igual
  al `saldoCents` cacheado.
- **Ampliación**: se consume **solo si hizo falta**, es decir, solo si
  `totalCents > limiteCents − saldoCents` (no cabía en el límite base).
  Si se consumió: `ampliacion.estado = 'consumida'` y `operacion.ampliacionId = ampliacion.id`.
  Si la operación cabía en el límite base, la ampliación queda `aprobada` intacta
  y `operacion.ampliacionId = null`.
- `tasaAplicada` queda congelada tal como llegó en el DTO.

### Caso repetido (`yaExistia: true`)
- Cero escrituras. El conteo de operaciones, movimientos y el saldo no cambian.

---

## `LedgerService.registrarCobro(dto)`

```ts
registrarCobro(dto: RegistrarCobroDto):
  Promise<{ cobro: Cobro; yaExistia: boolean }>
```

### Precondiciones
- Existe el `PerfilCajero`. Si `cobradorId` viene, existe el `PerfilCobrador`
  (si no existe, la transacción falla por FK — no hay excepción amigable, ver casos límite).
- Si `moneda === 'BS'`: `tasaAplicada` presente y > 0, si no `TasaRequeridaException`
  (se lanza **antes** de abrir la transacción: cero escrituras).

### Comportamiento
1. **Idempotencia antes que nada**: `clientUuid` ya existe → devuelve
   `{cobro: elExistente, yaExistia: true}` sin escribir nada. También cubre la
   carrera de dos peticiones simultáneas con el mismo uuid (índice único).
2. Conversión: `montoUsdCents = moneda === 'BS' ? round_half_up(montoCents / tasa) : montoCents`.
   USD y USDT pasan tal cual (paridad 1:1 con USDT asumida, ver casos límite).
3. En transacción con `FOR UPDATE` sobre el cajero y luego sobre el cierre:
   - Si `cobradorId` viene: busca el `Cierre` del cobrador con
     `fecha = hoy en America/Caracas` (no UTC). Si no existe lo crea
     (`estado: 'abierto'`, totales en 0). Si existe pero `estado !== 'abierto'`
     → `CierreNoAbiertoException` y rollback.
   - Si `cobradorId` es null (lo registró el admin): `cierreId = null`, no se toca
     ningún cierre.
   - Inserta el `Cobro` (folio `COB-<n>` de secuencia, `esEfectivo = (metodo === 'efectivo_usd')`,
     `tasaAplicada` solo si vino en BS, `sincronizadoAt` = ahora),
     inserta `Movimiento` `{tipo: 'abono', montoUsdCents: −montoUsdCents, saldoDespues}`,
     actualiza el perfil y recalcula los totales del cierre.

### Postcondiciones (caso éxito)
- `saldoCents` nuevo = saldo anterior − `montoUsdCents`. **Puede quedar negativo**
  (pago en exceso); no se rechaza ni se recorta.
- `deudaDesde`: si el saldo nuevo ≤ 0 → `null`. Si sigue > 0 → conserva su valor.
- Cierre (cuando aplica): `totalRegistradoCents` = suma de `montoUsdCents` de los
  cobros **no anulados** del cierre; `digitalCents` = ídem pero solo los de
  `esEfectivo = false`. `efectivoDeclaradoCents` NO se toca (lo declara el
  cobrador a mano al enviar el cierre).
- El `Movimiento` abono tiene monto **negativo** y su `saldoDespues` cuadra con el cache.

### Caso repetido
- Cero escrituras nuevas. Un solo `Cobro` con ese `clientUuid` en la base.

---

## `LedgerService.anular(tipo, id, motivo, actorId)`

```ts
anular(tipo: 'operacion' | 'cobro', id: string, motivo: string, actorId: string):
  Promise<Operacion | Cobro>   // el registro original ya marcado como anulado
```

### Precondiciones
- `motivo` no vacío ni solo espacios (si no: `MotivoRequeridoException`, cero escrituras).
- El registro existe (`NoEncontradoException`) y no está ya anulado (`YaAnuladoException`).
  La doble anulación se rechaza incluso bajo concurrencia (se re-verifica con el lock en mano).

### Comportamiento — nunca borra nada
En transacción con `FOR UPDATE` sobre el cajero:

**`tipo === 'operacion'`:**
- Inserta `Movimiento` `{tipo: 'reverso_cargo', montoUsdCents: −totalCents, saldoDespues, motivo, registradoPorId: actorId, origenTipo: 'operacion', origenId: id}`.
- Marca la operación: `estado = 'anulada'`, `anuladaAt`, `anuladaPorId = actorId`, `motivoAnulacion = motivo`.
- Saldo nuevo = saldo − `totalCents`. `deudaDesde`: `null` si el saldo quedó ≤ 0;
  si queda deuda, **conserva el valor previo** (no se recalcula al cargo vivo más viejo — ver casos límite).
- Si la operación consumió una ampliación, la ampliación **queda `consumida`**
  (marcado como `PENDIENTE DE DEFINIR` en el código).

**`tipo === 'cobro'`:**
- Inserta `Movimiento` `{tipo: 'reverso_abono', montoUsdCents: +montoUsdCents, saldoDespues, motivo, ...}`.
- Marca el cobro: `anuladoAt`, `anuladoPorId`, `motivoAnulacion`.
- Saldo nuevo = saldo + `montoUsdCents`. `deudaDesde`: si el saldo nuevo > 0 y
  `deudaDesde` era `null`, se pone en "ahora" (el momento del reverso, no la fecha
  del cargo original — ver casos límite). Si ya tenía valor, se conserva.
- Si el cobro pertenecía a un cierre, se recalculan `totalRegistradoCents` y
  `digitalCents` **excluyendo** los anulados. Anular el único cobro deja ambos en 0,
  pero el cierre y el cobro siguen existiendo y visibles.

### Postcondición clave
Anular un cobro deja `saldoCents` **exactamente** en el valor que tenía antes de
registrarlo (mismo bigint, sin redondeos nuevos: el reverso usa el `montoUsdCents`
guardado, no reconvierte con tasa).

---

## `SemaforoService.calcular(cajeroId, ahora?)`

```ts
calcular(cajeroId: string, ahora: Date = new Date()): Promise<SemaforoResultado>
```

Solo lee; nunca escribe. Umbrales desde `Config` (las tres claves son obligatorias,
si falta una → `ConfigFaltanteException`):

| Clave | Valor seed |
|---|---|
| `semaforo.dias_ambar` | `"4"` |
| `semaforo.dias_rojo` | `"7"` |
| `semaforo.pct_ambar` | `"0.75"` |

Cálculo:

```
limiteEfectivo = limiteCents + ampliación 'aprobada' (la más antigua), si existe
dias  = deudaDesde ? floor((ahora − deudaDesde) / 86_400_000) : 0   // nunca negativo
pct   = limiteEfectivo > 0 ? Number(saldo) / Number(limiteEfectivo) : 0

porDias    = dias >= dias_rojo ? 2 : dias >= dias_ambar ? 1 : 0
porCredito = pct >= 1 ? 2 : pct >= pct_ambar ? 1 : 0

estado     = ['verde','ambar','rojo'][max(porDias, porCredito)]
bloqueado  = pct >= 1
disponibleCents = max(0n, limiteEfectivo − saldoCents)
```

`motivo`: `"Al día"` en verde; `"Sin cupo"` si bloqueado; `"Cerca del límite"` si
manda el eje de crédito en ámbar; `"Deuda vencida (N días)"` / `"Deuda por vencer (N días)"`
si manda el eje de días. En empate de nivel gana la explicación del eje de crédito.

Nota: una ampliación `aprobada` **sube** el límite efectivo y por tanto **baja** el
pct y puede desbloquear a un cajero al 100% de su límite base. Una `consumida` no cuenta.

---

## Cómo montar el estado inicial para probar

Base de prueba: `npm run db:test:setup` (usa `tav_test`). Los servicios se
instancian directo: `new LedgerService(prismaClient)` — cualquier objeto con la
interfaz de `PrismaClient` sirve, no hace falta el contenedor de Nest.

Mínimo indispensable:

```ts
// Config (sin esto el semáforo lanza ConfigFaltanteException)
await prisma.config.createMany({ data: [
  { clave: 'semaforo.dias_ambar', valor: '4' },
  { clave: 'semaforo.dias_rojo',  valor: '7' },
  { clave: 'semaforo.pct_ambar',  valor: '0.75' },
], skipDuplicates: true });

// Un cajero con límite de $1.000,00 y saldo 0
const cajero = await prisma.usuario.create({ data: {
  rol: 'cajero', nombre: 'Cajero Test', telefono: 'unico-por-test',
  passwordHash: 'x',
  perfilCajero: { create: { limiteCents: 100_000n } },
}});
// cajeroId para los DTOs = cajero.id (== PerfilCajero.usuarioId)

// Un cobrador (solo para cobros con cierre)
const cobrador = await prisma.usuario.create({ data: {
  rol: 'cobrador', nombre: 'Cobrador Test', telefono: 'otro-unico',
  passwordHash: 'x', perfilCobrador: { create: {} },
}});

// Una ampliación aprobada de $200,00 (para los casos de cupo ampliado)
await prisma.ampliacionCredito.create({ data: {
  cajeroId: cajero.id, montoCents: 20_000n, motivo: 'test',
  estado: 'aprobada', resueltaAt: new Date(), resueltaPorId: admin.id,
}});
```

- `telefono` tiene índice único: usar valores distintos por test o limpiar entre tests.
- Para un cajero con saldo previo, **no** escribir `saldoCents` a mano: registrar
  una operación por el ledger, que es la única vía legal. (El seed lo hace a mano,
  pero es seed.)
- Para probar el eje de días, sí es válido fijar `deudaDesde` directo en el perfil
  (es un dato de estado, no un derivado del libro).
- Números cómodos: límite `100_000n`, operación de `60_000n` → pct 0.6 verde;
  `+30_000n` → 0.9 ámbar; `+10_000n` → 1.0 rojo/bloqueado.
- Conversión BS redonda: `montoCents = 2_854_000n` con tasa `"285.4"` → `10_000n` exactos.

Invariante universal a verificar tras cualquier secuencia:

```ts
const suma = await prisma.movimiento.aggregate({
  where: { cajeroId }, _sum: { montoUsdCents: true } });
expect(suma._sum.montoUsdCents ?? 0n).toBe(perfil.saldoCents);
```

Y por movimiento: cada `saldoDespues` = `saldoDespues` del movimiento anterior
(ordenando por `seq`) + su propio `montoUsdCents`.

---

## Casos límite considerados (y los que me generan dudas)

Los que la implementación cubre a propósito:

1. **Carrera de cupo**: dos `registrarOperacion` en `Promise.all` que juntas
   exceden el cupo → exactamente una pasa. Es la razón del `FOR UPDATE`.
2. **Carrera de idempotencia**: dos peticiones simultáneas con el mismo
   `clientUuid` (el check previo no ve nada en ninguna de las dos). El índice
   único tumba a una, y esa devuelve el registro ganador con `yaExistia: true`.
   Vale para operaciones y cobros.
3. **Carrera de creación de cierre**: dos cobros simultáneos del mismo cobrador
   sin cierre previo. Se resuelve con `INSERT ... ON CONFLICT ("cobradorId", "fecha")
   DO UPDATE SET "cobradorId" = EXCLUDED."cobradorId" RETURNING "id"` en SQL crudo,
   que nunca lanza error y siempre devuelve la fila (la creada o la que ya existía).
   Después se toma `FOR UPDATE` sobre esa fila. Total final = suma de ambos.
   (No se puede atrapar una violación de índice único y continuar en la misma
   transacción: en Postgres el error aborta la transacción y todo comando
   posterior falla con `current transaction is aborted`.)
4. **Carrera de totales del cierre**: dos cobros del mismo cobrador a cajeros
   distintos recalculan a la vez. Sin lock del cierre, el último en escribir
   pisaría al otro con un total incompleto. El orden de locks es siempre
   cajero → cierre, así que no hay deadlock.
5. **Doble anulación concurrente**: el estado de anulación se re-verifica después
   de adquirir el lock del cajero; la segunda recibe `YaAnuladoException`.
6. **SinCupo no consume folio ni deja rastro**: la excepción se lanza antes de
   pedir `nextval`, y el rollback cubre todo lo demás.
7. **Ampliación justa**: con límite 100.000, saldo 90.000 y ampliación de 20.000,
   una operación de 25.000 pasa (25.000 ≤ 10.000 + 20.000) y consume la ampliación.
   Una de 31.000 falla con `faltante = 1.000`.
8. **Operación que cabe en el límite base no consume la ampliación** aunque exista.
9. **Cobro que sobrepaga**: saldo puede quedar negativo y `deudaDesde` pasa a `null`.
   No hay validación de "no pagues más de lo que debes".
10. **Cobro de las 9pm de Caracas**: cae en el cierre de la fecha Caracas, no la
    UTC. La fecha viaja a Postgres como texto `YYYY-MM-DD` para que la zona
    horaria del servidor no la corra un día (bug real encontrado y corregido en
    la verificación).
11. **Redondeo BS→USD**: half-up a centavo entero. `1n` de Bs con tasa 285.4 da
    `0n` centavos USD: un cobro puede resultar en abono de 0. No se rechaza.
12. **Cobro registrado por admin** (`cobradorId` null): no crea ni toca cierre alguno.

Los que **no** están resueltos y el que escriba los tests debe saber (marcados
`PENDIENTE DE DEFINIR` en el código; los tests deben cubrir el comportamiento
actual, pero son decisiones de negocio abiertas):

13. **`deudaDesde` tras anulaciones es aproximado.** Anular un cobro que había
    saldado la deuda pone `deudaDesde` en el momento del reverso, no en la fecha
    del cargo original: el semáforo puede quedar más benévolo de lo justo.
    Simétricamente, anular la operación más vieja no recorre el libro para
    encontrar el siguiente cargo vivo. Reconstruir la fecha "verdadera" exige
    definir una política FIFO de imputación de pagos que el cliente no ha dado.
14. **Anular una operación que consumió ampliación no la revive.** El cupo extra
    se pierde. Podría argumentarse lo contrario; decisión del cliente.
15. **Cobro tardío con cierre ya enviado** → `CierreNoAbiertoException`. La
    alternativa (meterlo en silencio) alteraría un total ya declarado. Puede que
    el negocio prefiera otra cosa (¿cierre del día siguiente?).
16. **Múltiples ampliaciones aprobadas**: se usa solo la más antigua por
    `resueltaAt`, nunca se suman. El flujo normal no debería permitir dos activas,
    pero la base no lo impide.
18. **No se valida la coherencia aritmética del DTO de operación**
    (`totalCents == montoOrigenCents + comisionCents`, `montoDestinoCents` vs
    tasa): el ledger asienta lo que le mandan. Si eso debe validarse, es en la
    capa HTTP o aquí — sin definir.
19. **Anular una operación puede dejar el saldo negativo** si después de ella
    hubo cobros grandes. Se permite (coherente con el punto 9).
20. **`pct` es un `Number`**: con saldos y límites gigantescos (> 2^53 centavos)
    perdería precisión. Solo afecta presentación/umbral del semáforo; la
    validación de cupo real es 100% entera. Riesgo teórico, no práctico.
21. **El semáforo con `limiteEfectivo = 0` devuelve `pct = 0`** (verde, no
    bloqueado) aunque haya saldo. Un cajero con límite 0 y deuda es un estado
    anómalo que el flujo normal no produce.

Los que se resolvieron al encontrar bugs durante los tests de Fase 2:

17. **Validación de identidades en `registrarOperacion` y `registrarCobro`.**
    Antes era un hueco: el ledger aceptaba `cajeroId`/`cobradorId` inexistentes
    y reventaba con un error crudo de Prisma (P2003/P2010) que la capa HTTP no
    sabe mapear limpiamente. Ahora se validan **antes de abrir la transacción**:
    `cajeroId` debe corresponder a un `PerfilCajero` (si no,
    `CajeroNoValidoException`); si `cobradorId` viene informado, debe
    corresponder a un `PerfilCobrador` (si no, `CobradorNoValidoException`).
    Va fuera de la transacción a propósito: son valores que no cambian durante
    la petición, no hay carrera que proteger, y así no se alarga la sección
    crítica bajo el `FOR UPDATE`. `creadaPorId`/`actorId` siguen sin validarse
    contra `Usuario` (no tienen FK en el schema); queda como decisión abierta
    si se quiere validarlos también.
22. **Idempotencia bajo concurrencia cuando el duplicado ya no cabe en cupo.**
    Dos `registrarOperacion` (o `registrarCobro`) simultáneas con el mismo
    `clientUuid`: el chequeo de idempotencia de afuera de la transacción no
    basta — ambas pasan sin ver la operación de la otra. Sin re-verificación
    dentro de la transacción, la segunda llega al chequeo de cupo con el saldo
    ya subido por la primera y recibe `SinCupoException`, cuando el contrato
    dice que un duplicado nunca debe recibir ese error (es el mismo intento
    lógico). **Solución**: re-consultar por `clientUuid` dentro de la
    transacción, justo después de adquirir el `FOR UPDATE` del cajero y antes
    de validar el cupo; si aparece, devolver el existente con `yaExistia: true`.
    Aplica a `registrarOperacion` y `registrarCobro`, que comparten estructura.

Verificación ya realizada por mí (no sustituye los tests): un script de humo
contra `tav_test` ejercitó los puntos 1–12 con los números de ejemplo de este
documento y el invariante del libro. Todo pasó. Los casos 13–21 (excepto el 17,
ya resuelto) quedan a juicio del que escriba los tests y del cliente. Los casos
17 y 22 se resolvieron al detectarlos en los tests de Fase 2.
