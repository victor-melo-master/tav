# Plan de construcción — TAV

Ocho fases. **No saltes el orden.** Cada fase se prueba y se commitea antes de pasar a la siguiente.

La tentación con agentes de IA es pedir "hazme la app". El resultado es siempre el mismo:
mucho código bonito y un modelo de datos que no aguanta el primer caso real. Aquí el orden
es el que protege: primero el libro contable, después todo lo demás.

**Reparto de modelos**
- 🧠 **Fable 5** — lo que si sale mal cuesta dinero: transacciones, concurrencia, sincronización offline.
- ⚡ **GLM 5.2** — todo lo demás: CRUD, pantallas, formularios, tablas, estilos.

---

## Stack

| Pieza | Tecnología |
|---|---|
| API | NestJS + Prisma + PostgreSQL 16 |
| Tiempo real | Socket.IO |
| Móvil | Flutter (cajero y cobrador en el mismo binario) |
| Offline | Drift (SQLite) + cola de sincronización |
| Panel admin | Next.js 15 + shadcn/ui + TanStack Table |
| Auth | JWT propio (access + refresh), cuentas creadas por el admin |
| Archivos | Disco del servidor detrás de nginx |
| Despliegue | Docker Compose en tu VPS/Plesk |

NestJS por encima de Express por una razón concreta: su estructura obligatoria
(módulos, DTOs, guards) mantiene a raya a los agentes. Con Express cada modelo inventa
su propio estilo y en dos semanas tienes tres arquitecturas conviviendo.

---

## Estructura del repo

```
tav/
├── AGENTS.md                 ← los agentes lo leen primero
├── docs/
├── design/                   ← prototipos navegables = especificación de UI
└── apps/
    ├── api/                  NestJS
    ├── mobile/               Flutter
    └── admin/                Next.js
```

---

# Fase 0 · Andamiaje ⚡

**Prompt:**

> Lee `AGENTS.md` y `docs/` completos antes de escribir nada.
>
> Crea el andamiaje del monorepo TAV con esta estructura: `apps/api` (NestJS + Prisma + PostgreSQL),
> `apps/admin` (Next.js 15, App Router, TypeScript, Tailwind, shadcn/ui) y `apps/mobile` (Flutter).
>
> Incluye: `docker-compose.yml` con Postgres 16 y la API; `.env.example` en cada app;
> ESLint y Prettier compartidos; y un `README.md` en la raíz con los comandos para levantar todo.
>
> No implementes ninguna funcionalidad todavía. Solo el esqueleto que arranca sin errores.

**Verifica:** `docker compose up` levanta Postgres, la API responde en `/health`,
`npm run dev` en admin abre una página en blanco, `flutter run` compila.

---

# Fase 1 · Base de datos ⚡

**Prompt:**

> Implementa el schema de `docs/02-modelo-de-datos.md` en `apps/api/prisma/schema.prisma`.
> Cópialo exactamente: está revisado y las decisiones de tipos son deliberadas.
> Todos los montos son `BigInt` de centavos.
>
> Genera la primera migración con Prisma Migrate.
>
> Crea `prisma/seed.ts` con datos de desarrollo: 1 admin, 2 cobradores, 8 cajeros con
> límites y saldos variados (uno bloqueado al 100% de su cupo, uno al 88%, uno con 8 días
> de deuda, uno sin conectarse hace 4 días), tasas vigentes y unos 15 movimientos históricos
> coherentes — el saldo de cada cajero debe cuadrar con la suma de sus movimientos.
>
> Añade también los valores por defecto de la tabla `Config`:
> `semaforo.dias_ambar=4`, `semaforo.dias_rojo=7`, `semaforo.pct_ambar=0.75`.

**Verifica:** abre Prisma Studio y confirma a mano que para cada cajero
`saldoCents` es igual a la suma de `montoUsdCents` de sus movimientos. Si no cuadra, el seed está mal.

---

# Fase 2 · Núcleo contable 🧠 ← **la fase que importa**

Esta es la que le das a Fable 5. Si sale bien, el resto del proyecto es trabajo mecánico.

**Prompt:**

