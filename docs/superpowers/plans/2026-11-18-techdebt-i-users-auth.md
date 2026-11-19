# Lote I — Usuarios, navegación, tests de auth e `invite-user` (#13, #15, #39, #41, #42) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Cinco follow-ups en un lote: los tests de `src/auth/*` comparten `deferred()` y la captura del listener de auth (#39); el rol en Usuarios pasa a `Select` de MUI y la navegación queda dentro del tema Dracula, sin rediseño (#15); Usuarios deja de tragarse errores, quita el prefijo `Error:` y su severidad deja de depender del texto (#13); un test fija que `isOriginAllowed` no normaliza el `Origin` entrante (#41); y `invite-user` responde un 500 JSON **con** headers CORS ante cualquier excepción inesperada (#42).

**Architecture:**
- **#39:** dos helpers de test nuevos en `src/test/` (`deferred.ts` y `authListener.ts`, con sus tests); solo los tests de `src/auth/*` los adoptan (spec §4).
- **#15:** `UsersPage` usa `Select` de MUI (con `MenuItem`) para el rol de cada usuario y `TextField select` no nativo para el rol de la invitación; la lista muestra solo el nombre (el rol ya se ve en el select). `AppLayout` agrupa los links de sección en un `<nav aria-label="Principal">` y marca la sección actual con `aria-current="page"`, un subrayado de 2 px en `primary.main` y `fontWeight: 700`; el texto conserva el color `inherit` del `AppBar` (el morado como color de texto sobre el `AppBar` oscuro queda en ~2.9:1, bajo AA). "Jugadores" es la sección actual en `/` y en `/jugadores/*`. Mismos componentes (MUI `Button` + `NavLink`/`Link`), sin cambio de estructura.
- **#13:** `UsersPage` guarda el aviso como `{ severity, text }`; los errores van en `role="alert"` y los éxitos en `role="status"`; `fetchUsers` lanza si Supabase devuelve error y la lista muestra `LoadError` con Reintentar (el patrón del resto de la app); un cambio de rol fallido muestra un aviso en vez de fallar en silencio.
- **#41/#42:** `http.ts` gana `jsonResponse` y `withInternalErrorResponse` (puros, probados con Vitest como el resto del módulo); `index.ts` envuelve todo el handler en `withInternalErrorResponse`. El orquestador redespliega y prueba con curl después del merge.

**Tech Stack:** React 19.2, MUI 9, react-router-dom 7, Vitest 4.1.9 + Testing Library + user-event 14, TypeScript 6 (`tsc -b`, incluye `tsconfig.functions.json`), ESLint 10, pnpm; Supabase Edge Functions (Deno) desplegadas con el CLI del repo (`supabase` 2.107, `--use-api`).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§2 decisión del owner sobre #15, §3 decisión sobre #42, §4 lote I y regla de #39, §5 Edge Function y UI).

## Global Constraints

