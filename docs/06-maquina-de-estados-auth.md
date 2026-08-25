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
| Autenticado         | `AuthAuthenticated`  | Hay tokens válidos. Ver dimensiones abajo.                 |
| No autenticado      | `AuthUnauthenticated`| No hay tokens o la sesión se invalidó.                     |
| Error               | `AuthError`          | Fallo de login o de PIN con mensaje del servidor.          |

### Dimensiones de `AuthAuthenticated`

`AuthAuthenticated` tiene dos campos booleanos que definen cuatro sub-estados:

| `pinEstablecido` | `desbloqueado` | Significado                                    |
|-------------------|-----------------|------------------------------------------------|
| `false`           | —               | Sin PIN. Debe crearlo.                         |
| `true`            | `false`         | Con PIN pero no validado en esta sesión.       |
| `true`            | `true`          | Con PIN y validado. Puede entrar al shell.     |
| `false`           | `true`          | Caso transitorio: acaba de loguear sin PIN.    |

`desbloqueado` indica que el usuario probó su identidad en esta ejecución de
la app. Se establece así:

- **Login con contraseña exitoso** → `desbloqueado: true`. Acaba de probar su
  identidad.
- **Arranque en frío con tokens guardados** (`checkSession`) →
  `desbloqueado: false`. Tiene sesión pero debe validar el PIN.
- **`loginPin` exitoso** → `desbloqueado: true`.
- **`setPin` exitoso** → `desbloqueado` se mantiene: venía de un login con
  contraseña, así que ya era `true`.

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
  (desbloqueado: false)                     ▲
      │                                     │
      │ loginPin() ok                       │ logout()
      ▼                                     │
  AuthAuthenticated                         │
  (desbloqueado: true)                      │
                                            │
  AuthUnauthenticated ──login()──► AuthLoading ──login ok──► AuthAuthenticated
                                            │                  (desbloqueado: true)
                                            │ login fail
                                            ▼
                                       AuthError
