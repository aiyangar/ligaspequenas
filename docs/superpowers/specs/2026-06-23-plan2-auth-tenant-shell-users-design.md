# Spec de diseño — Plan 2: Auth + TenantContext + app shell + gestión de usuarios

- **Proyecto**: Liga Infantil y Juvenil de Béisbol de Monterrey, A.C. (Liga MTY AC)
- **Fecha**: 2026-06-23
- **Plan**: #2 de la secuencia (ver roadmap en el plan de Foundation)
- **Fuente**: spec maestra `docs/superpowers/specs/2026-06-22-liga-mty-registro-jugadores-design.md` (§3, §6, §8, §10) + decisiones de brainstorming de este plan
- **Estado**: aprobado en brainstorming, pendiente de plan de implementación

> Convención: la prosa va en español; **todos los identificadores, nombres de tabla/columna, enums y código van en inglés**.

> Prerrequisito: el Plan 1 (Foundation) está completo y mergeado a `main` (esquema multi-tenant, RLS con doble candado tenant+rol vía `private.current_tenant_id()` / `private.is_admin()`, seed de Liga MTY AC, vista `players_with_category`). Este plan construye la primera capa de aplicación encima de esa base.

---

## 1. Objetivo y alcance

Construir la primera capa de aplicación real sobre la base de datos de Foundation: dejar la app **detrás de login**, resolver **tenant + rol** del usuario en un solo lugar, y montar el **esqueleto navegable** donde encajarán los planes 3–6. Incluye la **gestión de usuarios** (invitar + asignar rol) que la spec maestra (§6) pide, con el primer código **server-side** del proyecto.

### Dentro de alcance

- Autenticación email + contraseña (login / logout / sesión persistente) sobre Supabase Auth.
- `AuthContext` (sesión cruda) + `TenantContext` (tenant + rol del `profiles` del usuario logueado — spec maestra §10).
- App shell mobile-first: layout autenticado con navegación + guards de ruta.
- Pantalla **Usuarios** (solo admin): invitar por email, listar usuarios del tenant, cambiar rol.
- Edge Function `invite-user` (service_role, server-side, guard de admin).
- Pantalla de **aceptar invitación / fijar contraseña**.
- Runbook documentado para el **bootstrap del primer admin**.

### Fuera de alcance (planes posteriores)

- Players CRUD + formulario de registro + display de categoría → **Plan 3**.
- Documents + Storage (buckets privados, URLs firmadas) + candado de consentimiento → **Plan 4**.
- Payments + "quién debe" → **Plan 5**.
- Filtros + export a Excel → **Plan 6**.
- Recuperación de contraseña ("olvidé mi contraseña"), edición de perfil, desactivar/eliminar usuarios, SMTP propio → diferidos (ver §10).

En el shell, las áreas de planes futuros aparecen como **placeholders** ("Próximamente").

---

## 2. Decisiones de brainstorming (este plan)

| Tema | Decisión | Razón |
|---|---|---|
| Mecanismo de invitación | **Edge Function `invite-user`** (service_role server-side, guard de admin) que crea el `auth.user` y su `profiles` | `auth.admin.inviteUserByEmail` requiere service_role, que **jamás** puede ir al bundle del navegador; la función es el único lugar server-side que la spec maestra (§6, invitación en la app) permite materializar bien. |
| Cambio de rol de usuario existente | **anon client + RLS** (no la función) | La RLS de Foundation ya permite a un admin del tenant hacer `update profiles.role`; no necesita bypass de service_role. |
| Bootstrap del primer admin | **Runbook manual, una sola vez** (crear user en dashboard + snippet SQL que inserta el profile admin) | El primer admin no puede crearse por la función (esta exige que el llamador YA sea admin). Sin ningún code path que auto-otorgue admin → fail-closed. |
| Alcance del app shell | **Shell completo + nav + placeholders** | Deja routing + guards listos para que los Planes 3–6 solo rellenen pantallas, sin reconstruir el esqueleto. |
| Routing | **`react-router-dom` v7** | Estándar para SPA Vite + React; nueva dependencia. |
| "Olvidé mi contraseña" | **Fuera del Plan 2** | YAGNI para el v1 inicial; se añade después si se necesita. |

