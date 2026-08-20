# Máquina de estados de autenticación — TAV Mobile

Este documento describe los estados de sesión, las transiciones válidas y qué
debe mostrar el router en cada uno. Es la fuente de verdad para el flujo de
auth del cliente Flutter.

---

## Estados

| Estado              | Clase Dart           | Qué significa                                              |
|---------------------|----------------------|------------------------------------------------------------|
| Inicial             | `AuthInitial`        | La app acaba de arrancar. `checkSession()` aún no terminó. |
| Cargando            | `AuthLoading`        | `login()` o `loginPin()` en curso.                         |
| Autenticado sin PIN | `AuthAuthenticated`  | Hay tokens válidos y `pinEstablecido == false`.            |
| Autenticado con PIN | `AuthAuthenticated`  | Hay tokens válidos y `pinEstablecido == true`.             |
| No autenticado      | `AuthUnauthenticated`| No hay tokens o la sesión se invalidó.                     |
| Error               | `AuthError`          | Fallo de login o de PIN con mensaje del servidor.          |

`AuthAuthenticated` lleva `usuario` (id, telefono, nombre, rol) y `pinEstablecido`.
Los dos estados "autenticado" se distinguen por el booleano, no por clases
distintas.

---

## Transiciones

```
                      checkSession()
  AuthInitial ──────────────────────────────┐
      │                                     │
      │ checkSession()                      │ checkSession()
      │ con tokens                          │ sin tokens
      ▼                                     ▼
  AuthAuthenticated ◄───────────── AuthUnauthenticated
      │                                     ▲
      │ login()                             │
      ▼                                     │
  AuthLoading ────────────────┐            │
      │                       │            │
      │ login ok              │ login fail │ logout()
      ▼                       ▼            │
  AuthAuthenticated      AuthError ────────┘
      │
      │ setPin() ok
      ▼
  AuthAuthenticated  (pinEstablecido: true)
      │
      │ loginPin() ok
      ▼
  AuthAuthenticated  (tokens nuevos, pinEstablecido: true)
```

### Transiciones válidas

| Desde              | Evento          | Hasta                          |
|--------------------|-----------------|--------------------------------|
| AuthInitial        | checkSession ok | AuthAuthenticated              |
| AuthInitial        | checkSession sin tokens | AuthUnauthenticated    |
| AuthInitial        | checkSession error 401 | AuthUnauthenticated    |
| AuthUnauthenticated| login() ok      | AuthAuthenticated              |
| AuthUnauthenticated| login() fail    | AuthError                      |
| AuthAuthenticated  | setPin() ok     | AuthAuthenticated (pin=true)   |
| AuthAuthenticated  | loginPin() ok   | AuthAuthenticated (pin=true)   |
| AuthAuthenticated  | loginPin() fail | AuthError                      |
| AuthAuthenticated  | logout()        | AuthUnauthenticated            |
| AuthError          | login() ok      | AuthAuthenticated              |
| Cualquiera         | logout()        | AuthUnauthenticated            |

### Transiciones prohibidas

- `AuthAuthenticated` → `AuthAuthenticated` con `pinEstablecido` pasando de
  `true` a `false`. Si el PIN ya está guardado en el servidor, no puede
  "des-guardarse". Que esto ocurra es síntoma de un bug.
- `checkSession()` pisando un estado que ya cambió por `login()` o `setPin()`.
  `checkSession` es una restauración de arranque, no una re-validación
  continua.

---

## Router — qué mostrar en cada estado

| Estado              | Location actual  | Redirect a                          |
|--------------------|-------------------|-------------------------------------|
| AuthInitial        | cualquiera        | `null` (no redirigir, esperar)      |
| AuthLoading        | cualquiera        | `null` (no redirigir, esperar)      |
| AuthUnauthenticated| /login            | `null` (quedarse)                   |
| AuthUnauthenticated| cualquier otra    | `/login`                            |
| AuthError          | /login            | `null` (quedarse, mostrar error)    |
| AuthError          | cualquier otra    | `/login`                            |
| AuthAuth sin PIN   | /login            | `/pin-setup`                        |
| AuthAuth sin PIN   | /pin-setup        | `null` (quedarse)                   |
| AuthAuth sin PIN   | /pin-login        | `/pin-setup`                        |
| AuthAuth sin PIN   | shell del rol     | `null` (quedarse)                   |
| AuthAuth con PIN   | /login            | `/pin-login`                        |
| AuthAuth con PIN   | /pin-setup        | `/pin-login`                        |
| AuthAuth con PIN   | /pin-login        | `null` (quedarse)                   |
| AuthAuth con PIN   | shell del rol     | `null` (quedarse)                   |

