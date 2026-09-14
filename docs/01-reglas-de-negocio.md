# Reglas de negocio — TAV

Todo lo que hay aquí viene de conversaciones con el cliente (Iván / Saddiel Rojas, agosto 2026).
Lo que no está aquí, **no está decidido**. No lo inventes: márcalo como pendiente y pregunta.

---

## 1. Qué es TAV

Casa de cambio y remesas que opera desde Guyana hacia Venezuela, LATAM y USA.
Cambia USDT, dólares en efectivo y Zelle a bolívares.

**TAV no atiende consumidores finales.** Atiende **cajeros**: revendedores que despachan
a sus propios clientes. El margen que el cajero le cobra a su cliente es asunto suyo
— *"es libre mercado, problema de él"*. La app no lo calcula ni lo muestra.

**El dinero de la app es ficticio.** Es un libro de cuentas. Todo el proceso de pago real
ocurre por fuera: transferencias, efectivo, USDT. La app solo registra qué pasó.

---

## 2. Roles

| Rol | Quién es | Qué hace |
|---|---|---|
| **Cajero** | Revendedor. Opera a crédito con TAV. | Registra operaciones, ve su cupo y su deuda, abona. |
| **Cobrador** | Recorre zonas cobrando a los cajeros. | Registra cobros, cierra su día y entrega el efectivo. |
| **Admin** | Uno solo. Iván. | Define límites, verifica cierres, aprueba ampliaciones, registra pagos. |

Cajero y cobrador viven en **la misma app móvil**. El rol decide qué ve al entrar.
El admin usa un panel web aparte.

Las cuentas **las crea el administrador**. No hay registro público ni OTP.

### Identidad: correo, no teléfono

El usuario entra con **correo y contraseña**. Decidido en agosto 2026.

El teléfono fue el identificador original, pero como no hay OTP nunca se
verificó: era una cadena única cualquiera. El correo tiene la ventaja de que
el propio usuario puede recuperarlo si pierde el acceso.

**El teléfono sigue existiendo, como dato de contacto.** El cobrador lo usa
para llamar y escribir por WhatsApp al cajero. Es editable, opcional y **sin
índice único**: dos personas pueden compartir un número. Lo que perdió es su
papel de llave de acceso.

---

## 3. El ciclo del dinero

```
El cajero opera a crédito
        ↓
Su deuda sube y su cupo baja
        ↓
Llega a 7 días o topa el límite  →  el sistema avisa al cajero Y al cobrador
        ↓
El cobrador cobra y lo registra al instante
        ↓
Cierra su día y declara cuánto efectivo lleva encima
        ↓
El admin verifica el efectivo recibido contra lo declarado
```

*"El negocio es una rueda, se reintegra a sí mismo."*
El dinero cobrado hoy financia las operaciones de mañana. Por eso la entrega es diaria
y por eso el cierre tiene que ser rápido de hacer: la fricción ahí cuesta capital, no tiempo.

---

## 4. Crédito

- El **límite de crédito lo fija el administrador**, por cajero. Puede modificarlo cuando quiera.
- **Al topar el límite no hay más transacciones.** Bloqueo duro, no advertencia.
- El bloqueo aplica **tenga o no tenga señal**. No hay vía de escape offline.
- El bloqueo **cobra solo**: el cajero no puede seguir despachando, así que busca pagar
  sin que nadie lo llame. Ese es el mecanismo de cobranza, no una restricción administrativa.

### Ampliación de cupo

Antes esto era una llamada telefónica. Ahora es un registro.

- El cajero **solicita** una ampliación indicando monto y motivo.
- El **admin aprueba o rechaza**.
- La ampliación es **para una operación puntual**: se consume al usarse y el cupo vuelve solo.
- Mientras esté activa, el porcentaje del semáforo **se calcula sobre el cupo ampliado**.

---

## 5. Semáforo del cajero

Dos ejes independientes. **Manda el peor de los dos.**

### Eje 1 — Días de deuda
| Estado | Días |
|---|---|
| Verde · Al día | 0 – 3 |
| Ámbar · Por vencer | 4 – 6 |
| Rojo · Vencida | 7 o más |

