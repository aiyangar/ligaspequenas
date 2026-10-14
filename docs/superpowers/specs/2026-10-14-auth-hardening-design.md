# Endurecimiento de auth: ciclo de vida async en el frontend (#12) e `invite-user` operativo (#14) — Diseño

**Fecha:** 2026-10-14
**Estado:** Borrador (pendiente de revisión adversarial)
**Issues:** [#12](https://github.com/aiyangar/ligaspequenas/issues/12), [#14](https://github.com/aiyangar/ligaspequenas/issues/14)

## 1. Contexto y objetivo

Ambas issues salieron de la revisión del Plan 2 (auth + tenant shell + usuarios) y quedaron diferidas. Desde entonces el flujo de contraseña se reemplazó por magic-link (`2026-06-28-passwordless-magic-link-design.md`): `AcceptInvitePage` ya no existe (se eliminó en `d5b4450`) y su lugar lo ocupa `AuthCallbackPage`.

Objetivo:

- **#12:** ninguna pantalla de auth se queda colgada para siempre en "cargando" porque una promesa de Supabase se rechazó; una sesión vieja nunca pisa a una más nueva; el formulario de login no envía dos solicitudes por un mismo intento.
- **#14:** si el rollback de una invitación falla, queda registrado y el cliente lo sabe; el header `Authorization` se valida con un formato estricto; CORS solo responde a los orígenes de la app.

Sin cambios de base de datos. Cada afirmación de las issues se verificó contra `develop` (`c1bac5b`); §3.1 y §4.1 dicen cuáles siguen vigentes y cuáles se descartan.

## 2. Decisiones

| Decisión | Elección |
|---|---|
| #12 — "updates de estado tras unmount" | **Se descarta como objetivo propio.** En React 18+ (el proyecto usa React 19.2) un `setState` sobre un componente desmontado es un no-op silencioso; se quitó el warning. Añadir banderas `active`/`mounted` solo para eso es código sin efecto observable ni test que pueda fallar. Solo se tocan los efectos donde hay un **defecto real** (§3.1). |
| #12 — `getSession()` rechazado | **`.catch` que resuelve el estado "sin sesión"** en `AuthProvider` (`loading: false`, `session: null`) y en `AuthCallbackPage` (`checked: true`). Descartado: reintentar — el siguiente evento de `onAuthStateChange` ya corrige el estado si la sesión aparece; reintentos/backoff quedan fuera de alcance. |
| #12 — carrera `getSession` vs. eventos en `AuthProvider` | **El evento gana**: si `onAuthStateChange` ya entregó un estado, el resultado posterior de `getSession()` se ignora. Descartado: (a) quitar `getSession()` y depender solo del evento `INITIAL_SESSION` — cambio de diseño mayor, y `RequireAuth` depende de que `loading` se resuelva aunque el evento no llegue; (b) comparar timestamps de sesión — innecesario, el orden de llegada basta. |
| #12 — doble envío en `LoginPage` | **Guarda síncrona con `useRef`** al inicio de `handleSubmit`, además del `disabled` actual. El `disabled={submitting}` depende de un re-render; un segundo `submit` despachado antes de que el botón se deshabilite (o un `submit` del formulario que no pasa por el botón) hoy vuelve a llamar `signInWithOtp`. Descartado: leer `submitting` en el handler — el closure puede estar desfasado. |
| #14 — origen de la lista CORS | **Secreto de la función `ALLOWED_ORIGINS`** (lista separada por comas), leído con `Deno.env.get`. Se configura en Supabase (Dashboard → Edge Functions → Secrets o `supabase secrets set`), nunca en el repo. Descartado: lista hardcodeada — la URL de producción no está en el repo y cambiarla exigiría redeploy con código nuevo. |
| #14 — secreto ausente o vacío | **Fail-closed**: sin orígenes permitidos no se emite `Access-Control-Allow-Origin` y toda petición con `Origin` se rechaza (403). Es la opción conservadora; obliga a configurar el secreto **antes** de desplegar (§6). |
| #14 — origen no permitido | Además de omitir `Access-Control-Allow-Origin`, el handler **rechaza** (`OPTIONS` → 403; `POST` → 403 `origin_not_allowed`) cualquier petición cuyo header `Origin` no esté en la lista, antes de validar el token. Peticiones **sin** `Origin` (curl, server-to-server) siguen al chequeo de JWT como hoy. CORS no es autenticación: el JWT + `checkAdmin` siguen siendo el control real. |
| #14 — rollback fallido | **Se comprueba el resultado de `deleteUser`** (error devuelto o excepción). Si falla: `console.error` con el `userId` (sin email) y respuesta `500 { error: 'profile_insert_failed', detail, rollback: 'failed' }`. El código de error no cambia, así que `UsersPage` no necesita cambios. Descartado: código nuevo (`orphaned_user`) — obligaría a tocar `src/users/` y el admin no puede resolverlo desde la UI de todos modos. |
| #14 — testabilidad | La lógica nueva va en **módulos puros sin imports de Deno** (como `authorize.ts`), probados con Vitest igual que `authorize.test.ts`. `index.ts` solo los cablea. Descartado: `deno test` — no hay toolchain de Deno en el repo ni en CI. |
| Entrega | Una rama + un PR por issue, base `develop`. Paralelizables (§7). |

## 3. #12 — Ciclo de vida async en auth (`fix/auth-lifecycle-hardening`)

### 3.1 Contexto verificado

**`src/auth/AuthContext.ts`** — solo define el contexto y `useAuth()`. Nada async. **Sin cambios.**

**`src/auth/AuthProvider.tsx`** (líneas 11–26):

- Ya tiene bandera `active` para el `.then` de `getSession()` y desuscribe en el cleanup. El "update tras unmount" ya está cubierto.
- **Defecto 1 (vigente):** `getSession()` no tiene `.catch`. Si se rechaza (en `@supabase/auth-js` 2.108 puede rechazar, p. ej. por timeout del lock en `_acquireLock`), `loading` se queda en `true` para siempre y `RequireAuth` muestra "Cargando…" indefinidamente; además queda una promesa rechazada sin manejar.
- **Defecto 2 (vigente):** `onAuthStateChange` emite `INITIAL_SESSION` y luego `SIGNED_IN`/`SIGNED_OUT`; `getSession()` puede resolver **después** de un evento y sobrescribir `session` con un valor anterior (p. ej. un `SIGNED_IN` seguido por un `getSession` que resolvió `null`). La ventana es pequeña pero real.

**`src/auth/LoginPage.tsx`** (líneas 17–42):

- **Doble envío (vigente, menor):** `handleSubmit` no comprueba si hay un envío en vuelo; solo el botón se deshabilita tras el re-render. Un `submit` del formulario despachado directamente (o dos antes del re-render) llama `signInWithOtp` dos veces → dos correos.
- **Update tras unmount (descartado):** si el usuario sale de `/login` mientras espera, `setSent`/`setSubmitting` son no-ops en React 19. Nada que corregir.

**`src/auth/AuthCallbackPage.tsx`** (líneas 29–38):

- **Defecto (vigente):** `getSession()` sin `.catch`. En una visita sin token (`/auth/callback` a secas) el error "El enlace no es válido o expiró" depende de `checked === true`; si `getSession()` se rechaza, `checked` nunca cambia y la página se queda en "Iniciando sesión…" para siempre.
- **Update tras unmount (descartado):** el `.then` no tiene bandera `active`, pero tras desmontar `setReady`/`setChecked` son no-ops y la navegación vive en otro efecto (desaparece con el componente). En StrictMode el `.then` del primer montaje toca la misma instancia de estado con valores idempotentes. Sin cambio.
- **Doble envío:** no aplica (no hay formulario).

**Conceptos del hallazgo original que ya no aplican** (se dicen explícitamente porque la issue lo pide):

- `AcceptInvitePage` (formulario de contraseña, doble envío de `updateUser`, `setState` tras navegar): la página y el flujo de contraseña ya no existen.
- "Guardar contra `setState` tras unmount" en general: no-op en React 18+/19 (ver §2).

### 3.2 Comportamiento exacto

**`AuthProvider`:**

- Una variable local del efecto `settledByEvent = false`. El callback de `onAuthStateChange` la pone en `true` antes de `setSession`/`setLoading(false)`.
- `.then` de `getSession()`: `if (!active || settledByEvent) return`; si no, como hoy.
- Nuevo `.catch`: `if (!active || settledByEvent) return; setSession(null); setLoading(false)`.
- Todo ocurre en callbacks async, no en el cuerpo del efecto: cumple `react-hooks/set-state-in-effect` (§6.3 de los lotes anteriores).

**`AuthCallbackPage`:**

- Nuevo `.catch` en `getSession()`: `setChecked(true)` (sin `setReady`). Resultado: visita sin token + rechazo → error "El enlace no es válido o expiró" con el enlace a `/login`; con token en la URL sigue esperando el `SIGNED_IN` como hoy (la condición `checked && !hasAuthToken` no cambia).

**`LoginPage`:**

- `const inFlight = useRef(false)`. Al inicio de `handleSubmit`, tras `e.preventDefault()`: `if (inFlight.current) return`. Se pone en `true` justo antes del `await` (después de la validación del correo, para que un correo inválido no bloquee) y se vuelve a `false` en el `finally`, junto a `setSubmitting(false)`.
- El `disabled={submitting}` del botón se mantiene (feedback visual). Tras terminar, se puede reenviar como hoy.

Sin comentarios nuevos en el código salvo, si hace falta, uno de una línea en `settledByEvent` (por qué el evento tiene prioridad).

### 3.3 Tests (TDD — cada uno falla antes del cambio)

`src/auth/AuthContext.test.tsx` (prueba `AuthProvider` vía `useAuth`, mismo `Probe`):

1. **`getSession` rechazado → anon:** `mocks.getSession.mockRejectedValue(new Error('lock timeout'))` → se ve `anon` (hoy: `loading` para siempre + rechazo no manejado).
2. **El evento gana sobre un `getSession` tardío:** `getSession` devuelve una promesa diferida; capturar el callback de `onAuthStateChange` (como en `AuthCallbackPage.test.tsx`); `act(() => cb('SIGNED_IN', { user: { id: 'u2' } }))` → `user:u2`; luego resolver la diferida con `{ data: { session: null }, error: null }` dentro de `act` → sigue `user:u2` (hoy: pasa a `anon`).
3. Los tres tests existentes siguen en verde.

`src/auth/AuthCallbackPage.test.tsx`:

4. **Visita sin token + `getSession` rechazado → error:** `renderCallback('/auth/callback')` con `getSession.mockRejectedValue(...)` → se ve "El enlace no es válido o expiró" (hoy: "Iniciando sesión…" para siempre).
5. **Con token + `getSession` rechazado → sigue esperando:** `renderCallback()` (entrada con token) → "Iniciando sesión…" y, tras un `SIGNED_IN` capturado, navega a Home.
6. Los cuatro tests existentes siguen en verde.

`src/auth/LoginPage.test.tsx`:

7. **Un solo envío por intento:** `signInWithOtp` devuelve una promesa diferida; escribir un correo válido; `fireEvent.submit` dos veces sobre el formulario (`screen.getByRole('button', …).closest('form')`) → `signInWithOtp` llamado **una** vez; tras resolver, se ve el mensaje neutral. `fireEvent.submit` salta el `disabled` del botón, que es justo el camino que la guarda cubre.
8. **Reenvío tras terminar:** tras un envío resuelto, un segundo clic en "Enviar enlace de acceso" vuelve a llamar `signInWithOtp` (la guarda se libera en `finally`).
9. Los cinco tests existentes siguen en verde.

Mocks: rechazos con `mockRejectedValue` persistente (no `*Once` sin consumir — `vi.clearAllMocks()` no vacía la cola de `*Once`).

## 4. #14 — `invite-user` operativo (`fix/invite-user-hardening`)

### 4.1 Contexto verificado

`supabase/functions/invite-user/index.ts`:

- **Rollback sin comprobar (vigente):** línea 79, `await serviceClient.auth.admin.deleteUser(invited.user.id)` ignora `{ error }` y no tiene `try`. Si falla, el usuario de `auth.users` queda huérfano (sin `profiles`), el correo ya no es re-invitable (`email_exists`) y nadie se entera.
- **Bearer laxo (vigente):** línea 29, `authHeader.replace('Bearer ', '')` acepta cualquier cosa: `Basic xyz` pasa tal cual como "token", `bearer x` (minúsculas) no se recorta, espacios extra quedan dentro. En la práctica `getUser` lo rechaza (401) y el gateway tiene `verify_jwt = true` (`supabase/config.toml:416-417`), así que es endurecimiento, no un bypass.
- **CORS `*` (vigente):** líneas 5–9; también en la respuesta del preflight (línea 19) y en todas las respuestas `json()`.

Cómo se prueba hoy: `authorize.test.ts` usa los globals de Vitest (`test`, `expect`, `globals: true` en `vite.config.ts`) y lo recoge `pnpm exec vitest run` (patrón por defecto `**/*.test.ts`); se ejecuta en Node/jsdom, por eso `authorize.ts` no importa nada de Deno. `tsc -b` **no** typechecka `supabase/` (`tsconfig.app.json` solo incluye `src`); el typecheck de Deno ocurre al desplegar. ESLint sí lintea `supabase/**/*.ts`.

Orígenes de la app (verificados en el repo): dev = `http://localhost:5173` (Vite por defecto; citado en `docs/plan2-bootstrap-admin.md` y en el spec de magic-link). Producción = la URL de Vercel, **que no está en el repo** (la provee el owner). No hay entorno local de Supabase: el dev apunta al mismo proyecto remoto, así que ambos orígenes van en el mismo secreto.

Despliegue: originalmente con `mcp__supabase__deploy_edge_function` (plan de Plan 2, Task 9 Step 7). Hoy el camino es la CLI del repo (devDependency `supabase` 2.107): `pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api` (sin Docker; empaqueta los imports relativos y respeta `verify_jwt` de `config.toml`). No hay CI de despliegue.

### 4.2 Comportamiento exacto

**Módulo nuevo `supabase/functions/invite-user/http.ts`** (puro, sin imports):

- `parseBearerToken(header: string | null): string | null` — devuelve el token si el header, tras `trim()`, cumple `/^Bearer\s+(\S+)$/i` (esquema sin distinguir mayúsculas, un único token sin espacios); si no, `null`.
- `parseAllowedOrigins(raw: string | undefined): string[]` — `split(',')`, `trim()` de cada uno, quita vacíos y la `/` final. `undefined`/`''` → `[]`.
- `isOriginAllowed(origin: string | null, allowed: string[]): boolean` — `origin === null` → `true` (petición no-browser; el JWT decide); si no, coincidencia **exacta** con algún elemento de `allowed`.
- `corsHeaders(origin: string | null, allowed: string[]): Record<string, string>` — siempre `Access-Control-Allow-Headers` y `Access-Control-Allow-Methods` actuales, más `Vary: Origin`; `Access-Control-Allow-Origin: <origin>` **solo** si `origin !== null` y está en `allowed`. Nunca `*`.

**Módulo nuevo `supabase/functions/invite-user/rollback.ts`** (puro):

- `rollbackInvitedUser(deleteUser: (id: string) => Promise<{ error: { message: string } | null }>, userId: string): Promise<boolean>` — `true` si `deleteUser` resuelve sin `error`; `false` si devuelve `error` **o** lanza. En el caso `false`, `console.error('invite-user rollback failed', { userId, message })`. No registra el email.

**`index.ts`:**

1. Al inicio de cada petición: `origin = req.headers.get('Origin')`, `allowed = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))`, `cors = corsHeaders(origin, allowed)`. `json()` recibe los headers CORS de la petición (deja de usar la constante global).
2. `OPTIONS`: si `isOriginAllowed` → `200 'ok'` con `cors` (como hoy); si no → `403` sin `Access-Control-Allow-Origin`.
3. Método distinto de `POST` → `405` (como hoy).
4. `POST` con `Origin` no permitido → `403 { error: 'origin_not_allowed' }`, **antes** de crear el cliente de servicio o validar el token.
5. Token: `parseBearerToken(req.headers.get('Authorization'))`. Header ausente → `401 missing_authorization` (como hoy); presente pero mal formado → `401 invalid_authorization`. Luego `getUser(token)` como hoy.
6. Rollback: `const rolledBack = await rollbackInvitedUser((id) => serviceClient.auth.admin.deleteUser(id), invited.user.id)`. Respuesta `500 { error: 'profile_insert_failed', detail }` si `rolledBack`, o `500 { error: 'profile_insert_failed', detail, rollback: 'failed' }` si no. El comentario existente del "compensating action" se mantiene.
7. El resto (validación del body, `inviteUserByEmail`, mapeo `email_exists`, insert del perfil) no cambia.

`src/users/` no cambia: `inviteUser.ts` solo lee `error`, y `UsersPage` muestra el código crudo para los no mapeados (`profile_insert_failed`, como hoy).

### 4.3 Tests (TDD — Vitest, mismo estilo que `authorize.test.ts`)

`supabase/functions/invite-user/http.test.ts`:

1. `parseBearerToken`: `'Bearer abc'` → `'abc'`; `'bearer abc'` → `'abc'`; `'  Bearer   abc  '` → `'abc'`; `null`, `''`, `'Bearer'`, `'Bearer '`, `'Basic abc'`, `'Bearer a b'`, `'abc'` → `null`.
2. `parseAllowedOrigins`: `'http://localhost:5173, https://app.example.com/'` → `['http://localhost:5173', 'https://app.example.com']`; `undefined`, `''`, `' , '` → `[]`.
3. `isOriginAllowed`: `null` → `true`; origen exacto → `true`; `'https://app.example.com.evil.com'`, `'http://app.example.com'` (otro esquema), `'https://app.example.com:8443'` → `false`; cualquier origen con `allowed = []` → `false`.
4. `corsHeaders`: origen permitido → `Access-Control-Allow-Origin` igual al origen y `Vary: Origin`; origen no permitido o `null` → sin `Access-Control-Allow-Origin`; ninguna salida contiene `'*'`.

`supabase/functions/invite-user/rollback.test.ts`:

5. `deleteUser` resuelve `{ error: null }` → `true`, sin `console.error` (spy con `vi.spyOn(console, 'error')`).
6. `deleteUser` resuelve `{ error: { message: 'boom' } }` → `false` y `console.error` llamado con un objeto que contiene el `userId`.
7. `deleteUser` lanza → `false` y `console.error` llamado.

`authorize.test.ts` no cambia. Los módulos nuevos se importan con extensión `.ts` (como `./authorize.ts`) para que funcionen igual en Deno y en Vitest.

`index.ts` no tiene test automatizado (como hoy); se cubre con la verificación en vivo de §6.

## 5. Restricciones comunes

- §6.3 de los lotes anteriores sigue vigente: ningún `setState` síncrono en el cuerpo de un efecto (`react-hooks/set-state-in-effect`). Todos los cambios de #12 van en callbacks async o handlers.
- Mismo estilo de mocks (`vi.hoisted` + `vi.mock('../lib/supabase')`).
- Sin comentarios salvo un "por qué" de una línea donde haga falta.
- Ningún secreto en el repo: `ALLOWED_ORIGINS` no es secreto en sentido estricto, pero vive en los secretos de la función y no se commitea (la URL de producción la decide el owner). No se añade a `.env.example` (ese archivo es del frontend Vite).

## 6. Pasos del owner / manuales

Orden obligatorio para #14 (fail-closed, §2):

1. **Owner — antes del deploy:** configurar el secreto `ALLOWED_ORIGINS` en el proyecto `eksbaugyypadtanyjcje` (Dashboard → Edge Functions → Secrets, o `pnpm exec supabase secrets set ALLOWED_ORIGINS=http://localhost:5173,https://<url-de-producción> --project-ref eksbaugyypadtanyjcje`). El owner aporta la URL de producción; el comando lo puede correr el orquestador. Exactamente los orígenes (esquema + host + puerto), sin ruta.
2. **Orquestador/owner — tras el merge a `develop`:** redesplegar desde el checkout actualizado de `develop`: `pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api` (incluye `authorize.ts`, `http.ts`, `rollback.ts` por ser imports relativos). No es paso del implementador. Confirmar que la versión subió (`pnpm exec supabase functions list --project-ref eksbaugyypadtanyjcje`).
3. **Owner — verificación en vivo (curl):**
   - `OPTIONS` con `Origin: http://localhost:5173` → 200 y `Access-Control-Allow-Origin: http://localhost:5173`.
   - `OPTIONS` con `Origin: https://evil.example` → 403 sin `Access-Control-Allow-Origin`. (Si el gateway responde el preflight antes del handler, anotarlo: ver §8.)
   - `POST` con token de admin y `Authorization: Basic <token>` → 401 `invalid_authorization` (o 401 del gateway por `verify_jwt`; ambos válidos).
4. **Owner — navegador:** desde `http://localhost:5173` y desde producción, invitar un usuario en **Usuarios** → éxito; DevTools muestra `Access-Control-Allow-Origin` con el origen exacto.
5. **Owner — navegador (#12):** login con magic-link de punta a punta sigue funcionando; abrir `/auth/callback` sin token muestra "El enlace no es válido o expiró".

El rollback fallido no se puede provocar en vivo sin romper la BD; queda cubierto solo por los tests de `rollback.ts`.

## 7. Entrega

| Rama | Issue | Archivos |
|---|---|---|
| `fix/auth-lifecycle-hardening` | #12 | `src/auth/AuthProvider.tsx`, `src/auth/AuthContext.test.tsx`, `src/auth/AuthCallbackPage.tsx`, `src/auth/AuthCallbackPage.test.tsx`, `src/auth/LoginPage.tsx`, `src/auth/LoginPage.test.tsx` |
| `fix/invite-user-hardening` | #14 | `supabase/functions/invite-user/index.ts`, `supabase/functions/invite-user/http.ts` (nuevo), `supabase/functions/invite-user/http.test.ts` (nuevo), `supabase/functions/invite-user/rollback.ts` (nuevo), `supabase/functions/invite-user/rollback.test.ts` (nuevo) |

- **Paralelizables, ambas desde `develop`:** archivos disjuntos y sin acoplamiento de comportamiento (#12 no toca la función; #14 no toca `src/`).
- Un PR por rama, base `develop`, cuerpo con `Closes #12` / `Closes #14`.
- Ciclo por rama: implementador → revisor previo al PR. Sin Blockers/Majors → PR (Minors/Nits como issues). Con Blockers/Majors → el orquestador planea cambios y reinicia; máximo 3 ciclos, luego se escala al owner. El orquestador mergea a `develop`; `develop → main` solo con confirmación del owner.
- Cierre de cada rama: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint` en verde. Para #14, además, `tsc -b` no cubre `supabase/`: el typecheck real es el del deploy (paso 2 de §6); si el deploy falla por tipos, se trata como regresión de la rama (revert, no parche).
- #14 no está "hecho" hasta completar §6 pasos 1–4; #12 hasta el paso 5.

## 8. Preguntas abiertas / supuestos

- **URL de producción:** no está en el repo; el owner la pone en `ALLOWED_ORIGINS`. Se asume un único dominio de producción.
- **Previews de Vercel:** sus URLs cambian por deploy; con coincidencia exacta **no** pueden invitar usuarios. Se acepta (conservador); si hace falta, issue aparte (p. ej. patrón por sufijo).
- **`localhost:5173` en el secreto de producción:** necesario porque dev usa el mismo proyecto remoto (no hay stack local). Riesgo bajo: CORS no autentica; el JWT de admin sigue siendo obligatorio.
- **Preflight y `verify_jwt`:** se asume, como hoy, que el gateway deja pasar el `OPTIONS` al handler (la invitación funciona hoy desde el navegador). Si el paso 3 de §6 muestra que el gateway contesta el preflight por su cuenta, el filtrado de `POST` (paso 4 de §4.2) sigue protegiendo; se documenta en el PR.
- **`AuthCallbackPage` con token inválido en la URL:** si el hash trae un token que Supabase no logra canjear y no llega `#error=…`, la página espera indefinidamente (no hay timeout). No es un caso de "promesa rechazada" y queda fuera de alcance; candidato a issue aparte.
- **`detail` en errores 500** expone el mensaje de Postgres al admin que invita. Comportamiento actual; fuera de alcance.

## 9. Fuera de alcance

- Validar `redirectTo` del body contra `ALLOWED_ORIGINS` (ya lo restringe el allowlist de Redirect URLs de Supabase Auth).
- Reintentos/backoff de `getSession` o de `deleteUser`.
- Mapear `profile_insert_failed` u `origin_not_allowed` a mensajes en `UsersPage`.
- Timeout en `AuthCallbackPage` (§8).
- Migrar las pruebas de la función a `deno test`.
