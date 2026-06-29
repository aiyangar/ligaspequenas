# Passwordless Magic-Link Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plan 2's password-based auth with a passwordless magic-link flow: the admin creates users from the app and everyone signs in via a one-time emailed link — no passwords anywhere.

**Architecture:** Two sub-flows (admin onboarding via `inviteUserByEmail`, recurring login via `signInWithOtp`) both land on a single public callback route `/auth/callback` that waits for the session and routes to `/`. supabase-js (`detectSessionInUrl`, default) processes the link token on load. RLS stays the real authorization; UI gating is only UX. No backend logic changes — only the `redirectTo` target moves from `/accept-invite` to `/auth/callback`.

**Tech Stack:** React + TypeScript, Vite, MUI v9 (Dracula theme), react-router-dom v6, supabase-js v2, Vitest + Testing Library (jsdom), Supabase Edge Functions (Deno).

## Global Constraints

- **Branch:** all work stays on the current `feature/passwordless-magic-link` branch. Never commit to `main`/`develop`. One commit per task.
- **Language:** code, identifiers, and comments in English; UI copy in Spanish (existing convention). No comments unless they explain a non-obvious *why* (one line max).
- **Callback route path is exactly `/auth/callback`** for both invite links and magic links.
- **`signInWithOtp` MUST pass `shouldCreateUser: false`** — a non-registered email can never auto-create an account (closed system).
- **`emailRedirectTo` / `redirectTo` MUST be `` `${window.location.origin}/auth/callback` ``.**
- **LoginPage submit shows a neutral anti-enumeration message by default** (`"Si tu correo tiene acceso, te enviamos un enlace."`); only a thrown transport error shows a generic error.
- **Client uses `VITE_SUPABASE_PUBLISHABLE_KEY` only** — no `service_role` key client-side. supabase-js client config is **not** changed (`detectSessionInUrl` is on by default).
- **No edge-function logic changes.** `supabase/functions/invite-user/index.ts` and `authorize.ts` stay byte-for-byte as they are; the new `redirectTo` value is supplied by the client (Task 3).
- **Tests:** Vitest globals are enabled (`test`/`expect` are global), env is jsdom, setup file `src/test-setup.ts`. Run a single test file with `pnpm exec vitest run <path>`.

---

## File Structure

- `src/auth/LoginPage.tsx` — passwordless login form (single email field → `signInWithOtp`). **Rewritten** (Task 1).
- `src/auth/LoginPage.test.tsx` — tests for the rewritten login. **Rewritten** (Task 1).
- `src/auth/AuthCallbackPage.tsx` — waits for the session from the link token, routes to `/`, surfaces link errors. **Created** (Task 2, repurposed from `AcceptInvitePage`).
- `src/auth/AuthCallbackPage.test.tsx` — tests for the callback page. **Created** (Task 2).
- `src/auth/AcceptInvitePage.tsx` + `src/auth/AcceptInvitePage.test.tsx` — **Deleted** (Task 2).
- `src/app/routes.tsx` — public route `/accept-invite` → `/auth/callback`. **Modified** (Task 2).
- `src/users/inviteUser.ts` + `src/users/inviteUser.test.ts` — `redirectTo` now ends in `/auth/callback`. **Modified** (Task 3).
- `src/users/UsersPage.tsx` + `src/users/UsersPage.test.tsx` — success copy → "se le envió un enlace de acceso". **Modified** (Task 4).
- `docs/plan2-bootstrap-admin.md` — operational runbook allowlist URLs → `/auth/callback`. **Modified** (Task 5).

Untouched (logic unchanged per spec): `AuthContext`, `TenantContext`, `RequireAuth`, `RequireAdmin`, `AppLayout`, `PlaceholderPage`, `App.tsx`, `App.test.tsx`, `src/lib/supabase.ts`, and the entire `supabase/functions/invite-user/` directory.

---

### Task 1: `LoginPage` — passwordless magic-link request

**Files:**
- Modify (rewrite): `src/auth/LoginPage.tsx`
- Test (rewrite): `src/auth/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser, emailRedirectTo } })` from `src/lib/supabase.ts`.
- Produces: `LoginPage()` — renders heading `"Iniciar sesión"` (kept so `App.test.tsx` stays green), a single `Correo` field, and an `"Enviar enlace de acceso"` button. No password field, no `signInWithPassword`, no navigation. Mounted by `routes.tsx` at `/login` (unchanged).

