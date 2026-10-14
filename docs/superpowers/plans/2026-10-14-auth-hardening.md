# Auth Hardening (#12 #14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No auth screen hangs forever on "loading" because a Supabase promise rejected, an older session never overwrites a newer one, and the login form sends one request per attempt (#12); a failed invitation rollback is logged and reported to the client, the `Authorization` header is parsed strictly, and CORS only answers the app's origins (#14).

**Architecture:** #12 is frontend-only: `AuthProvider` and `AuthCallbackPage` gain a `.catch` on `getSession()`, `AuthProvider` ignores a `getSession()` result that arrives after an auth event, and `LoginPage` gets a synchronous `useRef` in-flight guard. #14 moves the new edge-function logic into two pure modules with no Deno imports (`http.ts`, `rollback.ts`), unit-tested with Vitest like `authorize.ts`, typechecked by a new `tsconfig.functions.json` project reference; `index.ts` only wires them and reads the `ALLOWED_ORIGINS` function secret. No database changes.

**Tech Stack:** React 19.2, react-router-dom 7, MUI 9, `@supabase/supabase-js` 2.108, Vitest 4.1.9 + Testing Library + user-event, TypeScript 6 (`tsc -b`), ESLint 10, pnpm; Supabase Edge Functions (Deno) deployed with the repo CLI (`supabase` 2.107, `--use-api`).

**Spec:** `docs/superpowers/specs/2026-10-14-auth-hardening-design.md` (read it before starting; section numbers below refer to it).

## Global Constraints

- One branch per issue, one PR per branch, base `develop`: #12 → `fix/auth-lifecycle-hardening`, #14 → `fix/invite-user-hardening`. PR bodies carry `Closes #12` / `Closes #14`.
- Delivery (spec §7): **one parallel wave** — both branches are cut from `develop` at the same time; their files are disjoint (#12 only touches `src/auth/`, #14 only `supabase/functions/invite-user/`, `tsconfig.functions.json`, `tsconfig.json`). No post-merge rebase coupling.
- Worktrees are created **by the orchestrator** before dispatch: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening` (#12) and `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening` (#14). Implementers skip creation; their first action is `pnpm install --frozen-lockfile` inside their worktree. Tests need no `.env` (`vite.config.ts` injects the test env).
- Git inside a worktree: always `git -C <absolute worktree path> …`, **one git command per shell call**. Never use `CLAUDE_GIT_OVERRIDE`. Never touch `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (the main checkout).
- Implementers **never** push, open PRs, merge, set Supabase secrets, deploy functions, or run any remote-changing `supabase` command. Those are the orchestrator's (final section).
- Per-branch cycle (spec §7): implementer → pre-PR reviewer; no Blockers/Majors → PR to `develop`, Minors/Nits filed as GitHub issues; Blockers/Majors → orchestrator plans fixes and the cycle restarts; max 3 cycles, then escalate to the owner. The orchestrator merges into `develop`; `develop → main` only with the owner's confirmation.
- Code, identifiers, comments, commit messages: English. Comments only for a non-obvious *why*, one short line max (spec §3.2 allows one on `settledByEvent`; the existing "compensating action" comment in `index.ts` stays). UI copy: Spanish, exactly as already in the code.
- Exact UI strings asserted (unchanged in the code): `Iniciando sesión…` · `El enlace no es válido o expiró` · `Volver a iniciar sesión` · `Enviar enlace de acceso` · `Correo` · `Ingresa un correo válido` · `No se pudo enviar el enlace. Intenta de nuevo.` · `Si tu correo tiene acceso, te enviamos un enlace.`
- Exact edge-function error codes: `missing_authorization` (401) · `invalid_authorization` (401, new) · `origin_not_allowed` (403, new) · `profile_insert_failed` (500, plus `rollback: 'failed'` when the rollback fails). Everything else in `index.ts` keeps its current codes.
- Lint rules that bite: `react-hooks/set-state-in-effect` — no synchronous `setState` in an effect body; every #12 state change lives in a `.then`/`.catch`/event callback or a handler (spec §5).
- Mocks: keep the existing `vi.hoisted` + `vi.mock('../lib/supabase')` style. Rejections use persistent `mockRejectedValue`, never an unconsumed `*Once` (`vi.clearAllMocks()` does not drain `*Once` queues in Vitest 4).
- New edge-function modules are imported with the `.ts` extension (`./http.ts`, `./rollback.ts`), like `./authorize.ts`, so they resolve the same in Deno and Vitest. They import nothing from Deno, `jsr:` or `npm:`.
- `ALLOWED_ORIGINS` never goes in the repo (not in code, not in `.env.example`); it is a Supabase function secret (spec §5).
- Test classes: tests marked **TDD red** must fail before the change; tests marked **guard** already pass their assertions today and pin behavior the change must not break — never claim a guard fails first.
- Every branch closes with all three green: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`.

## Review Focus

- **A rejection after an event must not sign the user out** — if `SIGNED_IN` already arrived and `getSession()` then rejects, the user stays signed in; a `.catch` that forgets the `settledByEvent` check would flip them to anonymous (pinned in Task 1, guard test 3).
- **A real magic link must still sign in when storage reads fail** — with a token in the URL, a rejected `getSession()` must keep showing "Iniciando sesión…" (not the error) and still navigate home on `SIGNED_IN` (pinned in Task 2, guard test 2 — spec test 5).
- **A typo in the email must not lock the form** — an address that fails the regex shows "Ingresa un correo válido" and the corrected address still sends; arming the guard before validation would silently swallow every later submit (pinned in Task 3, guard test 3).
- **A failed send must allow a retry** — after "No se pudo enviar el enlace. Intenta de nuevo." the next submit calls `signInWithOtp` again; the guard is released in `finally`, not only on success (pinned in Task 3, guard test 4).
- **A missing or empty `ALLOWED_ORIGINS` fails closed** — no `Access-Control-Allow-Origin`, never `*`, `Vary: Origin` still present; therefore the secret must be set *before* the deploy (pinned in Task 4, `corsHeaders`/`isOriginAllowed` tests with `[]`; ordering enforced in the final section, step 1).

---

## Branch `fix/auth-lifecycle-hardening` (#12)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening` (created by the orchestrator from `develop`).

- [ ] **Step 0: Install dependencies**

Run (inside the worktree): `pnpm install --frozen-lockfile`
Then: `pnpm exec vitest run`
Expected: `Test Files  28 passed (28)` · `Tests  147 passed (147)` (baseline on `develop` c1bac5b).

### Task 1: `AuthProvider` survives a rejected `getSession()` and lets events win

**Files:**
- Modify: `src/auth/AuthProvider.tsx:11-26` (the `useEffect`)
- Test: `src/auth/AuthContext.test.tsx` (import `act`, add a `deferred` helper, append 3 tests)

**Interfaces:**
- Consumes: `supabase.auth.getSession()` / `supabase.auth.onAuthStateChange(cb)` from `../lib/supabase` (mocked).
- Produces: unchanged `export function AuthProvider({ children })`; `useAuth()` still returns `{ session, loading }`.

- [ ] **Step 1: Prepare the test file** — in `src/auth/AuthContext.test.tsx`:

Replace line 1 with:

```tsx
import { act, render, screen } from '@testing-library/react'
```

Directly above `function Probe() {` add:

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

```

- [ ] **Step 2: Write the tests** — append to `src/auth/AuthContext.test.tsx`:

```tsx
test('resolves to anon when getSession rejects', async () => {
  mocks.getSession.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('anon')).toBeInTheDocument()
})