---

## Casos de arranque

### Arranque en frío (sin sesión)

1. App arranca → `AuthInitial`.
2. `checkSession()` lee storage → no hay tokens → `AuthUnauthenticated`.
3. Router: `/login` → `null` (se queda en login).
4. Usuario entra teléfono + contraseña → `login()` → `AuthLoading` → `AuthAuthenticated`.
5. Router: `/login` → `/pin-setup` (si sin PIN) o `/pin-login` (si con PIN).

### Sesión restaurada (con PIN ya establecido)

1. App arranca → `AuthInitial`.
2. `checkSession()` lee storage → hay tokens → llama `GET /auth/me`.
3. `/auth/me` devuelve usuario + `pinEstablecido: true`.
4. `AuthAuthenticated(pinEstablecido: true)`.
5. Router: `/login` (initialLocation) → `/pin-login`.
6. Usuario entra PIN → `loginPin()` → `AuthLoading` → `AuthAuthenticated(pinEstablecido: true)`.
7. Router: `/pin-login` → shell del rol.

### Sesión restaurada (sin PIN)

1. App arranca → `AuthInitial`.
2. `checkSession()` lee storage → hay tokens → `GET /auth/me` → `pinEstablecido: false`.
3. `AuthAuthenticated(pinEstablecido: false)`.
4. Router: `/login` → `/pin-setup`.

### Token expirado

1. App arranca → `checkSession()` lee storage → hay tokens → `GET /auth/me`.
2. Access token expirado → 401.
3. `AuthInterceptor` refresca con refresh token → reintenta `/auth/me`.
4. Si refresh ok → `/auth/me` devuelve usuario → `AuthAuthenticated`.
5. Si refresh falla → `clearAll()` → `AuthUnauthenticated` → `/login`.

### PIN no establecido tras login con contraseña

1. `login()` → `AuthAuthenticated(pinEstablecido: false)`.
2. Router: `/login` → `/pin-setup`.
3. Usuario crea PIN → `setPin()` → `AuthAuthenticated(pinEstablecido: true)`.
4. Router: `/pin-setup` → `/pin-login`.
5. Usuario entra PIN → `loginPin()` → `AuthAuthenticated(pinEstablecido: true)`.
6. Router: `/pin-login` → shell del rol.

---

## Invariantes

1. **`pinEstablecido` viene del servidor, nunca se infiere localmente.**
   El servidor debe devolverlo como booleano explícito en `/auth/me` y
   `/auth/login`. El cliente no debe inspeccionar `pinHash` (que el servidor
   no envía).

2. **`checkSession()` es de arranque, no de validación continua.**
   Si el estado ya cambió a `AuthAuthenticated` por `login()` o `setPin()`
   antes de que `checkSession()` reciba su respuesta de `/auth/me`,
   `checkSession()` **no debe** sobrescribir el estado. Hacerlo provoca un
   bucle: el PIN ya se guardó, pero la respuesta tardía dice
   `pinEstablecido: false` y el router manda de vuelta a `/pin-setup`.

3. **El PIN no se guarda en el dispositivo.**
   Se establece con `POST /auth/pin` (autenticado) y se verifica con
   `POST /auth/login-pin` (púbico, usa refresh token + PIN).

4. **"Entrar con contraseña" y "Cerrar sesión" siempre hacen `logout()`.**
   Navegar a `/login` sin `logout()` no sirve: el router redirect devuelve
   al usuario a `/pin-setup` o `/pin-login` porque el estado sigue
   `AuthAuthenticated`.