- [ ] **Step 1: Rewrite the test file** `src/auth/LoginPage.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({ signInWithOtp: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: mocks.signInWithOtp } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null })
})

function renderLogin() {
  const router = createMemoryRouter(
    [{ path: '/login', element: <LoginPage /> }],
    { initialEntries: ['/login'] },
  )
  return render(<RouterProvider router={router} />)
}

test('requires an email before sending', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('correo válido')
  expect(mocks.signInWithOtp).not.toHaveBeenCalled()
})

test('sends a magic link with shouldCreateUser false and the callback redirect', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(mocks.signInWithOtp).toHaveBeenCalledWith({
    email: 'a@b.com',
    options: {
      shouldCreateUser: false,
      emailRedirectTo: expect.stringMatching(/\/auth\/callback$/),
    },
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
})

test('renders no password field', () => {
  renderLogin()
  expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
})

test('shows a generic error if sending throws', async () => {
  mocks.signInWithOtp.mockRejectedValue(new Error('network'))
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/auth/LoginPage.test.tsx`
Expected: FAIL — current `LoginPage` has a `Contraseña` field, a button named `Entrar`, and calls `signInWithPassword`; the mock only exposes `signInWithOtp`.

- [ ] **Step 3: Rewrite the implementation** `src/auth/LoginPage.tsx`

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError('Ingresa un correo válido')
      return
    }
    setSubmitting(true)
    try {
      // Swallow the returned error on purpose: revealing "that email has no access"
      // would leak which addresses exist. Only a thrown transport failure surfaces.
      await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      setSent(true)
    } catch {
      setError('No se pudo enviar el enlace. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 360, mx: 'auto', mt: 8, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">Iniciar sesión</Typography>
        <TextField
          label="Correo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <Alert severity="error">{error}</Alert>}
        {sent && (
          <Alert role="status" severity="success">
            Si tu correo tiene acceso, te enviamos un enlace.
          </Alert>
        )}
        <Button type="submit" variant="contained" disabled={submitting}>
          Enviar enlace de acceso
        </Button>
      </Stack>
    </Box>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/auth/LoginPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Confirm `App.test.tsx` still passes** (it asserts the `"Iniciar sesión"` heading on an unauthenticated visit)

Run: `pnpm exec vitest run src/App.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/auth/LoginPage.tsx src/auth/LoginPage.test.tsx
git commit -m "feat: passwordless magic-link login via signInWithOtp"
```

---

### Task 2: `AuthCallbackPage` + route swap

**Files:**
- Create: `src/auth/AuthCallbackPage.tsx`
- Create (test): `src/auth/AuthCallbackPage.test.tsx`
- Delete: `src/auth/AcceptInvitePage.tsx`
- Delete: `src/auth/AcceptInvitePage.test.tsx`
- Modify: `src/app/routes.tsx:2-3,12`

**Interfaces:**
- Consumes: `supabase.auth.onAuthStateChange(cb)` and `supabase.auth.getSession()` from `src/lib/supabase.ts`; `useLocation`, `useNavigate`, `Link as RouterLink` from `react-router-dom`.
- Produces: `AuthCallbackPage()` — renders `"Iniciando sesión…"` while there is no session; auto-navigates to `/` (replace) once a session appears (via `getSession` or a `SIGNED_IN` event); renders an error Alert + a link back to `/login` when the URL carries Supabase error params (`error` / `error_code` / `error_description`, hash or query). No form. Mounted by `routes.tsx` at `/auth/callback`.

- [ ] **Step 1: Write the failing test** `src/auth/AuthCallbackPage.test.tsx`

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthCallbackPage } from './AuthCallbackPage'

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
})