test('an auth event wins over a getSession result that arrives later', async () => {
  const pending = deferred<{ data: { session: null }; error: null }>()
  mocks.getSession.mockReturnValue(pending.promise)
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(screen.getByText('loading')).toBeInTheDocument()
  act(() => {
    captured!('SIGNED_IN', { user: { id: 'u2' } })
  })
  expect(screen.getByText('user:u2')).toBeInTheDocument()
  await act(async () => {
    pending.resolve({ data: { session: null }, error: null })
  })
  expect(screen.getByText('user:u2')).toBeInTheDocument()
})

test('a getSession rejection after an auth event keeps the signed-in user', async () => {
  const pending = deferred<{ data: { session: null }; error: null }>()
  mocks.getSession.mockReturnValue(pending.promise)
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  render(<AuthProvider><Probe /></AuthProvider>)
  act(() => {
    captured!('SIGNED_IN', { user: { id: 'u2' } })
  })
  await act(async () => {
    pending.reject(new DOMException('The operation is insecure.', 'SecurityError'))
  })
  expect(screen.getByText('user:u2')).toBeInTheDocument()
})
```

Test classes: test 1 (spec §3.3 test 1) and test 2 (spec test 2) are **TDD red**. Test 3 is a **guard** (Review Focus): its assertion passes today — the current code has no `.catch`, so the state stays `user:u2` — but it fails if the new `.catch` ignores `settledByEvent`.

- [ ] **Step 3: Run to verify the reds**

Run: `pnpm exec vitest run src/auth/AuthContext.test.tsx`
Expected: exit code 1 · `Tests  2 failed | 4 passed (6)`:
- `resolves to anon when getSession rejects` FAILS (`Unable to find an element with the text: anon` after the 1000 ms `findBy` timeout).
- `an auth event wins over a getSession result that arrives later` FAILS on its last assertion (`Unable to find an element with the text: user:u2` — the late `null` overwrote it).
- `a getSession rejection after an auth event keeps the signed-in user` PASSES (guard).
- Vitest also prints `Unhandled Rejection` / `SecurityError: The operation is insecure.` — the missing `.catch`.

- [ ] **Step 4: Implement** — in `src/auth/AuthProvider.tsx`, replace the whole `useEffect` (lines 11–26) with:

```tsx
  useEffect(() => {
    let active = true
    // Events are newer than the initial read, so a late getSession result must not overwrite them.
    let settledByEvent = false
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || settledByEvent) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!active || settledByEvent) return
        setSession(null)
        setLoading(false)
      })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      settledByEvent = true
      setSession(newSession)
      setLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
