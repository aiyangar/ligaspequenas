# Plan 2 — Auth + TenantContext + App Shell + Users Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the app behind login, resolve tenant + role from the user's profile in one place, mount the navigable authenticated shell with route guards, and ship admin users-management (invite via an Edge Function + role assignment).

**Architecture:** A Vite + React 19 + TS (strict) SPA gains `react-router-dom` v7. Two React contexts — `AuthContext` (raw Supabase session) and `TenantContext` (profile → tenant + role) — feed route guards and the shell. Authorization is enforced by the existing RLS (Foundation); the only server-side code is one Supabase Edge Function (`invite-user`) that runs with the service_role to create an `auth.user` + its `profiles` row, guarded so only a tenant admin can call it. Role changes go through the anon client under RLS. The first admin is bootstrapped once via a documented manual runbook.

**Tech Stack:** Vite ^8, React 19, TypeScript ~6 (strict), Tailwind ^3, `react-router-dom` ^7, `@supabase/supabase-js` ^2.108, Vitest ^4 + React Testing Library ^16 (frontend), Deno (Edge Function runtime), Supabase MCP for migrations/deploy/live verification (no local Docker).

## Global Constraints

- Spanish prose in docs/UI copy; **all identifiers, table/column names, enums, and code in English**.
- No comments in code unless explaining a non-obvious *why* (one line max).
- TypeScript strict mode on (`noUnusedLocals` / `noUnusedParameters` are enabled — no unused vars/params).
- Use `import type { … }` for type-only imports (`isolatedModules: true`).
- Never commit to `main` or `develop`. Execute this whole plan on one feature branch `feature/plan2-auth-tenant-shell-users`; checkpoint commits per task are allowed on that branch (Foundation precedent).
- No secret/service keys in the client bundle or repo. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public. The `service_role` key lives **only** in the Edge Function runtime (auto-injected as `SUPABASE_SERVICE_ROLE_KEY`).
- RLS is already enabled on all tables (Foundation). UI role-gating is UX only; RLS + the Edge Function guard are the real authorization.
- Roles are the `user_role` enum: exactly `'admin'` | `'readonly'`. There is no other role value.
- `profiles` columns are `id uuid` (= `auth.users.id`), `tenant_id uuid NOT NULL`, `full_name text NOT NULL`, `role user_role NOT NULL default 'readonly'`. Any insert MUST set `tenant_id`, `full_name`, and (here) `role`.
- Liga MTY AC tenant id (seeded in Foundation `0004_seed_ligamtyac.sql`): `00000000-0000-0000-0000-000000000001`.
- `react-router-dom` v7 re-exports `react-router`. Import **everything** (incl. `RouterProvider`, `createBrowserRouter`, `createMemoryRouter`, hooks) from `react-router-dom` in both app and tests — never mix the `react-router` and `react-router-dom` package names in the same tree.
- DB / Edge work is applied and verified against the remote `main` project via Supabase MCP. The DB scripts in `package.json` and a local stack are not used.
- Per-task `pnpm test run <file>` uses Vitest (esbuild transpile — **no full typecheck**). The strict-mode typecheck of all `src/**` files (incl. `.test.tsx`) runs at the integration gates `pnpm exec tsc -b` (Task 8 Step 5 and Task 10 Step 3); any type error introduced in an earlier task surfaces there.

---

## File Structure (created/modified by this plan)

- `package.json`, `pnpm-lock.yaml` — add `react-router-dom` ^7.
- `src/lib/supabase.ts` — (exists) anon client, unchanged.
- `src/lib/authorize.ts` — pure `isAdmin(role)` helper for UI gating. **Created (Task 2).**
- `src/lib/authorize.test.ts` — its test. **Created (Task 2).**
- `src/auth/AuthContext.tsx` — `AuthProvider` + `useAuth` (raw session). **Created (Task 1).**
- `src/auth/AuthContext.test.tsx` — tests. **Created (Task 1).**
- `src/tenant/TenantContext.tsx` — `TenantProvider` + `useTenant` (tenant + role from profile). **Created (Task 2).**
- `src/tenant/TenantContext.test.tsx` — tests. **Created (Task 2).**
- `src/auth/LoginPage.tsx` + `.test.tsx` — email/password login. **Created (Task 3).**
- `src/auth/RequireAuth.tsx` + `.test.tsx` — session route guard. **Created (Task 4).**
- `src/auth/RequireAdmin.tsx` + `.test.tsx` — admin route guard. **Created (Task 4).**
- `src/app/PlaceholderPage.tsx` + `.test.tsx` — "Próximamente" page. **Created (Task 5).**
- `src/app/AppLayout.tsx` + `.test.tsx` — authenticated shell + nav + logout + no-profile handling. **Created (Task 5).**
- `src/auth/AcceptInvitePage.tsx` + `.test.tsx` — set password after invite. **Created (Task 6).**
- `src/users/inviteUser.ts` + `.test.ts` — calls the Edge Function. **Created (Task 7).**
- `src/users/UsersPage.tsx` + `.test.tsx` — invite + list + change role. **Created (Task 7).**
- `src/app/routes.tsx` — route tree. **Created (Task 8).**
- `src/App.tsx` — mounts providers + `RouterProvider`. **Rewritten (Task 8).**
- `src/App.test.tsx` — smoke test adapted to the new shell. **Modified (Task 8).**
- `src/main.tsx` — (exists) renders `<App/>`; unchanged unless needed.
- `supabase/functions/invite-user/authorize.ts` + `authorize.test.ts` — pure `checkAdmin` guard. **Created (Task 9).**
- `supabase/functions/invite-user/index.ts` — Deno handler. **Created (Task 9).**
- `supabase/config.toml` — add `[functions.invite-user]`. **Modified (Task 9).**
- `docs/plan2-bootstrap-admin.md` — first-admin runbook. **Created (Task 10).**

---

### Task 1: `AuthProvider` — raw Supabase session context