- Rama `fix/users-auth-polish`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/users-auth-polish` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR, merge, deploy de funciones, `supabase secrets` ni ningún comando remoto de `supabase`; nunca usa el Supabase MCP. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Archivos permitidos** (solo estos): `src/test/deferred.ts`, `src/test/deferred.test.ts`, `src/test/authListener.ts`, `src/test/authListener.test.ts` (nuevos); `src/auth/AuthContext.test.tsx`, `src/auth/AuthCallbackPage.test.tsx`, `src/auth/LoginPage.test.tsx`; `src/users/UsersPage.tsx`, `src/users/UsersPage.test.tsx`; `src/app/AppLayout.tsx`, `src/app/AppLayout.test.tsx`; `supabase/functions/invite-user/http.ts`, `supabase/functions/invite-user/http.test.ts`, `supabase/functions/invite-user/index.ts`; y este plan. **No** migres los `deferred` locales de `src/players/*` ni `src/teams/*` (spec §4, §6). **No** toques código de producción de `src/auth/*`.
- **Runner de la Edge Function:** el repo **no** usa `deno test`. Los módulos puros de `supabase/functions/invite-user/` (`authorize.ts`, `http.ts`, `rollback.ts`) se prueban con Vitest (los recoge `pnpm exec vitest run`) y se typechequean con `tsconfig.functions.json` (referenciado por `tsc -b`). `index.ts` está excluido de ese tsconfig a propósito (importa `jsr:`/`npm:` y usa `Deno`): solo lo validan ESLint, el typecheck fuera del repo del Step 5.4 y las pruebas en vivo del orquestador. No hay `deno` instalado en la máquina.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `24c14a4`: **45 archivos, 449 tests**. Este lote agrega **+2 archivos y +20 tests** (47 / 469 sobre la referencia).

## Review Focus

- **`invite-user` nunca más responde un 500 sin CORS:** cualquier `throw` dentro del handler (red, `getUser`, `inviteUserByEmail`, insert de perfil, un body JSON `null`) sale como `500 {"error":"internal_error"}` con los headers CORS calculados para ese `Origin` — fijado por los tests de `withInternalErrorResponse` y comprobado en vivo por el orquestador (curl con body `null`).
- **El orden de los chequeos de `index.ts` no cambia** (OPTIONS → método → origen → cliente de servicio → `Authorization` → bearer → `getUser` → perfil → body), ni ningún código de error existente. El diff de `index.ts` sin espacios (`git diff -w`) solo muestra el import, `json` vía `jsonResponse`, y el envoltorio.
- **El `Origin` entrante se compara exacto** (sin `toLowerCase`, sin quitar `/`): fijado en Task 4, con mutación.
- **Usuarios ya no falla en silencio:** lectura fallida → `LoadError` + Reintentar; recarga fallida después de invitar → el aviso de éxito se queda y aparece Reintentar; cambio de rol fallido → aviso y el select sigue mostrando el rol anterior.
- **Severidad explícita:** el color y el `role` del aviso salen de `notice.severity`, nunca del texto.
- **Sin rediseño (#15) y con contraste AA:** mismo `AppBar`/`Toolbar`/`Button`; solo el agrupado en `<nav>` y la marca de la sección activa (subrayado `primary.main` + negrita, texto en `inherit`, nunca morado como color de texto). El orquestador mide el contraste y compara 390 px contra una captura "antes" (O5).

---

## Task 0: Preparar y medir el baseline

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `fix/users-auth-polish`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [ ] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 45 y 449, todo verde).

---

## Task 1: Helpers de test compartidos para auth (#39)

**Files:**
- Create: `src/test/deferred.ts`, `src/test/deferred.test.ts`
- Create: `src/test/authListener.ts`, `src/test/authListener.test.ts`
- Modify: `src/auth/AuthContext.test.tsx` (l.21–29 `deferred` local; l.65–69 y l.85–89 captura del listener)
- Modify: `src/auth/AuthCallbackPage.test.tsx` (l.45–49 y l.78–82 captura del listener)
- Modify: `src/auth/LoginPage.test.tsx` (l.17–23 `deferred` local)

- [ ] **Step 1.1: Escribir los tests de los helpers (rojo)**

Crea `src/test/deferred.test.ts`:

```ts
import { expect } from 'vitest'
import { deferred } from './deferred'

test('deferred resolves its promise from outside', async () => {
  const pending = deferred<number>()
  pending.resolve(7)
  await expect(pending.promise).resolves.toBe(7)
})

test('deferred rejects its promise from outside', async () => {
  const pending = deferred<number>()
  pending.reject(new Error('boom'))
  await expect(pending.promise).rejects.toThrow('boom')
})
```

Crea `src/test/authListener.test.ts`:

```ts
import { expect, vi } from 'vitest'
import { captureAuthListener } from './authListener'

test('captureAuthListener hands back an emit that calls the registered listener', () => {
  const onAuthStateChange = vi.fn()
  const emit = captureAuthListener(onAuthStateChange)
  const listener = vi.fn()
  const result = onAuthStateChange(listener)
  expect(result).toEqual({ data: { subscription: { unsubscribe: expect.any(Function) } } })
  emit('SIGNED_IN', { user: { id: 'u1' } })
  expect(listener).toHaveBeenCalledWith('SIGNED_IN', { user: { id: 'u1' } })
})

test('emit before any listener registered throws', () => {
  const emit = captureAuthListener(vi.fn())
  expect(() => emit('SIGNED_IN', null)).toThrow('no auth listener registered')
})
```

Run: `pnpm exec vitest run src/test`
Expected: FAIL en los 2 archivos: `Failed to resolve import "./deferred"` y `Failed to resolve import "./authListener"`; `Tests  no tests`.

- [ ] **Step 1.2: Implementar los helpers**

Crea `src/test/deferred.ts`:

```ts
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
```

Crea `src/test/authListener.ts`:

```ts
import { vi } from 'vitest'
import type { Mock } from 'vitest'

export type AuthListener = (event: string, session: unknown) => void

export function captureAuthListener(onAuthStateChange: Mock): AuthListener {
  let listener: AuthListener | undefined
  onAuthStateChange.mockImplementation((cb: AuthListener) => {
    listener = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  return (event, session) => {
    if (!listener) throw new Error('no auth listener registered')
    listener(event, session)
  }
}
```

Run: `pnpm exec vitest run src/test`
Expected: 2 archivos, 4 tests PASS.

- [ ] **Step 1.3: Migrar los tests de `src/auth/*`**

`src/auth/AuthContext.test.tsx`:
1. Debajo de `import { useAuth } from './AuthContext'` agrega:

```ts
import { captureAuthListener } from '../test/authListener'
import { deferred } from '../test/deferred'
```

2. Borra la función local `function deferred<T>() { … }` completa (l.21–29) y la línea en blanco que la sigue.
3. En los dos tests que la usan (`an auth event wins over a getSession result that arrives later` y `a getSession rejection after an auth event keeps the signed-in user`), reemplaza el bloque:

```ts
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
```

por:

```ts
  const emit = captureAuthListener(mocks.onAuthStateChange)
```

y cambia `captured!('SIGNED_IN', { user: { id: 'u2' } })` por `emit('SIGNED_IN', { user: { id: 'u2' } })`.

`src/auth/AuthCallbackPage.test.tsx`:
1. Debajo de `import { AuthCallbackPage } from './AuthCallbackPage'` agrega `import { captureAuthListener } from '../test/authListener'`.
2. En `navigates home when a session appears via SIGNED_IN` y en `keeps waiting for SIGNED_IN when getSession rejects but the link carries a token`, el mismo reemplazo del bloque `let captured … })` por `const emit = captureAuthListener(mocks.onAuthStateChange)` y `captured!('SIGNED_IN', { user: { id: 'u1' } })` → `emit('SIGNED_IN', { user: { id: 'u1' } })`.

`src/auth/LoginPage.test.tsx`:
1. Debajo de `import { LoginPage } from './LoginPage'` agrega `import { deferred } from '../test/deferred'`.
2. Borra la función local `function deferred<T>() { … }` completa (l.17–23) y la línea en blanco que la sigue. Sus dos usos (`deferred<{ data: object; error: null }>()`) no cambian.

Comprobación: `grep -rn "captured\|function deferred" src/auth` → sin salida.

Run: `pnpm exec vitest run src/auth src/test`
Expected: 7 archivos, 31 tests PASS (los 27 de `src/auth` siguen igual + 4 de los helpers).

Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint src/auth src/test` → exit 0.

- [ ] **Step 1.4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-i-users-auth.md src/test/deferred.ts src/test/deferred.test.ts src/test/authListener.ts src/test/authListener.test.ts src/auth/AuthContext.test.tsx src/auth/AuthCallbackPage.test.tsx src/auth/LoginPage.test.tsx
```

```bash
git -C $WT commit -m "test: share deferred() and the auth listener capture across auth tests (#39)" -m "deferred was duplicated with two shapes and the onAuthStateChange capture repeated four times. Players and teams tests keep their local helpers for now so this sweep does not collide with their branches." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Rol con `Select` de MUI y navegación con el tema (#15)

**Files:**
- Modify: `src/app/AppLayout.test.tsx` (imports, `renderLayout`, 4 tests nuevos: 2 + un `test.each` de 2 casos)
- Modify: `src/app/AppLayout.tsx` (imports l.1 y l.9; constante nueva; `useLocation` en el componente; links l.48–53)
- Modify: `src/users/UsersPage.test.tsx` (`lists the tenant users`, `changes a user role through an update`, 1 test nuevo)
- Modify: `src/users/UsersPage.tsx` (imports, constantes, select de invitación l.97–107, select por usuario l.124–137, `ListItemText` l.140)

Decisión del owner (spec §2): ajuste con el tema actual, sin rediseño. Qué cambia y qué no:
- Navegación: sigue siendo `AppBar` + `Toolbar` + `Button component={NavLink}`. Los cuatro links de sección pasan a estar dentro de `<Box component="nav" aria-label="Principal">`; "Salir" queda fuera (es una acción, no una sección). La sección actual lleva la clase `active` y `aria-current="page"` (los pone `NavLink`; para Jugadores se calculan a mano) y se marca con un subrayado de 2 px en `primary.main` (morado Dracula `#BD93F9`) y `fontWeight: 700`. El texto **no** cambia de color: sigue en `inherit` (texto claro del `AppBar`), porque `#BD93F9` como texto sobre el `AppBar` oscuro da ~2.9:1, bajo el 4.5:1 de AA. "Jugadores" es la sección actual en `/` **y** en `/jugadores/*` (fichas y alta de jugador), algo que `NavLink to="/"` no hace: por eso ese botón usa `Link` con `className`/`aria-current` calculados desde `useLocation()`. Nada más.
- Usuarios: el rol de cada usuario pasa de `TextField select` nativo a `Select` de MUI con `MenuItem`; el de la invitación, a `TextField select` no nativo (que es `Select` de MUI con su etiqueta). La lista muestra solo el nombre: hoy dice `Ana — admin` (el valor crudo) y el rol ya se ve en el select.

- [ ] **Step 2.1: Tests de navegación (rojo)**

En `src/app/AppLayout.test.tsx`:

1. Cambia `import { render, screen } from '@testing-library/react'` por `import { render, screen, within } from '@testing-library/react'`.
2. Debajo de `import { createMemoryRouter, RouterProvider } from 'react-router-dom'` agrega `import { ThemeProvider } from '@mui/material/styles'`, y debajo de `import { AppLayout } from './AppLayout'` agrega `import { draculaTheme } from '../theme/dracula'`.
3. Reemplaza `renderLayout` completo por:

```tsx
function renderLayout(entry = '/') {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <p>contenido</p> },
          { path: 'jugadores/:id', element: <p>ficha</p> },
          { path: 'equipos', element: <p>equipos</p> },
        ],
      },
      { path: '/login', element: <h1>Login</h1> },
    ],
    { initialEntries: [entry] },
  )
  return render(
    <ThemeProvider theme={draculaTheme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}
```

4. Agrega al final (jsdom devuelve el color del `box-shadow` en minúsculas, de ahí el `toLowerCase()`; el test no mira el color del texto a propósito):

```tsx
const ACTIVE_UNDERLINE = `inset 0 -2px 0 ${draculaTheme.palette.primary.main.toLowerCase()}`

test('the section links live in the Principal navigation landmark, without Salir', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  renderLayout()
  const nav = screen.getByRole('navigation', { name: 'Principal' })
  expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
    'Jugadores',
    'Equipos',
    'Quién debe',
    'Usuarios',
  ])
  expect(within(nav).queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument()
})

test('the current section is marked with aria-current, a primary underline and bold text', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout('/equipos')
  const current = screen.getByRole('link', { name: 'Equipos' })
  expect(current).toHaveAttribute('aria-current', 'page')
  expect(current).toHaveStyle({ boxShadow: ACTIVE_UNDERLINE, fontWeight: '700' })
  const other = screen.getByRole('link', { name: 'Jugadores' })
  expect(other).not.toHaveAttribute('aria-current')
  expect(other).not.toHaveStyle({ boxShadow: ACTIVE_UNDERLINE })
})

test.each(['/', '/jugadores/p1'])('Jugadores is the current section on %s', (entry) => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout(entry)
  const players = screen.getByRole('link', { name: 'Jugadores' })
  expect(players).toHaveAttribute('aria-current', 'page')
  expect(players).toHaveStyle({ boxShadow: ACTIVE_UNDERLINE, fontWeight: '700' })
  expect(screen.getByRole('link', { name: 'Equipos' })).not.toHaveAttribute('aria-current')
})
```

Run: `pnpm exec vitest run src/app/AppLayout.test.tsx`
Expected: FAIL en los 4 tests nuevos: `the section links live…` (`Unable to find an accessible element with the role "navigation" and name "Principal"`), `the current section is marked…` y `Jugadores is the current section on /` (`toHaveStyle`: falta `boxShadow: inset 0 -2px 0 #bd93f9; fontWeight: 700`), y `Jugadores is the current section on /jugadores/p1` (`toHaveAttribute("aria-current", "page")`: sin atributo); los 6 existentes pasan con el `ThemeProvider`.

- [ ] **Step 2.2: Implementar la navegación**

En `src/app/AppLayout.tsx`:

1. Cambia `import { NavLink, Outlet, useNavigate } from 'react-router-dom'` por `import { NavLink, Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'`, y debajo de `import Alert from '@mui/material/Alert'` agrega `import type { Theme } from '@mui/material/styles'`.

2. Justo antes de `export function AppLayout() {` agrega:

```tsx
const NAV_LINK_SX = {
  '&.active': {
    fontWeight: 700,
    boxShadow: (theme: Theme) => `inset 0 -2px 0 ${theme.palette.primary.main}`,
  },
} as const

```

3. Al inicio de `AppLayout`, reemplaza:

```tsx
  const navigate = useNavigate()
  const { status, role, fullName } = useTenant()
```

por (los hooks van antes de los `return` tempranos):

```tsx
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { status, role, fullName } = useTenant()
  const playersActive = pathname === '/' || pathname.startsWith('/jugadores/')
```

4. Reemplaza:

```tsx
          <Button color="inherit" component={NavLink} to="/">Jugadores</Button>
          <Button color="inherit" component={NavLink} to="/equipos">Equipos</Button>
          <Button color="inherit" component={NavLink} to="/quien-debe">Quién debe</Button>
          {isAdmin(role) && (
            <Button color="inherit" component={NavLink} to="/usuarios">Usuarios</Button>
          )}
```

por:

```tsx
          <Box component="nav" aria-label="Principal" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {/* Jugadores also covers the player pages under /jugadores/, which NavLink to="/" never matches */}
            <Button
              color="inherit"
              component={RouterLink}
              to="/"
              className={playersActive ? 'active' : undefined}
              aria-current={playersActive ? 'page' : undefined}
              sx={NAV_LINK_SX}
            >
              Jugadores
            </Button>
            <Button color="inherit" component={NavLink} to="/equipos" sx={NAV_LINK_SX}>Equipos</Button>
            <Button color="inherit" component={NavLink} to="/quien-debe" sx={NAV_LINK_SX}>Quién debe</Button>
            {isAdmin(role) && (
              <Button color="inherit" component={NavLink} to="/usuarios" sx={NAV_LINK_SX}>Usuarios</Button>
            )}
          </Box>