```

No other change in the file.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run src/auth/AuthContext.test.tsx`
Expected: `Tests  6 passed (6)`, exit code 0, **no** `Unhandled Rejection` block.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening add src/auth/AuthProvider.tsx src/auth/AuthContext.test.tsx
```

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening commit -m "fix: resolve AuthProvider loading when getSession rejects and let auth events win (#12)"
```

### Task 2: `AuthCallbackPage` stops waiting when `getSession()` rejects without a token

**Files:**
- Modify: `src/auth/AuthCallbackPage.tsx:33-36` (the `getSession()` call inside the first `useEffect`)
- Test: `src/auth/AuthCallbackPage.test.tsx` (append 2 tests; imports already include `act`, `waitFor`)

**Interfaces:**
- Consumes: `supabase.auth.getSession()` / `onAuthStateChange` (mocked); `renderCallback(entry = TOKEN_ENTRY)` helper already in the test file.
- Produces: unchanged `export function AuthCallbackPage()`.

- [ ] **Step 1: Write the tests** — append to `src/auth/AuthCallbackPage.test.tsx`:

```tsx
test('shows an error on a bare callback visit when getSession rejects', async () => {
  mocks.getSession.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))
  renderCallback('/auth/callback')
  expect(await screen.findByText('El enlace no es válido o expiró')).toBeInTheDocument()
})

test('keeps waiting for SIGNED_IN when getSession rejects but the link carries a token', async () => {
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mocks.getSession.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))
  renderCallback()
  expect(await screen.findByText('Iniciando sesión…')).toBeInTheDocument()
  await act(async () => {})
  expect(screen.queryByText('El enlace no es válido o expiró')).not.toBeInTheDocument()
  await act(async () => {
    captured!('SIGNED_IN', { user: { id: 'u1' } })
  })
  await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
})
```

Test classes: test 1 (spec §3.3 test 4) is **TDD red**. Test 2 (spec test 5) is a **guard**: its assertions already pass today; the empty `act` flushes the rejection so the "no error" assertion runs after the `.catch` would have fired.

- [ ] **Step 2: Run to verify the red**

Run: `pnpm exec vitest run src/auth/AuthCallbackPage.test.tsx`
Expected: exit code 1 · `Tests  1 failed | 5 passed (6)`:
- `shows an error on a bare callback visit when getSession rejects` FAILS (`Unable to find an element with the text: El enlace no es válido o expiró`; the page stays on "Iniciando sesión…").
- `keeps waiting for SIGNED_IN when getSession rejects but the link carries a token` PASSES its assertions (guard).
- Vitest prints `Unhandled Rejection` / `SecurityError: The operation is insecure.` (from both new tests) — this alone would make the run exit 1 even if every assertion passed.

- [ ] **Step 3: Implement** — in `src/auth/AuthCallbackPage.tsx`, replace:

```tsx
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      setChecked(true)
    })
```

with:

```tsx
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) setReady(true)
        setChecked(true)
      })
      .catch(() => setChecked(true))
```

The render condition `!ready && (hasLinkError || (checked && !hasAuthToken))` does not change: with a token in the URL the page keeps waiting for `SIGNED_IN`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/auth/AuthCallbackPage.test.tsx`
Expected: `Tests  6 passed (6)`, exit code 0, no `Unhandled Rejection`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening add src/auth/AuthCallbackPage.tsx src/auth/AuthCallbackPage.test.tsx
```

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening commit -m "fix: show the invalid-link error when getSession rejects on a bare callback visit (#12)"
```

### Task 3: `LoginPage` sends one request per attempt

**Files:**
- Modify: `src/auth/LoginPage.tsx:1`, `:15`, `:17-42` (`useRef` import, `inFlight` ref, `handleSubmit`)
- Test: `src/auth/LoginPage.test.tsx` (import `act` and `fireEvent`, add a `deferred` helper, append 4 tests)

**Interfaces:**
- Consumes: `supabase.auth.signInWithOtp` (mocked); `renderLogin()` helper already in the test file.
- Produces: unchanged `export function LoginPage()`.

- [ ] **Step 1: Prepare the test file** — in `src/auth/LoginPage.test.tsx`:

Replace line 1 with:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
```

