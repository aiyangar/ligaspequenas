# Players/Teams Tech-Debt Batch (#8–#11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Players and Teams screens trustworthy: read errors surface with a Retry button, missing records show a "not found" state, list filters key by id, and the team selector explains why it is disabled.

**Architecture:** Read functions in the data layer throw on Supabase errors; pages catch them with a per-load `loadError` + `reloadKey` pair and render a shared `LoadError` component. A shared `NotFoundState` component handles `null` reads. No database changes.

**Tech Stack:** React 19, react-router-dom (data router), MUI v9, Supabase JS, Vitest + Testing Library + user-event, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-13-tech-debt-players-teams-design.md` (read it before starting; section numbers below refer to it).

## Global Constraints

- One issue = one branch = one PR, base `main`: #11 `fix/team-selector-guard`, #10 `fix/filters-by-id`, #9 `fix/list-fetch-errors`, #8 `fix/not-found-state`.
- Delivery waves (spec §8): **Wave 1** = Task 1 (#11) ∥ Task 2 (#10), both from `main`. **Wave 2** = Tasks 3–8 (#9), cut from `main` only after #10 and #11 are merged. **Wave 3** = Tasks 9–11 (#8), cut from `fix/list-fetch-errors` (PR base `fix/list-fetch-errors`) or from `main` if #9 is already merged.
- Each implementer works in its own worktree outside the repo: `git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas worktree add /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/<branch-slug> -b <branch> <base>`, then `pnpm install --frozen-lockfile` inside it. Tests need no `.env` (`vite.config.ts` injects test env).
- Git inside a worktree: always `git -C <absolute worktree path> …`, **one git command per shell call**. Never use `CLAUDE_GIT_OVERRIDE`. Never push, open PRs or merge — report and wait.
- Code, identifiers, comments, commit messages: English. Comments only for a non-obvious *why*, one short line max. UI copy: Spanish, exactly as written in this plan.
- Exact UI strings: `No se pudo cargar la información.` · `Reintentar` · `No se pudieron cargar los equipos.` · `No se pudo actualizar la vista. Recarga la página.` (TeamDetailPage) · `Error: no se pudo actualizar la vista. Recarga la página.` (PlayerFormPage) · `Jugador no encontrado` · `Equipo no encontrado` · `Volver a Jugadores` · `Volver a Equipos` · `Solo lectura: solo un administrador puede cambiar el equipo.` · `No hay liga activa.` · `Cargando…`
- Routes: players list is `/` (there is **no** `/jugadores` route); teams list is `/equipos`.
- Lint rules that bite: `react-hooks/set-state-in-effect` (no synchronous setState in an effect body — reset state in handlers or inside async callbacks); `react-hooks/exhaustive-deps` (`reloadKey` goes in the **`useEffect`** deps, never in a `useCallback`'s).
- In tests, find alerts by button name or text (`getByRole('button', { name: 'Reintentar' })`, `findByText(...)`), never by bare `getByRole('alert')`.
- Every branch closes with all three green: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`.

## Review Focus

- **Error clears on any successful reload, not only Retry** — reopening `AddPlayerDialog` after a failed load must show the list, not a stale error (pinned in Task 7).
- **Partial failure in PlayerFormPage** — teams/season failing must not hide the player form, and its Retry must not refetch the player (pinned in Task 8).
- **Post-mutation reload failure severity** — the PlayerFormPage message must render as an error, not green success (pinned in Task 8 via `MuiAlert-colorError`).
- **Loading vs not-found vs error ordering** — a `null` read must never be shown as "Cargando…" forever or as a blank editable form (pinned in Tasks 10–11).
- **Back link targets real routes** — "Volver a Jugadores" must link to `/` (pinned in Task 11 with an `href` assertion).

---

## Wave 1 — branch `fix/team-selector-guard` (#11)

### Task 1: Team selector readonly hint and tenantId guard