---

## 3. Arquitectura y estructura por features

Sigue la spec maestra §3 (frontend dividido por features con fronteras claras). Cada unidad tiene un propósito único y se comunica por interfaces explícitas.

```
src/
  lib/
    supabase.ts            (ya existe) cliente anon, env-driven
    category.ts            (ya existe) categoryLabel
  auth/
    AuthContext.tsx        provider de sesión Supabase (getSession + onAuthStateChange)
    useAuth.ts             hook de acceso a la sesión
    LoginPage.tsx          form email + password
    AcceptInvitePage.tsx   fija password tras invitación
    RequireAuth.tsx        guard de ruta: sin sesión -> /login
    RequireAdmin.tsx       guard de ruta: no-admin -> oculta/redirige
  tenant/
    TenantContext.tsx      carga profile del usuario -> { tenantId, role, fullName, status }
    useTenant.ts           hook de acceso a tenant + rol
  users/
    UsersPage.tsx          invitar + listar + cambiar rol (solo admin)
    inviteUser.ts          invoca la Edge Function invite-user
    authorize.ts           lógica de autorización PURA y testeable (admin-check)
  app/
    AppLayout.tsx          shell + nav mobile-first
    routes.tsx             definición de rutas (react-router)
    PlaceholderPage.tsx    "Próximamente" para Jugadores / Quién debe
  App.tsx                  monta AuthProvider > TenantProvider > RouterProvider
supabase/
  functions/
    invite-user/
      index.ts             Deno; orquesta I/O; usa service_role
      authorize.ts         (o reusa src/users/authorize.ts vía import compartido)
docs/
  plan2-bootstrap-admin.md runbook del primer admin (§7)
```

`authorize.ts` aísla la decisión de autorización ("¿este llamador es admin de este tenant?") para poder testearla como función pura, tanto en el front (gating de UI) como en la Edge Function (guard real). La función `index.ts` solo orquesta entrada/salida.

---

## 4. Auth + Sesión + TenantContext (flujo de datos)

### `AuthProvider` (sesión cruda)

- Al arranque llama `supabase.auth.getSession()` y se suscribe a `supabase.auth.onAuthStateChange`.
- Expone `{ session, loading }`. Mientras `loading`, la app muestra un splash neutro (evita parpadeo login↔app).
- Limpia la suscripción al desmontar.

### `TenantProvider` (perfil → tenant + rol)

- Depende de la sesión. Cuando hay `session`, hace `select` a `profiles where id = auth.uid()` y expone `{ tenantId, role, fullName, status }`.
- `status` ∈ `'loading' | 'ready' | 'no-profile' | 'error'`.
- **En el v1 esto *es* la resolución del tenant.** Mañana se reemplaza la fuente (resolución por subdominio / `hostname`) sin tocar a los consumidores (spec maestra §10).

### Caso borde: autenticado sin `profiles`

Un `auth.user` válido puede no tener fila en `profiles` (p.ej. antes del bootstrap, o una invitación a medio crear). En ese caso `TenantContext.status = 'no-profile'` y la app muestra una pantalla **"Tu cuenta aún no tiene acceso; contacta al administrador"** con botón **Salir**. Fail-closed: sin profile no se entra al shell.

### Por qué dos contextos y no uno

`AuthContext` (¿hay sesión?) y `TenantContext` (¿quién es y qué puede?) tienen ciclos de vida y responsabilidades distintos: la sesión la maneja Supabase Auth; el tenant/rol sale de una tabla de negocio. Separarlos mantiene cada unidad enfocada y testeable de forma aislada. (Decisión confirmada en brainstorming.)

---

## 5. Routing y app shell