> Implementa el módulo `ledger` en `apps/api/src/ledger/`, el núcleo contable de TAV.
> Lee primero la sección "Las dos transacciones que importan" de `docs/02-modelo-de-datos.md`.
>
> **`LedgerService.registrarOperacion(dto)`**
> Dentro de una única transacción de Prisma con `SELECT ... FOR UPDATE` sobre `perfiles_cajero`:
> calcula el límite efectivo (límite base más la ampliación aprobada y no consumida, si existe),
> valida que haya cupo suficiente, y si no lo hay lanza `SinCupoException` con
> `{disponible, requerido, faltante}` que la API devuelve como 409.
> Si hay cupo: inserta la operación, inserta el movimiento de tipo `cargo`, actualiza
> `saldoCents` y `deudaDesde`, y marca la ampliación como consumida si se usó.
>
> **`LedgerService.registrarCobro(dto)`**
> Primero verifica idempotencia por `clientUuid`: si ya existe, devuelve el registro
> existente sin crear nada. Luego, en transacción: convierte a USD si vino en bolívares
> usando la tasa recibida, inserta el cobro asociándolo al cierre abierto del cobrador
> para hoy (creándolo si no existe, agrupando por fecha en `America/Caracas`),
> inserta el movimiento de tipo `abono`, actualiza saldo y limpia `deudaDesde` si el
> saldo llegó a cero, y recalcula los totales del cierre.
>
> **`LedgerService.anular(tipo, id, motivo, actorId)`**
> Nunca borra. Inserta el movimiento de reverso correspondiente, marca `anuladoAt`,
> `anuladoPorId` y `motivoAnulacion` en el registro original, y recalcula el cierre si aplica.
>
> **`SemaforoService.calcular(cajeroId)`**
> Implementa el cálculo de dos ejes de `docs/02-modelo-de-datos.md` leyendo los umbrales
> desde la tabla `Config`. Devuelve `{estado, dias, pct, bloqueado, motivo, disponibleCents}`.
> Este cálculo vive **solo aquí**: la app móvil y el panel consumen el resultado, no lo repiten.
>
> **Tests obligatorios** con una base Postgres de prueba, no mocks:
> 1. Una operación dentro del cupo pasa y el saldo queda correcto.
> 2. Una operación que excede el cupo lanza 409 y **no deja rastro** en la base.
> 3. Dos operaciones concurrentes que juntas exceden el cupo: una pasa, la otra falla.
>    Ejecuta ambas en paralelo de verdad con `Promise.all`. Este es el test que justifica el `FOR UPDATE`.
> 4. El mismo `clientUuid` enviado dos veces crea un solo cobro.
> 5. Anular un cobro devuelve el saldo al valor exacto que tenía antes.
> 6. Tras cualquier secuencia de operaciones, `saldoCents` siempre es igual a la suma de movimientos.
> 7. Una ampliación aprobada permite una operación que sin ella sería rechazada, y queda consumida.
>
> No implementes controladores HTTP todavía. Solo el servicio y sus tests.

**Verifica:** los siete tests en verde. **No avances si el test 3 o el 6 fallan.**
Ese es el momento de parar y arreglar, no dentro de tres semanas con datos reales.

---

# Fase 3 · Auth y roles ⚡

**Prompt:**

> Implementa autenticación en `apps/api/src/auth/`. No hay registro público: las cuentas
> las crea el administrador.
>
> Endpoints: `POST /auth/login` (teléfono + contraseña → access token de 15 min y refresh de 30 días),
> `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/pin` para establecer
> el PIN de 4 dígitos que se usa para reabrir la app.
>
> El JWT lleva `sub`, `rol` y `nombre`. Crea un `RolesGuard` con decorador `@Roles('admin')`
> aplicable por endpoint. Hashea con argon2. Actualiza `ultimaVezAt` en cada petición
> autenticada — de ahí sale la alerta de cajero desconectado.
>
> Añade `POST /admin/usuarios` para que el admin cree cajeros y cobradores, y tests
> que verifiquen que un cajero recibe 403 al llamar endpoints de admin.

---

# Fase 4 · API del cajero ⚡

**Prompt:**