**Files:**
- Create: `src/auth/AuthContext.tsx`
- Test: `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`.
- Produces: `AuthProvider({ children })`; `useAuth(): { session: Session | null; loading: boolean }`. Throws if used outside the provider. Later tasks (TenantProvider, RequireAuth, AppLayout) call `useAuth`.

- [ ] **Step 1: Write the failing test** in `src/auth/AuthContext.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

function Probe() {
  const { session, loading } = useAuth()
  return <div>{loading ? 'loading' : session ? `user:${session.user.id}` : 'anon'}</div>
}

test('exposes anon when there is no session', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('anon')).toBeInTheDocument()
})

test('exposes the session user once loaded', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('user:u1')).toBeInTheDocument()
})

test('unsubscribes from auth changes on unmount', async () => {
  const unsubscribe = vi.fn()
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })
  const { unmount } = render(<AuthProvider><Probe /></AuthProvider>)
  await screen.findByText('anon')
  unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test run src/auth/AuthContext.test.tsx`
Expected: FAIL — `./AuthContext` does not exist.

- [ ] **Step 3: Implement** `src/auth/AuthContext.tsx`

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 4: Run the test (expect PASS)**

Run: `pnpm test run src/auth/AuthContext.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx
git commit -m "Add AuthProvider exposing the Supabase session"
```

---

### Task 2: `TenantProvider` + `isAdmin` helper

**Files:**
- Create: `src/lib/authorize.ts`, `src/tenant/TenantContext.tsx`
- Test: `src/lib/authorize.test.ts`, `src/tenant/TenantContext.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 1), `supabase`.
- Produces:
  - `isAdmin(role: string | null | undefined): boolean`.
  - `TenantProvider({ children })`; `useTenant(): { tenantId: string | null; role: 'admin' | 'readonly' | null; fullName: string | null; status: 'loading' | 'ready' | 'no-profile' | 'error' }`. Later tasks (RequireAdmin, AppLayout) call `useTenant` and `isAdmin`.

- [ ] **Step 1: Write the failing `isAdmin` test** in `src/lib/authorize.test.ts`

```ts
import { isAdmin } from './authorize'

test('isAdmin is true only for the admin role', () => {
  expect(isAdmin('admin')).toBe(true)
  expect(isAdmin('readonly')).toBe(false)
  expect(isAdmin(null)).toBe(false)
  expect(isAdmin(undefined)).toBe(false)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test run src/lib/authorize.test.ts`
Expected: FAIL — `./authorize` does not exist.

- [ ] **Step 3: Implement** `src/lib/authorize.ts`

```ts
export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin'
}
```

- [ ] **Step 4: Run the `isAdmin` test (expect PASS)**

Run: `pnpm test run src/lib/authorize.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Write the failing `TenantProvider` test** in `src/tenant/TenantContext.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { TenantProvider, useTenant } from './TenantContext'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: mocks.useAuth }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.maybeSingle.mockResolvedValue({
    data: { tenant_id: 't1', role: 'admin', full_name: 'Ana' },
    error: null,
  })
})

function Probe() {
  const { tenantId, role, fullName, status } = useTenant()
  return <div>{`${status}|${tenantId ?? '-'}|${role ?? '-'}|${fullName ?? '-'}`}</div>
}

test('maps the profile row to tenant + role when ready', async () => {
  render(<TenantProvider><Probe /></TenantProvider>)
  expect(await screen.findByText('ready|t1|admin|Ana')).toBeInTheDocument()
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.select).toHaveBeenCalledWith('tenant_id, role, full_name')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
})

test('reports no-profile when the profile row is missing', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  render(<TenantProvider><Probe /></TenantProvider>)
  expect(await screen.findByText('no-profile|-|-|-')).toBeInTheDocument()
})

test('reports error when the query errors', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
  render(<TenantProvider><Probe /></TenantProvider>)
  expect(await screen.findByText('error|-|-|-')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test run src/tenant/TenantContext.test.tsx`
Expected: FAIL — `./TenantContext` does not exist.

- [ ] **Step 7: Implement** `src/tenant/TenantContext.tsx`

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'

type TenantStatus = 'loading' | 'ready' | 'no-profile' | 'error'
type Role = 'admin' | 'readonly'

interface TenantState {
  tenantId: string | null
  role: Role | null
  fullName: string | null
  status: TenantStatus
}

const EMPTY: TenantState = { tenantId: null, role: null, fullName: null, status: 'loading' }

const TenantContext = createContext<TenantState | undefined>(undefined)

export function TenantProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [state, setState] = useState<TenantState>(EMPTY)

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      setState(EMPTY)
      return
    }
    let active = true
    setState((s) => ({ ...s, status: 'loading' }))
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('tenant_id, role, full_name')
        .eq('id', session.user.id)
        .maybeSingle()
      if (!active) return
      if (error) {
        setState({ tenantId: null, role: null, fullName: null, status: 'error' })
        return
      }
      if (!data) {
        setState({ tenantId: null, role: null, fullName: null, status: 'no-profile' })
        return
      }
      setState({ tenantId: data.tenant_id, role: data.role, fullName: data.full_name, status: 'ready' })
    })()
    return () => {
      active = false
    }
  }, [session, authLoading])

  return <TenantContext.Provider value={state}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantState {
  const ctx = useContext(TenantContext)
  if (ctx === undefined) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
```

- [ ] **Step 8: Run the `TenantProvider` test (expect PASS)**

Run: `pnpm test run src/tenant/TenantContext.test.tsx`
Expected: 3 passed.

- [ ] **Step 9: Commit**

```bash
git add src/lib/authorize.ts src/lib/authorize.test.ts src/tenant/TenantContext.tsx src/tenant/TenantContext.test.tsx
git commit -m "Add TenantProvider (profile -> tenant+role) and isAdmin helper"
```

---

### Task 3: Install router + `LoginPage`

**Files:**
- Modify: `package.json` (add `react-router-dom` ^7)
- Create: `src/auth/LoginPage.tsx`
- Test: `src/auth/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `supabase`, `react-router-dom` (`useNavigate`, `useLocation`).
- Produces: `LoginPage()` — email/password form; on success navigates to `location.state.from` (or `/`). Later used by `routes.tsx` (Task 8).

- [ ] **Step 1: Install react-router-dom v7 + the test interaction helper**

```bash
pnpm add react-router-dom@^7
pnpm add -D @testing-library/user-event
pnpm ls react-router-dom @testing-library/user-event
```
Expected: a `react-router-dom 7.x` entry and a `@testing-library/user-event` entry print. (`user-event` is not bundled with `@testing-library/react` 16 and is used by the form tests in Tasks 3, 5, 6, 7; `tsc -b` typechecks the `.test.tsx` files under `src`, so its types must be present.)

- [ ] **Step 2: Write the failing test** in `src/auth/LoginPage.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null })
})

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: ['/login'] },
  )
  return render(<RouterProvider router={router} />)
}

test('validates that both fields are required', async () => {
  const user = userEvent.setup()
  renderLogin()
  // bypass native required by typing only email, then submit
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('obligatorios')
  expect(mocks.signInWithPassword).not.toHaveBeenCalled()
})

test('shows an error on invalid credentials', async () => {
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'bad' } })
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.type(screen.getByLabelText('Contraseña'), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('inválidas')
})

test('navigates home on success', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.type(screen.getByLabelText('Contraseña'), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test run src/auth/LoginPage.test.tsx`
Expected: FAIL — `./LoginPage` does not exist.

- [ ] **Step 4: Implement** `src/auth/LoginPage.tsx`

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email || !password) {
      setError('Correo y contraseña son obligatorios')
      return
    }
    setSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (signInError) {
      setError('Credenciales inválidas')
      return
    }
    void navigate(from, { replace: true })
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Iniciar sesión</h1>
      <label>
        Correo
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Contraseña
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>Entrar</button>
    </form>
  )
}
```

(Native `required` is intentionally omitted so the explicit "obligatorios" check is reachable and testable.)

- [ ] **Step 5: Run the test (expect PASS)**

Run: `pnpm test run src/auth/LoginPage.test.tsx`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/auth/LoginPage.tsx src/auth/LoginPage.test.tsx
git commit -m "Add react-router-dom and the login page"
```