- **Librería**: `react-router-dom` v7.
- **Rutas públicas**: `/login`, `/accept-invite`.
- **Rutas protegidas** (bajo `RequireAuth` + `AppLayout`):
  - `/` → Jugadores (`PlaceholderPage`, "Próximamente").
  - `/quien-debe` → `PlaceholderPage`.
  - `/usuarios` → `UsersPage`, envuelta además en `RequireAdmin`.
  - Acción **Salir** en el nav (cierra sesión y redirige a `/login`).
- **Nav mobile-first**: navegación simple (los ítems admin-only se ocultan para `readonly`).
- **Capas de defensa** (de UX a candado real): `RequireAdmin` oculta la UI → el guard redirige si se navega directo → la **RLS** y el **guard de la Edge Function** bloquean de verdad cualquier escritura. La UI nunca es la barrera de seguridad; solo la de experiencia.
- `App.tsx` deja de renderizar "Liga MTY AC" suelto y pasa a montar `AuthProvider > TenantProvider > RouterProvider`. El smoke test existente (`App.test.tsx`) se adapta a la nueva composición.

---

## 6. Usuarios + Edge Function `invite-user`

### Pantalla Usuarios (solo admin)

- **Invitar**: form `{ email, role }` → `inviteUser.ts` invoca la Edge Function `invite-user` (con el JWT de la sesión actual en el header `Authorization`).
- **Listar**: `select` a `profiles` del tenant (la RLS de Foundation ya permite a un admin ver los profiles de su tenant).
- **Cambiar rol**: `update profiles set role = ...` con el **anon client** directamente; la RLS de Foundation solo lo permite a un admin del mismo tenant.

### Edge Function `invite-user` (único uso de service_role)

Flujo:

1. Lee el JWT del header `Authorization` del llamador.
2. Con un client **service_role**, carga el `profiles` del llamador y verifica vía `authorize.ts` que `role = 'admin'`; obtiene su `tenant_id`. Si no es admin → `403`. Sin JWT válido → `401`.
3. `auth.admin.inviteUserByEmail(email, { redirectTo: <APP_URL>/accept-invite })` → crea el `auth.user` (estado *invited*) y dispara el email de invitación.
4. `insert` en `profiles` `{ id: nuevoUser.id, tenant_id: <del llamador>, role: <pedido>, full_name }`. (El `full_name` se captura en el form o se deja provisional y el invitado lo completa al aceptar; ver decisión en §11.)
5. Devuelve `{ ok: true }` o un error tipado (p.ej. email ya existe).

Detalles:

- El `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_URL` están disponibles en el entorno de la Edge Function automáticamente; **nunca** tocan el repo ni el bundle del cliente.
- La lógica de autorización (paso 2) vive en `authorize.ts` como función pura testeable; `index.ts` solo orquesta I/O (parseo de request, llamadas a Supabase, respuesta HTTP).
- Deploy vía `mcp__supabase__deploy_edge_function`.

### Aceptar invitación / fijar contraseña

`AcceptInvitePage.tsx` maneja el aterrizaje del link de invitación (token en el fragmento de URL → Supabase establece una sesión temporal). El usuario fija su contraseña con `supabase.auth.updateUser({ password })` y, si aplica, completa su `full_name`. Tras éxito, redirige al shell.

---

## 7. Bootstrap del primer admin (runbook, una vez)

Documento `docs/plan2-bootstrap-admin.md` con el procedimiento operativo único:

1. Crear el usuario en el dashboard de Supabase (Authentication → Add user; email + contraseña, o invitación manual).
2. Aplicar vía MCP `execute_sql` contra `main` un snippet que inserta su profile:
   ```sql
   insert into profiles (id, tenant_id, full_name, role)
   values ('<auth-user-id>', '00000000-0000-0000-0000-000000000001', '<Nombre>', 'admin');
   ```
   (tenant = Liga MTY AC, sembrado en Foundation `0004_seed_ligamtyac.sql`.)

No existe ningún code path en la app que auto-otorgue admin (fail-closed). A partir de ese admin, todo el resto se invita desde la pantalla Usuarios.