function renderCallback(entry = '/auth/callback') {
  const router = createMemoryRouter(
    [
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/login', element: <h1>Login</h1> },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: [entry] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows a signing-in message while no session is present', async () => {
  renderCallback()
  expect(await screen.findByText('Iniciando sesión…')).toBeInTheDocument()
})

test('navigates home when a session appears via SIGNED_IN', async () => {
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  renderCallback()
  expect(await screen.findByText('Iniciando sesión…')).toBeInTheDocument()
  await act(async () => {
    captured!('SIGNED_IN', { user: { id: 'u1' } })
  })
  await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
})

test('shows an error when the magic link is invalid or expired', async () => {
  renderCallback(
    '/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  )
  expect(await screen.findByText('El enlace no es válido o expiró')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/auth/AuthCallbackPage.test.tsx`
Expected: FAIL — `Cannot find module './AuthCallbackPage'`.

- [ ] **Step 3: Create the implementation** `src/auth/AuthCallbackPage.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [ready, setReady] = useState(false)

  const hasLinkError = useMemo(() => {
    const hash = location.hash.replace(/^#/, '')
    const search = location.search.replace(/^\?/, '')
    const params = new URLSearchParams(`${hash}&${search}`)
    return params.has('error') || params.has('error_code') || params.has('error_description')
  }, [location.hash, location.search])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(!!session)
    })
    void supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (ready) void navigate('/', { replace: true })
  }, [ready, navigate])

  if (!ready && hasLinkError) {
    return (
      <Box sx={{ maxWidth: 360, mx: 'auto', mt: 8, px: 2 }}>
        <Stack spacing={2}>
          <Alert severity="error">El enlace no es válido o expiró</Alert>
          <Link component={RouterLink} to="/login">Volver a iniciar sesión</Link>
        </Stack>
      </Box>
    )
  }

  return <Typography sx={{ p: 2 }}>Iniciando sesión…</Typography>
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/auth/AuthCallbackPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Delete the obsolete page and its test**

```bash
git rm src/auth/AcceptInvitePage.tsx src/auth/AcceptInvitePage.test.tsx
```

- [ ] **Step 6: Update the route tree** `src/app/routes.tsx`

Replace the import on line 3:

```tsx
import { AcceptInvitePage } from '../auth/AcceptInvitePage'
```

with:

```tsx
import { AuthCallbackPage } from '../auth/AuthCallbackPage'
```

Replace the public route on line 12:

```tsx
  { path: '/accept-invite', element: <AcceptInvitePage /> },
```

with:

```tsx
  { path: '/auth/callback', element: <AuthCallbackPage /> },
```

Leave the rest of the route tree unchanged.

- [ ] **Step 7: Typecheck and run the full suite to confirm nothing dangles**

Run: `pnpm exec tsc -b && pnpm exec vitest run`
Expected: PASS — `tsc` exits 0 (no remaining reference to `AcceptInvitePage`), all test files green.

- [ ] **Step 8: Commit**

```bash
git add src/auth/AuthCallbackPage.tsx src/auth/AuthCallbackPage.test.tsx src/app/routes.tsx
git commit -m "feat: add /auth/callback page, drop password accept-invite step"
```

---

### Task 3: `inviteUser` — redirect onboarding links to `/auth/callback`

**Files:**
- Modify: `src/users/inviteUser.ts:15`
- Test: `src/users/inviteUser.test.ts:20`

**Interfaces:**
- Consumes: `supabase.functions.invoke('invite-user', { body })` (unchanged).
- Produces: `inviteUser(input)` — same signature and `InviteUserResult` shape; only the `redirectTo` it sends now ends in `/auth/callback`. The edge function forwards this value to `inviteUserByEmail` verbatim, so no function code changes.

- [ ] **Step 1: Update the test assertion** `src/users/inviteUser.test.ts`

Change line 20 from:

```ts
      redirectTo: expect.stringMatching(/\/accept-invite$/),
```

to:

```ts
      redirectTo: expect.stringMatching(/\/auth\/callback$/),
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/users/inviteUser.test.ts`
Expected: FAIL — `inviteUser` still builds `/accept-invite`, so the redirect assertion mismatches.

- [ ] **Step 3: Update the implementation** `src/users/inviteUser.ts`

Change line 15 from:

```ts
  const redirectTo = `${window.location.origin}/accept-invite`
```

to:

```ts
  const redirectTo = `${window.location.origin}/auth/callback`
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/users/inviteUser.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/users/inviteUser.ts src/users/inviteUser.test.ts
git commit -m "feat: point invite redirect at /auth/callback"
```

---

### Task 4: `UsersPage` — passwordless success copy

**Files:**
- Modify: `src/users/UsersPage.tsx:55`
- Test: `src/users/UsersPage.test.tsx:47`

**Interfaces:**
- Consumes: `inviteUser(...)` (Task 3), `supabase.from('profiles')` (unchanged).
- Produces: same form (correo, nombre, rol) and role-change behavior; only the success message changes to `"Usuario creado, se le envió un enlace de acceso"`. Error mapping (`email_exists`/`invalid_role`/`forbidden`) unchanged.

- [ ] **Step 1: Update the test assertion** `src/users/UsersPage.test.tsx`

Change line 47 from:

```tsx
  expect(await screen.findByRole('status')).toHaveTextContent('Invitación enviada')
```

to:

```tsx
  expect(await screen.findByRole('status')).toHaveTextContent('enlace de acceso')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: FAIL — the page still sets `'Invitación enviada'`, which lacks `'enlace de acceso'`.

- [ ] **Step 3: Update the implementation** `src/users/UsersPage.tsx`

Change line 55 from:

```tsx
    setMessage('Invitación enviada')
```

to:

```tsx
    setMessage('Usuario creado, se le envió un enlace de acceso')
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/users/UsersPage.tsx src/users/UsersPage.test.tsx
git commit -m "feat: update UsersPage success copy for passwordless invite"
```

---

### Task 5: Operational config + full verification

**Files:**
- Modify: `docs/plan2-bootstrap-admin.md:27-30`

**Interfaces:**
- No code interface. Closes the spec's "Configuración operativa (Supabase Auth)" section and the final verification gate.

- [ ] **Step 1: Update the runbook allowlist note** `docs/plan2-bootstrap-admin.md`

Replace lines 27-30:

```markdown
- **Redirect allowlist**: agrega las URLs de `/accept-invite` de la app
  (dev `http://localhost:5173/accept-invite` y la URL de producción de Vercel)
  en Authentication → URL Configuration → Redirect URLs. Sin esto,
  `inviteUserByEmail` cae al Site URL y el link de invitación no aterriza en la app.
```

with:

```markdown
- **Redirect allowlist**: agrega las URLs de `/auth/callback` de la app
  (dev `http://localhost:5173/auth/callback` y la URL de producción de Vercel)
  en Authentication → URL Configuration → Redirect URLs. Sin esto, tanto el
  link de invitación (`inviteUserByEmail`) como el magic link (`signInWithOtp`)
  caen al Site URL y no aterrizan en la app.
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm exec vitest run`
Expected: PASS — all test files green, including `App.test.tsx`, `LoginPage.test.tsx`, `AuthCallbackPage.test.tsx`, `inviteUser.test.ts`, `UsersPage.test.tsx`, and the unchanged auth/tenant/lib/edge tests. No `AcceptInvitePage.test.tsx` remains.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm exec tsc -b && pnpm lint`
Expected: both exit 0.

- [ ] **Step 4: Confirm no stale `accept-invite` / `signInWithPassword` references in shipping code**

Run: `grep -rn "accept-invite\|AcceptInvite\|signInWithPassword" src`
Expected: no output (matches survive only in `docs/superpowers/specs/` history, which is fine).

- [ ] **Step 5: Commit**

```bash
git add docs/plan2-bootstrap-admin.md
git commit -m "docs: update redirect allowlist runbook for /auth/callback"
```

- [ ] **Step 6: Owner-run manual verification (cannot be automated — list and wait for approval)**

These require the live Supabase project and a real mailbox; they are **blocking** for declaring the feature done:

1. In Supabase dashboard → Authentication → URL Configuration → Redirect URLs, add `http://localhost:5173/auth/callback` and the production URL. (No local Docker stack / MCP cannot set Auth URL config — this is a dashboard action.)
2. **Onboarding e2e:** create a user from the app (Usuarios tab) → confirm the email arrives → click the link → lands on `/auth/callback` → reaches the app **without** being asked for a password.
3. **Recurring login e2e:** on `/login`, enter that user's email → receive the magic link → click → `/auth/callback` → reaches the app.
4. **Invalid-link check:** open an expired/garbage callback URL → see "El enlace no es válido o expiró" with a working link back to `/login`.

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:

- §Componentes `LoginPage` (rewrite, `signInWithOtp`, `shouldCreateUser:false`, neutral message, no password) → **Task 1**.
- §Componentes `AuthCallbackPage` (waits for session, routes to `/`, link error) + delete `AcceptInvitePage` + `routes.tsx` swap → **Task 2**.
- §Componentes `inviteUser.ts` (`redirectTo` → `/auth/callback`) → **Task 3**.
- §Componentes `UsersPage.tsx` (success copy) → **Task 4**.
- §Componentes `invite-user/index.ts` ("sin cambios de lógica") → no task by design; covered by the Global Constraint and Task 3 (client supplies the new `redirectTo`).
- §Manejo de errores (LoginPage neutral + generic transport; AuthCallbackPage invalid-link) → Task 1 (Steps 1/3 tests + impl) and Task 2 (Step 1/3 error branch).
- §Seguridad (`shouldCreateUser:false`, server-only admin-guarded creation, RLS unchanged, no passwords) → Global Constraints + Task 1; nothing weakens RLS or moves keys client-side.
- §Configuración operativa (redirect allowlist, integrated email) → Task 5 (Step 1 doc + Step 6.1 dashboard).
- §Estrategia de pruebas — LoginPage / AuthCallbackPage / inviteUser / UsersPage / App smoke each have matching automated tests (Tasks 1-4, Task 5 Step 2); `checkAdmin` edge test unchanged; owner-run manual e2e → Task 5 Step 6.

No gaps.

**2. Placeholder scan** — no "TBD"/"add error handling"/"write tests for the above" placeholders. Every code step ships complete code; every command step states the expected result.

**3. Type consistency** — `AuthCallbackPage` (Task 2) is referenced by the exact same name in its test import and in `routes.tsx`. `signInWithOtp` arg shape in Task 1's test and impl match (`{ email, options: { shouldCreateUser, emailRedirectTo } }`). `inviteUser` keeps its existing `InviteUserInput`/`InviteUserResult` contract (Task 3 changes only a string literal). The `/auth/callback` literal is identical across `inviteUser.ts`, `LoginPage.tsx`, `routes.tsx`, and the docs. The neutral message string in Task 1's impl (`"Si tu correo tiene acceso, te enviamos un enlace."`) matches the substring its test asserts (`"Si tu correo tiene acceso"`).