### Eje 2 — Porcentaje del límite consumido
| Estado | % del límite |
|---|---|
| Verde | menos de 75% |
| Ámbar | 75% – 99% |
| Rojo · Sin cupo | 100% o más → **bloqueo** |

> ⚠️ **PENDIENTE:** el umbral del 75% lo propuso el equipo de diseño; el cliente lo confirmará.
> El 100% sí es regla firme. Déjalo configurable en la base de datos, no quemado en el código.

El eje del crédito suele dispararse antes que el de los días: un cajero con volumen
topa su cupo en dos días. Por eso el orden de la lista de cobro lo encabezan los bloqueados.

---

## 6. Cobros

- **Varios cobradores operando a la vez. Un solo admin.**
- **Todos los cobradores ven las deudas de todos los cajeros.** No hay cartera asignada.
  El que esté cerca aprieta al que esté en rojo.
- Un cobrador puede marcar **"lo estoy atendiendo"** para que los demás no vayan al mismo.
- El pago es **impredecible**: depende de cuándo sale la avioneta, cuándo llega el bongo,
  cuándo el cajero anda cerca. **No hay ruta planificada**, hay lista de prioridad.
- **El cajero no confirma el cobro.** Al registrarlo, queda 100% cargado al sistema.
- Corregir un cobro exige **anularlo con motivo escrito**. Queda visible para el admin.
- Métodos: efectivo USD, bolívares, pago móvil, USDT.
  Solo el **efectivo** suma a lo que el cobrador debe entregar físicamente.

### Cierre diario

- **La lista del cobrador es diaria.** Cobra hoy, entrega hoy.
- **No hay hora límite** definida.
- Al cerrar declara: total registrado, cuánto es efectivo (lo que entrega en mano)
  y cuánto es digital (verificable en cuenta).
- **El efectivo se declara por moneda física, no convertido.** El cobrador lleva
  billetes guyaneses (GYD) y billetes americanos (USD): son dos pilas distintas
  que el admin cuenta por separado. Declarar un solo total convertido en GYD
  vuelve imposible la verificación, porque el admin recibe las dos monedas en
  mano y no puede comparar contra un número mezclado.
- El **admin verifica** el efectivo recibido contra lo declarado, **por moneda**.
  Si hay diferencia en cualquiera de las dos, queda registrada y la nota es
  obligatoria.
- Lo digital —bolívares, pago móvil, USDT— no se entrega en mano: se verifica
  en cuenta y no entra en el cuadre de efectivo.
- Un cierre no puede enviarse con cobros pendientes de sincronizar.

---

## 7. Avisos

- El **sistema** genera el aviso automáticamente al llegar a 7 días o al límite.
- El mismo aviso le llega al **cajero y al cobrador a la vez**, *"así están en sintonía"*.
- El cobrador puede además enviar un **aviso manual**.
- Debe registrarse si el cajero **leyó** el aviso. El admin necesita saberlo.
- Alerta cuando un cajero **no se conecta desde hace 3 días**.

---

## 8. Operaciones del cajero

- Volumen: **más de 20 al día**. El registro tiene que ser rápido.
- Las cuentas destino de sus clientes **cambian casi siempre**: prioriza pegar y despachar
  por encima de mantener una libreta de beneficiarios guardados.
- Cada operación guarda la **tasa aplicada**.
- La tasa la define el administrador manualmente.

### La comisión va dentro de la tasa

**El cajero no paga un cargo aparte.** Envía un monto, debe exactamente ese monto,
y su beneficiario recibe lo que resulte de aplicar la tasa. El margen de TAV está
implícito en la tasa que cotiza.

En las apps de cajero y cobrador **no se muestra ninguna comisión**: ni línea de
desglose, ni porcentaje, ni "total a pagar" distinto del monto enviado. El desglose
visible es de tres líneas: lo que envía, la tasa aplicada, y lo que recibe el beneficiario.