```

La línea de "Salir" y el comentario existente del `Toolbar` no cambian.

Comprobación: `grep -n "color: 'primary" src/app/AppLayout.tsx` → sin salida (el texto activo no se pinta de morado).

Run: `pnpm exec vitest run src/app/AppLayout.test.tsx`
Expected: 10 tests PASS.

- [ ] **Step 2.3: Tests del rol con MUI (rojo)**

En `src/users/UsersPage.test.tsx`:

1. Cambia `import { beforeEach, vi } from 'vitest'` por `import { beforeEach, expect, vi } from 'vitest'`.
2. En `lists the tenant users`, cambia `expect(await screen.findByText(/Ana/)).toBeInTheDocument()` por `expect(await screen.findByText('Ana')).toBeInTheDocument()`.
3. Reemplaza el test `changes a user role through an update` completo por estos dos:

```tsx
test('the invitation role is an MUI select, not a native one', async () => {
  const user = userEvent.setup()
  const { container } = render(<UsersPage />)
  await screen.findByText(/Ana/)
  expect(container.querySelector('select')).toBeNull()
  await user.click(screen.getByRole('combobox', { name: 'Rol de la invitación' }))
  await user.click(await screen.findByRole('option', { name: 'Administrador' }))
  await user.type(screen.getByPlaceholderText('Correo'), 'jefe@b.com')
  await user.type(screen.getByPlaceholderText('Nombre completo'), 'Jefe')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(mocks.inviteUser).toHaveBeenCalledWith({ email: 'jefe@b.com', fullName: 'Jefe', role: 'admin' })
})