> Expón los endpoints del rol cajero sobre `LedgerService`. No dupliques lógica de negocio
> en los controladores: son una capa fina.
>
> `GET /cajero/resumen` → saldo, límite, disponible y el semáforo ya calculado.
> `GET /cajero/operaciones` con paginación y filtro por estado.
> `POST /cajero/operaciones` → llama a `registrarOperacion`. Devuelve 409 con detalle si no hay cupo.
> `GET /cajero/movimientos` → el estado de cuenta paginado.
> `POST /cajero/ampliaciones` → solicita ampliación con monto y motivo.
> `GET /cajero/ampliaciones` → estado de sus solicitudes.
> `GET /tasas/vigentes`
> `POST /uploads/comprobante` → multipart, guarda en disco, devuelve la ruta.
>
> Valida todo con DTOs de class-validator. Documenta con Swagger en `/docs`.

---

# Fase 5 · App Flutter: base ⚡

**Prompt:**

> Monta la base de la app en `apps/mobile`. Un solo binario para cajero y cobrador.
>
> Traduce los tokens de `design/TAV_design_system.html` a `lib/theme/`: `TavColors`,
> `TavSpace`, `TavRadius`, `TavText`. Respeta los valores exactos, incluidos los ajustes
> de contraste (el verde de botones es `#2E7D32`, no `#4CAF50`; el gris de texto secundario
> es `#667085`).
>
> Construye los componentes compartidos que se repiten en los dos prototipos:
> `TavButton` con sus seis variantes, `TavCard`, `TavChip` con los estados de semáforo,
> `TavListRow`, `TavField`, `TavKeypad`, `TavMoneyDisplay` y `TavProgressBar`.
>
> Estado con Riverpod, navegación con go_router, HTTP con dio más interceptor de refresh token.
> Formatea moneda con `intl` en locale `es_VE`.
>
> Implementa login, PIN y biometría, y el enrutado por rol: `cajero` va al shell del cajero,
> `cobrador` al del cobrador. Cada shell con su barra inferior de cuatro destinos.
>
> Abre los prototipos HTML en el navegador y replica el aspecto. Todavía no construyas
> las pantallas de contenido, solo la base y los shells vacíos.

---

# Fase 6 · Pantallas del cajero ⚡

**Prompt:**

> Implementa las pantallas del cajero siguiendo `design/TAV_prototipo_cajero.html`.
> Ábrelo en el navegador: cada pantalla del prototipo es la especificación visual y de texto.
>
> Inicio con el crédito disponible como número principal (no la deuda), semáforo y tarjeta
> de bloqueo cuando no hay cupo. Nueva operación: tipo, monto con teclado y tasa en vivo,
> beneficiario, resumen, instrucciones de pago y confirmación. Historial y detalle con
> línea de tiempo de estados. Estado de cuenta con movimientos y exportación. Abono a deuda.
> Solicitud de ampliación. Notificaciones y perfil.
>
> El bloqueo por cupo debe manejar el 409 del servidor y mostrar el mensaje real,
> no solo deshabilitar el botón. Los textos en español, copiados del prototipo.

---

# Fase 7 · Cobrador y modo offline 🧠

La segunda pieza para Fable 5. El offline es donde se pierde dinero de verdad.

**Prompt:**

> Implementa el rol cobrador, en API y en Flutter, siguiendo `design/TAV_prototipo_cobrador.html`.
>
> **API:** `GET /cobrador/cajeros` (todos los cajeros con su semáforo, ordenados por urgencia:
> primero los bloqueados por límite, luego por estado, luego por días).
> `POST /cobrador/cobros` (idempotente por `clientUuid`).
> `POST /cobrador/cobros/:id/anular` con motivo obligatorio.
> `GET /cobrador/cierre-actual`, `POST /cobrador/cierres/:id/enviar` — que rechace el envío
> si quedan cobros sin sincronizar.
> `POST /cobrador/atenciones` y `DELETE /cobrador/atenciones/:id` para el "lo estoy atendiendo".
> `POST /cobrador/avisos` para el aviso manual.
>
> **Flutter — motor de sincronización.** Esta es la parte crítica:
> Base local con Drift que replica cajeros, cobros del día y el cierre abierto.
> Toda escritura va **primero a SQLite** con un `clientUuid` generado en el dispositivo
> y estado `pendiente`, y la interfaz responde de inmediato con el dato local.
> Una cola en segundo plano reintenta el envío con retroceso exponencial cuando hay red.
> Al confirmar el servidor, marca `sincronizadoAt`.
> El indicador de pendientes y el bloqueo del cierre salen de esa cola.
>
> Casos que debes manejar explícitamente y cubrir con tests:
> se pierde la red a mitad de un envío; la app se cierra con cobros en cola;
> el mismo cobro se reintenta tres veces y solo debe existir una vez;
> el servidor responde 409 porque otro cobrador ya cobró a ese cajero.
>
> Nunca borres un registro local que no se haya confirmado en el servidor.