```

### Transiciones válidas

| Desde              | Evento          | Hasta                                    |
|--------------------|-----------------|------------------------------------------|
| AuthInitial        | checkSession ok | AuthAuthenticated (desbloqueado: false)  |
| AuthInitial        | checkSession sin tokens | AuthUnauthenticated            |
| AuthInitial        | checkSession error 401 | AuthUnauthenticated            |
| AuthUnauthenticated| login() ok      | AuthAuthenticated (desbloqueado: true)   |
| AuthUnauthenticated| login() fail    | AuthError                                |
| AuthAuthenticated  | setPin() ok     | AuthAuthenticated (pin=true, desbloqueado igual) |
| AuthAuthenticated  | loginPin() ok   | AuthAuthenticated (desbloqueado: true)   |
| AuthAuthenticated  | loginPin() fail | AuthError                                |
| AuthAuthenticated  | logout()        | AuthUnauthenticated                      |
| AuthError          | login() ok      | AuthAuthenticated (desbloqueado: true)   |
| Cualquiera         | logout()        | AuthUnauthenticated                      |

### Transiciones prohibidas

- `AuthAuthenticated` → `AuthAuthenticated` con `pinEstablecido` pasando de
  `true` a `false`. Si el PIN ya está guardado en el servidor, no puede
  "des-guardarse".
- `checkSession()` pisando un estado que ya cambió por `login()` o `setPin()`.
  `checkSession` es una restauración de arranque, no una re-validación
  continua. El guard anti-race en `checkSession()` descarta la respuesta
  tardía si el estado ya dejó de ser `AuthInitial`.
- `desbloqueado` pasando de `true` a `false` dentro de la misma sesión.
  Solo `logout()` puede resetearlo (via `AuthUnauthenticated`).

---

## Router — cuatro reglas en orden

El redirect evalúa estas reglas en orden. La primera que coincide gana.

| # | Condición                                    | Redirect a              |
|---|----------------------------------------------|-------------------------|
| 1 | No autenticado (`AuthUnauthenticated` o `AuthError`) | `/login`        |
| 2 | Autenticado y `pinEstablecido == false`      | `/pin-setup`            |
| 3 | Autenticado, `pinEstablecido == true`, `desbloqueado == false` | `/pin-login` |
| 4 | Autenticado y `desbloqueado == true`         | shell del rol (si está en ruta de auth) |

Si ninguna regla aplica (ej: ya está en el shell del rol), devuelve `null` y
se queda donde está.

### Rutas de autenticación

Las rutas de autenticación son: `/login`, `/pin-setup`, `/pin-login`,
`/pin-bloqueado`. La regla 4 solo redirige al shell si el usuario está en una
de estas rutas. Si ya está en el shell, se queda.

---

## Casos de arranque

### Arranque en frío (sin sesión)

1. App arranca → `AuthInitial`.
2. `checkSession()` lee storage → no hay tokens → `AuthUnauthenticated`.
3. Router: regla 1 → `/login`.
4. Usuario entra teléfono + contraseña → `login()` → `AuthLoading` →
   `AuthAuthenticated(desbloqueado: true)`.
5. Router: regla 2 (sin PIN) → `/pin-setup`, o regla 4 (con PIN) → shell.

### Sesión restaurada (con PIN ya establecido)

1. App arranca → `AuthInitial`.
2. `checkSession()` lee storage → hay tokens → `GET /auth/me` →
   `pinEstablecido: true`.
3. `AuthAuthenticated(pinEstablecido: true, desbloqueado: false)`.
4. Router: regla 3 → `/pin-login`.
5. Usuario entra PIN → `loginPin()` → `AuthLoading` →
   `AuthAuthenticated(desbloqueado: true)`.
6. Router: regla 4 → shell del rol.

### Sesión restaurada (sin PIN)

1. App arranca → `AuthInitial`.
2. `checkSession()` → `GET /auth/me` → `pinEstablecido: false`.
3. `AuthAuthenticated(pinEstablecido: false, desbloqueado: false)`.
4. Router: regla 2 → `/pin-setup`.

### Token expirado

1. App arranca → `checkSession()` → `GET /auth/me`.
2. Access token expirado → 401.
3. `AuthInterceptor` refresca con refresh token → reintenta `/auth/me`.
4. Si refresh ok → `/auth/me` devuelve usuario → `AuthAuthenticated(desbloqueado: false)`.
5. Si refresh falla → `clearAll()` → `AuthUnauthenticated` → `/login`.

### PIN no establecido tras login con contraseña

1. `login()` → `AuthAuthenticated(pinEstablecido: false, desbloqueado: true)`.
2. Router: regla 2 → `/pin-setup`.
3. Usuario crea PIN → `setPin()` →
   `AuthAuthenticated(pinEstablecido: true, desbloqueado: true)`.
4. Router: regla 4 → shell del rol.

> **Nota:** tras `setPin`, el usuario va directo al shell porque ya probó su
> identidad con la contraseña. No se le pide el PIN de nuevo en la misma
> sesión.

---

## Invariantes

1. **`pinEstablecido` viene del servidor, nunca se infiere localmente.**
   El servidor lo devuelve como booleano explícito en `/auth/me` y
   `/auth/login`. El cliente no inspecciona `pinHash` (que el servidor no
   envía).

2. **`desbloqueado` es local a la sesión.**
   No se persiste. Un arranque en frío siempre empieza con
   `desbloqueado: false`, aunque haya tokens válidos. Solo `login()` y
   `loginPin()` lo ponen en `true`.

3. **`checkSession()` es de arranque, no de validación continua.**
   Si el estado ya cambió a `AuthAuthenticated` por `login()` o `setPin()`
   antes de que `checkSession()` reciba su respuesta de `/auth/me`,
   `checkSession()` no sobrescribe el estado.

4. **El PIN no se guarda en el dispositivo.**
   Se establece con `POST /auth/pin` (autenticado) y se verifica con
   `POST /auth/login-pin` (púbico, usa refresh token + PIN).

5. **"Entrar con contraseña" y "Cerrar sesión" siempre hacen `logout()`.**
   Navegar a `/login` sin `logout()` no sirve: el router redirect devuelve
   al usuario a `/pin-setup` o `/pin-login` porque el estado sigue
   `AuthAuthenticated`.

6. **Las pantallas de PIN conservan los datos del usuario durante `AuthLoading`.**
   El nombre y las iniciales se cachean en el widget. Mientras `loginPin()`
   está en vuelo, el estado pasa por `AuthLoading`, pero la pantalla no debe
   mostrar "Hola," vacío ni iniciales "TAV".