---

### Task 4: Route guards `RequireAuth` + `RequireAdmin`

**Files:**
- Create: `src/auth/RequireAuth.tsx`, `src/auth/RequireAdmin.tsx`
- Test: `src/auth/RequireAuth.test.tsx`, `src/auth/RequireAdmin.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 1), `useTenant` (Task 2), `isAdmin` (Task 2), `react-router-dom`.
- Produces: `RequireAuth()` and `RequireAdmin()` — pathless layout components that render `<Outlet/>` when allowed, a `<Navigate/>` redirect when not, and a loading line while their context resolves. Used by `routes.tsx` (Task 8).

- [ ] **Step 1: Write the failing `RequireAuth` test** in `src/auth/RequireAuth.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('./AuthContext', () => ({ useAuth: mocks.useAuth }))

beforeEach(() => vi.clearAllMocks())

function renderGuard() {
  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [{ path: '/', element: <h1>Protected</h1> }],
      },
      { path: '/login', element: <h1>Login</h1> },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows a loading line while auth resolves', () => {
  mocks.useAuth.mockReturnValue({ session: null, loading: true })
  renderGuard()
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
})

test('redirects to /login when there is no session', () => {
  mocks.useAuth.mockReturnValue({ session: null, loading: false })
  renderGuard()
  expect(screen.getByText('Login')).toBeInTheDocument()
  expect(screen.queryByText('Protected')).not.toBeInTheDocument()
})

test('renders the protected outlet when authenticated', () => {
  mocks.useAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
  renderGuard()
  expect(screen.getByText('Protected')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test run src/auth/RequireAuth.test.tsx`
Expected: FAIL — `./RequireAuth` does not exist.

- [ ] **Step 3: Implement** `src/auth/RequireAuth.tsx`

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <p>Cargando…</p>
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
```

- [ ] **Step 4: Run the `RequireAuth` test (expect PASS)**

Run: `pnpm test run src/auth/RequireAuth.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Write the failing `RequireAdmin` test** in `src/auth/RequireAdmin.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RequireAdmin } from './RequireAdmin'

const mocks = vi.hoisted(() => ({ useTenant: vi.fn() }))
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

beforeEach(() => vi.clearAllMocks())

function renderGuard() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <h1>Home</h1> },
      {
        element: <RequireAdmin />,
        children: [{ path: '/usuarios', element: <h1>Usuarios</h1> }],
      },
    ],
    { initialEntries: ['/usuarios'] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows a loading line while the tenant resolves', () => {
  mocks.useTenant.mockReturnValue({ role: null, status: 'loading' })
  renderGuard()
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
})

test('redirects non-admins home', () => {
  mocks.useTenant.mockReturnValue({ role: 'readonly', status: 'ready' })
  renderGuard()
  expect(screen.getByText('Home')).toBeInTheDocument()
  expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
})