---

## 8. Seguridad

- `service_role` **solo** en el entorno de la Edge Function (server-side). Jamás en variables `VITE_*`, ni en el repo, ni en el bundle.
- El **guard de admin de la Edge Function es la única barrera** frente a su propio bypass de RLS (corre con service_role) → se **verifica en vivo**: llamar como admin → `201`/ok; como readonly → `403`; sin auth → `401`. (Mismo enfoque de verificación-en-vivo que validó la RLS en Foundation.)
- Redirect URL de invitación (`<APP_URL>/accept-invite`) añadido al **allowlist** de Supabase Auth (config operativa documentada).
- Prueba de **regresión RLS**: confirmar que `readonly` no puede `update profiles.role`.
- Checklist pre-merge de la spec maestra §7: ningún `.env*` con secretos en git (`git ls-files | grep -E '^\.env'` vacío), ninguna service key en env público, `get_advisors(security)` limpio tras cualquier DDL.

---

## 9. Estrategia de pruebas (TDD)

### Unit (Vitest + React Testing Library), con el client Supabase mockeado

- `authorize.ts`: admin → permite; readonly / sin perfil / anon → rechaza.
- `TenantContext`: mapea `profile → { tenantId, role }`; cubre el caso `no-profile`.
- `RequireAuth` / `RequireAdmin`: redirecciones correctas (sin sesión → `/login`; no-admin fuera de `/usuarios`).
- `UsersPage`: admin ve el form de invitar; `readonly` no; cambiar rol dispara el `update`.
- `LoginPage`: validación de campos requeridos.
- `inviteUser.ts`: arma bien la llamada a la función (payload + header de auth).

### Verificación en vivo (sobre `main` vía MCP / función desplegada), documentada como evidencia

- `invite-user` desplegada: admin → ok; readonly → `403`; sin auth → `401`.
- Regresión RLS: `readonly` no puede escribir `profiles`.

### Gate de cierre

`vitest` verde, `tsc --noEmit` limpio, `pnpm build` ok, `get_advisors(security)` limpio, sin secretos en git.

---

## 10. Dependencias nuevas y configuración operativa

- **Dependencia**: `react-router-dom` (^7).
- **Operativo (documentado, no código)**:
  - Redirect URL en el allowlist de Supabase Auth.
  - Email integrado de Supabase para invitaciones en el v1 (rate-limited; SMTP propio se **difiere** a cuando haya volumen real).
  - `VITE_APP_URL` (o equivalente) para construir el `redirectTo` de la invitación, si no se infiere de `window.location.origin`.

---

## 11. Decisiones menores a fijar en el plan de implementación

- **`full_name` en la invitación**: capturarlo en el form de invitar (admin lo escribe) **vs.** dejarlo provisional y que el invitado lo complete al aceptar. Recomendación: capturarlo en el form (un dato menos que pedir al invitado); ajustable en el plan.
- **Forma del nav mobile-first** (barra inferior vs. menú): detalle visual, se concreta en implementación (eventual `frontend-design`).
- **Reutilización de `authorize.ts`** entre `src/` (Vite/TS) y la Edge Function (Deno): si el import cruzado complica el build, se duplica la función pura mínima en `supabase/functions/invite-user/` y se testea por separado. Se decide en el plan.

---

## 12. Cobertura de la spec maestra

- Auth con invitación, sin registro público, rol en `profiles` (spec maestra §6) → §4, §6, §7. ✅
- Pantalla Usuarios solo-admin (spec maestra §6, §8) → §6. ✅
- `TenantContext` que resuelve el tenant en un solo lugar (spec maestra §3, §10) → §4. ✅
- App detrás de login; sin sesión no se ve nada (spec maestra §3) → §4, §5. ✅
- Controles de edición no renderizados para `readonly`, RLS como candado real (spec maestra §8) → §5, §8. ✅
- Pantallas de planes futuros → placeholders, fuera de alcance (spec maestra §8, §12) → §1, §5.
