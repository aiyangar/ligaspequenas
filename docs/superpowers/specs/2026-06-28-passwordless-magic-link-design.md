# Diseño — Autenticación passwordless por magic link

**Fecha:** 2026-06-28
**Estado:** aprobado (brainstorming), pendiente de plan de implementación.

## Objetivo

Reemplazar la autenticación basada en contraseña de Plan 2 por un modelo **passwordless con magic link**, usando el **email integrado de Supabase**. Nadie define ni usa contraseña: el admin crea usuarios desde la app (autoconfirmados, sin correo de "confirma tu cuenta"), y cada usuario entra con un enlace de un solo uso que recibe por correo. La autorización real sigue siendo RLS; el gating de UI es solo UX.

## Motivación

El flujo de Plan 2 (invitación → fijar contraseña en `/accept-invite`) introducía un paso de contraseña frágil y dependía de que el usuario fijara y recordara una credencial. El usuario quiere un flujo más simple: el admin agrega gente y esta entra con un link, sin contraseñas.

## Alcance

**Dentro:** login passwordless; onboarding por invitación (correo con link que loguea); eliminación del paso de contraseña; copy de UsersPage; ruta de callback de auth; config de redirect allowlist.

**Fuera (YAGNI):** SMTP propio (se difiere; el email integrado basta para bajo volumen — migrable después); OTP de 6 dígitos (usamos magic link, no código); recuperación de contraseña (ya no aplica sin contraseñas); cambio de email.

## Arquitectura

Dos sub-flujos, ambos terminan en una **ruta de callback** que espera la sesión y enruta a `/`:

1. **Onboarding (admin crea usuario):** la Edge Function `invite-user` (service_role, admin-guarded) sigue llamando `inviteUserByEmail(email, { redirectTo: <origin>/auth/callback })` e insertando el `profile` (tenant del llamador, full_name, role). El correo de invitación contiene el link que, al hacer clic, **confirma + crea sesión** (passwordless). No hay paso de contraseña.

2. **Login recurrente (cualquier usuario):** `LoginPage` pide solo el correo y llama `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: <origin>/auth/callback } })`. Supabase manda un magic link. Al hacer clic → callback → sesión → `/`.

`AuthContext`, `TenantContext`, `RequireAuth`, `RequireAdmin`, `AppLayout`, `PlaceholderPage`, las rutas y los `routes.tsx` **no cambian su lógica** (siguen leyendo sesión/perfil y enrutando). Solo cambia el árbol de rutas para reemplazar `/accept-invite` por `/auth/callback`.

## Componentes (cambios por archivo)

- **`src/auth/LoginPage.tsx`** (reescrito): un solo campo `Correo` + botón "Enviar enlace de acceso". Llama `signInWithOtp` con `shouldCreateUser: false` y `emailRedirectTo`. Sin campo de contraseña, sin `signInWithPassword`. Tras enviar, muestra un mensaje neutral de confirmación (ver Manejo de errores). Conserva los labels/roles que sus tests asserten (se reescriben los tests acorde).
- **`src/auth/AuthCallbackPage.tsx`** (renombrado/repurposed desde `AcceptInvitePage.tsx`): muestra "Iniciando sesión…" mientras no hay sesión; en cuanto `onAuthStateChange`/`getSession` reporta sesión, navega a `/`. Sin formulario de contraseña. supabase-js (`detectSessionInUrl`, default) procesa el token del link al cargar.
- **`src/auth/AcceptInvitePage.tsx`** y su test: **eliminados** (sustituidos por `AuthCallbackPage`).
- **`src/app/routes.tsx`**: la ruta pública `/accept-invite` → `/auth/callback` (apunta a `AuthCallbackPage`). El resto del árbol igual.
- **`supabase/functions/invite-user/index.ts`**: sin cambios de lógica; el `redirectTo` que recibe ahora apunta a `/auth/callback` (lo construye el cliente). El guard `checkAdmin`, el `409 email_exists`, el rollback y el insert de profile se mantienen.
- **`src/users/inviteUser.ts`**: `redirectTo = ${window.location.origin}/auth/callback` (antes `/accept-invite`). Sin otros cambios.
- **`src/users/UsersPage.tsx`**: copy del mensaje de éxito → "Usuario creado, se le envió un enlace de acceso" (antes "Invitación enviada"). Form (correo, nombre, rol) igual.