Directly above `function renderLogin() {` add:

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

```

- [ ] **Step 2: Write the tests** — append to `src/auth/LoginPage.test.tsx`:

```tsx
test('a second submit while the link is being sent does not send it again', async () => {
  const pending = deferred<{ data: object; error: null }>()
  mocks.signInWithOtp.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  const form = screen.getByRole('button', { name: 'Enviar enlace de acceso' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve({ data: {}, error: null })
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
})

test('the link can be sent again once the previous send finished', async () => {
  const pending = deferred<{ data: object; error: null }>()
  mocks.signInWithOtp.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  const form = screen.getByRole('button', { name: 'Enviar enlace de acceso' }).closest('form')!
  fireEvent.submit(form)
  await act(async () => {
    pending.resolve({ data: {}, error: null })
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
  fireEvent.submit(form)
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2)
})

test('an invalid email does not block the next valid submit', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
  await user.clear(screen.getByLabelText('Correo'))
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1)
})

test('the link can be sent again after a failed send', async () => {
  mocks.signInWithOtp.mockRejectedValue(new Error('network'))
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByText('No se pudo enviar el enlace. Intenta de nuevo.')).toBeInTheDocument()
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2)
})
```

Notes for the implementer:
- `fireEvent.submit` on the form bypasses the button's `disabled`, which is exactly the path the ref guard covers (spec §3.3 test 7).
- The invalid address is `'a@b'`, not something like `'nope'`: the input is `type="email"` and jsdom's constraint validation blocks a button-click submit for `'nope'`, so `handleSubmit` would never run. `'a@b'` passes HTML validation but fails the component's regex.

Test classes:
- Test 1 (spec test 7) is **TDD red**.
- Test 2 (spec test 8) is a **guard**: it arms the guard with one submit, lets it finish, and checks a new submit sends again; it fails if `inFlight` is never reset. (Deviation from the spec's wording: spec test 8 says "submit twice, one call", but on today's code two submits make two calls, so that variant would be red, not a guard. A single submit arms the guard just as well.)
- Tests 3 and 4 are **guards** from Review Focus: test 3 fails if `inFlight` is set before the email validation; test 4 fails if `inFlight` is released only on success.

- [ ] **Step 3: Run to verify the red**

Run: `pnpm exec vitest run src/auth/LoginPage.test.tsx`
Expected: exit code 1 · `Tests  1 failed | 8 passed (9)` — only `a second submit while the link is being sent does not send it again` FAILS (`expected "vi.fn()" to be called 1 times, but got 2 times`).

- [ ] **Step 4: Implement** — in `src/auth/LoginPage.tsx`:

Replace line 1 with:

```tsx
import { useRef, useState } from 'react'
```

Below `const [submitting, setSubmitting] = useState(false)` add:

```tsx
  const inFlight = useRef(false)
```

Replace the whole `handleSubmit` function with:

```tsx
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    setError(null)
    const trimmed = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError('Ingresa un correo válido')
      return
    }
    inFlight.current = true
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
      inFlight.current = false
      setSubmitting(false)
    }
  }
```

The button keeps `disabled={submitting}` (visual feedback). No JSX change.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run src/auth/LoginPage.test.tsx`
Expected: `Tests  9 passed (9)`, exit code 0.

- [ ] **Step 6: Full verification for the branch**

Run: `pnpm exec vitest run` → `Test Files  28 passed (28)` · `Tests  156 passed (156)`, no `Unhandled` block.
Run: `pnpm exec tsc -b` → exit 0, no output.
Run: `pnpm lint` → exit 0, no problems reported.

- [ ] **Step 7: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening add src/auth/LoginPage.tsx src/auth/LoginPage.test.tsx
```

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/auth-lifecycle-hardening commit -m "fix: guard LoginPage against a second submit while a link is being sent (#12)"
```