test('changes a user role through the MUI select', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  const role = await screen.findByRole('combobox', { name: 'Rol de Ana' })
  expect(role).toHaveTextContent('Administrador')
  await user.click(role)
  await user.click(await screen.findByRole('option', { name: 'Solo lectura' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ role: 'readonly' }))
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
})
```

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: FAIL en 3 tests (mensajes verificados por el planner):
- `lists the tenant users`: `Unable to find an element with the text: Ana` (hoy la fila dice `Ana — admin`).
- `the invitation role is an MUI select, not a native one`: `expected <select …(3)>…(2)</select> to be null`.
- `changes a user role through the MUI select`: `Found multiple elements with the role "option" and name "Solo lectura"` (los `<option>` nativos de los dos selects).

2 pasan.

- [ ] **Step 2.4: Implementar los selects de MUI**

En `src/users/UsersPage.tsx`:

1. Debajo de `import ListItemText from '@mui/material/ListItemText'` agrega:

```tsx
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
```

2. Justo antes de `const INVITE_ERROR_MESSAGES` agrega:

```tsx
const ROLE_LABELS: Record<Role, string> = {
  readonly: 'Solo lectura',
  admin: 'Administrador',
}

const ROLES: Role[] = ['readonly', 'admin']

```

3. En el `TextField select` de la invitación, reemplaza:

```tsx
          onChange={(e) => setRole(e.target.value as Role)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        >
          <option value="readonly">Solo lectura</option>
          <option value="admin">Administrador</option>
        </TextField>
```

por:

```tsx
          onChange={(e) => setRole(e.target.value as Role)}
          sx={{ minWidth: 160 }}
        >
          {ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </MenuItem>
          ))}
        </TextField>
```

4. En `secondaryAction`, reemplaza el `<TextField select size="small" …>…</TextField>` completo (desde `<TextField` hasta `</TextField>`) por:

```tsx
              <Select
                size="small"
                value={u.role}
                onChange={(e) => void changeRole(u.id, e.target.value as Role)}
                inputProps={{ 'aria-label': `Rol de ${u.full_name}` }}
                sx={{ minWidth: 150 }}
              >
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </MenuItem>
                ))}
              </Select>
```

(En MUI 9 el `combobox` de `Select` toma `aria-label` de `inputProps` y `aria-labelledby` solo de `labelId`, que aquí no hay; el planner verificó que su nombre accesible queda `Rol de Ana`.)

5. Cambia `<ListItemText primary={`${u.full_name} — ${u.role}`} />` por `<ListItemText primary={u.full_name} />`.

Comprobación: `grep -n "native\|<option" src/users/UsersPage.tsx` → sin salida.

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: 5 tests PASS.

Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint src/app src/users` → exit 0.

- [ ] **Step 2.5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-i-users-auth.md src/app/AppLayout.tsx src/app/AppLayout.test.tsx src/users/UsersPage.tsx src/users/UsersPage.test.tsx
```

```bash
git -C $WT commit -m "fix: theme the users role selectors and the main navigation (#15)" -m "Per the owner's decision, no redesign: both role controls become MUI selects, the user list stops echoing the raw role, and the section links sit in a Principal nav landmark. The current section, Jugadores included on player pages, gets aria-current plus a primary underline and bold text; the text keeps the AppBar color for contrast." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 3: Errores y avisos de Usuarios (#13)

**Files:**
- Modify (reemplazo completo): `src/users/UsersPage.test.tsx`
- Modify (reemplazo completo): `src/users/UsersPage.tsx`

Los tres puntos del issue: (1) sin prefijo `Error:`; (2) severidad explícita, no derivada del texto; (3) `loadUsers` (hoy `fetchUsers`) se traga el error de la consulta. Además `changeRole` ignora el error del `update` (mismo problema, misma pantalla): también se atiende aquí (ver Discrepancias). Un código de error desconocido de `invite-user` (p. ej. `internal_error`, que agrega Task 5) se muestra como `No se pudo enviar la invitación (internal_error).` para no perder el diagnóstico, pero **solo si parece un código** (`/^[a-z_]+$/`): `inviteUser` también puede devolver el `message` en texto libre de supabase-js (p. ej. `Edge Function returned a non-2xx status code`), y ese no se muestra; queda solo el mensaje en español.

- [ ] **Step 3.1: Reescribir los tests (rojo)**

Reemplaza **todo** el contenido de `src/users/UsersPage.test.tsx` por:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { UsersPage } from './UsersPage'

const mocks = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}))
vi.mock('./inviteUser', () => ({ inviteUser: mocks.inviteUser }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inviteUser.mockResolvedValue({ ok: true })
  mocks.select.mockResolvedValue({
    data: [{ id: 'u1', full_name: 'Ana', role: 'admin' }],
    error: null,
  })
  mocks.eq.mockResolvedValue({ data: null, error: null })
  mocks.update.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
})

async function fillInvite(user: ReturnType<typeof userEvent.setup>, email: string, fullName: string) {
  await user.type(screen.getByPlaceholderText('Correo'), email)
  await user.type(screen.getByPlaceholderText('Nombre completo'), fullName)
}

test('lists the tenant users', async () => {
  render(<UsersPage />)
  expect(await screen.findByText('Ana')).toBeInTheDocument()
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.select).toHaveBeenCalledWith('id, full_name, role')
})

test('invites a user through the inviteUser client', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'nuevo@b.com', 'Nuevo')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(mocks.inviteUser).toHaveBeenCalledWith({
    email: 'nuevo@b.com',
    fullName: 'Nuevo',
    role: 'readonly',
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Usuario creado, se le envió un enlace de acceso')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a known invite error shows its friendly message as an alert, without an Error: prefix', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false, error: 'email_exists' })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'dup@b.com', 'Dup')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^Ese correo ya está registrado$/)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('an unknown invite error shows a generic alert that keeps the code', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false, error: 'internal_error' })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'x@b.com', 'X')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo enviar la invitación \(internal_error\)\.$/)
})

test('an invite error without a code shows the generic alert alone', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'x@b.com', 'X')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo enviar la invitación\.$/)
})

test('an invite error that is not a code shows the generic alert without the text', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false, error: 'Edge Function returned a non-2xx status code' })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'x@b.com', 'X')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo enviar la invitación\.$/)
})

test('the invitation role is an MUI select, not a native one', async () => {
  const user = userEvent.setup()
  const { container } = render(<UsersPage />)
  await screen.findByText(/Ana/)
  expect(container.querySelector('select')).toBeNull()
  await user.click(screen.getByRole('combobox', { name: 'Rol de la invitación' }))
  await user.click(await screen.findByRole('option', { name: 'Administrador' }))
  await fillInvite(user, 'jefe@b.com', 'Jefe')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(mocks.inviteUser).toHaveBeenCalledWith({ email: 'jefe@b.com', fullName: 'Jefe', role: 'admin' })
})

test('changes a user role through the MUI select', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  const role = await screen.findByRole('combobox', { name: 'Rol de Ana' })
  expect(role).toHaveTextContent('Administrador')
  await user.click(role)
  await user.click(await screen.findByRole('option', { name: 'Solo lectura' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ role: 'readonly' }))
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
})