---

# Fase 8 · Tiempo real, panel admin y despliegue ⚡

**Prompt A — tiempo real:**

> Añade un gateway de Socket.IO en la API. Al registrarse, anularse o verificarse algo,
> emite a las salas correspondientes: `cajero:{id}` para su saldo y semáforo,
> `cobradores` para la lista compartida y las atenciones, `admin` para todo.
> En Flutter y en el panel, suscríbete y actualiza el estado sin recargar.

**Prompt B — panel admin:**

> Construye el panel en `apps/admin` con Next.js y shadcn/ui:
> tablero con totales del día y cartera por semáforo; tabla de cajeros con edición del
> límite de crédito; bandeja de solicitudes de ampliación para aprobar o rechazar con nota;
> verificación de cierres — abrir el cierre enviado, capturar el efectivo realmente recibido,
> calcular la diferencia y cerrar con nota; registro de pagos en nombre de un cajero;
> gestión de tasas; alta de usuarios; vista de avisos con quién leyó y quién no;
> alerta de cajeros sin conectarse hace más de 3 días; exportación a PDF y Excel.
> Toda la escritura pasa por la misma API. El panel no habla con la base directamente.

**Prompt C — despliegue:**

> Prepara el despliegue en un VPS con Docker Compose: Postgres con volumen persistente,
> la API, nginx como proxy inverso con certificados de Let's Encrypt, y respaldo diario
> de la base con `pg_dump` rotando 30 días. Documenta el proceso en `docs/04-despliegue.md`.

Para distribuir la app con menos de 50 usuarios conocidos, no necesitas la Play Store:
reparte el APK por Firebase App Distribution o por enlace directo. En iOS, TestFlight.

---

## Cómo trabajar con los agentes

**Un commit por fase.** Si una fase sale mal, revertir es barato.

**No aceptes código que no probaste.** El agente dice "listo" con la misma seguridad
cuando funciona que cuando no. Levanta la app y úsala.

**Cuando el agente se desvíe, recuérdale el archivo.** "Lee AGENTS.md de nuevo" corrige
más rápido que explicar la regla otra vez.

**Los prototipos son la fuente de verdad visual.** Cuando el agente proponga un diseño
propio, señálale el HTML. Ya está decidido.

**Empieza hoy por las fases 0, 1 y 2.** La 2 es la única que realmente importa;
si el núcleo contable queda sólido, el resto es velocidad.

---

## Pendientes fuera de fase

- **Gestión de corredores desde el panel** — `CorredorService` está
  implementado en `apps/api/src/corredores/corredor.service.ts` (crear,
  desactivar, activar, listar, listarActivos, obtener) pero **no tiene
  controlador HTTP ni pantalla en el panel**. El admin no puede crear ni
  desactivar corredores desde la interfaz; los seis del seed son los
  únicos disponibles. Es trabajo de una tarde cuando haga falta (inyectar
  el servicio en `AdminModule`, exponer los endpoints, añadir la pantalla
  al panel), pero no entra en esta entrega.

- **Exportación de lista de cierre en PDF** — el botón "Descargar lista en PDF"
  se quitó de la pantalla de cierre enviado del cobrador porque no estaba implementado.
  Se debe implementar en una fase posterior, generando un PDF con los cobros del día
  y los totales declarados. No dejar el botón visible sin funcionalidad.