test('renders the admin outlet for admins', () => {
  mocks.useTenant.mockReturnValue({ role: 'admin', status: 'ready' })
  renderGuard()
  expect(screen.getByText('Usuarios')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test run src/auth/RequireAdmin.test.tsx`
Expected: FAIL — `./RequireAdmin` does not exist.

- [ ] **Step 7: Implement** `src/auth/RequireAdmin.tsx`

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'

export function RequireAdmin() {
  const { role, status } = useTenant()
  if (status === 'loading') return <p>Cargando…</p>
  if (!isAdmin(role)) return <Navigate to="/" replace />
  return <Outlet />
}
```

- [ ] **Step 8: Run the `RequireAdmin` test (expect PASS)**

Run: `pnpm test run src/auth/RequireAdmin.test.tsx`
Expected: 3 passed.

- [ ] **Step 9: Commit**

```bash
git add src/auth/RequireAuth.tsx src/auth/RequireAuth.test.tsx src/auth/RequireAdmin.tsx src/auth/RequireAdmin.test.tsx
git commit -m "Add RequireAuth and RequireAdmin route guards"
```

---

### Task 5: App shell — `PlaceholderPage` + `AppLayout`

**Files:**
- Create: `src/app/PlaceholderPage.tsx`, `src/app/AppLayout.tsx`
- Test: `src/app/PlaceholderPage.test.tsx`, `src/app/AppLayout.test.tsx`

**Interfaces:**
- Consumes: `useTenant` (Task 2), `isAdmin` (Task 2), `supabase` (logout), `react-router-dom` (`NavLink`, `Outlet`, `useNavigate`).
- Produces:
  - `PlaceholderPage({ title })` — renders `title` + "Próximamente".
  - `AppLayout()` — renders the nav (hides the Usuarios link for non-admins), a logout button, and `<Outlet/>`; shows a no-access screen when `status === 'no-profile'` and an error screen when `status === 'error'`. Used by `routes.tsx` (Task 8).

- [ ] **Step 1: Write the failing `PlaceholderPage` test** in `src/app/PlaceholderPage.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { PlaceholderPage } from './PlaceholderPage'

test('renders the title and the coming-soon note', () => {
  render(<PlaceholderPage title="Jugadores" />)
  expect(screen.getByRole('heading', { name: 'Jugadores' })).toBeInTheDocument()
  expect(screen.getByText('Próximamente')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test run src/app/PlaceholderPage.test.tsx`
Expected: FAIL — `./PlaceholderPage` does not exist.

- [ ] **Step 3: Implement** `src/app/PlaceholderPage.tsx`

```tsx
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>Próximamente</p>
    </section>
  )
}
```

- [ ] **Step 4: Run the `PlaceholderPage` test (expect PASS)**

Run: `pnpm test run src/app/PlaceholderPage.test.tsx`
Expected: 1 passed.

- [ ] **Step 5: Write the failing `AppLayout` test** in `src/app/AppLayout.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from './AppLayout'

const mocks = vi.hoisted(() => ({ useTenant: vi.fn(), signOut: vi.fn() }))
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signOut.mockResolvedValue({ error: null })
})

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [{ index: true, element: <p>contenido</p> }],
      },
      { path: '/login', element: <h1>Login</h1> },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

test('hides the Usuarios link for readonly users', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout()
  expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Jugadores' })).toBeInTheDocument()
})

test('shows the Usuarios link for admins', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  renderLayout()
  expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument()
})

test('shows the no-access screen when the user has no profile', () => {
  mocks.useTenant.mockReturnValue({ status: 'no-profile', role: null, fullName: null })
  renderLayout()
  expect(screen.getByText(/no tiene acceso/i)).toBeInTheDocument()
})

test('logging out signs out and redirects to /login', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  const user = userEvent.setup()
  renderLayout()
  await user.click(screen.getByRole('button', { name: 'Salir' }))
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('Login')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test run src/app/AppLayout.test.tsx`
Expected: FAIL — `./AppLayout` does not exist.

- [ ] **Step 7: Implement** `src/app/AppLayout.tsx`

```tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'

export function AppLayout() {
  const navigate = useNavigate()
  const { status, role, fullName } = useTenant()

  async function handleLogout() {
    await supabase.auth.signOut()
    void navigate('/login', { replace: true })
  }

  if (status === 'loading') return <p>Cargando…</p>

  if (status === 'no-profile' || status === 'error') {
    const message =
      status === 'no-profile'
        ? 'Tu cuenta aún no tiene acceso. Contacta al administrador.'
        : 'Ocurrió un error al cargar tu perfil.'
    return (
      <div>
        <p>{message}</p>
        <button onClick={handleLogout}>Salir</button>
      </div>
    )
  }

  return (
    <div>
      <header>
        <span>{fullName}</span>
        <nav>
          <NavLink to="/">Jugadores</NavLink>
          <NavLink to="/quien-debe">Quién debe</NavLink>
          {isAdmin(role) && <NavLink to="/usuarios">Usuarios</NavLink>}
        </nav>
        <button onClick={handleLogout}>Salir</button>
      </header>
      <main><Outlet /></main>
    </div>
  )
}
```

- [ ] **Step 8: Run the `AppLayout` test (expect PASS)**

Run: `pnpm test run src/app/AppLayout.test.tsx`
Expected: 4 passed.

- [ ] **Step 9: Commit**

```bash
git add src/app/PlaceholderPage.tsx src/app/PlaceholderPage.test.tsx src/app/AppLayout.tsx src/app/AppLayout.test.tsx
git commit -m "Add app shell: placeholder page and authenticated layout"
```

---

### Task 6: `AcceptInvitePage` — set password after invitation

**Files:**
- Create: `src/auth/AcceptInvitePage.tsx`
- Test: `src/auth/AcceptInvitePage.test.tsx`

**Interfaces:**
- Consumes: `supabase` (`auth.onAuthStateChange`, `auth.getSession`, `auth.updateUser`), `react-router-dom` (`useNavigate`).
- Produces: `AcceptInvitePage()` — waits for the invite session (implicit-flow token auto-detected by supabase-js → `SIGNED_IN`), then lets the user set a password via `updateUser({ password })`, then navigates to `/`. Used by `routes.tsx` (Task 8).

- [ ] **Step 1: Write the failing test** in `src/auth/AcceptInvitePage.test.tsx`

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AcceptInvitePage } from './AcceptInvitePage'

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
      updateUser: mocks.updateUser,
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
  mocks.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
})

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/accept-invite', element: <AcceptInvitePage /> },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: ['/accept-invite'] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows the password form once the invite session is present', async () => {
  renderPage()
  expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument()
})

test('becomes ready via the SIGNED_IN auth event (implicit-flow token path)', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  renderPage()
  expect(await screen.findByText('Validando invitación…')).toBeInTheDocument()
  await act(async () => {
    captured!('SIGNED_IN', { user: { id: 'u1' } })
  })
  expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument()
})

test('rejects passwords shorter than 8 characters', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.type(await screen.findByLabelText('Nueva contraseña'), 'short')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('8 caracteres')
  expect(mocks.updateUser).not.toHaveBeenCalled()
})