test('a failed role change shows an alert and keeps the previous role', async () => {
  mocks.eq.mockResolvedValue({ data: null, error: { message: 'RLS denied' } })
  const user = userEvent.setup()
  render(<UsersPage />)
  await user.click(await screen.findByRole('combobox', { name: 'Rol de Ana' }))
  await user.click(await screen.findByRole('option', { name: 'Solo lectura' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo cambiar el rol\.$/)
  expect(screen.getByRole('combobox', { name: 'Rol de Ana' })).toHaveTextContent('Administrador')
})

test('a failed list load shows LoadError and Reintentar reloads', async () => {
  mocks.select.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  const user = userEvent.setup()
  render(<UsersPage />)
  expect(await screen.findByText('No se pudieron cargar los usuarios.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText(/Ana/)).toBeInTheDocument()
  expect(screen.queryByText('No se pudieron cargar los usuarios.')).not.toBeInTheDocument()
  expect(mocks.select).toHaveBeenCalledTimes(2)
})

test('a failed reload after inviting keeps the success message and offers Reintentar', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  mocks.select.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  await fillInvite(user, 'nuevo@b.com', 'Nuevo')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByText('No se pudieron cargar los usuarios.')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Usuario creado, se le envió un enlace de acceso')
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: FAIL en 7 tests: `a known invite error …`, `an unknown invite error …`, `an invite error without a code …`, `an invite error that is not a code …`, `a failed role change …`, `a failed list load …`, `a failed reload after inviting …`; los 4 restantes pasan.

- [ ] **Step 3.2: Implementar**

Reemplaza **todo** el contenido de `src/users/UsersPage.tsx` por:

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import { LoadError } from '../app/LoadError'
import { supabase } from '../lib/supabase'
import { inviteUser } from './inviteUser'

type Role = 'admin' | 'readonly'

interface ProfileRow {
  id: string
  full_name: string
  role: Role
}

interface Notice {
  severity: 'success' | 'error'
  text: string
}

const ROLE_LABELS: Record<Role, string> = {
  readonly: 'Solo lectura',
  admin: 'Administrador',
}

const ROLES: Role[] = ['readonly', 'admin']

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  email_exists: 'Ese correo ya está registrado',
  invalid_role: 'Rol inválido',
  forbidden: 'No tienes permiso para invitar usuarios',
}

function inviteErrorText(code: string | undefined): string {
  if (code && INVITE_ERROR_MESSAGES[code]) return INVITE_ERROR_MESSAGES[code]
  // only machine codes are shown; free-text errors (e.g. supabase-js messages) stay out of the UI
  return code && /^[a-z_]+$/.test(code) ? `No se pudo enviar la invitación (${code}).` : 'No se pudo enviar la invitación.'
}

async function fetchUsers(): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role')
  if (error) throw new Error(error.message)
  return (data as ProfileRow[] | null) ?? []
}

export function UsersPage() {
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('readonly')
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let active = true
    void fetchUsers()
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setUsers(rows)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function handleRetry() {
    setLoadError(false)
    reload()
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    const result = await inviteUser({ email, fullName, role })
    if (!result.ok) {
      setNotice({ severity: 'error', text: inviteErrorText(result.error) })
      return
    }
    setNotice({ severity: 'success', text: 'Usuario creado, se le envió un enlace de acceso' })
    setEmail('')
    setFullName('')
    reload()
  }

  async function changeRole(id: string, newRole: Role) {
    setNotice(null)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    if (error) {
      setNotice({ severity: 'error', text: 'No se pudo cambiar el rol.' })
      return
    }
    reload()
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>Usuarios</Typography>
      <Stack
        component="form"
        onSubmit={handleInvite}
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center' }}
      >
        <TextField
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          type="text"
          placeholder="Nombre completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <TextField
          select
          label="Rol de la invitación"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          sx={{ minWidth: 160 }}
        >
          {ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained">Invitar</Button>
      </Stack>
      {notice && (
        <Alert role={notice.severity === 'error' ? 'alert' : 'status'} severity={notice.severity} sx={{ mt: 2 }}>
          {notice.text}
        </Alert>
      )}
      {loadError ? (
        <LoadError message="No se pudieron cargar los usuarios." onRetry={handleRetry} />
      ) : (
        <List sx={{ mt: 2 }}>
          {users.map((u) => (
            <ListItem
              key={u.id}
              secondaryAction={
                <Select
                  size="small"
                  value={u.role}
                  onChange={(e) => void changeRole(u.id, e.target.value as Role)}
                  inputProps={{ 'aria-label': `Rol de ${u.full_name}` }}
                  sx={{ minWidth: 150 }}
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </MenuItem>
                  ))}
                </Select>
              }
            >
              <ListItemText primary={u.full_name} />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}
```

Notas: `fetchUsers` sale del componente (ya no necesita `useCallback`); después de invitar o de cambiar el rol se recarga por `reloadKey`, así que una recarga fallida cae en el mismo `LoadError` sin borrar el aviso de éxito. Un `update` sin error que no toca filas (RLS) sigue viéndose como éxito: fuera del alcance de #13.

Comprobación: `grep -n "Error:\|startsWith" src/users/UsersPage.tsx` → sin salida.

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: 11 tests PASS.

Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint src/users` → exit 0.

- [ ] **Step 3.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-i-users-auth.md src/users/UsersPage.tsx src/users/UsersPage.test.tsx
```

```bash
git -C $WT commit -m "fix: surface Usuarios load and role-change errors and decouple alert severity from text (#13)" -m "The profiles read and the role update swallowed their errors, messages carried a raw Error: prefix, and the alert color was derived from that prefix. The notice now carries its severity, failed reads show LoadError with Reintentar and a failed role change says so." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: `isOriginAllowed` no normaliza el `Origin` entrante (#41)

**Files:**
- Modify: `supabase/functions/invite-user/http.test.ts` (test nuevo después de `isOriginAllowed lets a missing Origin through and matches present ones exactly`)

Test de caracterización (el código ya compara exacto, `http.ts:20`); el rojo se demuestra con la mutación que cita el issue.

- [ ] **Step 4.1: Escribir el test**

En `supabase/functions/invite-user/http.test.ts`, justo después del test `isOriginAllowed lets a missing Origin through and matches present ones exactly`, agrega:

```ts
test('isOriginAllowed does not normalize the incoming Origin', () => {
  expect(isOriginAllowed('HTTPS://APP.EXAMPLE.COM', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com/', ALLOWED)).toBe(false)
  expect(corsHeaders('HTTPS://APP.EXAMPLE.COM', ALLOWED)).not.toHaveProperty('Access-Control-Allow-Origin')
})
```

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: 3 archivos, 10 tests PASS.

- [ ] **Step 4.2: Mutación (rojo demostrado)**

En `supabase/functions/invite-user/http.ts`, cambia temporalmente `  return allowed.includes(origin)` (en `isOriginAllowed`) por `  return allowed.includes(origin.toLowerCase())`.

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: FAIL solo en `isOriginAllowed does not normalize the incoming Origin`.

Restaura: `git -C $WT checkout -- supabase/functions/invite-user/http.ts`; `git -C $WT diff --stat -- supabase/functions/invite-user/http.ts` → vacío. Vuelve a correr → 10 PASS.

- [ ] **Step 4.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-i-users-auth.md supabase/functions/invite-user/http.test.ts
```

```bash
git -C $WT commit -m "test: pin that invite-user matches the incoming Origin exactly (#41)" -m "The allowlist is normalized but the request Origin is not; lowercasing it kept the suite green." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 5: 500 JSON con CORS ante excepciones inesperadas en `invite-user` (#42)

**Files:**
- Modify: `supabase/functions/invite-user/http.test.ts` (imports, `afterEach`, 4 tests nuevos al final)
- Modify: `supabase/functions/invite-user/http.ts` (2 funciones nuevas al final)
- Modify (reemplazo completo): `supabase/functions/invite-user/index.ts`

Hoy una excepción de `getUser`, `inviteUserByEmail`, el insert de perfil o un body JSON `null` (`body.email` sobre `null`) escapa de `Deno.serve` como un 500 pelado sin CORS, y el navegador reporta un error de CORS en vez de un código. Se agrega un envoltorio puro y probado, y `index.ts` lo usa alrededor de todo el handler.

- [ ] **Step 5.1: Escribir los tests (rojo)**

En `supabase/functions/invite-user/http.test.ts`:

1. Reemplaza la primera línea `import { corsHeaders, isOriginAllowed, parseAllowedOrigins, parseBearerToken } from './http.ts'` por:

```ts
import { afterEach, vi } from 'vitest'
import {
  corsHeaders,
  isOriginAllowed,
  jsonResponse,
  parseAllowedOrigins,
  parseBearerToken,
  withInternalErrorResponse,
} from './http.ts'
```

2. Debajo de `const ALLOWED = ['https://app.example.com', 'http://localhost:5173']` agrega:

```ts

afterEach(() => {
  vi.restoreAllMocks()
})
```

3. Agrega al final del archivo:

```ts
test('jsonResponse sends the body as JSON with the given status and CORS headers', async () => {
  const cors = corsHeaders('https://app.example.com', ALLOWED)
  const res = jsonResponse({ error: 'forbidden' }, 403, cors)
  expect(res.status).toBe(403)
  expect(res.headers.get('Content-Type')).toBe('application/json')
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
  expect(res.headers.get('Vary')).toBe('Origin')
  expect(await res.json()).toEqual({ error: 'forbidden' })
})

test('withInternalErrorResponse passes the handler response through untouched', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const cors = corsHeaders('https://app.example.com', ALLOWED)
  const ok = new Response('ok', { status: 201 })
  expect(await withInternalErrorResponse(async () => ok, cors)).toBe(ok)
  expect(errorSpy).not.toHaveBeenCalled()
})

test('withInternalErrorResponse turns an unexpected exception into a 500 JSON with CORS headers', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const cors = corsHeaders('https://app.example.com', ALLOWED)
  const res = await withInternalErrorResponse(async () => {
    throw new TypeError('fetch failed')
  }, cors)
  expect(res.status).toBe(500)
  expect(res.headers.get('Content-Type')).toBe('application/json')
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
  expect(res.headers.get('Vary')).toBe('Origin')
  expect(await res.json()).toEqual({ error: 'internal_error' })
  expect(errorSpy).toHaveBeenCalledWith('invite-user unexpected error', { message: 'fetch failed' })
})

test('withInternalErrorResponse also catches a non-Error throw', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const res = await withInternalErrorResponse(async () => {
    throw 'boom'
  }, corsHeaders(null, ALLOWED))
  expect(res.status).toBe(500)
  expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  expect(await res.json()).toEqual({ error: 'internal_error' })
  expect(errorSpy).toHaveBeenCalledWith('invite-user unexpected error', { message: 'boom' })
})
```

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: FAIL en los 4 tests nuevos con `TypeError: jsonResponse is not a function` / `TypeError: withInternalErrorResponse is not a function`; 10 pasan. (`pnpm exec tsc -b` también falla en este punto: `Module './http.ts' has no exported member 'jsonResponse'`.)

- [ ] **Step 5.2: Implementar los helpers**

Agrega al final de `supabase/functions/invite-user/http.ts`:

```ts

export function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export async function withInternalErrorResponse(
  handle: () => Promise<Response>,
  cors: Record<string, string>,
): Promise<Response> {
  try {
    return await handle()
  } catch (err) {
    // an escaped throw would reach the browser as a bare 500 without CORS, i.e. a CORS error
    console.error('invite-user unexpected error', { message: err instanceof Error ? err.message : String(err) })
    return jsonResponse({ error: 'internal_error' }, 500, cors)
  }
}
```

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: 3 archivos, 14 tests PASS.

- [ ] **Step 5.3: Envolver el handler en `index.ts`**

Reemplaza **todo** el contenido de `supabase/functions/invite-user/index.ts` por:

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkAdmin, type CallerProfile } from './authorize.ts'
import {
  corsHeaders,
  isOriginAllowed,
  jsonResponse,
  parseAllowedOrigins,
  parseBearerToken,
  withInternalErrorResponse,
} from './http.ts'
import { rollbackInvitedUser } from './rollback.ts'

Deno.serve((req: Request) => {
  const origin = req.headers.get('Origin')
  const allowed = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))
  const cors = corsHeaders(origin, allowed)
  const json = (body: unknown, status = 200) => jsonResponse(body, status, cors)

  return withInternalErrorResponse(async () => {
    if (req.method === 'OPTIONS') {
      if (!isOriginAllowed(origin, allowed)) return new Response('forbidden', { status: 403, headers: cors })
      return new Response('ok', { headers: cors })
    }
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    if (!isOriginAllowed(origin, allowed)) return json({ error: 'origin_not_allowed' }, 403)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'missing_authorization' }, 401)
    const token = parseBearerToken(authHeader)
    if (!token) return json({ error: 'invalid_authorization' }, 401)

    const { data: { user }, error: userError } = await serviceClient.auth.getUser(token)
    if (userError || !user) return json({ error: 'invalid_token' }, 401)

    const { data, error: profileError } = await serviceClient
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) return json({ error: 'profile_lookup_failed' }, 500)
    const profile = data as CallerProfile | null
    if (!checkAdmin(profile)) return json({ error: 'forbidden' }, 403)

    let body: { email?: string; fullName?: string; role?: string; redirectTo?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }

    const email = body.email?.trim()
    const fullName = body.fullName?.trim()
    const role = body.role
    if (!email) return json({ error: 'email_required' }, 400)
    if (!fullName) return json({ error: 'full_name_required' }, 400)
    if (role !== 'admin' && role !== 'readonly') return json({ error: 'invalid_role' }, 400)

    const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
      email,
      body.redirectTo ? { redirectTo: body.redirectTo } : undefined,
    )
    if (inviteError || !invited?.user) {
      // GoTrue reports an already-registered address as code 'email_exists' (HTTP 422)
      const duplicate =
        inviteError?.code === 'email_exists' ||
        inviteError?.status === 422 ||
        /already.*registered/i.test(inviteError?.message ?? '')
      if (duplicate) return json({ error: 'email_exists' }, 409)
      return json({ error: 'invite_failed', detail: inviteError?.message }, 400)
    }

    const { error: insertError } = await serviceClient.from('profiles').insert({
      id: invited.user.id,
      tenant_id: profile.tenant_id,
      full_name: fullName,
      role,
    })
    if (insertError) {
      // compensating action: remove the just-created auth user so the email stays re-invitable, not orphaned
      const rolledBack = await rollbackInvitedUser(
        (id) => serviceClient.auth.admin.deleteUser(id),
        invited.user.id,
      )
      if (!rolledBack) {
        return json({ error: 'profile_insert_failed', detail: insertError.message, rollback: 'failed' }, 500)
      }
      return json({ error: 'profile_insert_failed', detail: insertError.message }, 500)
    }

    return json({ userId: invited.user.id }, 200)
  }, cors)
})
```

Comprobación por lectura (ninguna herramienta del repo cubre `index.ts`):

Run: `git -C $WT diff -w --stat -- supabase/functions/invite-user/index.ts`
Expected: `1 file changed, 12 insertions(+), 7 deletions(-)` — sin espacios, el cuerpo del handler es idéntico; solo cambian el import, `Deno.serve(async` → `Deno.serve(`, `json` vía `jsonResponse` y las dos líneas del envoltorio (`return withInternalErrorResponse(async () => {` y `}, cors)`).

Run: `grep -n "new Response(JSON.stringify" supabase/functions/invite-user/index.ts` → sin salida.

- [ ] **Step 5.4: Typecheck de `index.ts` fuera del repo (recomendado)**

`tsc -b` excluye `index.ts`. Para descartar errores de tipos antes del deploy, compílalo una vez contra los tipos reales de `@supabase/supabase-js` con `Deno` simulado, en un directorio temporal **fuera** del repo (no se commitea nada):

```bash
TC=$(mktemp -d)
```

```bash
cat > "$TC/stubs.d.ts" <<'EOF'
declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts' {}
declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void
  env: { get(name: string): string | undefined }
}
EOF
```

```bash
cat > "$TC/tsconfig.json" <<EOF
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM"], "module": "ESNext", "moduleResolution": "bundler",
    "allowImportingTsExtensions": true, "noEmit": true, "strict": true, "skipLibCheck": true,
    "noUnusedLocals": true, "noUnusedParameters": true, "types": [], "ignoreDeprecations": "6.0",
    "baseUrl": "$WT", "paths": { "@supabase/supabase-js": ["node_modules/@supabase/supabase-js"] }
  },
  "files": ["stubs.d.ts", "$WT/supabase/functions/invite-user/index.ts"]
}
EOF
```

Run (en `$WT`): `pnpm exec tsc -p "$TC/tsconfig.json"`
Expected: exit 0 sin salida (el planner corrió exactamente esto contra este `index.ts`). Después: `rm -rf "$TC"`.

- [ ] **Step 5.5: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files + 2` archivos, `B_tests + 20` tests (Task 1: 4; Task 2: 5 — AppLayout 4, UsersPage 1 —; Task 3: 6; Task 4: 1; Task 5: 4), todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0 (ESLint sí lintea `index.ts`).

- [ ] **Step 5.6: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-i-users-auth.md supabase/functions/invite-user/http.ts supabase/functions/invite-user/http.test.ts supabase/functions/invite-user/index.ts
```

```bash
git -C $WT commit -m "fix: answer unexpected invite-user exceptions with a CORS-enabled 500 JSON (#42)" -m "A throw from getUser, inviteUserByEmail, the profile insert or a null JSON body escaped Deno.serve as a bare 500 without CORS headers, which the browser reports as a CORS error. The whole handler now runs inside a tested wrapper that logs and returns internal_error." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 5 SHAs, `B_files`/`B_tests` y conteos finales, salidas de los rojos (1.1, 2.1, 2.3, 3.1, 5.1) y de la mutación (4.2), la salida de `git diff -w --stat` del Step 5.3, el resultado del Step 5.4 y las tres salidas verdes del Step 5.5. El PR debe decir: (a) `index.ts` solo se valida en vivo (más el typecheck fuera del repo); (b) después del merge el orquestador redespliega `invite-user` y anexa los resultados de curl al PR.

---

## Orquestador (después de la revisión pre-PR y del merge)

Desde el checkout principal `/Users/arturoortiz/Proyectos/Personales/ligaspequenas`, con `develop` actualizado. Variables:

```bash
FN=https://eksbaugyypadtanyjcje.supabase.co/functions/v1/invite-user
```

- [ ] **O1. PR** a `develop` con `Closes #13`, `Closes #15`, `Closes #39`, `Closes #41`, `Closes #42`; merge tras revisión limpia. El cuerpo declara dos decisiones del plan: (a) #13 también hace que un cambio de rol fallido muestre `No se pudo cambiar el rol.` (antes fallaba en silencio); (b) #15 quita el `— admin` crudo de cada fila porque el `Select` de esa misma fila ya muestra el rol traducido.

- [ ] **O1.b Token de admin sin exponerlo** (lo usan O2 y O4.c). En la sesión persistente de Playwright (pestaña de `http://localhost:5173` con sesión admin), escribe el header a un archivo privado **desde el propio script**, sin imprimir el token ni devolverlo como resultado de la herramienta:

```js
const token = await page.evaluate(() => JSON.parse(localStorage.getItem('sb-eksbaugyypadtanyjcje-auth-token')).access_token)
require('fs').writeFileSync(process.env.HDR, `Authorization: Bearer ${token}\n`, { mode: 0o600 })
```

con `HDR` = un archivo nuevo dentro del scratchpad del orquestador (p. ej. `$SCRATCH/invite-auth.hdr`). En shell, `HDR=<esa ruta>`. curl lo lee con `-H @"$HDR"`, así el token no aparece en la línea de comandos, en `ps` ni en el historial. Nunca hagas `cat`/`echo` del archivo ni pegues el token en el PR, en issues o en el chat. Expira en ~1 h; al terminar O4: `rm -f "$HDR"`.

- [ ] **O2. Línea base en vivo (antes del deploy, opcional pero recomendada).** Con el header de O1.b, corre el mismo curl de O4.c contra la versión actual: se espera **cualquier 5xx sin** `access-control-allow-origin` (el cuerpo exacto depende del runtime y no es `{"error":"internal_error"}`). Así queda demostrado el bug antes del fix. Anota la versión actual: `pnpm exec supabase functions list --project-ref eksbaugyypadtanyjcje`.

- [ ] **O3. Deploy desde `develop` actualizado:**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas pull --ff-only
```

```bash
pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api
```

Luego `pnpm exec supabase functions list --project-ref eksbaugyypadtanyjcje` → `invite-user` `ACTIVE`, `VERSION` uno más que en O2, `UPDATED_AT` = ahora. El secreto `ALLOWED_ORIGINS` no cambia (debe seguir incluyendo `http://localhost:5173` y `https://ligaspequenas.vercel.app`).

- [ ] **O4. Pruebas con curl** (registrar status y headers CORS tal cual en el PR):

a. Preflight del origen de dev (camino normal):

```bash
curl -s -o /dev/null -D - -X OPTIONS "$FN" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
```

Esperado: `HTTP/2 200`, `access-control-allow-origin: http://localhost:5173`, `vary: Origin`.

b. Origen ajeno (camino normal): mismo comando con `-H "Origin: https://evil.example"` → `HTTP/2 403` y **sin** `access-control-allow-origin`.

c. **Camino de error forzado (#42).** Con el header de O1.b, manda un body JSON `null`: pasa todos los chequeos (origen, bearer, `getUser`, perfil admin) y `body.email` sobre `null` lanza **antes** de invitar a nadie, así que no crea usuarios ni perfiles:

```bash
curl -s -i -X POST "$FN" -H "Origin: http://localhost:5173" -H @"$HDR" -H "Content-Type: application/json" -d 'null'
```

Esperado: `HTTP/2 500`, `access-control-allow-origin: http://localhost:5173`, `content-type: application/json`, cuerpo `{"error":"internal_error"}`. Opcional: en los logs de la función (MCP `get_logs`, servicio `edge-function`, solo lectura) aparece `invite-user unexpected error` con el mensaje del `TypeError`. Después, la query de línea base del spec §5 sigue en 3 profiles / 3 users.

d. Bearer malformado (camino normal, igual que en #14; no hace falta el token real):

```bash
curl -s -i -X POST "$FN" -H "Origin: http://localhost:5173" -H "Authorization: Basic not-a-token" -H "Content-Type: application/json" -d '{}'
```

Esperado: `401` con `{"error":"invalid_authorization"}` y `access-control-allow-origin: http://localhost:5173` (handler) **o** un 401 del gateway (`verify_jwt`); ambos válidos.

- [ ] **O5. Navegador** (Playwright, sesión admin persistente, dev server en `http://localhost:5173`; viewport desktop 1280×800 y móvil 390×844):
  0. **Antes del merge** (desde `develop` sin el lote, o desde `main` desplegado): captura del `AppBar` en `/equipos` y `/usuarios` a 1280 px y a 390 px, y anota la altura del `AppBar` (`(await page.locator('header').boundingBox()).height`) y cuántos renglones ocupan sus botones a 390 px.
  1. **Navegación:** los cuatro links de sección dentro del `navigation` "Principal"; "Salir" fuera del `nav`. En `/equipos` el link Equipos tiene `aria-current="page"`, subrayado morado y negrita; los demás no. En `/` **y** en la ficha de un jugador (`/jugadores/<id>`) la sección actual es Jugadores.
     - **Contraste:** el color de texto del link activo sigue siendo el del `AppBar` (no morado). Mide con `getComputedStyle` el `color` del link y el `background-color` efectivo del `AppBar` y calcula el ratio WCAG: ≥ 4.5:1. El subrayado (`box-shadow` 2 px `#BD93F9`) es indicador no textual: ≥ 3:1 contra el fondo del `AppBar`.
     - **390 px contra el "antes":** compara con las capturas del paso 0: mismo número de renglones de botones y altura del `AppBar` igual o con diferencia ≤ 4 px (el `gap` del `nav` y la negrita no deben empujar un botón a un renglón nuevo), sin scroll horizontal (`document.documentElement.scrollWidth <= 390`). Si cambia el número de renglones, es un hallazgo para el owner, no se ajusta sobre la marcha.
  2. **Usuarios:** la lista muestra solo nombres (sin `— admin`); cada fila tiene un select MUI "Rol de <nombre>" con el rol actual. Abre el menú de un usuario, comprueba las opciones "Solo lectura" y "Administrador", y ciérralo con Escape **sin cambiar** el rol (cambiarlo es una escritura sobre usuarios reales: solo con permiso del owner). El select "Rol de la invitación" abre su menú igual. **No** envíes invitaciones (manda un correo real). A 390 px el formulario apila sus campos y los selects no desbordan.
  3. Sin errores en la consola del navegador.

- [ ] **O6. Rollback operativo si O4 falla:** en una rama `fix/*` nueva, `git revert -m 1 <sha del merge commit del PR del lote>` (es un merge: `-m 1` conserva el lado de `develop`) → PR → merge → redeploy con el comando de O3 (vuelve a la versión anterior). Luego reintentar en otra rama; nunca parchar hacia adelante.

---

## Discrepancias

- **#15 dice "plain `<select>`".** En `origin/develop` el rol ya es `TextField select` de MUI, pero con `native: true`, que renderiza un `<select>` nativo (por eso el issue lo llama así). La decisión del owner lo pasa a `Select` de MUI no nativo; el test lo fija con `container.querySelector('select') === null`.
- **#15 "nav was not styled with the Dracula MUI theme":** el nav ya usa `Button` de MUI dentro del `AppBar` temado; lo que faltaba es que se note la sección actual y la semántica de navegación. Sin rediseño (owner): se agrega el landmark `nav` y el estado activo (subrayado `primary.main` + negrita + `aria-current`). La revisión adversarial descartó pintar el texto de morado: `#BD93F9` sobre el `AppBar` oscuro queda en ~2.9:1. También señaló que `NavLink to="/"` no marcaba Jugadores en las fichas (`/jugadores/*`); se calcula con `useLocation()`. El orquestador lo valida en navegador; si el owner quiere otro tratamiento visual, es un issue nuevo.
- **#15, lista de usuarios:** hoy cada fila dice `Ana — admin` (el valor crudo de la base). Con el select mostrando "Administrador" al lado, el texto crudo era redundante y sin traducir; la fila queda solo con el nombre. Es el único cambio de contenido visible fuera de los selects y el nav.
- **#13 dice "`loadUsers` swallows the query error";** la función se llama `fetchUsers` en `origin/develop` (`UsersPage.tsx:36-39`). Mismo problema. El plan también hace que `changeRole` deje de ignorar el error del `update` (hoy `UsersPage.tsx:67-70` no lo lee): es el mismo defecto de "error handling" en la misma pantalla que nombra el título del issue. Si la revisión lo considera fuera de alcance, se separa en un issue nuevo.
- **#13, códigos desconocidos:** antes se mostraba `Error: <código crudo>`; ahora `No se pudo enviar la invitación (<código>).` solo cuando el error parece un código (`/^[a-z_]+$/`, p. ej. `internal_error` de #42), y el mensaje en español a secas cuando es texto libre de supabase-js.
- **Runner de la Edge Function (spec §5 decía "`deno test` o el runner que use el repo"):** el repo usa Vitest para los módulos puros de `invite-user` (`tsconfig.functions.json` incluye `vitest/globals`; no hay `deno.json` ni `deno` instalado) y excluye `index.ts` del typecheck. Por eso #42 vive en `http.ts` (probado) y `index.ts` solo lo envuelve.
- **Camino de error forzado en vivo:** no hay forma de hacer fallar `getUser` o el insert desde fuera sin romper la base. Un body JSON `null` es una excepción real del handler (`body.email` sobre `null`), alcanzable con un JWT de admin y sin efectos (lanza antes de invitar). Validar ese caso como `400 invalid_json` sería otro cambio de comportamiento: se propone como issue nuevo (ver preguntas abiertas en el reporte), no en este lote.
