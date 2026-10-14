# Players/Teams Tech-Debt Follow-ups (#17 #18 #21 #22 #25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player page never shows another player's data under its URL; a real mutation error is never hidden by the follow-up reload's error; a reopened `AddPlayerDialog` never shows the previous opening's error or list; and the `PlayersPage` filter tests use realistic fixtures and cover going back to "Todas"/"Todos".

**Architecture:** Frontend + tests only, no database changes. `PlayerFormPage` becomes a thin wrapper that remounts its content per `id` via `key`. `TeamDetailPage` mutation handlers show the mutation error and reload silently (best-effort) on failure. `AddPlayerDialog` gains a `loading` state and resets itself in the `Dialog`'s exit-transition callback (`slotProps.transition.onExited`). `PlayersPage` gets test-only changes.

**Tech Stack:** React 19, react-router-dom 7 (data router), MUI 9.1.2, Supabase JS, Vitest 4 + Testing Library + user-event, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-13-tech-debt-followups-design.md` (read it before starting; section numbers below refer to it).

## Global Constraints

- One branch per item, one PR per branch, base `develop`: #25 `fix/player-page-id-change`, #17+#18 `update/players-page-filter-tests` (#17 commit first, then #18), #21 `fix/team-detail-error-overwrite`, #22 `fix/add-player-dialog-stale-error`.
- Delivery (spec §8): **one parallel wave** — all four branches are cut from `develop` at the same time; their files are disjoint (table in spec §8).
- Post-merge coupling: `TeamDetailPage` renders `AddPlayerDialog`, and Task 4's assign test opens it. Whichever of `fix/team-detail-error-overwrite` (#21) and `fix/add-player-dialog-stale-error` (#22) merges **second** is rebased onto the updated `develop` and runs the full suite (`pnpm exec vitest run`) before its merge.
- Per-branch cycle: implementer → pre-PR reviewer; no Blockers/Majors → PR to `develop` with `Closes #N` in the body (`update/players-page-filter-tests` carries both `Closes #17` and `Closes #18`), Minors/Nits filed as GitHub issues; Blockers/Majors → orchestrator plans fixes and the cycle restarts; max 3 cycles, then escalate to the owner. The orchestrator merges into `develop`; `develop → main` only with the owner's confirmation.
- Each implementer works in its own worktree outside the repo: `git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas worktree add /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/<branch-slug> -b <branch> origin/develop`, then `pnpm install --frozen-lockfile` inside it. Tests need no `.env` (`vite.config.ts` injects test env).
- Git inside a worktree: always `git -C <absolute worktree path> …`, **one git command per shell call**. Never use `CLAUDE_GIT_OVERRIDE`. Implementers never push, open PRs or merge — report and wait.
- Code, identifiers, comments, commit messages: English. Comments only for a non-obvious *why*, one short line max. UI copy: Spanish, exactly as written in this plan.
- Exact UI strings touched or asserted: `Cargando…` · `Jugador no encontrado` · `Guardar` · `Cambios guardados` · `Jugador creado` · `Todas` · `Todos` · `Estatus` · `Equipo` · `Categoría` · `No se pudo actualizar la vista. Recarga la página.` · `No se pudo asignar` · `No se pudo mover` · `No se pudo quitar` · `Quitar del equipo` · `Añadir jugador` · `Reintentar` · `Cerrar` · `No hay jugadores elegibles.`
- Lint rules that bite: `react-hooks/set-state-in-effect` (no synchronous setState in an effect body — resets go in handlers, async callbacks, or transition callbacks); `no-empty` (an empty `catch {}` must contain the one-line why-comment).
- Mocks: keep the existing `vi.hoisted` + `vi.mock` style. Never leave a `*Once` mock the fixed code will not consume (`vi.clearAllMocks()` does not drain `*Once` queues in Vitest 4); use persistent `mockResolvedValue`/`mockRejectedValue`/`mockReturnValue` set **after** the initial load when only later calls should change — the `beforeEach` overwrites them for the next test.
- In tests, find alerts by text or button name, never by bare `getByRole('alert')`. "Dialog closed" = `await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())`.
- Every branch closes with all three green: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`.

## Review Focus

- **Saving under the wrong id** — after navigating from player A to a missing player B, an admin must not see a form (and so no **Guardar**) that would call `updatePlayer(B, valuesOfA)` (pinned in Task 1, test 1, `Guardar` assertion).
- **Saving an edit must not remount** — save navigates to the same id; the page must keep its instance (one `fetchPlayer` call) and still show "Cambios guardados" (pinned in Task 1, test 3).
- **Double failure** — a failed mutation followed by a failed reload must show the mutation's error, never the generic "No se pudo actualizar la vista…" (pinned in Task 4, test 1).
- **Stale list after a parent-driven close** — after the parent closes `AddPlayerDialog` on assign/move, reopening must start in "Cargando…", not show the previous list (pinned in Task 5, test 2).
- **Resetting a filter to "Todas"/"Todos"** — must restore every player; the "Todos" option exists in two selects, so each reset is scoped by the select's label (pinned in Task 3, guarded by the mutation checks).

---

## Branch `fix/player-page-id-change` (#25)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-player-page-id-change`.