test('sets the password and navigates home', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.type(await screen.findByLabelText('Nueva contraseña'), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'secret12' })
  await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test run src/auth/AcceptInvitePage.test.tsx`
Expected: FAIL — `./AcceptInvitePage` does not exist.

- [ ] **Step 3: Implement** `src/auth/AcceptInvitePage.tsx`

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(!!session)
    })
    void supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError('No se pudo establecer la contraseña')
      return
    }
    void navigate('/', { replace: true })
  }

  if (!ready) return <p>Validando invitación…</p>

  return (
    <form onSubmit={handleSubmit}>
      <h1>Crea tu contraseña</h1>
      <label>
        Nueva contraseña
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>Guardar</button>
    </form>
  )
}
```

- [ ] **Step 4: Run the test (expect PASS)**

Run: `pnpm test run src/auth/AcceptInvitePage.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/AcceptInvitePage.tsx src/auth/AcceptInvitePage.test.tsx
git commit -m "Add accept-invite page to set a password after invitation"
```

---

### Task 7: Users feature — `inviteUser` client + `UsersPage`

**Files:**
- Create: `src/users/inviteUser.ts`, `src/users/UsersPage.tsx`
- Test: `src/users/inviteUser.test.ts`, `src/users/UsersPage.test.tsx`

**Interfaces:**
- Consumes: `supabase` (`functions.invoke`, `from('profiles')`).
- Produces:
  - `InviteUserInput = { email: string; fullName: string; role: 'admin' | 'readonly' }`.
  - `inviteUser(input: InviteUserInput): Promise<{ ok: boolean; error?: string }>` — invokes the `invite-user` Edge Function with `{ ...input, redirectTo: <origin>/accept-invite }`.
  - `UsersPage()` — invite form + tenant user list + per-user role select. Used by `routes.tsx` (Task 8). The Edge Function it calls is built in Task 9.

- [ ] **Step 1: Write the failing `inviteUser` test** in `src/users/inviteUser.test.ts`

```ts
import { beforeEach, expect, vi } from 'vitest'
import { inviteUser } from './inviteUser'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }))

beforeEach(() => {
  vi.clearAllMocks()
})

test('invokes the edge function with the input plus a redirectTo', async () => {
  mocks.invoke.mockResolvedValue({ data: { userId: 'new' }, error: null })
  const result = await inviteUser({ email: 'a@b.com', fullName: 'Ana', role: 'admin' })
  expect(result).toEqual({ ok: true })
  expect(mocks.invoke).toHaveBeenCalledWith('invite-user', {
    body: expect.objectContaining({
      email: 'a@b.com',
      fullName: 'Ana',
      role: 'admin',
      redirectTo: expect.stringMatching(/\/accept-invite$/),
    }),
  })
})

test('returns the transport error when invoke fails', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { message: 'network' } })
  const result = await inviteUser({ email: 'a@b.com', fullName: 'Ana', role: 'readonly' })
  expect(result).toEqual({ ok: false, error: 'network' })
})

test('surfaces the specific reason from a non-2xx function response', async () => {
  // supabase-js shape for a non-2xx function: data null, error is a FunctionsHttpError
  // whose `context` is the Response carrying the JSON body.
  mocks.invoke.mockResolvedValue({
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    },
  })
  const result = await inviteUser({ email: 'a@b.com', fullName: 'Ana', role: 'readonly' })
  expect(result).toEqual({ ok: false, error: 'forbidden' })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test run src/users/inviteUser.test.ts`
Expected: FAIL — `./inviteUser` does not exist.

- [ ] **Step 3: Implement** `src/users/inviteUser.ts`

```ts
import { supabase } from '../lib/supabase'

export interface InviteUserInput {
  email: string
  fullName: string
  role: 'admin' | 'readonly'
}

export interface InviteUserResult {
  ok: boolean
  error?: string
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const redirectTo = `${window.location.origin}/accept-invite`
  const { error } = await supabase.functions.invoke('invite-user', {
    body: { ...input, redirectTo },
  })
  if (!error) return { ok: true }
  // supabase-js turns a non-2xx function response into a FunctionsHttpError whose
  // `context` is the Response; the specific reason lives in its JSON body.
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    try {
      const body: unknown = await context.json()
      if (body && typeof body === 'object' && 'error' in body) {
        return { ok: false, error: String((body as { error: unknown }).error) }
      }
    } catch {
      // fall through to the generic message
    }
  }
  return { ok: false, error: error.message ?? 'invite_failed' }
}
```

> Why the `context` dance: `supabase.functions.invoke` resolves `{ data: null, error }` (never a 2xx body with an `error` field) when the function returns a non-2xx status. The `FunctionsHttpError`'s `message` is a generic "non-2xx status code" string; the real reason (`forbidden`, `invalid_role`, …) is only in `error.context` (the `Response`). Reading it is what surfaces the specific reason to the admin (spec §6/§9).

- [ ] **Step 4: Run the `inviteUser` test (expect PASS)**

Run: `pnpm test run src/users/inviteUser.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Write the failing `UsersPage` test** in `src/users/UsersPage.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
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

test('lists the tenant users', async () => {
  render(<UsersPage />)
  expect(await screen.findByText(/Ana/)).toBeInTheDocument()
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.select).toHaveBeenCalledWith('id, full_name, role')
})

