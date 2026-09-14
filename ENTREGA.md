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

Desde aquí Iván publica las tasas del día, abre y recarga las cajas, fija los
límites de crédito de cada cajero, aprueba ampliaciones, verifica los cierres
diarios de los cobradores y crea las cuentas de todo el mundo.

### App móvil (Android)

El APK va adjunto. Android va a advertir que no viene de la Play Store: hay que
permitir la instalación desde esa fuente. Es normal en una app sin publicar.

**Cajero, cobrador y pagador usan la misma app.** El rol de la cuenta decide qué
ve cada quien al entrar. La primera vez se entra con correo y clave, y la app
pide crear un PIN de 4 dígitos para las siguientes.

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

## El recorrido que recomiendo

Toca todo el ciclo, de punta a punta, en unos diez minutos.

**1. Publica las tasas del día.** Entra al panel, ve a tasas, cambia la pata base
y mira cómo se recalculan los seis corredores de golpe. Publica.

**2. Revisa las cajas.** En el panel, mira el saldo de cada destino y de la caja
madre de USDT. Abre o recarga alguna para ver cómo se mueve la plata de una a otra.

**3. Registra una operación.** Entra a la app como `carlos.ruiz@tav.test`, escoge
un destino, pon un monto y despacha. Fíjate en que el cupo disponible baja.

**4. Paga esa operación.** Entra como el pagador del país que escogiste. La
operación está en su cola. Ejecútala: escribe a cómo se ejecutó el cambio de
verdad y el nombre del cliente que recibió.

**5. Mira la caja de nuevo.** En el panel, la caja de ese destino bajó por el
monto que se pagó.

**6. Cóbrale al cajero.** Entra como `cobrador1@tav.test`, regístrale un cobro a
Carlos, cierra el día, y verifícalo desde el panel.

Después prueba los cajeros en ámbar y en rojo para ver el bloqueo, y registra un
cobro **mayor** a la deuda de alguien para ver el saldo a favor.

---

## Qué incluye esta versión

**Los destinos.** Venezuela en bolívares por transferencia, Venezuela en dólares
en efectivo, Brasil, Colombia, República Dominicana y México. Venezuela tiene dos
porque son dos formas de entrega distintas, con tasas distintas.

**Las tasas.** Iván escribe tres números por destino: lo que consigue por su USDT,
lo que vale el USDT en ese país, y su margen. El sistema calcula la tasa que ve el
cajero. Mover la pata base recalcula todos los destinos a la vez, así que
actualizar las tasas cada mañana toma menos de un minuto.

El cajero ve **un solo número** y el desglose es de tres líneas: lo que envía, la
tasa aplicada y lo que recibe el beneficiario. **Ninguna comisión visible**, tal
como quedó acordado: el margen va dentro de la tasa y es interno.

Publicar tasas nuevas nunca altera una operación ya registrada: cada operación
guarda congelada la tasa con la que se hizo.

**Las cajas.** Una por destino, más la caja madre de USDT. El admin abre la caja
del día convirtiendo desde USDT, y cada pago que ejecuta el pagador la va bajando.
El sistema avisa cuando una caja queda baja, y avisa distinto —y más fuerte— si
queda en negativo, que significa que se pagó plata que no había.

**El pagador.** Uno por país. Ve su cola de pagos pendientes y nada más: no ve la
deuda de los cajeros ni el margen de TAV. Al ejecutar un pago registra a cómo se
ejecutó el cambio realmente, cómo pagó y el nombre del cliente. Esos datos son los
que permiten saber después cuánto ganó TAV de verdad en cada operación.

**El crédito.** Cada cajero tiene un límite que fija el admin. Al llegar al 100%
se le bloquean las transacciones, con señal o sin ella. A las tres cuartas partes
del cupo recibe un aviso. Puede pedir una ampliación indicando monto y motivo; el
admin la aprueba o la rechaza, se consume en una operación puntual y el cupo
vuelve solo.

**El adelanto.** Un cajero puede abonar de más para operar tranquilo. Ese saldo a
favor le sube el cupo disponible por encima de su límite, no cuenta como deuda, y
el contador de días no arranca hasta que se agota.

**Los cobros.** Todos los cobradores ven a todos los cajeros deudores, con los
bloqueados de primero. Se puede marcar "lo estoy atendiendo". El cobro queda
cargado al registrarlo. Anular exige motivo escrito. Se cobra en efectivo
guyanés, dólares, bolívares, pago móvil o USDT, y la conversión usa la tasa que
publicó el admin, que queda congelada en el cobro.

**El cierre diario.** El cobrador declara el efectivo que lleva encima
**separado por moneda** —guyaneses y dólares son billetes distintos— y lo digital
aparte. El admin verifica contra lo que recibe en mano.

**La contabilidad.** El libro de cuentas es de solo inserción: nada se edita ni se
borra nunca. Una corrección es un asiento inverso. Los abonos saldan primero la
deuda más vieja. Hay una verificación automática que comprueba que el saldo de
cada cajero y de cada caja es exactamente la suma de sus movimientos.

**La moneda.** El cajero debe en dólares guyaneses, que es lo que le pagan allá,
tal como quedó definido.

---

## Qué falta

Nada de esto impide probar el negocio completo. Lo listo para que sepan dónde
está la línea.

**Anular un pago ya ejecutado.** Está bloqueado a propósito, esperando su
respuesta. Ver la pregunta abajo.

**Crear destinos desde el panel.** Los seis que hay vienen cargados. Añadir uno
nuevo requiere que nosotros lo hagamos; la pantalla para que lo haga Iván es
trabajo de una tarde y la construimos en cuanto haga falta.

**Trabajo sin conexión.** La app necesita internet para registrar. La siguiente
entrega trae una cola local para que el cobrador registre sin señal y todo suba
cuando la recupere.

**Cuatro pantallas del cajero** —notificaciones, seguridad, abono y beneficiarios
guardados— muestran "próximamente".

**El reporte de ganancia.** Los datos ya se están guardando: cada operación tiene
la tasa cotizada y la tasa a la que el pagador la ejecutó de verdad. Falta la
pantalla que los cruce y muestre el margen real por destino y por período.

---

## Lo que necesitamos decidido de su parte

**1. Si se anula una operación que el pagador ya pagó, ¿vuelve la plata a la
caja?** La deuda del cajero se revierte sin problema, pero los bolívares ya
salieron del banco. Hasta que respondan, el botón de anular un pago está
bloqueado. Es lo único del sistema que no sabe qué hacer.

**2. La lista completa de destinos activos**, con su país, su moneda y su forma de
entrega. Cargamos seis según lo que nos pasaron; si operan hacia más, dígannos
cuáles.

**3. Ejemplos reales de mensajes de datos bancarios.** Tres o cuatro mensajes de
WhatsApp tal como se los mandan a sus cajeros, para afinar el botón de pegar datos
con los formatos que ustedes ven de verdad.

---

## Cómo darnos feedback

Lo más útil: al toparse con algo raro, anotar **qué estaban haciendo, qué
esperaban que pasara y qué pasó**, con una captura si pueden. Con eso lo
reproducimos en minutos. Un "no me sirvió" sin contexto nos cuesta un día.
