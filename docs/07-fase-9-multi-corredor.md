# Fase 9 — Multi-corredor, pagador y tesorería

Todo lo de aquí viene de los mensajes de Iván y Saddiel de agosto 2026 y del
formulario respondido el 1/9/2026. Las reglas confirmadas están en
`docs/01-reglas-de-negocio.md`; este documento las traduce a modelo y pantallas.

Lo que no esté aquí, no está decidido. `// PENDIENTE DE DEFINIR:` y preguntar.

---

## 1. Qué cambia

Hoy el sistema asume **una sola moneda** y **un solo destino**. TAV opera desde
Guyana hacia varios países, cobra en dólares guyaneses y paga en la moneda de
cada destino. Fase 9 mete esa realidad en el modelo.

Son tres cosas de tamaños muy distintos, y conviene no confundirlas:

| | Qué es | Tamaño |
|---|---|---|
| **Corredores y tasas** | Una tabla de destinos con su tasa, y una pantalla para que el admin la actualice a diario. | Chico |
| **El pagador** | Un cuarto rol, y un ciclo de vida para la operación que hoy no existe. | Mediano |
| **Tesorería y cajas** | El inventario de TAV por moneda. Un segundo libro, separado del de deuda. | Grande |

Y por debajo de las tres, un cambio de base: **el libro de cuentas pasa a GYD**.

---

## 2. La moneda del libro es GYD

Confirmado: el cajero debe en dólares guyaneses, que es lo que le pagan allá.

Hoy los montos son `BigInt` de centavos sin moneda explícita, y la app muestra
dólares. El cambio es invasivo pero acotado, y se hace **una sola vez**:

- Los saldos, límites y movimientos del cajero se expresan en **centavos de GYD**.
- La app del cajero y la del cobrador muestran GYD.
- El formato sigue la regla de siempre: punto para miles, coma para decimales.

**Esto no convierte el ledger en multi-moneda.** El libro de deuda sigue teniendo
una sola moneda; lo que pasa es que ahora es GYD en vez de dólares. La
multi-moneda vive en dos lugares acotados: la conversión de cobros (§5) y las
cajas (§6).

---

## 3. Corredores y tasas

### El corredor no es un par de monedas

Un corredor es **destino + forma de entrega**. Venezuela tiene dos —bolívares por
transferencia y dólares en efectivo— con tasas distintas. Si se modela como par
de monedas, ese caso no cabe y toca migrar.

Corredores iniciales, de los mensajes de Saddiel:

| Destino | Moneda | Entrega |
|---|---|---|
| Venezuela | Bs | Transferencia |
| Venezuela | USD | Efectivo en mano |
| Brasil | BRL | Transferencia |
| Colombia | COP | Transferencia |
| Rep. Dominicana | DOP | Transferencia |
| México | MXN | Transferencia |

**La lista no se quema en el código.** El admin puede añadir corredores desde el
panel: *"y así sucesivamente los países que tengamos disponibles para transferir"*.
Cada corredor se puede activar y desactivar; uno desactivado desaparece de la app
del cajero pero conserva su historia.

### La tasa se compone de dos patas

El cajero **siempre ve un solo número**: GYD → moneda de destino. Las dos patas son
internas. Saddiel lo dijo explícito: *"esta opción es solo para el operador que
hace los pagos"*.

```
Pata base      GYD → USDT        una sola, mueve todos los corredores
Pata destino   USDT → moneda     una por corredor
Margen         %                 uno por corredor
                                 ↓
Tasa al cajero = (destino ÷ base) × (1 − margen)
```

El admin escribe las dos patas y el margen. La tasa que ve el cajero se calcula sola.

### Son dos tasas distintas, no una

De la conversación del 1/9/2026 por la noche. Esto corrige lo que decía antes
este documento, y explica una contradicción aparente entre lo que Iván había
respondido en el formulario y lo que dijo después.

| | Quién la pone | Cuándo | Para qué sirve |
|---|---|---|---|
| **Tasa cotizada** | El admin | Publicada, antes de operar | Es la que ve el cajero y con la que él le cotiza a su cliente. Se congela en la operación. |
| **Tasa de ejecución** | El pagador | Al momento de pagar | Es a cómo se ejecutó de verdad el cambio: 240, 244, 250. Varía por operación. |

*"Todos los precios son distintos según el cliente."* El pagador registra, con
cada pago, **a cómo se está ejecutando el cambio** y el **nombre del cliente**.

La cotizada tiene que existir antes y ser estable: si el cajero no sabe la tasa
del día, no puede cotizarle a su cliente ni despachar. La de ejecución solo se
conoce cuando el pagador hace el pago.

**La ganancia real sale de la diferencia entre las dos.** Esto reemplaza la
`tasaCosto` que se había propuesto en Fase 8: el costo no es un número que el
admin teclee, es lo que el pagador reporta al ejecutar.

### Cero integraciones