test('invites a user through the inviteUser client', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await user.type(screen.getByPlaceholderText('Correo'), 'nuevo@b.com')
  await user.type(screen.getByPlaceholderText('Nombre completo'), 'Nuevo')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(mocks.inviteUser).toHaveBeenCalledWith({
    email: 'nuevo@b.com',
    fullName: 'Nuevo',
    role: 'readonly',
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Invitación enviada')
})

test('changes a user role through an update', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await user.selectOptions(screen.getByLabelText('Rol de Ana'), 'readonly')
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ role: 'readonly' }))
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test run src/users/UsersPage.test.tsx`
Expected: FAIL — `./UsersPage` does not exist.

- [ ] **Step 7: Implement** `src/users/UsersPage.tsx`

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { inviteUser } from './inviteUser'

type Role = 'admin' | 'readonly'

interface ProfileRow {
  id: string
  full_name: string
  role: Role
}

export function UsersPage() {
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('readonly')
  const [message, setMessage] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, role')
    setUsers((data as ProfileRow[] | null) ?? [])
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const result = await inviteUser({ email, fullName, role })
    if (!result.ok) {
      setMessage(`Error: ${result.error}`)
      return
    }
    setMessage('Invitación enviada')
    setEmail('')
    setFullName('')
    await loadUsers()
  }

  async function changeRole(id: string, newRole: Role) {
    await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    await loadUsers()
  }

  return (
    <section>
      <h1>Usuarios</h1>
      <form onSubmit={handleInvite}>
        <input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="text" placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Rol de la invitación">
          <option value="readonly">Solo lectura</option>
          <option value="admin">Administrador</option>
        </select>
        <button type="submit">Invitar</button>
      </form>
      {message && <p role="status">{message}</p>}
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {u.full_name} — {u.role}
            <select
              value={u.role}
              aria-label={`Rol de ${u.full_name}`}
              onChange={(e) => void changeRole(u.id, e.target.value as Role)}
            >
              <option value="readonly">Solo lectura</option>
              <option value="admin">Administrador</option>
            </select>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 8: Run the `UsersPage` test (expect PASS)**

Run: `pnpm test run src/users/UsersPage.test.tsx`
Expected: 3 passed.

- [ ] **Step 9: Commit**

```bash
git add src/users/inviteUser.ts src/users/inviteUser.test.ts src/users/UsersPage.tsx src/users/UsersPage.test.tsx
git commit -m "Add users management: invite client and admin users page"
```

---

### Task 8: Router wiring + `App` + smoke test

**Files:**
- Create: `src/app/routes.tsx`
- Modify: `src/App.tsx` (rewrite), `src/App.test.tsx` (adapt)

**Interfaces:**
- Consumes: every page/guard/layout/provider from Tasks 1–7.
- Produces: `router` (a `createBrowserRouter` instance) and an `App` default export mounting `AuthProvider > TenantProvider > RouterProvider`. This is the integration point — after it, the whole app runs.

- [ ] **Step 1: Implement** `src/app/routes.tsx`

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../auth/LoginPage'
import { AcceptInvitePage } from '../auth/AcceptInvitePage'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireAdmin } from '../auth/RequireAdmin'
import { AppLayout } from './AppLayout'
import { PlaceholderPage } from './PlaceholderPage'
import { UsersPage } from '../users/UsersPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/accept-invite', element: <AcceptInvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <PlaceholderPage title="Jugadores" /> },
          { path: 'quien-debe', element: <PlaceholderPage title="Quién debe" /> },
          {
            element: <RequireAdmin />,
            children: [{ path: 'usuarios', element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
])
```

- [ ] **Step 2: Rewrite** `src/App.tsx`

```tsx
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { TenantProvider } from './tenant/TenantContext'
import { router } from './app/routes'

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <RouterProvider router={router} />
      </TenantProvider>
    </AuthProvider>
  )
}
```

- [ ] **Step 3: Replace the smoke test** in `src/App.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
}))
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange },
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

test('an unauthenticated visit lands on the login screen', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the smoke test (expect PASS)**

Run: `pnpm test run src/App.test.tsx`
Expected: 1 passed (App boots, RequireAuth sees no session, redirects to /login).

- [ ] **Step 5: Run the whole suite + typecheck + build**

Run: `pnpm test run && pnpm exec tsc -b && pnpm build`
Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/routes.tsx src/App.tsx src/App.test.tsx
git commit -m "Wire the router and mount auth + tenant providers in App"
```

---

### Task 9: `invite-user` Edge Function (Deno) + deploy + live verification

**Files:**
- Create: `supabase/functions/invite-user/authorize.ts`, `supabase/functions/invite-user/authorize.test.ts`, `supabase/functions/invite-user/index.ts`
- Modify: `supabase/config.toml` (add `[functions.invite-user]`)

**Interfaces:**
- Consumes: caller JWT (auto-attached by `supabase.functions.invoke`), service_role env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), `profiles` table.
- Produces: a deployed `invite-user` function. Request body `{ email, fullName, role: 'admin'|'readonly', redirectTo }`. Responses: `200 { userId }`; `400 invalid_json|email_required|full_name_required|invalid_role|invite_failed`; `401 missing_authorization|invalid_token`; `403 forbidden`; `500 profile_lookup_failed|profile_insert_failed`. `checkAdmin(profile)` is the pure guard.

- [ ] **Step 1: Write the failing `checkAdmin` test** in `supabase/functions/invite-user/authorize.test.ts`

```ts
import { checkAdmin } from './authorize.ts'

test('checkAdmin requires an admin role and a tenant', () => {
  expect(checkAdmin({ role: 'admin', tenant_id: 't1' })).toBe(true)
  expect(checkAdmin({ role: 'readonly', tenant_id: 't1' })).toBe(false)
  expect(checkAdmin({ role: 'admin', tenant_id: null })).toBe(false)
  expect(checkAdmin(null)).toBe(false)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test run supabase/functions/invite-user/authorize.test.ts`
Expected: FAIL — `./authorize.ts` does not exist.

- [ ] **Step 3: Implement** `supabase/functions/invite-user/authorize.ts`

```ts
export interface CallerProfile {
  role: string | null
  tenant_id: string | null
}

export function checkAdmin(
  profile: CallerProfile | null,
): profile is CallerProfile & { role: 'admin'; tenant_id: string } {
  return !!profile && profile.role === 'admin' && !!profile.tenant_id
}
```

- [ ] **Step 4: Run the `checkAdmin` test (expect PASS)**