### Task 1: Remount `PlayerFormPage` content per id

**Files:**
- Modify: `src/players/PlayerFormPage.tsx` (wrapper + rename the current body to a private `PlayerFormContent`)
- Test: `src/players/PlayerFormPage.test.tsx` (import `act` and `PlayerRow`, extract the fixture to `ana`, make `renderAt` return the router, add a `deferred` helper, append 3 tests)

**Interfaces:**
- Consumes: `useParams()` from `react-router-dom`; `PlayerRow` from `./players`.
- Produces: `export function PlayerFormPage()` (unchanged export; `routes.tsx` and tests keep importing it). `PlayerFormContent({ id }: { id: string | undefined })` is module-private.

- [ ] **Step 1: Prepare the test file** — in `src/players/PlayerFormPage.test.tsx`:

Replace line 1 with:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
```

Below the `import { PlayerFormPage } from './PlayerFormPage'` line add:

```tsx
import type { PlayerRow } from './players'
```

Replace the whole `renderAt` function with (same routes; it now returns the router so tests can navigate):

```tsx
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/jugadores/nuevo', element: <PlayerFormPage /> },
      { path: '/jugadores/:id', element: <PlayerFormPage /> },
      { path: '/', element: <div>lista</div> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const ana: PlayerRow = {
  id: 'p1', tenant_id: 'tenant-1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
  curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
  tutor_name: 'Luis', tutor_whatsapp: '811', tutor_email: null,
  emergency_contact_name: null, emergency_contact_phone: null,
  affiliation_status: 'pendiente', affiliation_date: null,
  created_at: '', updated_at: '', edad_liga: 11, division: 'Infantil',
  category_name: 'Infantil Mayor', category_year: 1,
  category_id: 'cat1', team_id: null, team_name: null,
}
```

In `beforeEach`, replace the whole `mocks.fetchPlayer.mockResolvedValue({ … })` call (the inline object literal) with:

```tsx
  mocks.fetchPlayer.mockResolvedValue(ana)
```

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: all 17 existing tests PASS (pure refactor of the test file).

- [ ] **Step 2: Write the failing tests** — append to `src/players/PlayerFormPage.test.tsx`:

```tsx
test('navigating to a missing player shows not-found instead of the previous player', async () => {
  mocks.fetchPlayer.mockImplementation((id: string) => Promise.resolve(id === 'p1' ? ana : null))
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await act(() => router.navigate('/jugadores/p2'))
  expect(await screen.findByText('Jugador no encontrado')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Ana Ruiz')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})

test('navigating to another player shows Cargando… until it loads, not the previous player', async () => {
  const beto = deferred<PlayerRow | null>()
  mocks.fetchPlayer.mockImplementation((id: string) => (id === 'p1' ? Promise.resolve(ana) : beto.promise))
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await act(() => router.navigate('/jugadores/p2'))
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Ana Ruiz')).not.toBeInTheDocument()
  await act(async () => {
    beto.resolve({ ...ana, id: 'p2', full_name: 'Beto Gómez' })
  })
  expect(await screen.findByDisplayValue('Beto Gómez')).toBeInTheDocument()
})

test('saving an edit keeps the same page instance and shows the toast', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  expect(mocks.fetchPlayer).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: the first two new tests FAIL — test 1 times out on `findByText('Jugador no encontrado')` (Ana's form stays on screen), test 2 times out on `findByText('Cargando…')` (`loaded` is still `true`, Ana is shown). The third new test PASSES already (characterization: it pins that the fix keys by `id`, not by navigation). The 17 existing tests pass.

- [ ] **Step 4: Implement** — in `src/players/PlayerFormPage.tsx`, replace these two lines:

```tsx
export function PlayerFormPage() {
  const { id } = useParams()
```

with:

```tsx
export function PlayerFormPage() {
  const { id } = useParams()
  // Remount per id so no state from the previous player (row, loaded, in-flight setRow) leaks in.
  return <PlayerFormContent key={id ?? 'new'} id={id} />
}

function PlayerFormContent({ id }: { id: string | undefined }) {
```

Nothing else changes: the rest of the former `PlayerFormPage` body (from `const navigate = useNavigate()` to the end) is now `PlayerFormContent`'s body, and the `useParams` import stays (the wrapper uses it). The `if (!r) return` in the load effect stays — each id starts with `row === null` and `loaded === false`.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: all 20 tests PASS (including the existing "Jugador creado" and "Cambios guardados" toast tests, unchanged).

- [ ] **Step 6: Full verification for the branch**

Run: `pnpm exec vitest run` → all pass. `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 7: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-player-page-id-change add src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-player-page-id-change commit -m "fix: remount the player page when the id changes (#25)"
```

Branch close: report to the orchestrator; pre-PR review; PR to `develop` with `Closes #25`.

---

## Branch `update/players-page-filter-tests` (#17, #18)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests`. Test-only branch: `src/players/PlayersPage.tsx` must have **no** committed diff.

### Task 2: Realistic uncategorized fixture (#17)

**Files:**
- Test: `src/players/PlayersPage.test.tsx` (the `beforeEach` Beto fixture, line 44)

**Interfaces:**
- Consumes: `PlayerRow.category_id: string | null` (the `players_with_category` view returns id and name together or both `null`).
- Produces: Beto fixture with `category_id: null`, which Task 3's category test relies on.

- [ ] **Step 1: Fix the fixture** — in `src/players/PlayersPage.test.tsx`, replace the Beto line inside `beforeEach`:

```tsx
    player({ id: 'p2', full_name: 'Beto Gómez', status: 'baja', category_name: null, category_year: null, edad_liga: 25, team_id: null, team_name: null }),
```

with:

```tsx
    player({ id: 'p2', full_name: 'Beto Gómez', status: 'baja', category_id: null, category_name: null, category_year: null, edad_liga: 25, team_id: null, team_name: null }),
```

- [ ] **Step 2: Run the file**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: all 10 tests PASS (no existing test changes outcome; category options already drop pairs with a `null` name).

- [ ] **Step 3: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests add src/players/PlayersPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests commit -m "test: give the uncategorized player fixture a null category_id (#17)"
```

### Task 3: Cover resetting filters to "Todas"/"Todos" (#18)

**Files:**
- Test: `src/players/PlayersPage.test.tsx` (extend two existing tests, append one)
- Temporarily mutate (never commit): `src/players/PlayersPage.tsx` lines 117, 132, 144

**Interfaces:**
- Consumes: Task 2's Beto fixture (`category_id: null`). Fixture data from `beforeEach`: Ana `cat1` / `team9` / activo; Beto no category / no team / baja.
- Produces: no new exports.

- [ ] **Step 1: Extend the status test** — replace the whole `test('status filter narrows to activos', …)` with:

```tsx
test('status filter narrows to activos and Todos restores everyone', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Beto Gómez')
  await user.selectOptions(screen.getByLabelText('Estatus'), 'activo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Estatus'), 'Todos')
  expect(await screen.findByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})
```

- [ ] **Step 2: Extend the team test** — replace the whole `test('team filter narrows to a single team', …)` with:

```tsx
test('team filter narrows to a single team and Todos restores everyone', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.selectOptions(screen.getByLabelText('Equipo'), 'MTY AC Rojo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Equipo'), 'Todos')
  expect(await screen.findByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})
```

- [ ] **Step 3: Add the category test** — append:

```tsx
test('category filter narrows by id and Todas restores everyone', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Beto Gómez')
  await user.selectOptions(screen.getByLabelText('Categoría'), 'cat1')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Categoría'), 'Todas')
  expect(await screen.findByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the file**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: all 11 tests PASS on the first run. These are characterization tests — the production code is already correct (`''` is falsy and skips the predicate, `PlayersPage.tsx:73-75`).

- [ ] **Step 5: Mutation check — Equipo** — in `src/players/PlayersPage.tsx` line 144, temporarily replace

```tsx
              onChange={(e) => setTeamId(e.target.value)}
```

with

```tsx
              onChange={(e) => e.target.value && setTeamId(e.target.value)}
```

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: exactly `team filter narrows to a single team and Todos restores everyone` FAILS, on `findByText('Beto Gómez')` after selecting "Todos" (the narrowing half still passes). Revert:

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests checkout -- src/players/PlayersPage.tsx
```

- [ ] **Step 6: Mutation check — Categoría** — line 117, temporarily replace

```tsx
              onChange={(e) => setCategoryId(e.target.value)}
```

with

```tsx
              onChange={(e) => e.target.value && setCategoryId(e.target.value)}
```

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: exactly `category filter narrows by id and Todas restores everyone` FAILS after selecting "Todas". Revert:

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests checkout -- src/players/PlayersPage.tsx
```

- [ ] **Step 7: Mutation check — Estatus** — line 132, temporarily replace

```tsx
              onChange={(e) => setStatus(e.target.value as '' | PlayerStatus)}
```

with

```tsx
              onChange={(e) => e.target.value && setStatus(e.target.value as PlayerStatus)}
```

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: exactly `status filter narrows to activos and Todos restores everyone` FAILS after selecting "Todos". Revert:

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests checkout -- src/players/PlayersPage.tsx
```

Do **not** use "remove the `teamId &&` guard from the predicate" as a mutation: it empties the list from the start and fails before reaching the reset, proving nothing about it. Report the three observed failures (test name + failing assertion) to the orchestrator.

- [ ] **Step 8: Confirm production code is untouched**

Run: `git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests diff --exit-code -- src/players/PlayersPage.tsx`
Expected: no output, exit 0.

- [ ] **Step 9: Full verification for the branch**

Run: `pnpm exec vitest run` → all pass. `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 10: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests add src/players/PlayersPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/update-players-page-filter-tests commit -m "test: cover resetting the players filters to Todas/Todos (#18)"
```

Branch close: report to the orchestrator (including the three mutation failures); pre-PR review; PR to `develop` with `Closes #17` and `Closes #18`.

---

## Branch `fix/team-detail-error-overwrite` (#21)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-team-detail-error-overwrite`.

### Task 4: A failed mutation keeps its error and reloads silently

**Files:**
- Modify: `src/teams/TeamDetailPage.tsx` (add `bestEffortRefresh` next to `safeRefresh`; rewrite `handleAssign`, `handleMove`, `handleRemove`)
- Test: `src/teams/TeamDetailPage.test.tsx` (append 3 tests)

**Interfaces:**
- Consumes: `refresh(): Promise<void>` (existing `useCallback`, throws when a read fails); `safeRefresh()` (unchanged); mutation results `{ ok: boolean; error?: string }`.
- Produces: module-private `bestEffortRefresh(): Promise<void>` inside the component. No new exports.

- [ ] **Step 1: Write the failing tests** — append to `src/teams/TeamDetailPage.test.tsx`:

```tsx
test('a failed removal keeps its error when the reload also fails', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.removeFromRoster.mockResolvedValue({ ok: false, error: 'RLS denied' })
  mocks.fetchRoster.mockRejectedValue(new Error('boom'))
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  expect(await screen.findByText('RLS denied')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.fetchRoster).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('No se pudo actualizar la vista. Recarga la página.')).not.toBeInTheDocument()
})

test('a failed removal shows its error and still reloads a concurrently changed roster', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.removeFromRoster.mockResolvedValue({ ok: false, error: 'duplicate key' })
  mocks.fetchRoster.mockResolvedValue([p({ id: 'p2', full_name: 'Beto Roster' })])
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  expect(await screen.findByText('duplicate key')).toBeInTheDocument()
  expect(await screen.findByText('Beto Roster')).toBeInTheDocument()
  expect(screen.queryByText('Ana Roster')).not.toBeInTheDocument()
  expect(screen.queryByText('No se pudo actualizar la vista. Recarga la página.')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('a failed assign shows its error, closes the dialog and still reloads', async () => {
  mocks.fetchEligiblePlayers.mockResolvedValue([p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null })])
  mocks.assignPlayer.mockResolvedValue({ ok: false, error: 'RLS denied' })
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  await user.click(screen.getByRole('button', { name: 'Añadir jugador' }))
  await user.click(await screen.findByText('Free Agent'))
  expect(await screen.findByText('RLS denied')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.fetchRoster).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run to verify the double-failure test fails**

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: `a failed removal keeps its error when the reload also fails` FAILS on `findByText('RLS denied')` (today `safeRefresh`'s catch overwrites it with "No se pudo actualizar la vista. Recarga la página."). The other two new tests PASS already (today's code also reloads after a failed mutation); they pin that the fix keeps reloading — Step 5 proves they are not vacuous. The 7 existing tests pass, including "a failed refresh after a mutation shows an error without losing the page" (successful mutation + failed reload; its `mockRejectedValueOnce` is consumed).

- [ ] **Step 3: Implement** — in `src/teams/TeamDetailPage.tsx`, right after the closing `}` of `safeRefresh`, add:

```tsx
  async function bestEffortRefresh() {
    try {
      await refresh()
    } catch {
      // Keep the mutation error; the refresh is best-effort.
    }
  }
```

Replace `handleAssign`, `handleMove` and `handleRemove` (the three functions between `safeRefresh` and `handleDelete`) with:

```tsx
  async function handleAssign(playerId: string) {
    if (!tenantId) return
    const res = await assignPlayer(team!.id, playerId, tenantId, team!.season_id)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo asignar')
      setAddOpen(false)
      await bestEffortRefresh()
      return
    }
    setAddOpen(false)
    await safeRefresh()
  }

  async function handleMove(playerId: string) {
    const res = await movePlayer(playerId, team!.season_id, team!.id)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo mover')
      setAddOpen(false)
      await bestEffortRefresh()
      return
    }
    setAddOpen(false)
    await safeRefresh()
  }

  async function handleRemove() {
    if (!removing) return
    const res = await removeFromRoster(removing.id, team!.season_id)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo quitar')
      setRemoving(null)
      await bestEffortRefresh()
      return
    }
    setRemoving(null)
    await safeRefresh()
  }
```

`safeRefresh` and `handleDelete` do not change.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: all 10 tests PASS.

- [ ] **Step 5: Mutation check — the silent reload is pinned** — temporarily delete the line `await bestEffortRefresh()` from **both** `handleAssign` and `handleRemove`.

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: `a failed removal shows its error and still reloads a concurrently changed roster` FAILS (no "Beto Roster") and `a failed assign shows its error, closes the dialog and still reloads` FAILS (`fetchRoster` called once). Restore the two lines exactly as in Step 3 (do **not** `git checkout` — that would discard the fix), then re-run the file → all 10 PASS.

- [ ] **Step 6: Full verification for the branch**

Run: `pnpm exec vitest run` → all pass. `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 7: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-team-detail-error-overwrite add src/teams/TeamDetailPage.tsx src/teams/TeamDetailPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-team-detail-error-overwrite commit -m "fix: keep a failed mutation's error instead of the reload error (#21)"
```

Branch close: report to the orchestrator; pre-PR review; PR to `develop` with `Closes #21`. If #22 merged first, rebase onto `develop` and re-run `pnpm exec vitest run` before merging.

---

## Branch `fix/add-player-dialog-stale-error` (#22)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-add-player-dialog-stale-error`.

### Task 5: Reset `AddPlayerDialog` after it exits and show "Cargando…"

**Files:**
- Modify: `src/teams/AddPlayerDialog.tsx` (`loading` state, effect callbacks, `handleRetry`, new `handleExited`, `Dialog` `slotProps`, content branch)
- Test: `src/teams/AddPlayerDialog.test.tsx` (import `act`, add a `deferred` helper, append 3 tests)

**Interfaces:**
- Consumes: MUI 9.1.2 `Dialog` `slotProps.transition` (`TransitionProps`, includes `onExited`; `TransitionProps` prop no longer exists). The `Modal` chains the child's `onExited` with its own, so unmounting still works. Exit duration `leavingScreen` = 195 ms.
- Produces: no new exports; `AddPlayerDialogProps` unchanged.

- [ ] **Step 1: Write the failing tests** — in `src/teams/AddPlayerDialog.test.tsx`, replace line 1 with:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
```

Add after the `p()` helper:

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
```

Append:

```tsx
test('closing with Cerrar after a failed load reopens in Cargando… without the stale error', async () => {
  mocks.fetchEligiblePlayers.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  const props = { categoryId: 'cat1', teamId: 'A', onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open {...props} />)
  await screen.findByRole('button', { name: 'Reintentar' })
  await user.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(props.onClose).toHaveBeenCalledTimes(1)
  rerender(<AddPlayerDialog open={false} {...props} />)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  rerender(<AddPlayerDialog open {...props} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  await act(async () => {
    rows.resolve([p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null })])
  })
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
})

test('reopening after the parent closes it shows Cargando… instead of the previous list', async () => {
  const props = { categoryId: 'cat1', teamId: 'A', onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open {...props} />)
  await screen.findByText('Free Agent')
  rerender(<AddPlayerDialog open={false} {...props} />)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  rerender(<AddPlayerDialog open {...props} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByText('Free Agent')).not.toBeInTheDocument()
  await act(async () => {
    rows.resolve([p({ id: 'new', full_name: 'Nuevo Agente', team_id: null, team_name: null })])
  })
  expect(await screen.findByText('Nuevo Agente')).toBeInTheDocument()
})

test('the first load shows Cargando… instead of the empty-list message', async () => {
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByText('No hay jugadores elegibles.')).not.toBeInTheDocument()
  await act(async () => {
    rows.resolve([p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null })])
  })
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
})
```

The tests wait for the dialog to leave the DOM before reopening: reopening during the 195 ms fade cancels the exit, `onExited` never runs, and the old state is kept (accepted edge case, spec §6.2).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: all 3 new tests FAIL on `findByText('Cargando…')` — test 1 still shows the stale Reintentar alert, test 2 still shows "Free Agent", test 3 shows "No hay jugadores elegibles.". The 5 existing tests pass.

- [ ] **Step 3: Implement** — in `src/teams/AddPlayerDialog.tsx`:

After `const [reloadKey, setReloadKey] = useState(0)` add:

```tsx
  const [loading, setLoading] = useState(true)
```

Replace the effect's `.then`/`.catch` chain:

```tsx
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setPlayers(rows)
        setSearch('')
        setPending(null)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
```

with:

```tsx
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setLoading(false)
        setPlayers(rows)
        setSearch('')
        setPending(null)
      })
      .catch(() => {
        if (!active) return
        setLoading(false)
        setLoadError(true)
      })
```

Replace `handleRetry` with, and add `handleExited` right after it:

```tsx
  function handleRetry() {
    setLoadError(false)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  // Reset after the exit fade (any close path) so closing never flashes and every reopen starts loading.
  function handleExited() {
    setLoadError(false)
    setLoading(true)
    setSearch('')
    setPending(null)
  }
```

Replace the outer `Dialog` opening tag:

```tsx
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
```

with:

```tsx
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onExited: handleExited } }}
    >
```

Inside the outer `DialogContent`, replace:

```tsx
        {loadError ? (
          <LoadError onRetry={handleRetry} />
        ) : (
```

with:

```tsx
        {loadError ? (
          <LoadError onRetry={handleRetry} />
        ) : loading ? (
          <Typography>Cargando…</Typography>
        ) : (
```

The **Cerrar** button and `Dialog onClose` keep calling `onClose` directly; the nested "Mover jugador" dialog does not change.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: all 8 tests PASS, including the existing "a failed load offers Reintentar inside the dialog" and "reopening after a failed load shows the list without a stale error" (that one reopens in the same tick, hits the accepted edge case, and still ends with the list).

- [ ] **Step 5: Full verification for the branch**

Run: `pnpm exec vitest run` → all pass (including `src/teams/TeamDetailPage.test.tsx`, which renders this dialog). `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-add-player-dialog-stale-error add src/teams/AddPlayerDialog.tsx src/teams/AddPlayerDialog.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/fix-add-player-dialog-stale-error commit -m "fix: reset AddPlayerDialog after it closes and show a loading state (#22)"
```

Branch close: report to the orchestrator; pre-PR review; PR to `develop` with `Closes #22`. If #21 merged first, rebase onto `develop` and re-run `pnpm exec vitest run` before merging.