**Ninguna tasa se lee de una fuente externa.** Iván menciona el BCV como su
referencia mental —*"el servicio por automático es BCV"*— y a veces cotiza por
encima cuando le conviene cobrar más por el cambio. Todo eso lo teclea el admin.

El sistema no consulta al BCV ni a ninguna API. Es una decisión deliberada: una
integración es una dependencia que se cae, cambia de formato y hay que mantener,
a cambio de ahorrarle a una persona treinta segundos al día.

### Reglas duras

- **La tasa se congela en la operación.** Ya se hace con `tasaAplicada`. Publicar
  tasas nuevas **nunca** puede mover una operación ya registrada.
- **Solo el admin cambia tasas.** Nadie más, ningún rol.
- Cada publicación queda con autor y fecha. El historial es consultable.
- Un corredor sin tasa publicada no es ofrecible: no aparece en la app del cajero.

### Implementación (Bloque 3)

La tasa se modela con dos tablas que se publican atómicamente:

```
PublicacionTasas
  pataBase       Decimal(18,6)   1 USDT = X GYD. Una sola por publicación.
  publicadaPorId String
  publicadaAt    DateTime

PublicacionTasaItem
  publicacionId   String          → PublicacionTasas
  corredorId      String          → Corredor
  pataDestino     Decimal(18,6)   1 USDT = Y moneda destino
  margen          Decimal(6,4)    legible: 2.5 = 2.5%. CHECK: 0 ≤ margen < 100.
  tasaCotizada    Decimal(18,8)   (pataDestino ÷ pataBase) × (1 − margen/100)
```

La publicación es atómica: la pata base y todos los items se insertan en una
sola transacción. No existe un estado intermedio con pata base nueva y patas
destino viejas.

- `tasaCotizada` va en `Decimal(18,8)`: con 6 decimales el corredor de USD en
  efectivo (1 GYD ≈ 0,00455 USD) queda apretado. Las patas se quedan en 6.
- El margen se guarda legible (2.5 = 2.5%) y la división entre 100 vive en un
  único sitio: `TasaCorredorService.margenAFactor`. Un porcentaje guardado en
  forma legible es la receta clásica del bug de dividir dos veces.
- El monto destino se redondea half-up a centavos en Decimal, nunca float:
  `montoDestino = round_half_up(montoGydCents × tasaCotizada)`.
- El umbral de aviso al publicar (10% de desviación sobre la publicación
  anterior) vive en `Config.tasa_umbral_aviso_pct`, no quemado.
- La pantalla del admin precarga todos los corredores activos con sus valores
  anteriores y avisa si alguno se quedó sin valor antes de publicar.
- El endpoint del cajero (`GET /cajero/corredores`) devuelve solo `tasaCotizada`
  por corredor. NUNCA margen, pataDestino ni pataBase.

---

## 4. El rol pagador

Un cuarto rol. **Uno por país**, y **atiende varias monedas**.

### Qué ve

Su cola de pagos pendientes. **No ve la deuda del cajero ni el margen de TAV.**
Palabras de Iván: *"solo necesita ejecutar las órdenes que llegan."*

**Las cajas no son suyas: son del admin.** *"Esa caja interna la tendría el
pagador? — El admin. Sería como un supervisor."* El pagador ejecuta; quien mira
el inventario de plata por moneda es el admin.

### Qué registra al pagar

Al marcar una operación como pagada, el pagador escribe:

- **A cómo se ejecutó el cambio** — la tasa real de ese pago (240, 244, 250…).
- **La forma en que pagó** — pago móvil, transferencia, efectivo. Determina de
  qué caja sale la plata.
- **El nombre del cliente** que recibió.

Ejemplo textual de Iván: *"el cajero me pasó un pago, que yo le estoy cobrando a
2,50 por pago móvil. Realizo el pago, y el movimiento de una vez se descuenta de
mi caja."*

Estos datos son lo que después permite calcular la ganancia real de TAV y saber
cuánto queda en cada caja.

### Qué le hace a la operación

Aquí está el cambio de fondo: hoy una operación nace y ya está. Con pagador, la
operación adquiere un ciclo de vida.

```
registrada  →  el cajero la crea, se carga a su deuda al instante
   ↓
pendiente   →  entra en la cola del pagador del país destino
   ↓
pagada      →  el pagador la marca, se descuenta de la caja correspondiente
```

Dos cosas que no cambian con esto:

- **La deuda del cajero se carga al registrar, no al pagar.** El cajero debe desde
  el momento en que despacha. El estado del pago es asunto de TAV.
- El cajero ve el estado de su operación, pero su cupo no depende de él.

---

## 5. Cobros en moneda distinta a la deuda

El cajero debe en GYD y paga en bolívares, dólares en efectivo, pago móvil o USDT.

**La tasa de conversión la fija el admin desde el panel**, junto con las demás
tasas. El cobrador no escribe tasas: al registrar el cobro, el sistema aplica la
tasa vigente de esa moneda.