Branch close: report to the orchestrator (commits, test counts, the three green commands); pre-PR review; PR to `develop` with `Closes #12`. The PR body states what spec §3.1 discards and why (no `active`/`mounted` flags for post-unmount `setState`: no-op in React 19; `AcceptInvitePage` no longer exists). Manual check left for the owner: final section step 5 (#12 part).

---

## Branch `fix/invite-user-hardening` (#14)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening` (created by the orchestrator from `develop`).

- [ ] **Step 0: Install dependencies**

Run (inside the worktree): `pnpm install --frozen-lockfile`
Then: `pnpm exec vitest run`
Expected: `Test Files  28 passed (28)` · `Tests  147 passed (147)`.

### Task 4: Pure HTTP helpers (`http.ts`) + typecheck project for the function modules

**Files:**
- Create: `supabase/functions/invite-user/http.ts`
- Create: `supabase/functions/invite-user/http.test.ts`
- Create: `tsconfig.functions.json`
- Modify: `tsconfig.json` (third reference)

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces (used by Task 6):
  - `parseBearerToken(header: string | null): string | null`
  - `parseAllowedOrigins(raw: string | undefined): string[]`
  - `isOriginAllowed(origin: string | null, allowed: string[]): boolean`
  - `corsHeaders(origin: string | null, allowed: string[]): Record<string, string>`

- [ ] **Step 1: Write the failing tests** — create `supabase/functions/invite-user/http.test.ts`:

```ts
import { corsHeaders, isOriginAllowed, parseAllowedOrigins, parseBearerToken } from './http.ts'

const ALLOWED = ['https://app.example.com', 'http://localhost:5173']

test('parseBearerToken accepts a single Bearer token, case-insensitive scheme, surrounding spaces', () => {
  expect(parseBearerToken('Bearer abc')).toBe('abc')
  expect(parseBearerToken('bearer abc')).toBe('abc')
  expect(parseBearerToken('  Bearer   abc  ')).toBe('abc')
})

test('parseBearerToken rejects anything that is not exactly one Bearer token', () => {
  for (const header of [null, '', 'Bearer', 'Bearer ', 'Basic abc', 'Bearer a b', 'abc']) {
    expect(parseBearerToken(header)).toBeNull()
  }
})

test('parseAllowedOrigins trims, lowercases, drops empties and trailing slashes', () => {
  expect(parseAllowedOrigins('http://localhost:5173, https://app.example.com/')).toEqual([
    'http://localhost:5173',
    'https://app.example.com',
  ])
  expect(parseAllowedOrigins(' HTTPS://App.Example.com ')).toEqual(['https://app.example.com'])
  expect(parseAllowedOrigins(undefined)).toEqual([])
  expect(parseAllowedOrigins('')).toEqual([])
  expect(parseAllowedOrigins(' , ')).toEqual([])
})

test('isOriginAllowed lets a missing Origin through and matches present ones exactly', () => {
  expect(isOriginAllowed(null, ALLOWED)).toBe(true)
  expect(isOriginAllowed('https://app.example.com', ALLOWED)).toBe(true)
  expect(isOriginAllowed('null', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com.evil.com', ALLOWED)).toBe(false)
  expect(isOriginAllowed('http://app.example.com', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com:8443', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com', [])).toBe(false)
})

test('corsHeaders echoes only an allowed origin and never a wildcard', () => {
  const allowed = corsHeaders('https://app.example.com', ALLOWED)
  expect(allowed['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  expect(allowed['Vary']).toBe('Origin')
  expect(allowed['Access-Control-Allow-Headers']).toBe('authorization, x-client-info, apikey, content-type')
  expect(allowed['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')

  const denied = corsHeaders('https://evil.example', ALLOWED)
  const missing = corsHeaders(null, ALLOWED)
  const failClosed = corsHeaders('https://app.example.com', [])
  for (const headers of [denied, missing, failClosed]) {
    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(headers['Vary']).toBe('Origin')
  }
  for (const headers of [allowed, denied, missing, failClosed]) {
    expect(Object.values(headers)).not.toContain('*')
  }
})
```

(Covers spec §4.3 tests 1–4; the `failClosed` and `[]` cases pin the Review Focus fail-closed line.) All five are **TDD red**.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: exit code 1 · `FAIL supabase/functions/invite-user/http.test.ts` with `Error: Failed to resolve import "./http.ts" from "supabase/functions/invite-user/http.test.ts". Does the file exist?` · `authorize.test.ts` still passes.

- [ ] **Step 3: Implement** — create `supabase/functions/invite-user/http.ts`:

```ts
const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'
const ALLOW_METHODS = 'POST, OPTIONS'

export function parseBearerToken(header: string | null): string | null {
  const match = header?.trim().match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((origin) => origin.trim().toLowerCase().replace(/\/$/, ''))
    .filter((origin) => origin !== '')
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  // No Origin header means a non-browser caller; the JWT check still decides.
  if (origin === null) return true
  return allowed.includes(origin)
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    Vary: 'Origin',
  }
  if (origin !== null && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
```

`x-retry-count` is intentionally **not** added to `ALLOW_HEADERS` (spec §4.2: only the PostgREST client sends it, not `functions.invoke`). The incoming `Origin` is matched case-sensitively and is never normalized; only the secret is.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: `Test Files  2 passed (2)` · `Tests  6 passed (6)` (5 in `http.test.ts` + 1 in `authorize.test.ts`).

- [ ] **Step 5: Add the functions typecheck project** — create `tsconfig.functions.json` at the repo root (exactly spec §4.4):

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.functions.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals"]
  },
  "include": ["supabase/functions/invite-user/*.ts"],
  "exclude": ["supabase/functions/invite-user/index.ts"]
}
```

Replace the whole `tsconfig.json` with:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.functions.json" }
  ]
}
```