Run: `pnpm test run supabase/functions/invite-user/authorize.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Implement** `supabase/functions/invite-user/index.ts`

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkAdmin, type CallerProfile } from './authorize.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing_authorization' }, 401)
  const token = authHeader.replace('Bearer ', '')

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
    return json({ error: 'invite_failed', detail: inviteError?.message }, 400)
  }

  const { error: insertError } = await serviceClient.from('profiles').insert({
    id: invited.user.id,
    tenant_id: profile.tenant_id,
    full_name: fullName,
    role,
  })
  if (insertError) return json({ error: 'profile_insert_failed', detail: insertError.message }, 500)

  return json({ userId: invited.user.id }, 200)
})
```

Notes on the handler:
- The `missing_authorization` and `invalid_token` 401 branches are **defense-in-depth**: with `verify_jwt = true` (Step 6) the Functions gateway already rejects requests without a valid JWT (401) before the handler runs. The real handler-level guard that the live verification targets is the `checkAdmin` **403**.
- `data` is cast to `CallerProfile | null` before `checkAdmin` so the Deno deploy typecheck (no generated DB types) has a concrete input type; the type guard then narrows `profile.tenant_id` to `string` for the insert.

- [ ] **Step 6: Register the function** in `supabase/config.toml` — append:

```toml
[functions.invite-user]
verify_jwt = true
```

- [ ] **Step 7: Deploy via Supabase MCP**

Use the MCP tool `mcp__supabase__deploy_edge_function` with:
```jsonc
{
  "name": "invite-user",
  "entrypoint_path": "index.ts",
  "verify_jwt": true,
  "files": [
    { "name": "index.ts", "content": "<contents of supabase/functions/invite-user/index.ts>" },
    { "name": "authorize.ts", "content": "<contents of supabase/functions/invite-user/authorize.ts>" }
  ]
}
```
Expected: deploy succeeds; `mcp__supabase__list_edge_functions` then lists `invite-user`.

- [ ] **Step 8: Live RLS regression — readonly cannot change a profile role (via MCP `execute_sql`)**

Mirror the Foundation idiom (`supabase/tests/0002_rls.test.sql`): switch the acting identity with `set_config('role', …, true)` + `set_config('request.jwt.claims', …, true)` — both transaction-local. **Call 1** must be a single `execute_sql` call so the fixtures, the role switches, and the UPDATEs all run in **one transaction** (the local switches take effect for the UPDATEs and commit at the end). It runs the readonly self-escalation (must be blocked) and an admin positive control (must succeed). **Call 2** reads the committed truth under the privileged connection (fresh transaction, no role override).

Call 1 (fixtures + simulation, one transaction):
```sql
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'p2-admin@test.local'),
  ('a0000000-0000-0000-0000-0000000000a2', 'p2-readonly@test.local')
on conflict (id) do nothing;
insert into profiles (id, tenant_id, full_name, role) values
  ('a0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'P2 Admin', 'admin'),
  ('a0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'P2 Readonly', 'readonly')
on conflict (id) do nothing;

-- (negative) act as the readonly user; self-escalation must be blocked by RLS
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-0000000000a2', 'role', 'authenticated')::text, true);
update profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-0000000000a2';

-- (positive control) act as the admin user; admin IS allowed to write a tenant profile
select set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
update profiles set full_name = 'touched-by-admin' where id = 'a0000000-0000-0000-0000-0000000000a2';
```

Call 2 (privileged read of the committed state):
```sql
select
  (select role::text from profiles where id = 'a0000000-0000-0000-0000-0000000000a2') as still_role,
  (select full_name from profiles where id = 'a0000000-0000-0000-0000-0000000000a2') as full_name;
```
Expected: `still_role = 'readonly'` (RLS blocked the readonly self-escalation — 0 rows) **and** `full_name = 'touched-by-admin'` (the admin policy allowed the write — proving the block was role-based RLS, not a blanket failure). If the readonly UPDATE had instead slipped through, `still_role` would read `'admin'` and this check fails loudly (fail-safe).

- [ ] **Step 9: Clean up the fixtures (via MCP `execute_sql`)**

```sql
delete from profiles where id in ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2');
delete from auth.users where id in ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2');
```
Then run `mcp__supabase__get_advisors` with type `security` — expected: no new lints.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/invite-user/authorize.ts supabase/functions/invite-user/authorize.test.ts supabase/functions/invite-user/index.ts supabase/config.toml
git commit -m "Add invite-user edge function (service_role, admin-guarded) and deploy"
```

> **Manual verification (deferred to the user — requires real auth tokens + email delivery; cannot run over MCP).** After the first admin exists (Task 10):
> 1. Sign in as the admin via `POST {VITE_SUPABASE_URL}/auth/v1/token?grant_type=password` (with `apikey: <anon>`) to get an `access_token`.
> 2. `curl -X POST {VITE_SUPABASE_URL}/functions/v1/invite-user -H "Authorization: Bearer <admin access_token>" -H "Content-Type: application/json" -d '{"email":"...","fullName":"...","role":"readonly","redirectTo":"<app>/accept-invite"}'` → expect `200 { userId }`.
> 3. Repeat with a readonly user's token → expect `403 forbidden`.
> 4. Repeat with no `Authorization` header → expect `401` (rejected by `verify_jwt` before the handler).
> 5. End-to-end: confirm the invited user receives the email, lands on `/accept-invite`, sets a password, and reaches the app. (Add `<app>/accept-invite` to the Supabase Auth redirect allowlist first — see Task 10.)

---

### Task 10: First-admin bootstrap runbook + operational config + final gate

**Files:**
- Create: `docs/plan2-bootstrap-admin.md`

**Interfaces:**
- Consumes: nothing in code.
- Produces: the documented one-time procedure to create the first admin, plus the operational config notes; closes the plan with a full-suite gate.

- [ ] **Step 1: Write** `docs/plan2-bootstrap-admin.md`

```markdown
# Runbook — Bootstrap del primer admin (Plan 2)

El primer admin no puede crearse desde la app: la Edge Function `invite-user`
exige que quien llama YA sea admin del tenant. Por eso se provisiona una sola
vez, fuera de banda. No existe ningún code path en la app que auto-otorgue admin
(fail-closed).

## Pasos (una sola vez)

1. **Crear el usuario** en el dashboard de Supabase: Authentication → Users →
   Add user. Captura email + contraseña (o usa "Send invitation"). Copia el
   `id` (uuid) del usuario creado.
