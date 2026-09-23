# TAV — Entrega para pruebas

Septiembre 2026 · Rolapro Group

Versión funcional completa para que la prueben con casos reales. No es un demo
con datos de adorno: la app, el panel y el servidor son los mismos que quedarán
en producción. Lo que registren queda registrado.

---

## Cómo entrar

### Panel de administración

**https://panel.tav.rolapro.com**

| | |
|---|---|
| Usuario | `admin@tav.test` |
| Clave | `tav1234` |

Desde aquí Iván fija el precio de cada cajero, registra las compras de USDT con
su precio, abre y recarga las cajas, ve la ganancia del día, fija los límites de
crédito, aprueba ampliaciones, verifica los cierres de los cobradores y crea las
cuentas.

### App móvil (Android)

El APK va adjunto. Android va a advertir que no viene de la Play Store: hay que
permitir la instalación desde esa fuente. Es normal en una app sin publicar.

**Cajero, cobrador y pagador usan la misma app.** El rol de la cuenta decide qué
ve cada quien. La primera vez se entra con correo y clave, y la app pide crear un
PIN de 4 dígitos para las siguientes.

Cuentas de prueba, todas con clave `tav1234`:

| Rol | Correo | Para probar |
|---|---|---|
| Cajero | `carlos.ruiz@tav.test` | Un cajero al día, sin restricciones |
| Cajero | `ana.rodriguez@tav.test` | Cerca del límite: semáforo en ámbar |
| Cajero | `cajero.bloqueado@tav.test` | Bloqueado por topar el 100% del cupo |
| Cajero | `pedro.mendoza@tav.test` | Deuda vencida de 8 días |
| Cobrador | `cobrador1@tav.test` | Lista de cobro, registro y cierre del día |
| Pagador | `pagador.ven@tav.test` | Cola de pagos de Venezuela |
| Pagador | `pagador.bra@tav.test` | Cola de pagos de Brasil |

---

## Cómo funciona el precio

Esta es la parte que más conversamos, así que la dejo escrita tal como quedó.

**Todo se cuenta en dólares.** El cajero pide enviar 100 dólares a un destino.

**Cada cajero tiene su propio precio, en GYD por dólar, y uno por servicio.** Es
lo que se negoció con él y **no cambia hasta que Iván lo cambie**. Si el precio
de José para BCV es 240, enviar 100 dólares le cuesta 24.000 GYD.

**Los servicios cargados son siete:**

| Servicio | Precio de ejemplo |
|---|---|
| Venezuela · bolívares a BCV | 240 |
| Venezuela · bolívares a tasa especial | 250 |
| Venezuela · dólares en efectivo | 255 |
| Brasil · Pix | 245 |
| Colombia | 248 |
| República Dominicana | 252 |
| México | 260 |

**La ganancia sale de la diferencia con el precio de compra.** Cada vez que Iván
compra USDT registra a qué precio lo compró — 237, por ejemplo. Vender a 250 lo
que se compró a 237 es un margen del 5,5%, y el sistema lo calcula solo.

---

## El recorrido que recomiendo

Toca todo el ciclo en unos diez minutos.

**1. Mira los precios de un cajero.** En el panel, entra a la ficha de Carlos
Ruiz y abre su pestaña de precios. Cambia uno y fíjate en que queda el historial
de quién lo cambió y cuándo.

**2. Revisa las cajas.** Mira el saldo de cada caja física y de la caja madre de
USDT. Registra un ingreso de USDT con su precio de compra, o abre una caja.

**3. Registra una operación.** Entra a la app como `carlos.ruiz@tav.test`, escoge
un servicio, pon un monto **en dólares** y despacha. Vas a ver las dos cifras:
envía cien dólares, debe veinticuatro mil GYD.

**4. Paga esa operación.** Entra como el pagador del país que escogiste. La
operación está en su cola. Al abrirla ve los precios de ese cajero como
referencia. Anota cuántos bolívares entregó, sube una captura del comprobante y
ejecuta.

**5. Mira la ganancia.** En el panel, abre movimientos diarios: ahí está esa
operación con su precio de venta, su precio de compra y el margen.

**6. Cóbrale al cajero.** Entra como `cobrador1@tav.test`, regístrale un cobro,
cierra el día y verifícalo desde el panel.