**Files:**
- Modify: `src/players/PlayerFormPage.tsx` (the `teamSelectDisabled` const, `handleTeamChange`, and the team `TextField`'s `helperText`)
- Test: `src/players/PlayerFormPage.test.tsx` (append)

**Interfaces:**
- Consumes: `useTenant()` → `{ role, tenantId: string | null }`; `isAdmin(role)`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests** — append to `src/players/PlayerFormPage.test.tsx`:

```tsx
test('readonly sees the team selector disabled with a read-only hint', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 'tenant-1' })
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  expect(await screen.findByLabelText('Equipo')).toBeDisabled()
  expect(screen.getByText('Solo lectura: solo un administrador puede cambiar el equipo.')).toBeInTheDocument()
})

test('without an active tenant the team selector is disabled with a hint', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: null })
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  expect(await screen.findByLabelText('Equipo')).toBeDisabled()
  expect(screen.getByText('No hay liga activa.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: the two new tests FAIL (no hint text; the no-tenant selector is enabled). The 9 existing tests pass.

- [ ] **Step 3: Implement** — in `src/players/PlayerFormPage.tsx`:

Replace the `teamSelectDisabled` declaration with:

```tsx
  const teamSelectDisabled =
    !canEdit || !tenantId || !season || row?.status === 'baja' || row?.category_id == null
```

Replace the whole `handleTeamChange` function with:

```tsx
  async function handleTeamChange(next: string) {
    if (!row || !season || !tenantId) return
    let res
    if (next === '') res = await removeFromRoster(row.id, season.id)
    else if (currentTeamId === '') res = await assignPlayer(next, row.id, tenantId, season.id)
    else res = await movePlayer(row.id, season.id, next)
    if (!res.ok) {
      setMessage(`Error: ${res.error ?? 'no se pudo actualizar el equipo'}`)
      return
    }
    const refreshed = await fetchPlayer(row.id)
    if (refreshed) setRow(refreshed)
  }
```

Replace the team `TextField`'s `helperText` prop with:

```tsx
            helperText={
              !canEdit
                ? 'Solo lectura: solo un administrador puede cambiar el equipo.'
                : !tenantId
                  ? 'No hay liga activa.'
                  : row.category_id == null
                    ? 'Fuera de categoría: no asignable a un equipo.'
                    : !season
                      ? 'No hay temporada activa.'
                      : row.status === 'baja'
                        ? 'Jugador de baja: no asignable.'
                        : undefined
            }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: all 11 tests PASS.

- [ ] **Step 5: Full verification**

Run: `pnpm exec vitest run` → all pass (110). `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C <worktree> commit -m "fix: explain and guard the disabled team selector (#11)"
```

---

## Wave 1 — branch `fix/filters-by-id` (#10)

### Task 2: Key players-list filters by id

**Files:**
- Modify: `src/players/PlayersPage.tsx` (filter state, option derivation, filter predicate, the two `<option>` maps)
- Test: `src/players/PlayersPage.test.tsx` (append)

**Interfaces:**
- Consumes: `PlayerRow` fields `category_id`, `category_name`, `team_id`, `team_name` (all `string | null`).
- Produces: no new exports (the helper below is module-private).

- [ ] **Step 1: Write the failing tests** — append to `src/players/PlayersPage.test.tsx`:

```tsx
test('team filter distinguishes teams that share a name', async () => {
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p1', full_name: 'Ana Ruiz', team_id: 'tA', team_name: 'Rojo' }),
    player({ id: 'p3', full_name: 'Carla Paz', team_id: 'tB', team_name: 'Rojo' }),
  ])
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Carla Paz')
  await user.selectOptions(screen.getByLabelText('Equipo'), 'tA')
  await waitFor(() => expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})

test('category filter distinguishes categories that share a name', async () => {
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p1', full_name: 'Ana Ruiz', category_id: 'cat1', category_name: 'Infantil Mayor' }),
    player({ id: 'p3', full_name: 'Carla Paz', category_id: 'cat2', category_name: 'Infantil Mayor' }),
  ])
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Carla Paz')
  await user.selectOptions(screen.getByLabelText('Categoría'), 'cat1')
  await waitFor(() => expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: both new tests FAIL (no option with value `tA` / `cat1`). Existing tests pass.

- [ ] **Step 3: Implement** — in `src/players/PlayersPage.tsx`:

Add above `export function PlayersPage()`:

```tsx
interface FilterOption {
  id: string
  name: string
}

function uniqueOptions(pairs: Array<[string | null, string | null]>): FilterOption[] {
  const byId = new Map<string, string>()
  for (const [id, name] of pairs) if (id && name) byId.set(id, name)
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}
```

Replace the `category` and `team` state lines with:

```tsx
  const [categoryId, setCategoryId] = useState('')
  const [teamId, setTeamId] = useState('')
```

Replace the `categories` and `teams` `useMemo`s with:

```tsx
  const categories = useMemo(
    () => uniqueOptions(players.map((p) => [p.category_id, p.category_name])),
    [players],
  )

  const teams = useMemo(
    () => uniqueOptions(players.map((p) => [p.team_id, p.team_name])),
    [players],
  )
```

In `visible`, replace the category and team predicates with:

```tsx
    if (categoryId && p.category_id !== categoryId) return false
    if (teamId && p.team_id !== teamId) return false
```

Category `TextField`: `value={categoryId}`, `onChange={(e) => setCategoryId(e.target.value)}`, and its options:

```tsx
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
```

Team `TextField`: `value={teamId}`, `onChange={(e) => setTeamId(e.target.value)}`, and its options:

```tsx
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: all 9 tests PASS (the existing `team filter narrows to a single team` still passes: user-event matches an option by label text too).

- [ ] **Step 5: Full verification**

Run: `pnpm exec vitest run` → all pass (110). `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx
git -C <worktree> commit -m "fix: key players-list filters by id instead of name (#10)"
```

---

## Wave 2 — branch `fix/list-fetch-errors` (#9), from `main` after #10 and #11 are merged

Tasks 3–8 run sequentially on the same branch/worktree (later tasks consume Task 3–4 outputs).

### Task 3: Data layer throws on read errors

**Files:**
- Modify: `src/players/players.ts` (`fetchPlayers`, `fetchPlayer`), `src/teams/teams.ts` (`fetchActiveSeason`, `fetchCategories`, `fetchTeams`, `fetchTeam`, `fetchRoster`, `fetchEligiblePlayers`)
- Test: `src/players/players.test.ts`, `src/teams/teams.test.ts` (append)

**Interfaces:**
- Produces: the 8 read functions keep their signatures but now **reject with `Error(message)`** when Supabase returns `error`. `null` / `[]` mean only "no data".

- [ ] **Step 1: Write the failing tests**

Append to `src/players/players.test.ts`:

```ts
test('fetchPlayers throws when Supabase returns an error', async () => {
  mocks.order.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(fetchPlayers()).rejects.toThrow('boom')
})

test('fetchPlayer throws when Supabase returns an error', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(fetchPlayer('p1')).rejects.toThrow('boom')
})
```

Append to `src/teams/teams.test.ts`:

```ts
test.each([
  ['fetchCategories', () => fetchCategories()],
  ['fetchTeams', () => fetchTeams()],
  ['fetchRoster', () => fetchRoster('team9')],
  ['fetchEligiblePlayers', () => fetchEligiblePlayers('cat1', 'team9')],
])('%s throws when Supabase returns an error', async (_name, call) => {
  mocks.order.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(call()).rejects.toThrow('boom')
})

test.each([
  ['fetchActiveSeason', () => fetchActiveSeason()],
  ['fetchTeam', () => fetchTeam('team9')],
])('%s throws when Supabase returns an error', async (_name, call) => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(call()).rejects.toThrow('boom')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/players/players.test.ts src/teams/teams.test.ts`
Expected: the 8 new tests FAIL ("promise resolved … instead of rejecting").

- [ ] **Step 3: Implement** — in each of the 8 functions destructure `error` and throw before returning. Exact bodies:

`src/players/players.ts`:

```ts
export async function fetchPlayers(): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players_with_category')
    .select('*')
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as PlayerRow[] | null) ?? []
}

export async function fetchPlayer(id: string): Promise<PlayerRow | null> {
  const { data, error } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PlayerRow | null) ?? null
}
```

`src/teams/teams.ts`:

```ts
export async function fetchActiveSeason(): Promise<SeasonRow | null> {
  const { data, error } = await supabase.from('seasons').select('*').eq('is_active', true).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as SeasonRow | null) ?? null
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as CategoryRow[] | null) ?? []
}

export async function fetchTeams(): Promise<TeamRow[]> {
  const { data, error } = await supabase
    .from('teams_with_meta')
    .select('*')
    .eq('season_is_active', true)
    .order('category_sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data as TeamRow[] | null) ?? []
  return rows.sort((a, b) =>
    a.category_sort_order - b.category_sort_order || a.name.localeCompare(b.name),
  )
}

export async function fetchTeam(id: string): Promise<TeamRow | null> {
  const { data, error } = await supabase.from('teams_with_meta').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as TeamRow | null) ?? null
}

export async function fetchRoster(teamId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('team_id', teamId)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as PlayerRow[] | null) ?? []
}

export async function fetchEligiblePlayers(categoryId: string, teamId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('category_id', categoryId)
    .eq('status', 'activo')
    .or(`team_id.is.null,team_id.neq.${teamId}`)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as PlayerRow[] | null) ?? []
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/players/players.test.ts src/teams/teams.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add src/players/players.ts src/players/players.test.ts src/teams/teams.ts src/teams/teams.test.ts
git -C <worktree> commit -m "fix: throw on Supabase read errors instead of returning empty data (#9)"
```

### Task 4: `LoadError` component

**Files:**
- Create: `src/app/LoadError.tsx`
- Test: `src/app/LoadError.test.tsx`

**Interfaces:**
- Produces: `export function LoadError(props: { onRetry: () => void; message?: string })` — default message `No se pudo cargar la información.`; renders an MUI error `Alert` with a `Reintentar` button.

- [ ] **Step 1: Write the failing test** — `src/app/LoadError.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { LoadError } from './LoadError'

test('shows the default message and retries on click', async () => {
  const onRetry = vi.fn()
  const user = userEvent.setup()
  render(<LoadError onRetry={onRetry} />)
  expect(screen.getByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test('accepts a custom message', () => {
  render(<LoadError onRetry={vi.fn()} message="No se pudieron cargar los equipos." />)
  expect(screen.getByText('No se pudieron cargar los equipos.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/app/LoadError.test.tsx`
Expected: FAIL — cannot resolve `./LoadError`.

- [ ] **Step 3: Implement** — `src/app/LoadError.tsx`:

```tsx
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

export interface LoadErrorProps {
  onRetry: () => void
  message?: string
}

export function LoadError({ onRetry, message = 'No se pudo cargar la información.' }: LoadErrorProps) {
  return (
    <Alert
      severity="error"
      sx={{ mt: 2 }}
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          Reintentar
        </Button>
      }
    >
      {message}
    </Alert>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/app/LoadError.test.tsx`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add src/app/LoadError.tsx src/app/LoadError.test.tsx
git -C <worktree> commit -m "feat: add LoadError alert with retry (#9)"
```

### Task 5: Retry on the list pages (`PlayersPage`, `TeamsPage`)

**Files:**
- Modify: `src/players/PlayersPage.tsx`, `src/teams/TeamsPage.tsx`
- Test: `src/players/PlayersPage.test.tsx`, `src/teams/TeamsPage.test.tsx` (append)

**Interfaces:**
- Consumes: `LoadError` (Task 4); `fetchPlayers`/`fetchTeams` reject on error (Task 3).

- [ ] **Step 1: Write the failing tests**

Append to `src/players/PlayersPage.test.tsx`:

```tsx
test('a failed load offers Reintentar and retrying shows the list', async () => {
  mocks.fetchPlayers.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  expect(mocks.fetchPlayers).toHaveBeenCalledTimes(2)
})
```

Append to `src/teams/TeamsPage.test.tsx` (add `import userEvent from '@testing-library/user-event'` at the top):

```tsx
test('a failed load offers Reintentar instead of the empty state', async () => {
  mocks.fetchTeams.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  expect(screen.queryByText(/No hay equipos/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('MTY AC Rojo')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx src/teams/TeamsPage.test.tsx`
Expected: the 2 new tests FAIL (no error text; unhandled rejection).

- [ ] **Step 3: Implement**

`src/players/PlayersPage.tsx` — add `import { LoadError } from '../app/LoadError'`. Below the existing `useState`s add:

```tsx
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
```

Replace the load `useEffect` with:

```tsx
  useEffect(() => {
    let active = true
    void load()
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setPlayers(rows)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [load, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }
```

In the JSX, keep the header `Stack` (title + "Nuevo jugador"); wrap the filters `Stack` and the `List` so that they render only without error:

```tsx
      {loadError ? (
        <LoadError onRetry={handleRetry} />
      ) : (
        <>
          {/* existing filters <Stack> … </Stack> unchanged */}
          {/* existing <List> … </List> unchanged */}
        </>
      )}
```

(Move the two existing elements inside the fragment verbatim — do not leave the JSX comments.)

`src/teams/TeamsPage.tsx` — add `import { LoadError } from '../app/LoadError'`, the same two `useState`s, and replace the effect with:

```tsx
  useEffect(() => {
    let active = true
    void load()
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setTeams(rows)
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [load, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }
```

In the JSX, after the header `Stack`, render `{loadError && <LoadError onRetry={handleRetry} />}` and change the empty-state condition to `loaded && !loadError && teams.length === 0`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx src/teams/TeamsPage.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Lint check**

Run: `pnpm lint`
Expected: no errors (in particular none from `react-hooks/*`).

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx src/teams/TeamsPage.tsx src/teams/TeamsPage.test.tsx
git -C <worktree> commit -m "fix: show a retryable error when the players or teams list fails to load (#9)"
```

### Task 6: Retry on `TeamFormPage` and `TeamDetailPage`, guarded post-mutation refresh

**Files:**
- Modify: `src/teams/TeamFormPage.tsx`, `src/teams/TeamDetailPage.tsx`
- Test: `src/teams/TeamFormPage.test.tsx`, `src/teams/TeamDetailPage.test.tsx` (append)

**Interfaces:**
- Consumes: `LoadError` (Task 4); `fetchTeam`, `fetchCategories`, `fetchActiveSeason`, `fetchRoster` reject on error (Task 3).

- [ ] **Step 1: Write the failing tests**

Append to `src/teams/TeamFormPage.test.tsx`:

```tsx
test('a failed load offers Reintentar and retrying shows the form', async () => {
  mocks.fetchCategories.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/equipos/nuevo')
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
})
```

Append to `src/teams/TeamDetailPage.test.tsx`:

```tsx
test('a failed load offers Reintentar and retrying shows the team', async () => {
  mocks.fetchTeam.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('heading', { name: /MTY AC Rojo/ })).toBeInTheDocument()
})

test('a failed refresh after a mutation shows an error without losing the page', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.fetchRoster.mockRejectedValueOnce(new Error('boom'))
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  expect(await screen.findByText('No se pudo actualizar la vista. Recarga la página.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /MTY AC Rojo/ })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/teams/TeamFormPage.test.tsx src/teams/TeamDetailPage.test.tsx`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement**

`src/teams/TeamFormPage.tsx` — add `import { LoadError } from '../app/LoadError'`; add `const [loadError, setLoadError] = useState(false)` and `const [reloadKey, setReloadKey] = useState(0)` with the other state. Replace the effect with:

```tsx
  useEffect(() => {
    let active = true
    void Promise.all([
      fetchCategories(),
      fetchActiveSeason(),
      id ? fetchTeam(id) : Promise.resolve(null),
    ])
      .then(([cats, s, team]) => {
        if (!active) return
        setLoadError(false)
        setCategories(cats)
        setSeason(s)
        if (team) {
          setValues({ name: team.name, category_id: team.category_id, coach: team.coach ?? '', color: team.color ?? '' })
          setCategoryLocked(team.player_count > 0)
        } else if (!editing) {
          setValues((v) => ({ ...v, category_id: v.category_id || cats[0]?.id || '' }))
        }
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [id, editing, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }
```

Immediately before `if (!loaded) return …`, add:

```tsx
  if (loadError) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <LoadError onRetry={handleRetry} />
      </Box>
    )
  }
```

`src/teams/TeamDetailPage.tsx` — add `import { LoadError } from '../app/LoadError'`; add `const [loadError, setLoadError] = useState(false)` and `const [reloadKey, setReloadKey] = useState(0)` with the other state. Replace the mount effect with:

```tsx
  useEffect(() => {
    let active = true
    void load()
      .then((res) => {
        if (!active || !res) return
        setLoadError(false)
        setTeam(res.team)
        setRoster(res.roster)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [load, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }
```

Immediately before `if (!team) return …`, add:

```tsx
  if (loadError) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
        <LoadError onRetry={handleRetry} />
      </Box>
    )
  }
```

After `if (!team) return …`, add a guarded refresh and use it in `handleAssign`, `handleMove` and `handleRemove` (replace each `await refresh()` with `await safeRefresh()`):

```tsx
  async function safeRefresh() {
    try {
      await refresh()
    } catch {
      setError('No se pudo actualizar la vista. Recarga la página.')
    }
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/teams/TeamFormPage.test.tsx src/teams/TeamDetailPage.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Lint check**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add src/teams/TeamFormPage.tsx src/teams/TeamFormPage.test.tsx src/teams/TeamDetailPage.tsx src/teams/TeamDetailPage.test.tsx
git -C <worktree> commit -m "fix: retryable load errors and guarded refresh on team pages (#9)"
```

### Task 7: Retry inside `AddPlayerDialog`

**Files:**
- Modify: `src/teams/AddPlayerDialog.tsx`
- Test: `src/teams/AddPlayerDialog.test.tsx` (append)

**Interfaces:**
- Consumes: `LoadError` (Task 4); `fetchEligiblePlayers` rejects on error (Task 3). Props unchanged.

- [ ] **Step 1: Write the failing tests** — append to `src/teams/AddPlayerDialog.test.tsx`:

```tsx
test('a failed load offers Reintentar inside the dialog', async () => {
  mocks.fetchEligiblePlayers.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={vi.fn()} onClose={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
})

test('reopening after a failed load shows the list without a stale error', async () => {
  mocks.fetchEligiblePlayers.mockRejectedValueOnce(new Error('boom'))
  const props = { categoryId: 'cat1', teamId: 'A', onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open {...props} />)
  await screen.findByRole('button', { name: 'Reintentar' })
  rerender(<AddPlayerDialog open={false} {...props} />)
  rerender(<AddPlayerDialog open {...props} />)
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: the 2 new tests FAIL (no Reintentar button).

- [ ] **Step 3: Implement** — in `src/teams/AddPlayerDialog.tsx`: add `import { LoadError } from '../app/LoadError'`; add `const [loadError, setLoadError] = useState(false)` and `const [reloadKey, setReloadKey] = useState(0)`. Replace the effect with:

```tsx
  // Reset search/pending inside the async callback (not synchronously in the
  // effect body) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!open) return
    let active = true
    void fetchEligiblePlayers(categoryId, teamId)
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
    return () => {
      active = false
    }
  }, [open, categoryId, teamId, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }
```

In the outer `DialogContent`, render `LoadError` instead of the search field, empty message and groups when `loadError`:

```tsx
      <DialogContent>
        {loadError ? (
          <LoadError onRetry={handleRetry} />
        ) : (
          <>
            {/* existing search TextField, empty-state Typography and groups.map unchanged */}
          </>
        )}
      </DialogContent>
```

(Move the three existing elements inside the fragment verbatim — do not leave the JSX comment.)

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add src/teams/AddPlayerDialog.tsx src/teams/AddPlayerDialog.test.tsx
git -C <worktree> commit -m "fix: retryable load error in the add-player dialog (#9)"
```

### Task 8: Two independent retryable loads in `PlayerFormPage`

**Files:**
- Modify: `src/players/PlayerFormPage.tsx` (this branch already contains #11's changes from Task 1)
- Test: `src/players/PlayerFormPage.test.tsx` (append)

**Interfaces:**
- Consumes: `LoadError` (Task 4); `fetchPlayer`, `fetchTeams`, `fetchActiveSeason` reject on error (Task 3).

- [ ] **Step 1: Write the failing tests** — append to `src/players/PlayerFormPage.test.tsx`:

```tsx
test('a failed player load offers Reintentar and retrying shows the form', async () => {
  mocks.fetchPlayer.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeInTheDocument()
})

test('a failed teams load keeps the form and retries only the teams', async () => {
  mocks.fetchTeams.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeInTheDocument()
  expect(await screen.findByText('No se pudieron cargar los equipos.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByLabelText('Equipo')).toBeInTheDocument()
  expect(mocks.fetchTeams).toHaveBeenCalledTimes(2)
  expect(mocks.fetchPlayer).toHaveBeenCalledTimes(1)
})

test('a failed refresh after changing team shows an error-severity message', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  mocks.fetchPlayer.mockRejectedValueOnce(new Error('boom'))
  await user.selectOptions(await screen.findByLabelText('Equipo'), 'team9')
  const msg = await screen.findByText('Error: no se pudo actualizar la vista. Recarga la página.')
  expect(msg.closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorError')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement** — in `src/players/PlayerFormPage.tsx`: add `import { LoadError } from '../app/LoadError'`. Add, next to the existing state:

```tsx
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [teamsLoadError, setTeamsLoadError] = useState(false)
  const [teamsReloadKey, setTeamsReloadKey] = useState(0)
```

Replace the player effect with:

```tsx
  useEffect(() => {
    if (!id) return
    let active = true
    void fetchPlayer(id)
      .then((r) => {
        if (!active) return
        setLoadError(false)
        if (!r) return
        setRow(r)
        setValues(rowToValues(r))
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [id, reloadKey])
```

Replace the teams/season effect with:

```tsx
  useEffect(() => {
    if (!editing) return
    let active = true
    void Promise.all([fetchTeams(), fetchActiveSeason()])
      .then(([ts, s]) => {
        if (!active) return
        setTeamsLoadError(false)
        setTeams(ts)
        setSeason(s)
      })
      .catch(() => {
        if (active) setTeamsLoadError(true)
      })
    return () => {
      active = false
    }
  }, [editing, teamsReloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }

  function handleTeamsRetry() {
    setTeamsLoadError(false)
    setTeamsReloadKey((k) => k + 1)
  }
```

In `handleTeamChange`, replace the last two lines (`const refreshed = …` / `if (refreshed) setRow(refreshed)`) with:

```tsx
    try {
      const refreshed = await fetchPlayer(row.id)
      if (refreshed) setRow(refreshed)
    } catch {
      setMessage('Error: no se pudo actualizar la vista. Recarga la página.')
    }
```

Immediately before the component's main `return (`, add:

```tsx
  if (loadError) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <LoadError onRetry={handleRetry} />
      </Box>
    )
  }
```

Replace `{editing && row && ( <TextField select label="Equipo" …>…</TextField> )}` with:

```tsx
        {editing && row && (teamsLoadError ? (
          <LoadError message="No se pudieron cargar los equipos." onRetry={handleTeamsRetry} />
        ) : (
          /* the existing team <TextField select label="Equipo" …>…</TextField>, unchanged */
        ))}
```

(Put the existing `TextField` element there verbatim — do not leave the JSX comment.)

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Full verification for the branch**

Run: `pnpm exec vitest run` → all pass. `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C <worktree> commit -m "fix: independent retryable loads on the player page (#9)"
```

---

## Wave 3 — branch `fix/not-found-state` (#8), from `fix/list-fetch-errors` (or `main` once #9 is merged)

### Task 9: `NotFoundState` component

**Files:**
- Create: `src/app/NotFoundState.tsx`
- Test: `src/app/NotFoundState.test.tsx`

**Interfaces:**
- Produces: `export function NotFoundState(props: { title: string; backTo: string; backLabel: string })` — MUI warning `Alert` with a router-link button.

- [ ] **Step 1: Write the failing test** — `src/app/NotFoundState.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { NotFoundState } from './NotFoundState'

test('renders the title and a link back to the list', async () => {
  const router = createMemoryRouter(
    [{ path: '/x', element: <NotFoundState title="Equipo no encontrado" backTo="/equipos" backLabel="Volver a Equipos" /> }],
    { initialEntries: ['/x'] },
  )
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Equipo no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Equipos' })).toHaveAttribute('href', '/equipos')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/app/NotFoundState.test.tsx`
Expected: FAIL — cannot resolve `./NotFoundState`.

- [ ] **Step 3: Implement** — `src/app/NotFoundState.tsx`:

```tsx
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

export interface NotFoundStateProps {
  title: string
  backTo: string
  backLabel: string
}

export function NotFoundState({ title, backTo, backLabel }: NotFoundStateProps) {
  return (
    <Alert
      severity="warning"
      sx={{ mt: 2 }}
      action={
        <Button color="inherit" size="small" component={RouterLink} to={backTo}>
          {backLabel}
        </Button>
      }
    >
      {title}
    </Alert>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/app/NotFoundState.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add src/app/NotFoundState.tsx src/app/NotFoundState.test.tsx
git -C <worktree> commit -m "feat: add NotFoundState with a back link (#8)"
```

### Task 10: Not-found on the team pages

**Files:**
- Modify: `src/teams/TeamDetailPage.tsx`, `src/teams/TeamFormPage.tsx`
- Test: `src/teams/TeamDetailPage.test.tsx`, `src/teams/TeamFormPage.test.tsx` (append)

**Interfaces:**
- Consumes: `NotFoundState` (Task 9); `LoadError` + `loadError`/`reloadKey` state already present from #9.

- [ ] **Step 1: Write the failing tests**

Append to `src/teams/TeamDetailPage.test.tsx`:

```tsx
test('a missing team shows not-found with a link back to Equipos', async () => {
  mocks.fetchTeam.mockResolvedValue(null)
  renderPage()
  expect(await screen.findByText('Equipo no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Equipos' })).toHaveAttribute('href', '/equipos')
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
})
```

Append to `src/teams/TeamFormPage.test.tsx`:

```tsx
test('editing a missing team shows not-found instead of a blank form', async () => {
  mocks.fetchTeam.mockResolvedValue(null)
  renderAt('/equipos/missing/editar')
  expect(await screen.findByText('Equipo no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Equipos' })).toHaveAttribute('href', '/equipos')
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx src/teams/TeamFormPage.test.tsx`
Expected: the 2 new tests FAIL (detail stays on "Cargando…"; form renders blank).

- [ ] **Step 3: Implement**

`src/teams/TeamDetailPage.tsx` — add `import { NotFoundState } from '../app/NotFoundState'`; add `const [loaded, setLoaded] = useState(false)`. In the mount effect's `.then`, after `setRoster(res.roster)`, add `setLoaded(true)`. Replace the early returns so the order is `loadError` → `!loaded` → `!team` (the `loadError` block from #9 stays first):

```tsx
  if (!loaded) return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  if (!team) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
        <NotFoundState title="Equipo no encontrado" backTo="/equipos" backLabel="Volver a Equipos" />
      </Box>
    )
  }
```

`src/teams/TeamFormPage.tsx` — add `import { NotFoundState } from '../app/NotFoundState'`; add `const [notFound, setNotFound] = useState(false)`. In the effect's `.then`, right after `setSeason(s)`, add `setNotFound(editing && !team)`. After `if (!loaded) return …` and **before** the `!editing && !season` block, add:

```tsx
  if (notFound) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <NotFoundState title="Equipo no encontrado" backTo="/equipos" backLabel="Volver a Equipos" />
      </Box>
    )
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx src/teams/TeamFormPage.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add src/teams/TeamDetailPage.tsx src/teams/TeamDetailPage.test.tsx src/teams/TeamFormPage.tsx src/teams/TeamFormPage.test.tsx
git -C <worktree> commit -m "fix: show not-found on team pages for missing ids (#8)"
```

### Task 11: Not-found on `PlayerFormPage`

**Files:**
- Modify: `src/players/PlayerFormPage.tsx`
- Test: `src/players/PlayerFormPage.test.tsx` (append)

**Interfaces:**
- Consumes: `NotFoundState` (Task 9); `loadError`/`reloadKey` state from #9.

- [ ] **Step 1: Write the failing tests** — append to `src/players/PlayerFormPage.test.tsx`:

```tsx
test('a missing player shows not-found with a link back to the list at /', async () => {
  mocks.fetchPlayer.mockResolvedValue(null)
  renderAt('/jugadores/missing')
  expect(await screen.findByText('Jugador no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Jugadores' })).toHaveAttribute('href', '/')
  expect(screen.queryByLabelText(/Nombre completo/)).not.toBeInTheDocument()
})

test('edit mode shows Cargando… instead of an empty form while loading', async () => {
  mocks.fetchPlayer.mockReturnValue(new Promise(() => {}))
  renderAt('/jugadores/p1')
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByLabelText(/Nombre completo/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: the 2 new tests FAIL (blank form is rendered).

- [ ] **Step 3: Implement** — in `src/players/PlayerFormPage.tsx`: add `import { NotFoundState } from '../app/NotFoundState'`; add `const [loaded, setLoaded] = useState(false)`. In the player effect's `.then`, right after `setLoadError(false)`, add `setLoaded(true)` (before the `if (!r) return`). After the `if (loadError) { … }` block from #9, add:

```tsx
  if (editing && !loaded) return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  if (editing && !row) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <NotFoundState title="Jugador no encontrado" backTo="/" backLabel="Volver a Jugadores" />
      </Box>
    )
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Full verification for the branch**

Run: `pnpm exec vitest run` → all pass. `pnpm exec tsc -b` → exit 0. `pnpm lint` → no errors.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C <worktree> commit -m "fix: show not-found and loading states on the player page (#8)"
```