2. **Insertar su profile como admin** (vía MCP `execute_sql` contra `main`),
   sustituyendo `<auth-user-id>` y `<Nombre>`:

   ```sql
   insert into profiles (id, tenant_id, full_name, role)
   values ('<auth-user-id>', '00000000-0000-0000-0000-000000000001', '<Nombre>', 'admin');
   ```

   (tenant = Liga MTY AC, sembrado en Foundation `0004_seed_ligamtyac.sql`.)
3. **Verificar**: iniciar sesión en la app con ese usuario; debe ver la pestaña
   **Usuarios**. A partir de ahí, ese admin invita al resto desde la app.

## Configuración operativa requerida (Supabase Auth)

- **Redirect allowlist**: agrega las URLs de `/accept-invite` de la app
  (dev `http://localhost:5173/accept-invite` y la URL de producción de Vercel)
  en Authentication → URL Configuration → Redirect URLs. Sin esto,
  `inviteUserByEmail` cae al Site URL y el link de invitación no aterriza en la app.
- **Email**: el v1 usa el email integrado de Supabase (rate-limited, para bajo
  volumen). SMTP propio se difiere a cuando haya volumen real.
```

- [ ] **Step 2: Commit the runbook**

```bash
git add docs/plan2-bootstrap-admin.md
git commit -m "Document first-admin bootstrap runbook and auth redirect config"
```

- [ ] **Step 3: Final whole-plan gate**

Run: `pnpm test run && pnpm exec tsc -b && pnpm build`
Expected: all tests pass (every suite from Tasks 1–9, including the edge function `checkAdmin`), no type errors, build succeeds.

- [ ] **Step 4: Secret + advisor checks**

Run: `git ls-files | grep -E '^\.env'`
Expected: only `.env.example` (no real env files).

Then run `mcp__supabase__get_advisors` with type `security`.
Expected: no new lints introduced by this plan.

- [ ] **Step 5: Confirm manual follow-ups are listed**

Confirm the deferred manual verifications from Task 9 (admin/readonly/no-auth function calls + end-to-end invite email) are recorded for the user to run, and that the Auth redirect allowlist is configured before the end-to-end test. Do not claim the plan is verified end-to-end until these manual steps pass.

---

## Self-Review

**Spec coverage (Plan 2 spec sections):**
- §1/§2 scope + decisions (Edge Function invites, anon+RLS role change, manual bootstrap, full shell, react-router v7, recovery deferred) → Tasks 3,7,9,10 + Global Constraints. ✅
- §3 feature structure (`auth`/`tenant`/`users`/`app`, shared pure authorize) → file layout across Tasks 1–9. ✅
- §4 Auth + Session + TenantContext, two contexts, `no-profile` edge case → Tasks 1, 2, 5 (AppLayout no-profile screen). ✅
- §5 routing + shell + guards + role-hidden nav + defense layers → Tasks 4, 5, 8. ✅
- §6 UsersPage (invite + list + role change) + Edge Function + accept-invite → Tasks 6, 7, 9. ✅
- §7 bootstrap runbook → Task 10. ✅
- §8 security: service_role only server-side, live function guard verification, redirect allowlist, RLS regression, pre-merge secret check → Tasks 9, 10. ✅
- §9 testing strategy (authorize, TenantContext, guards, UsersPage, LoginPage, inviteUser unit; live function + RLS regression) → tests in Tasks 1–9. ✅
- §10 deps + operational config (react-router, redirect URL, Supabase email) → Tasks 3, 10. ✅
- §11 minor decisions resolved: `full_name` captured in the invite form (Task 7 + Edge Function insert); nav form left to implementation; `authorize.ts` duplicated minimally across Vite (`src/lib/authorize.ts`, role-only) and Deno (`supabase/functions/invite-user/authorize.ts`, role+tenant) per the sanctioned fallback. ✅

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands carry expected output. Manual-only steps (function HTTP calls, email delivery) are explicitly marked as deferred user verifications, not code gaps. ✅

**Type/name consistency:** `useAuth` returns `{ session, loading }` (Tasks 1,4); `useTenant` returns `{ tenantId, role, fullName, status }` with `status ∈ 'loading'|'ready'|'no-profile'|'error'` (Tasks 2,4,5); `isAdmin(role)` (Tasks 2,4,5); `InviteUserInput = { email, fullName, role }` matches the Edge Function body fields and `UsersPage` call (Tasks 7,9); roles are `'admin'|'readonly'` everywhere (no `'member'`); `profiles` insert sets `id,tenant_id,full_name,role` (Edge Function, Task 9) consistent with the NOT-NULL schema. `react-router-dom` is the single import source in app + tests. ✅

**Note on edge-function testing:** `checkAdmin` is unit-tested via Vitest (plain TS, no Deno imports). `index.ts` (with `jsr:`/`npm:`/`Deno` globals) is outside the `src` TS project and is never imported by a test, so neither `tsc -b` nor Vitest parses it — its correctness rests on careful authoring + the live/manual verification in Task 9.

**Adversarial review (2026-06-23):** the plan's code was scaffolded into an isolated workspace with the exact dependency set and `tsconfig.app.json` — `tsc -p tsconfig.app.json` exits 0 over all 26 `src` impl+test files and `vitest run` reports all tests passing (incl. the edge `authorize` test). One *important* defect was found and fixed: `supabase.functions.invoke` returns business errors as `FunctionsHttpError` (`data: null`, generic `message`), so `inviteUser` now reads `error.context.json()` to surface the specific reason and its test mocks the real non-2xx shape. Minor hardening folded in: chain-argument assertions in `TenantContext`/`UsersPage` tests, an `onAuthStateChange`-driven readiness test for `AcceptInvitePage`, a `CallerProfile` cast before `checkAdmin` for the Deno deploy typecheck, the live RLS regression rewritten to the Foundation `set_config` idiom (single transaction + admin positive control), and notes that the handler's 401 branches are defense-in-depth under `verify_jwt`.