Why each option matters (do not "simplify"): `allowImportingTsExtensions` + `noEmit` for the `./*.ts` imports; `types: ["vitest/globals"]` for `test`/`expect`/`vi`; `DOM` in `lib` because without it `console` does not exist (`TS2584`); `index.ts` is excluded because it imports `jsr:`/`npm:` and uses `Deno`, which `tsc` cannot resolve (spec §4.4).

Run: `pnpm exec tsc -b`
Expected: exit 0, no output.

- [ ] **Step 6: Prove `tsc -b` now covers the pure modules** — inject a type error, see it caught, revert:

Append this line to the end of `supabase/functions/invite-user/http.ts`:

```ts
export const typeProbe: number = 'not a number'
```

Run: `pnpm exec tsc -b`
Expected: exit code 2 with `supabase/functions/invite-user/http.ts(<line>,14): error TS2322: Type 'string' is not assignable to type 'number'.`

Delete that line again (restoring the file exactly as in Step 3), then run: `pnpm exec tsc -b`
Expected: exit 0. Confirm the probe is gone: `grep -c typeProbe supabase/functions/invite-user/http.ts` → `0`.

Record the exit-2 output in the branch report (spec §7 requires the proof).

- [ ] **Step 7: Lint**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening add supabase/functions/invite-user/http.ts supabase/functions/invite-user/http.test.ts tsconfig.functions.json tsconfig.json
```

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening commit -m "feat: add strict bearer and origin-allowlist helpers for invite-user, typechecked by tsc -b (#14)"
```

### Task 5: Checked rollback (`rollback.ts`)

**Files:**
- Create: `supabase/functions/invite-user/rollback.ts`
- Create: `supabase/functions/invite-user/rollback.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by Task 6):
  - `export type DeleteUser = (id: string) => Promise<{ error: { message: string } | null }>`
  - `rollbackInvitedUser(deleteUser: DeleteUser, userId: string): Promise<boolean>` — `true` if deleted; `false` (after `console.error('invite-user rollback failed', { userId, message })`) if `deleteUser` returns an error or throws. Never logs the email.

- [ ] **Step 1: Write the failing tests** — create `supabase/functions/invite-user/rollback.test.ts`:

```ts
import { afterEach, vi } from 'vitest'
import { rollbackInvitedUser } from './rollback.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

test('returns true and logs nothing when the user is deleted', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const deleteUser = vi.fn().mockResolvedValue({ error: null })
  expect(await rollbackInvitedUser(deleteUser, 'u1')).toBe(true)
  expect(deleteUser).toHaveBeenCalledWith('u1')
  expect(errorSpy).not.toHaveBeenCalled()
})

test('returns false and logs the user id when deleteUser returns an error', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const deleteUser = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
  expect(await rollbackInvitedUser(deleteUser, 'u1')).toBe(false)
  expect(errorSpy).toHaveBeenCalledWith('invite-user rollback failed', { userId: 'u1', message: 'boom' })
})

test('returns false and logs when deleteUser throws', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const deleteUser = vi.fn().mockRejectedValue(new Error('network down'))
  expect(await rollbackInvitedUser(deleteUser, 'u1')).toBe(false)
  expect(errorSpy).toHaveBeenCalledWith('invite-user rollback failed', { userId: 'u1', message: 'network down' })
})
```

(Spec §4.3 tests 5–7.) All three are **TDD red**.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: exit code 1 · `FAIL supabase/functions/invite-user/rollback.test.ts` with `Error: Failed to resolve import "./rollback.ts" …` · the other two files pass.

- [ ] **Step 3: Implement** — create `supabase/functions/invite-user/rollback.ts`:

```ts
export type DeleteUser = (id: string) => Promise<{ error: { message: string } | null }>