El cobro guarda **las dos cifras**: lo recibido en su moneda original y su
equivalente en GYD. Guardar solo el resultado pierde el rastro del efectivo real,
que es justo lo que el admin verifica al cierre.

> La deuda del cajero baja **en el acto**. Diferir la conversión hasta el cierre
> dejaría al cajero sin ver su pago aplicado, y eso no es aceptable en un negocio
> de crédito.

---

## 6. Tesorería: las cajas

Es la parte cara, y la que conviene construir de último.

### Qué es una caja

Una caja responde una sola pregunta: **¿dónde está la plata y cuánta queda?**

En palabras de Iván: *"si tú cambias 5.000 para Brasil, ¿dónde están esos reales?
Tú diseñas la caja de Brasil, ahí 3.500. Cada pago que se ejecute se va a ejecutar
desde esa caja, y esa caja se va a ir reduciendo."*

**Hay una caja por corredor.** No por moneda, por corredor — que ya es destino más
forma de entrega. Los bolívares en cuenta y los dólares en efectivo en Venezuela
son dos cajas distintas, porque son dos plata distintas en dos lugares distintos.
Brasil por Pix es otra.

### Apertura de caja

*"Yo puedo cambiar un día 3.000 dólares en bolívares, entonces ya yo tengo mi caja
de bolívares con 3.000 dólares. Si usé 700, se me descontaron los 700 y me queda
tanto."*

El admin **abre la caja** con un monto: convierte USDT a la moneda del corredor y
ese es el saldo con el que se opera. A partir de ahí la caja solo baja, con cada
pago que ejecuta el pagador, hasta que el admin la recarga.

```
Apertura       admin convierte USDT → moneda del corredor, a la tasa que consiguió
   ↓
Saldo          baja con cada pago ejecutado
   ↓
Recarga        otra conversión desde USDT cuando hace falta
```

**USDT es la caja madre.** *"Nosotros lo que tenemos es siempre tener USDT y
cambiar, nosotros mismos internamente. Ese cambio interno para llenar las cajas
también lo tiene que tener el sistema."*

La conversión interna es un movimiento de primera clase: guarda cuánto USDT salió,
cuánto entró en la caja destino, a qué tasa, quién la hizo y cuándo. Sin eso no se
puede saber si el negocio ganó o perdió en el cambio.

### Reglas

- **Solo el admin abre, recarga y ve las cajas.** El pagador ejecuta contra ellas
  pero el inventario es del admin — *"sería como un supervisor"*.
- Cada pago ejecutado descuenta de la caja de su corredor, en el acto.
- **Este es un segundo libro, aparte del de deuda.** El de deuda dice cuánto le
  deben los cajeros a TAV; el de cajas dice cuánta plata tiene TAV y dónde. No se
  mezclan y no se suman.
- Aplica la misma regla innegociable: **solo-inserción**. Corregir es un asiento
  inverso, nunca un `UPDATE`.
- El saldo de una caja es siempre la suma exacta de sus movimientos, igual que el
  saldo de un cajero. Debe haber una verificación automática que lo compruebe.

### Una caja vacía solo avisa

Confirmado, y es lo que abarata la fase: cuando una caja se queda sin fondos el
sistema **alerta**, no bloquea. *"Envía una alerta para nosotros estar atentos."*

Las cajas son un tablero, no un mecanismo de control. Si más adelante quieren que
frene operaciones hacia ese destino, es una decisión que se toma después y cuesta
semanas — construirla ahora sería adivinar.

---

## 7. Lo que sigue abierto

- **Anular una operación ya pagada.** El reverso de la deuda es claro; el de la
  caja no. ¿Vuelve la plata a la caja? Preguntarlo antes de construir §6.
- **Qué pasa si una caja se queda en negativo** porque el pagador ejecutó más de lo
  que había. Solo alerta, o se impide.
- **Qué pasa si el pagador de un país no está disponible.** Con un solo pagador por
  país, no hay a quién derivar.
- **Retención de comprobantes.** Sigue sin definirse desde Fase 1.

---

## 8. Orden de construcción

El orden importa: cada bloque depende del anterior y cada uno es entregable solo.

1. **Base GYD.** Cambiar la moneda del libro. Invasivo, mecánico, se hace primero
   porque todo lo demás asienta encima.
2. **Corredores y tasas.** Tabla, pantalla del admin, tasa compuesta, congelado en
   la operación. Con esto el cajero ya puede escoger destino.
3. **Conversión de cobros.** Tasas por moneda de cobro y las dos cifras en el
   registro. Cierra el ciclo de crédito en multi-moneda.
4. **Pagador.** Rol, ciclo de vida de la operación, cola de pagos.
5. **Cajas.** Segundo libro, conversiones desde USDT, alertas de saldo bajo.

Los pasos 1 a 3 valen por sí solos aunque el pagador nunca se construya. El 5 no
tiene sentido sin el 4.