Después prueba los cajeros en ámbar y en rojo para ver el bloqueo, y registra un
cobro **mayor** a la deuda de alguien para ver el saldo a favor.

---

## Qué incluye esta versión

**El pedido en dólares.** El cajero escoge servicio y monto en dólares. El
servidor calcula lo que debe con el precio de ese cajero y se lo carga al
instante. El precio queda congelado en la operación: cambiarlo después nunca
altera una operación ya registrada.

**Sin comisión visible.** El margen va dentro del precio y el cajero no lo ve en
ninguna parte, tal como quedó acordado.

**El pagador.** Uno por país. Ve su cola de pagos y los precios del cliente como
referencia, pero no los puede editar — esa fue una decisión para quitar una
fuente de errores. Al pagar anota cuántos bolívares entregó, que sirve de doble
verificación, y sube la captura del comprobante, que es obligatoria.

**Las cajas.** Una por sitio donde hay plata: bolívares en cuenta, dólares en
efectivo, Pix de Brasil, y así. Varios servicios pueden salir de la misma caja —
BCV y tasa especial comparten los bolívares, porque es la misma cuenta. La caja
madre de USDT las alimenta. El sistema avisa cuando una queda baja, y avisa
distinto y más fuerte si queda en negativo.

**La ganancia del día.** Una pantalla con todas las operaciones del día, su
precio de venta, su precio de compra y el margen, con el total y el porcentaje
ponderado.

**El crédito.** Cada cajero tiene un límite. Al llegar al 100% se le bloquean las
transacciones, con señal o sin ella. A las tres cuartas partes recibe un aviso.
Puede pedir ampliación; el admin la aprueba, se consume en una operación y el
cupo vuelve solo.

**El adelanto.** Un cajero puede abonar de más para operar tranquilo. Ese saldo a
favor le sube el cupo por encima de su límite, no cuenta como deuda, y el
contador de días no arranca hasta que se agota.

**Los cobros.** Todos los cobradores ven a todos los deudores, con los bloqueados
primero. El cobro queda cargado al registrarlo; anular exige motivo escrito. El
cajero siempre paga en guyaneses, en efectivo o por transferencia.

**El cierre diario.** El cobrador declara cuánto lleva en efectivo y cuánto entró
por transferencia. El admin verifica el efectivo contra lo que recibe en mano.

**La contabilidad.** Nada se edita ni se borra: una corrección es un asiento
inverso. Los abonos saldan primero la deuda más vieja. Hay una verificación
automática que comprueba que el saldo de cada cajero y de cada caja es
exactamente la suma de sus movimientos.

---

## Qué falta

Nada de esto impide probar el negocio completo.

**Anular un pago ya ejecutado.** Está bloqueado a propósito, esperando su
respuesta: si se anula una operación que el pagador ya pagó, ¿la plata vuelve a
la caja o no?

**Crear servicios desde el panel.** Los siete que hay vienen cargados. Añadir uno
nuevo requiere que nosotros lo hagamos; la pantalla es trabajo de una tarde.

**Trabajo sin conexión.** La app necesita internet para registrar. La siguiente
entrega trae una cola local para que el cobrador registre sin señal.

**Cuatro pantallas del cajero** — notificaciones, seguridad, abono y beneficiarios
guardados — muestran "próximamente".

---

## Lo que necesitamos decidido de su parte

**1. Si se anula una operación que el pagador ya pagó, ¿vuelve la plata a la
caja?** La deuda del cajero se revierte sin problema, pero los bolívares ya
salieron del banco. Es lo único del sistema que no sabe qué hacer.

**2. Los precios reales de cada cajero.** Los que están cargados son de ejemplo.
Pásennos los de verdad, o cámbienlos desde el panel.

**3. Ejemplos reales de mensajes de datos bancarios.** Tres o cuatro mensajes de
WhatsApp tal como se los mandan a sus cajeros, para afinar el botón de pegar
datos con los formatos que ustedes ven de verdad.

---

## Cómo darnos feedback

Lo más útil: al toparse con algo raro, anotar **qué estaban haciendo, qué
esperaban que pasara y qué pasó**, con una captura si pueden. Con eso lo
reproducimos en minutos. Un "no me sirvió" sin contexto nos cuesta un día.