export async function rollbackInvitedUser(deleteUser: DeleteUser, userId: string): Promise<boolean> {
  let message: string
  try {
    const { error } = await deleteUser(userId)
    if (!error) return true
    message = error.message
  } catch (err) {
    message = err instanceof Error ? err.message : String(err)
  }
  console.error('invite-user rollback failed', { userId, message })
  return false
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: `Test Files  3 passed (3)` · `Tests  9 passed (9)`.
Run: `pnpm exec tsc -b` → exit 0 (now also covers `rollback.ts` and its test).

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening add supabase/functions/invite-user/rollback.ts supabase/functions/invite-user/rollback.test.ts
```

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening commit -m "feat: add a checked invite rollback that logs failures for invite-user (#14)"
```

### Task 6: Wire the helpers into `invite-user/index.ts`

**Files:**
- Modify: `supabase/functions/invite-user/index.ts:1-32` (imports, CORS, method/origin checks, bearer parsing) and `:77-81` (rollback)

**Interfaces:**
- Consumes: `corsHeaders`, `isOriginAllowed`, `parseAllowedOrigins`, `parseBearerToken` from `./http.ts` (Task 4); `rollbackInvitedUser` from `./rollback.ts` (Task 5); `Deno.env.get('ALLOWED_ORIGINS')`.
- Produces: the deployed function's HTTP contract — `OPTIONS` 200/403, `POST` 403 `origin_not_allowed`, 401 `missing_authorization` / `invalid_authorization`, 500 `profile_insert_failed` (+ `rollback: 'failed'`). `src/users/` does not change (spec §4.2).

`index.ts` has **no automated test and no typecheck** (spec §4.5): neither Vitest, `tsc -b` nor the `--use-api` deploy validates it; only the live checks in the final section (steps 4–5) do. Copy the code below exactly. (The planner type-checked this exact file once out-of-repo against the real `@supabase/supabase-js` types with a stubbed `Deno`, and confirmed an injected error was caught — so the `deleteUser` adapter type-checks; do not re-shape it.)

- [ ] **Step 1: Replace the top of the file** — in `supabase/functions/invite-user/index.ts`, replace everything from line 1 through line 29 (`const token = authHeader.replace('Bearer ', '')`), i.e. the imports, the `corsHeaders` constant, the `json` function and the start of the handler, with:

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkAdmin, type CallerProfile } from './authorize.ts'
import { corsHeaders, isOriginAllowed, parseAllowedOrigins, parseBearerToken } from './http.ts'
import { rollbackInvitedUser } from './rollback.ts'

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  const allowed = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))
  const cors = corsHeaders(origin, allowed)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

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
```

The next line in the file must still be `  const { data: { user }, error: userError } = await serviceClient.auth.getUser(token)` (preceded by a blank line). Order matters (spec §4.2): origin check **before** creating the service client or touching the token; an empty `Authorization` (`''`) stays `missing_authorization`; a present but malformed one (including `'   '`) is `invalid_authorization`. The 403 `OPTIONS` response carries `cors` (which has no `Access-Control-Allow-Origin` for a disallowed origin).

- [ ] **Step 2: Replace the rollback** — replace:

```ts
    await serviceClient.auth.admin.deleteUser(invited.user.id)
    return json({ error: 'profile_insert_failed', detail: insertError.message }, 500)
```

with:

```ts
    const rolledBack = await rollbackInvitedUser(
      (id) => serviceClient.auth.admin.deleteUser(id),
      invited.user.id,
    )
    if (!rolledBack) {
      return json({ error: 'profile_insert_failed', detail: insertError.message, rollback: 'failed' }, 500)
    }
    return json({ error: 'profile_insert_failed', detail: insertError.message }, 500)
```

Keep the existing comment line above it (`// compensating action: remove the just-created auth user so the email stays re-invitable, not orphaned`). Nothing else in the file changes (body validation, `inviteUserByEmail`, `email_exists` mapping, profile insert).

- [ ] **Step 3: Self-check the wiring** (no tool covers `index.ts`, so check by reading):

Run: `grep -n "corsHeaders\|'\*'\|replace('Bearer\|deleteUser" supabase/functions/invite-user/index.ts`
Expected exactly: one line importing `corsHeaders` from `./http.ts`, one `const cors = corsHeaders(origin, allowed)`, one `(id) => serviceClient.auth.admin.deleteUser(id),` — and **no** `'*'` and **no** `replace('Bearer`.

- [ ] **Step 4: Full verification for the branch**

Run: `pnpm exec vitest run` → `Test Files  30 passed (30)` · `Tests  155 passed (155)`.
Run: `pnpm exec tsc -b` → exit 0.
Run: `pnpm lint` → exit 0 (ESLint does lint `index.ts`).

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening add supabase/functions/invite-user/index.ts
```

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-hardening commit -m "fix: restrict invite-user CORS to ALLOWED_ORIGINS, parse bearer strictly and report failed rollbacks (#14)"
```

Branch close: report to the orchestrator (commits, test counts, the three green commands, the Task 4 Step 6 exit-2 output); pre-PR review; PR to `develop` with `Closes #14`. The PR body must say: (a) `ALLOWED_ORIGINS` must be set **before** deploy (fail-closed); (b) `index.ts` is only validated live; (c) the live-check results get appended to the PR after deploy. The implementer does **not** set the secret, deploy, or curl.

---

## Orchestrator / owner steps (post-review, in this order — spec §6)

Not implementer steps. Run from the main checkout `/Users/arturoortiz/Proyectos/Personales/ligaspequenas`. Shell vars used below:

```bash
REF=eksbaugyypadtanyjcje
FN=https://eksbaugyypadtanyjcje.supabase.co/functions/v1/invite-user
```

#12 (`fix/auth-lifecycle-hardening`) has no ordering constraint: merge it to `develop` after its review cycle; its owner check is in step 5.

- [ ] **Step 1 (orchestrator) — set the secret BEFORE merging/deploying #14.** The currently deployed function (`*`) does not read it, so setting it first changes nothing in production.

```bash
pnpm exec supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://ligaspequenas.vercel.app" --project-ref eksbaugyypadtanyjcje
```

Then: `pnpm exec supabase secrets list --project-ref eksbaugyypadtanyjcje`
Expected: a row `ALLOWED_ORIGINS` (value shown only as a digest). Exactly those two origins (scheme + host + port, no path).

- [ ] **Step 2 (orchestrator) — merge** the `fix/invite-user-hardening` PR into `develop` (after a clean pre-PR review).

- [ ] **Step 3 (orchestrator) — deploy from the updated `develop`:**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas pull --ff-only
```

```bash
pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api
```

(Bundles `authorize.ts`, `http.ts`, `rollback.ts` as relative imports; respects `verify_jwt = true` from `supabase/config.toml`.)
Then: `pnpm exec supabase functions list --project-ref eksbaugyypadtanyjcje`
Expected: `invite-user` `ACTIVE`, `VERSION` one higher than before, `UPDATED_AT` = now.

- [ ] **Step 4 (orchestrator) — live checks (curl).** Record every status line and CORS header verbatim in the PR / handoff.

a. Dev origin preflight:

```bash
curl -s -o /dev/null -D - -X OPTIONS "$FN" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
```

Expected: `HTTP/2 200`, `access-control-allow-origin: http://localhost:5173`, `vary: Origin` (header-name case may differ).

b. Production origin preflight:

```bash
curl -s -o /dev/null -D - -X OPTIONS "$FN" -H "Origin: https://ligaspequenas.vercel.app" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
```

Expected: `HTTP/2 200`, `access-control-allow-origin: https://ligaspequenas.vercel.app`.

c. Foreign origin preflight:

```bash
curl -s -o /dev/null -D - -X OPTIONS "$FN" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
```

Expected: `HTTP/2 403` and **no** `access-control-allow-origin` line. If instead the gateway answers the preflight itself (a 200 without reaching the handler), record it in the PR (spec §8): the `POST` origin filter still protects.

d. Malformed scheme with a real admin token. The owner signs in as admin at `http://localhost:5173`, copies `access_token` from DevTools → Application → Local Storage → `sb-eksbaugyypadtanyjcje-auth-token` (expires in ~1 h), and exports it as `ADMIN_JWT`:

```bash
curl -s -i -X POST "$FN" -H "Origin: http://localhost:5173" -H "Authorization: Basic $ADMIN_JWT" -H "Content-Type: application/json" -d '{}'
```

Expected: `401` with body `{"error":"invalid_authorization"}` (handler) **or** a gateway 401 (`verify_jwt`) — both valid (spec §6 step 4). Nothing is created (no valid bearer).

- [ ] **Step 5 (owner) — browser:**
  - From `http://localhost:5173` and from `https://ligaspequenas.vercel.app`: **Usuarios** → invite a user → success; DevTools → Network → `invite-user` shows `Access-Control-Allow-Origin` equal to the exact page origin.
  - (#12) Magic-link login end to end still works; opening `/auth/callback` with no token shows "El enlace no es válido o expiró".
  - Dev-origin caveat: only `http://localhost:5173` is allowed. If port 5173 is busy Vite falls back to `5174` (no `strictPort`), and `http://127.0.0.1:5173` is a different origin — invitations fail by CORS in both cases. Free the port and use `localhost`, or add the origin to the secret.

#14 is not done until steps 1–5 pass; #12 is not done until the #12 part of step 5 passes (spec §7).

- [ ] **Operational rollback (if step 4 or 5 fails):**
  - **Origin problem** (403 or missing `Access-Control-Allow-Origin` for a legitimate origin): fix only the secret, no redeploy — isolates recycle and pick up the new value — then repeat step 4:

    ```bash
    pnpm exec supabase secrets set ALLOWED_ORIGINS="<corrected value>" --project-ref eksbaugyypadtanyjcje
    ```

  - **Code problem** (wrong response with a correct origin, 500, etc.): `git revert` the #14 merge commit on a new `fix/*` branch → PR → merge to `develop` → redeploy from `develop` with the step 3 command (restores the previous version, including `*` CORS, which ignores the secret). Then retry on a new branch — never patch forward.
  - A failed invitation rollback cannot be provoked live without breaking the DB; it is covered only by `rollback.test.ts` (spec §6).