> ⚠️ **PENDIENTE — Fase 8.** Con la comisión dentro de la tasa, la ganancia deja de
> ser un dato del registro y el panel no puede calcularla. La solución es guardar
> **dos tasas por operación**: la cotizada al cajero (`tasaAplicada`, ya existe) y la
> de costo a la que TAV consigue los bolívares (`tasaCosto`, por añadir).
>
> `margen = montoEnviado − (montoEntregado ÷ tasaCosto)`
>
> Requiere una columna en `Tasa` y una foto en `Operacion`, igual que ya se congela
> `tasaAplicada`. El endpoint del cajero nunca devuelve la tasa de costo.
>
> **Antes de implementarlo hay que preguntarle a Iván cómo fija su precio**: si su
> costo es una tasa única o depende del proveedor, la ciudad o el volumen. Eso cambia
> el modelo.
- **Ni el cobrador ni el admin necesitan ver el detalle de las operaciones de un cajero**
  para cobrarle. *"Si debe 10 tiene que pagar 10 y así."*

---

## 9. Formato

| Concepto | Formato | Ejemplo |
|---|---|---|
| Dólares / USDT | `$#.###,00` | `$1.240,00` |
| Bolívares | `Bs #.###,00` | `Bs 353.896,00` |
| Tasa | `###,00` | `285,40` |
| Operación | `#TAV-####` | `#TAV-2482` |
| Cobro | `#COB-####` | `#COB-0412` |
| Cuenta enmascarada | `Banco ••••####` | `Banesco ••••4471` |

Punto para miles, coma para decimales. Nunca abreviar montos ("1,2K" está prohibido).

---

## 10. Pendientes de definir

Marcar en el código con `// PENDIENTE DE DEFINIR:` y no inventar.

1. Umbral ámbar del porcentaje de crédito (propuesto 75%).
2. Qué pasa si dos cobradores marcan "atendiendo" al mismo cajero a la vez.
3. Si el cobrador debe ver el % de cupo de cajeros que no están en rojo.
4. Cómo se salda una diferencia de cierre (¿se descuenta de la comisión del cobrador?).
5. Si el admin puede registrar operaciones en nombre de un cajero, o solo pagos.
6. Política de retención: cuánto tiempo se guardan comprobantes e imágenes.

### Multi-corredor, pagador y tesorería (Fase 9)

Respuestas del formulario del 1/9/2026. Lo que está aquí está confirmado;
lo que falta está en "Repreguntas pendientes" más abajo.

- **La moneda del libro de cuentas es GYD.** El cajero debe en dólares guyaneses,
  que es lo que le pagan allá. Hoy el sistema asume una sola moneda y la app
  muestra dólares: cambiar la base es invasivo pero se hace una sola vez.
- **El margen es por corredor**, no uno global.
- **Solo el admin cambia tasas.** Nadie más.
- **Venezuela es el único destino con varias formas de entrega** (bolívares por
  transferencia y dólares en efectivo). En el resto de los países hay una sola,
  y el precio se arma aplicando un porcentaje al cambio.
- **Un pagador por país**, y atiende **varias monedas**.
- **USDT es la caja madre.** Las cajas locales se llenan convirtiendo desde USDT.
  Repone el admin, y esa conversión es un movimiento que hay que registrar con
  su tasa.
- **Una caja sin fondos solo alerta**, no frena las operaciones hacia ese destino.
  Esto abarata mucho la fase: las cajas son un tablero, no un mecanismo de control.
- **La conversión de un cobro hecho en moneda distinta a la deuda es manual.**

Confirmado también el 1/9/2026, en la repregunta:

- **El umbral ámbar del 75% se queda.** El cajero recibe un aviso al llegar a las
  tres cuartas partes de su cupo, antes del bloqueo del 100%.
- **El pagador no ve la deuda del cajero.** *"Solo necesita ejecutar las órdenes
  que llegan."* Ve su cola de pagos y sus cajas, nada más.
- **El tipo de cambio del país destino lo escribe el admin a mano**, por ahora.
  Nada de tomarlo de una referencia externa. Si más adelante quiere automatizarlo,
  la pantalla no cambia: cambia de dónde sale el número.

Y el 1/9/2026, cerrando las últimas tres:

- **La conversión de un cobro en otra moneda la fija el admin desde el panel.**
  El cobrador no escribe tasas. Consecuencia de diseño: la tasa de conversión de
  cada moneda de cobro vive en la misma pantalla de tasas del admin, y el cobro
  la toma vigente al registrarse, para que la deuda del cajero baje en el acto.
  Diferirlo hasta el cierre dejaría al cajero sin ver su pago aplicado, y eso no
  es aceptable en un negocio de crédito.
- **Los corredores iniciales son los que dio Saddiel** (ver `docs/07-fase-9-multi-corredor.md`),
  y el admin puede añadir más desde el panel. La lista no se quema en el código.
- **No existe diferencia de cierre.** *"Si el cobrador declara que recogió 500,
  entrega 500."* Cuadrar faltantes es un proceso administrativo de ellos, fuera
  de la app. El campo se sigue registrando por si acaso, pero no se construye
  lógica de conciliación encima.

### Surgidos al implementar el ledger (Fase 2)

Detalle completo en `docs/05-contrato-ledger.md`, casos 13 a 21.
Mientras no se decidan, el código mantiene el comportamiento actual y los tests lo fijan.

7. **Imputación de pagos — RESUELTO 1/9/2026. Es FIFO.** El abono salda primero
   el cargo más viejo. De aquí sale el contador de días del semáforo: la fecha de
   la deuda es la del cargo más antiguo que siga sin saldar. `deudaDesde` debe
   reconstruirse FIFO en cada movimiento, incluidas las anulaciones — hoy no se
   hace y eso deja el semáforo más benévolo de lo justo.

8. **Saldo a favor — RESUELTO 1/9/2026. Se permite y se acumula.** El cajero puede
   adelantar plata para operar tranquilo. Tres consecuencias:
   - **El adelanto sube el disponible por encima del límite.** Con límite de $2.000
     y $500 adelantados, puede operar $2.500. Es plata suya: TAV no arriesga nada.
     Por tanto `disponible = límite + saldo a favor`, y el porcentaje del semáforo
     se calcula **solo sobre la deuda**, nunca sobre el disponible.
   - **El contador de días arranca cuando se agota el saldo a favor**, no cuando
     opera. Un cajero que adelantó y opera cuatro días sigue en verde con cero días.
   - **No se devuelve**, queda acumulado. La app debe decir "tienes $500 a favor",
     nunca "deuda: -$500", y ese cajero no aparece en la lista del cobrador.

9. **Cobro después de cerrar el día — RESUELTO 1/9/2026.** *"Puede cerrar hasta lo
   último, los cortes se ejecutan al cerrar el día."* No hay hora límite y no se
   reabre un cierre: el cierre **es** el corte. Un cobro posterior pertenece al día
   siguiente. Se mantiene el comportamiento actual.

10. **Anular una operación que consumió una ampliación.** Hoy el cupo extra se pierde.
    ¿Debería devolverse?

11. **Dos ampliaciones aprobadas al mismo tiempo.** Hoy se usa solo la más antigua y
    nunca se suman. El flujo del admin debería impedir que existan dos activas.

12. **Validación aritmética de la operación — RESUELTO en Fase 4.** El ledger
    asienta lo que le mandan: no comprueba que `totalCents == montoOrigenCents +
    comisionCents`. Esta validación vive ahora en el DTO HTTP
    (`CrearOperacionDto` con `@Validate(CoherenciaAritmeticaConstraint)`): un
    DTO incoherente se rechaza con 400 antes de tocar la base de datos.

13. **Identidad del actor — RESUELTO en Fase 3.** `creadaPorId` y `actorId`
    salen del JWT del usuario autenticado (`req.user.sub`), nunca del cuerpo
    de la petición. Los DTOs del ledger los marcan como `INTERNO` y la capa
    HTTP (Fase 4) con `forbidNonWhitelisted` los rechaza si un cliente intenta
    enviarlos. No hace falta validarlos contra `Usuario`: si el JWT es válido,
    el `sub` existe. `cajeroId` y `cobradorId` se validan desde la Fase 2
    (`CajeroNoValidoException`, `CobradorNoValidoException`).
