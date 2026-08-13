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
- El **admin verifica** el efectivo recibido contra lo declarado. Si hay diferencia, queda registrada.
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
- Cada operación guarda la **tasa aplicada** y la comisión de TAV.
- La tasa la define el administrador manualmente.
- Comisiones de referencia: 2–3% en mayoreo, 5–10% en detal o intermediación.
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

### Surgidos al implementar el ledger (Fase 2)

Detalle completo en `docs/05-contrato-ledger.md`, casos 13 a 21.
Mientras no se decidan, el código mantiene el comportamiento actual y los tests lo fijan.

7. **Imputación de pagos y fecha de la deuda.** ¿Los abonos saldan primero el cargo
   más viejo (FIFO)? Hoy `deudaDesde` no se reconstruye al anular, así que una anulación
   puede reiniciar el contador de días y dejar el semáforo más benévolo de lo justo.
   FIFO es la respuesta natural en este negocio, pero hay que confirmarla con Iván.
   **Es la más importante de esta lista:** el eje de días del semáforo depende de esto.

8. **Saldo negativo.** Un cajero puede pagar de más y quedar con saldo a favor.
   Hoy se permite. ¿Es correcto? Si lo es, hay que mostrarlo como "tienes $X a favor"
   en la app, no como una deuda negativa.

9. **Cobro después de cerrar el día.** Como no hay hora límite, un cobrador puede cerrar
   a las 6 y cobrar a las 7. Hoy se rechaza. ¿Debe ir al cierre del día siguiente,
   o el admin puede reabrir el cierre?

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