## Flujo de datos

**Onboarding:** Admin llena el form → `inviteUser({email, fullName, role})` → Edge Function `inviteUserByEmail(..., redirectTo=/auth/callback)` + insert profile → Supabase manda correo de invitación → usuario hace clic → `/auth/callback` detecta el token → sesión → `AuthCallbackPage` navega a `/` → `RequireAuth`+`TenantContext` resuelven → app.

**Login:** Usuario en `/login` escribe su correo → `signInWithOtp({shouldCreateUser:false, emailRedirectTo=/auth/callback})` → correo con magic link → clic → `/auth/callback` → sesión → `/`.

## Manejo de errores

- **LoginPage:** correo vacío/ inválido → mensaje "Ingresa un correo válido" (validación local). En el submit, para **no filtrar qué correos existen** (enumeración), se muestra siempre un mensaje neutral: *"Si tu correo tiene acceso, te enviamos un enlace."* Los errores reales de transporte (red) se muestran como error genérico. (Decisión revisable: en un sistema interno se podría mostrar "ese correo no tiene acceso" para mayor claridad; por defecto vamos a neutral.)
- **AuthCallbackPage:** si `getSession` resuelve sin sesión y el URL trae params de error de Supabase (`error`/`error_description`/`error_code` en el hash o query — Supabase los agrega cuando el link expiró o es inválido), muestra "El enlace no es válido o expiró" con un link de regreso a `/login`. No usa temporizadores arbitrarios.
- **Edge Function:** sin cambios (mismos códigos: 403 forbidden, 409 email_exists, 400 invalid_role/email_required, etc.). UsersPage mapea como hoy.

## Seguridad

- `shouldCreateUser: false` en `signInWithOtp` → un correo no registrado **no** puede auto-crear cuenta vía magic link; solo usuarios que el admin ya creó reciben enlace (sistema cerrado).
- La creación de usuarios sigue siendo solo server-side, admin-guarded (`checkAdmin`), con `service_role` únicamente en la Edge Function.
- RLS sin cambios: sigue siendo la autorización real; el `tenant_id` del nuevo profile viene del perfil verificado del llamador.
- Sin contraseñas → desaparece toda la superficie de credenciales (no hay password en bundle, storage, ni reset).

## Configuración operativa (Supabase Auth)

- **Redirect allowlist:** agregar la URL del callback — dev `http://localhost:5173/auth/callback` y la URL de producción — en Authentication → URL Configuration → Redirect URLs. Sin esto, los links caen al Site URL.
- **Email:** se mantiene el integrado de Supabase (rate-limited, bajo volumen). Migrar a SMTP propio (p. ej. Resend) cuando haya volumen real — fuera de alcance.

## Estrategia de pruebas

- **LoginPage:** valida correo requerido; al enviar llama `signInWithOtp` con `shouldCreateUser:false` + `emailRedirectTo` correcto; muestra el mensaje de confirmación; NO hay campo de contraseña.
- **AuthCallbackPage:** muestra "Iniciando sesión…" sin sesión; navega a `/` cuando aparece sesión (vía `SIGNED_IN`); muestra error si el link es inválido.
- **inviteUser:** `redirectTo` termina en `/auth/callback`; comportamiento de error (FunctionsHttpError → `error.context.json()`) igual que hoy.
- **UsersPage:** mensaje de éxito "se le envió un enlace de acceso"; lista + cambio de rol sin cambios.
- **Edge Function `checkAdmin`:** unit test igual (sin cambios de lógica).
- **App smoke:** visita no autenticada → `/login` (sigue válido).
- Verificación owner-run (manual): crear un usuario desde la app → llega el correo → el link loguea sin pedir contraseña → entra; y un login recurrente vía magic link.

## Decisiones menores

- Ruta de callback única (`/auth/callback`) para ambos tipos de link (invite y magic link), en vez de páginas separadas.
- `AcceptInvitePage` se repurposea a `AuthCallbackPage` (mismo patrón de espera de sesión, sin el form de contraseña) en lugar de crear algo de cero.
- Mensaje de login neutral (anti-enumeración) por defecto.
