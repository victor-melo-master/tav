# Reglas para agentes de IA — Proyecto TAV

Este archivo lo lee todo agente (Fable 5, GLM 5.2, o el que sea) antes de escribir código.
No son sugerencias. Romper cualquiera de estas reglas es un bug, aunque el código compile y los tests pasen.

---

## Contexto en una frase

TAV es una casa de cambio que opera **a crédito** con revendedores llamados **cajeros**.
El dinero de la app es **ficticio**: no se mueve plata por aquí. Todo pago real ocurre por fuera.
La app es un **libro de cuentas compartido** cuyo único trabajo es que todos miren el mismo número.

Lee `docs/01-reglas-de-negocio.md` antes de tocar cualquier lógica.

---

## Los diez mandamientos

### 1. El dinero se guarda en enteros, nunca en decimales
Todo monto es `BigInt` de **centavos**. En Prisma `BigInt`, en Postgres `BIGINT`, en Dart `int`.
Está prohibido `float`, `double`, `Number` y `Decimal` para montos.
El formateo a "$1.240,00" ocurre solo en la capa de presentación.

### 2. El libro contable es de solo-inserción
La tabla `movimientos` **nunca** recibe `UPDATE` ni `DELETE`. Jamás. Bajo ninguna circunstancia.
Corregir algo significa **insertar un movimiento de reverso**, no modificar el original.
Si un agente escribe `prisma.movimiento.update(...)` o `.delete(...)`, está mal.

### 3. Anular no es borrar
Anular un cobro o una operación = marcar `anulado_at` + insertar el movimiento de reverso
+ guardar `motivo_anulacion` y quién lo hizo. El registro original permanece visible.
El administrador tiene que poder ver que existió y que se anuló.

### 4. El saldo no se calcula en la aplicación
El saldo de un cajero se deriva del libro. Si se cachea en `cajeros.saldo_cents`, ese cache
se escribe **únicamente dentro de la misma transacción** que insertó el movimiento.
Nunca recalcular saldos en JavaScript sumando arrays.

### 5. El límite de crédito se valida en la base de datos, no en la interfaz
El bloqueo por cupo es una regla de negocio, no un detalle de UX.
Se verifica dentro de una transacción con `SELECT ... FOR UPDATE` sobre la fila del cajero.
Que el botón esté deshabilitado en Flutter no cuenta como validación.
Un cajero sin cupo debe recibir un error del servidor aunque llame al endpoint directamente.

### 6. Toda escritura de dinero es idempotente
Cada operación y cada cobro llega con un `client_uuid` generado en el dispositivo.
Ese campo tiene índice único. Si llega dos veces, la segunda devuelve el registro existente
sin crear nada nuevo. Sin esto, el cobrador que pierde señal y reintenta duplica dinero.

### 7. La tasa se congela en el registro
Cada operación y cada cobro guarda la `tasa_aplicada` con la que se hizo.
Nunca recalcular montos históricos con la tasa de hoy. El pasado no cambia.

### 8. Los tres roles viven en un solo proyecto Flutter
Cajero y cobrador son el mismo binario. El rol llega en el JWT y decide qué shell se monta
después del login. No se crean dos apps.

### 9. Nada de colores ni medidas escritos a mano
Todo sale de los tokens definidos en `design/TAV_design_system.html`.
Si un widget tiene `Color(0xFF...)` o `EdgeInsets.all(13)` inventado, está mal.
Existen `TavColors`, `TavSpace`, `TavRadius`, `TavText`.

### 10. Nada de datos inventados en producción
Los seeds van en `prisma/seed.ts` y solo corren en desarrollo.
Ningún endpoint devuelve datos de ejemplo cuando falla. Si falla, devuelve el error.

---

## Cómo se ven las cosas

**El diseño ya está resuelto.** No lo reinterpretes.
- `design/TAV_prototipo_cajero.html` — 29 pantallas del cajero, navegables
- `design/TAV_prototipo_cobrador.html` — 17 pantallas del cobrador, navegables
- `design/TAV_design_system.html` — tokens, componentes y reglas

Ábrelos en el navegador. Cada pantalla que construyas en Flutter debe verse como su equivalente
en el prototipo: mismos colores, mismas medidas, mismos textos en español.
Si algo no está en el prototipo, pregunta antes de inventarlo.

---

## Convenciones

- **Idioma del producto:** español de Venezuela. Formato `$1.240,00` y `Bs 353.896,00`.
- **Idioma del código:** identificadores en español cuando nombran conceptos del negocio
  (`cajero`, `cobro`, `cierre`, `ampliacion`), inglés para lo técnico (`repository`, `guard`, `dto`).
  Elige uno por archivo y sé consistente.
- **Commits:** `feat(api): ...`, `fix(mobile): ...`, `chore: ...`
- **Migraciones:** siempre por Prisma Migrate. Nunca `db push` contra una base con datos.
- **Tests:** obligatorios en el módulo de libro contable y en el de crédito. En el resto, opcionales.

---

## Cuando tengas dudas

Este proyecto se construye a partir de conversaciones reales con el cliente, no de suposiciones.
Si una regla de negocio no está en `docs/01-reglas-de-negocio.md`, **no la inventes**:
déjala marcada con `// PENDIENTE DE DEFINIR:` y sigue con lo demás.

Un supuesto silencioso en un sistema de dinero es el error más caro que puedes cometer.
