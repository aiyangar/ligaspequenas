# Player Registry (list + detail/edit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the player-registry core of Phase 3 — a searchable/filterable player list with auto-computed category, plus a create/edit/detail form for player + tutor + affiliation data, with the six document rows auto-seeded when a player is created.

**Architecture:** A new `src/players/` feature module. Reads go through the existing `players_with_category` Postgres view (which supplies the derived category); writes go to the `players` table with an explicit `tenant_id` (RLS scopes reads automatically but requires `tenant_id` + admin on writes). Creating a player auto-seeds its six `documents` rows via a new `AFTER INSERT` DB trigger, so the seeding is atomic and cannot be bypassed. The UI follows the codebase's existing MUI-v9 + returning-fetch conventions. Document status editing, the consent lock, uploads, payments, "quién debe", and Excel export are OUT OF SCOPE — they are later Phase-3 plans that build on this one.

**Tech Stack:** Vite + React 19 + TypeScript (strict) + MUI v9 + react-router-dom v7 + Supabase JS (`@supabase/supabase-js`) + Vitest + @testing-library/react. Package manager: pnpm. DB changes applied to remote Supabase `main` via the Supabase MCP (`apply_migration` / `execute_sql`) — there is no local Docker stack and no MCP branching.

## Global Constraints

- **Branch:** all work on a single `feature/players-registry` branch. NEVER commit to `main` or `develop`. Create the branch (or a git worktree via `superpowers:using-git-worktrees`) before Task 1.
- **Language:** prose/UI copy in Spanish; all identifiers, types, and code in English. No code comments unless they explain a non-obvious *why* (one line max).
- **Exports:** named exports only (no `default`). Feature files live under `src/players/`. Import paths are relative (no `@/` alias).
- **MUI v9:** configure inputs via `slotProps` (`select`, `inputLabel`, `htmlInput`) — NEVER `SelectProps`/`InputLabelProps`/`inputProps`. `Stack` `alignItems` goes via `sx`, never as a direct prop. Import each MUI component from its own deep path (`@mui/material/Box`), never a barrel import. This codebase uses `TextField select` with native `<option>` children — NOT `Select`/`MenuItem`.
- **Required-field label queries:** MUI appends a trailing `" *"` to a `required` field's accessible label (e.g. the label becomes `"Nombre completo *"`). In tests, query required fields with a **regex** (`getByLabelText(/Nombre completo/)`), never the bare exact string, or the query throws "Unable to find a label". Non-required fields keep exact-string queries.
- **Data access:** the shared client is `import { supabase } from '../lib/supabase'`. Reads rely on RLS for tenant isolation — do NOT add `.eq('tenant_id', …)` to selects. Writes (`insert`) MUST include `tenant_id` from `useTenant().tenantId` (column is `NOT NULL` and RLS `with check` requires `tenant_id = current_tenant_id()`). Only `admin` can write; `readonly` writes are blocked by RLS and their controls must not render.
- **Category display:** always format via `categoryLabel(name, year)` from `src/lib/category.ts`; do not re-implement age/category math (it lives in the DB view).
- **Secrets:** never reference the service_role key client-side. Env vars stay `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Commands:** typecheck `pnpm exec tsc -b` (expect exit 0); tests `pnpm exec vitest run` (whole suite) or `pnpm exec vitest run <file>` (single file); lint `pnpm lint` must stay exit 0. `posts-comunidad.txt` in the repo root is intentionally untracked — never `git add -A`; stage explicit paths only.

## Data contract (verified live against Supabase `main`, 2026-07-02)

`players` columns: `id uuid pk`, `tenant_id uuid NOT NULL`, `full_name text NOT NULL`, `birth_date date NOT NULL`, `curp text NULL`, `photo_path text NULL`, `status player_status NOT NULL default 'activo'`, `enrollment_date date NOT NULL default current_date`, `tutor_name text NOT NULL`, `tutor_whatsapp text NOT NULL`, `tutor_email text NULL`, `emergency_contact_name text NULL`, `emergency_contact_phone text NULL`, `affiliation_status affiliation_status NOT NULL default 'pendiente'`, `affiliation_date date NULL`, `created_at`, `updated_at`.

`players_with_category` view output = all `players` columns **plus** `edad_liga int` (null when no active season), `division text` (null when out of range), `category_name text` (aliased from `categories.name`; null when out of range), `category_year int` (1-indexed year within category; null when out of range). View is `security_invoker = true`, so RLS applies through it.

Enums: `player_status ('activo','baja')`, `affiliation_status ('autoriza','no_autoriza','pendiente')`, `document_type ('curp','birth_certificate','proof_of_address','image_consent','privacy_notice','medical_clearance')`, `document_status ('pendiente','fisico','digital')`.

`documents`: `unique (player_id, doc_type)`; composite FK `(player_id, tenant_id) → players(id, tenant_id) on delete cascade` (introduced in migration `0006`, not the base `0001` schema — this cascade is what makes Task 1's fixture cleanup delete the seeded docs); `status` default `'pendiente'`. RLS on `players`/`documents`/`payments` is identical: SELECT `tenant_id = private.current_tenant_id()`; INSERT/UPDATE/DELETE additionally require `private.is_admin()`.

Seed constants: tenant `00000000-0000-0000-0000-000000000001` (Liga MTY AC), active season `2026-2027` cutoff `2027-04-30`, 9 contiguous categories covering `edad_liga` 3–23.

## File Structure

- `supabase/migrations/0008_seed_player_documents.sql` — **create.** Trigger fn `private.seed_player_documents()` + `AFTER INSERT` trigger on `players`. Owns: auto-seeding the six document rows.
- `src/players/players.ts` — **create.** Data layer: enum/row/form types, read fns (`fetchPlayers`, `fetchPlayer`), the `playerCategoryText` presenter, write fns (`createPlayer`, `updatePlayer`), and form-value mappers (`emptyPlayer`, `rowToValues`, internal `toRecord`). Owns: all Supabase access + type contracts for players.
- `src/players/players.test.ts` — **create.** Unit tests for the data layer (mocked `supabase`).
- `src/players/PlayerForm.tsx` — **create.** Presentational controlled form (player + tutor + emergency + affiliation fields + read-only category). No data access. Owns: field rendering + change plumbing.
- `src/players/PlayerForm.test.tsx` — **create.**
- `src/players/PlayerFormPage.tsx` — **create.** Route glue for `/jugadores/nuevo` (create) and `/jugadores/:id` (edit for admin, read-only for readonly): loads the player, wires create/update, shows feedback, redirects. Owns: create/edit orchestration + authorization gating.
- `src/players/PlayerFormPage.test.tsx` — **create.**
- `src/players/PlayersPage.tsx` — **create.** The list (search by name, filter by category + status, category label, row link to detail, admin "Nuevo jugador" button). Owns: list + filtering UI.
- `src/players/PlayersPage.test.tsx` — **create.**
- `src/app/routes.tsx` — **modify.** Add `/jugadores/:id` (Task 5) and `/jugadores/nuevo` under `RequireAdmin` (Task 5); replace the index placeholder with `<PlayersPage />` (Task 6).

Reused as-is: `src/lib/supabase.ts` (`supabase`), `src/lib/authorize.ts` (`isAdmin`), `src/lib/category.ts` (`categoryLabel`), `src/tenant/TenantContext.ts` (`useTenant`, `Role`), `src/auth/RequireAdmin.tsx`, `src/app/AppLayout.tsx` (its existing "Jugadores" → `/` nav button already covers the list; no nav change needed).

---

### Task 1: DB trigger — auto-seed document rows on player insert

**Files:**
- Create: `supabase/migrations/0008_seed_player_documents.sql`

**Interfaces:**
- Consumes: existing `players`, `documents` tables; `document_type` / `document_status` enums; the `private` schema (already home to `is_admin` / `current_tenant_id`).
- Produces: behavior only — after any `INSERT` into `players`, exactly six `documents` rows exist for that player (one per `document_type`, `status = 'pendiente'`, matching `tenant_id`). No TS surface.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0008_seed_player_documents.sql`:

```sql
create or replace function private.seed_player_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.documents (tenant_id, player_id, doc_type, status)
  select new.tenant_id, new.id, dt, 'pendiente'::public.document_status
  from unnest(enum_range(null::public.document_type)) as dt;
  return new;
end;
$$;

create trigger trg_players_seed_documents
  after insert on public.players
  for each row execute function private.seed_player_documents();
```

`enum_range(null::document_type)` yields all six enum values, so the list never drifts from the enum. `security definer` + empty `search_path` matches the existing `private.*` helper hardening; it inserts the six rows regardless of the caller's RLS (the only callers that reach player-insert are admins anyway).

- [ ] **Step 2: Apply the migration to remote `main` via MCP**

Use the Supabase MCP tool `apply_migration` with name `0008_seed_player_documents` and the SQL above.
Expected: success, no error. (No local `supabase db` CLI — this project applies migrations directly to remote `main`.)

- [ ] **Step 3: Insert a fixture player via MCP**

Use a FIXED id so verification and cleanup are deterministic. Run this as its own `execute_sql` call (a separate statement from the verify query — a data-modifying CTE's rows are NOT visible to a sibling CTE in the same statement, so the insert and the count must be separate statements):

```sql
insert into players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', '__trigger_test__', '2015-01-01', 'T', '000');
```

Expected: 1 row inserted, no error.

- [ ] **Step 4: Verify the six seeded rows via MCP**

Separate `execute_sql` call — it sees the committed effect of the trigger from Step 3:

```sql
select
  count(*) as total_rows,
  count(*) filter (where status = 'pendiente') as pendiente_rows,
  count(distinct doc_type) as distinct_types,
  count(*) filter (where tenant_id = '00000000-0000-0000-0000-000000000001') as tenant_matches
from documents
where player_id = '11111111-1111-1111-1111-111111111111';
```

Expected single row: `total_rows = 6`, `pendiente_rows = 6`, `distinct_types = 6`, `tenant_matches = 6`.

- [ ] **Step 5: Clean up the fixture via MCP**

```sql
delete from players where id = '11111111-1111-1111-1111-111111111111';
select count(*) as leftover_players from players where id = '11111111-1111-1111-1111-111111111111';
select count(*) as leftover_docs from documents where player_id = '11111111-1111-1111-1111-111111111111';
```

Expected: the player delete cascades to the six `documents` rows (composite FK `on delete cascade`) → `leftover_players = 0`, `leftover_docs = 0`.

- [ ] **Step 6: Run advisors (post-DDL safety check)**

Use the MCP `get_advisors` tool with `type: "security"`. Expected: no new lints attributable to the migration (a `security definer` function with a locked `search_path` is the intended, advisor-clean pattern used by the existing helpers).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0008_seed_player_documents.sql
git commit -m "feat: seed six document rows on player insert via DB trigger"
```

---

### Task 2: Players data layer — types + reads + category presenter

**Files:**
- Create: `src/players/players.ts`
- Test: `src/players/players.test.ts`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`; `categoryLabel` from `../lib/category`.
- Produces:
  - `type PlayerStatus = 'activo' | 'baja'`
  - `type AffiliationStatus = 'autoriza' | 'no_autoriza' | 'pendiente'`
  - `interface PlayerRow` (all `players_with_category` columns; see code)
  - `fetchPlayers(): Promise<PlayerRow[]>` — reads the view, ordered by `full_name`
  - `fetchPlayer(id: string): Promise<PlayerRow | null>` — single row from the view
  - `playerCategoryText(row: Pick<PlayerRow,'category_name'|'category_year'|'edad_liga'>): string`

- [ ] **Step 1: Write the failing tests**

Create `src/players/players.test.ts`:

```ts
import { beforeEach, expect, vi } from 'vitest'
import { fetchPlayers, fetchPlayer, playerCategoryText } from './players'
import type { PlayerRow } from './players'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis Ruiz', tutor_whatsapp: '8110000000', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.mockResolvedValue({ data: [row()], error: null })
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.maybeSingle.mockResolvedValue({ data: row(), error: null })
  mocks.from.mockReturnValue({ select: mocks.select })
})

test('fetchPlayers reads the category view ordered by name', async () => {
  const rows = await fetchPlayers()
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.select).toHaveBeenCalledWith('*')
  expect(mocks.order).toHaveBeenCalledWith('full_name', { ascending: true })
  expect(rows).toHaveLength(1)
  expect(rows[0].category_name).toBe('Infantil Mayor')
})

test('fetchPlayers returns [] when the view yields null data', async () => {
  mocks.order.mockResolvedValue({ data: null, error: null })
  expect(await fetchPlayers()).toEqual([])
})

test('fetchPlayer reads a single row by id from the view', async () => {
  const found = await fetchPlayer('p1')
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'p1')
  expect(found?.id).toBe('p1')
})

test('fetchPlayer returns null when no row matches', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  expect(await fetchPlayer('missing')).toBeNull()
})

test('playerCategoryText formats a matched category via categoryLabel', () => {
  expect(playerCategoryText({ category_name: 'Infantil Mayor', category_year: 1, edad_liga: 11 }))
    .toBe('Infantil Mayor (1ro)')
})

test('playerCategoryText shows out-of-category with the league age', () => {
  expect(playerCategoryText({ category_name: null, category_year: null, edad_liga: 2 }))
    .toBe('Fuera de categoría (edad 2)')
})

test('playerCategoryText shows bare out-of-category when there is no league age', () => {
  expect(playerCategoryText({ category_name: null, category_year: null, edad_liga: null }))
    .toBe('Fuera de categoría')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: FAIL — `Failed to resolve import "./players"` / functions not defined.

- [ ] **Step 3: Write the minimal implementation**

Create `src/players/players.ts`:

```ts
import { supabase } from '../lib/supabase'
import { categoryLabel } from '../lib/category'

export type PlayerStatus = 'activo' | 'baja'
export type AffiliationStatus = 'autoriza' | 'no_autoriza' | 'pendiente'

export interface PlayerRow {
  id: string
  tenant_id: string
  full_name: string
  birth_date: string
  curp: string | null
  photo_path: string | null
  status: PlayerStatus
  enrollment_date: string
  tutor_name: string
  tutor_whatsapp: string
  tutor_email: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  affiliation_status: AffiliationStatus
  affiliation_date: string | null
  created_at: string
  updated_at: string
  edad_liga: number | null
  division: string | null
  category_name: string | null
  category_year: number | null
}

export async function fetchPlayers(): Promise<PlayerRow[]> {
  const { data } = await supabase
    .from('players_with_category')
    .select('*')
    .order('full_name', { ascending: true })
  return (data as PlayerRow[] | null) ?? []
}

export async function fetchPlayer(id: string): Promise<PlayerRow | null> {
  const { data } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as PlayerRow | null) ?? null
}

export function playerCategoryText(
  row: Pick<PlayerRow, 'category_name' | 'category_year' | 'edad_liga'>,
): string {
  if (row.category_name) return categoryLabel(row.category_name, row.category_year)
  if (row.edad_liga != null) return `Fuera de categoría (edad ${row.edad_liga})`
  return 'Fuera de categoría'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/players/players.ts src/players/players.test.ts
git commit -m "feat: add players data layer reads and category presenter"
```

---

### Task 3: Players data layer — writes + form-value mappers

**Files:**
- Modify: `src/players/players.ts`
- Test: `src/players/players.test.ts` (extend)

**Interfaces:**
- Consumes: `supabase`; the `PlayerRow`, `PlayerStatus`, `AffiliationStatus` from Task 2.
- Produces:
  - `interface PlayerFormValues` — the writable, string-only form fields
  - `emptyPlayer(): PlayerFormValues` — blank values, `enrollment_date` = today, `status` `'activo'`, `affiliation_status` `'pendiente'`
  - `rowToValues(row: PlayerRow): PlayerFormValues` — map a loaded row into form values (nulls → `''`)
  - `interface CreatePlayerResult { ok: boolean; id?: string; error?: string }`
  - `interface UpdatePlayerResult { ok: boolean; error?: string }`
  - `createPlayer(values: PlayerFormValues, tenantId: string): Promise<CreatePlayerResult>`
  - `updatePlayer(id: string, values: PlayerFormValues): Promise<UpdatePlayerResult>`

- [ ] **Step 1: Write the failing tests (append to `src/players/players.test.ts`)**

Add these imports to the existing import line from `./players`:
`createPlayer, updatePlayer, emptyPlayer, rowToValues` and the type `PlayerFormValues`.

Extend the `mocks` hoisted object with `insert`, `single`, `update`, `updateEq` (so it becomes `vi.hoisted(() => ({ from, select, order, eq, maybeSingle, insert, single, update, updateEq }))` with `vi.fn()` for each). Then **replace the Task 2 `beforeEach` body** with this complete version, which gives the read chain and the write chains distinct terminals so they never alias:

```ts
beforeEach(() => {
  vi.clearAllMocks()
  // read chain: from().select().order()  and  from().select().eq().maybeSingle()
  mocks.order.mockResolvedValue({ data: [row()], error: null })
  mocks.maybeSingle.mockResolvedValue({ data: row(), error: null })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle }) // read path only
  // write chains: from().insert().select('id').single()  and  from().update().eq()
  mocks.single.mockResolvedValue({ data: { id: 'newid' }, error: null })
  mocks.insert.mockReturnValue({ select: mocks.select })
  mocks.updateEq.mockResolvedValue({ error: null })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
  // select serves reads (order/eq) and the insert().select('id').single() write
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq, single: mocks.single })
  mocks.from.mockReturnValue({ select: mocks.select, insert: mocks.insert, update: mocks.update })
})
```

The read path uses `mocks.eq` (returns `{ maybeSingle }`); the update path uses `mocks.updateEq` (awaited directly, resolves `{ error }`). No per-test override is needed.

Add these tests:

```ts
test('createPlayer inserts with tenant_id and empty strings coerced to null', async () => {
  const values: PlayerFormValues = {
    ...emptyPlayer(),
    full_name: 'Ana Ruiz',
    birth_date: '2015-06-10',
    curp: '',
    tutor_name: 'Luis Ruiz',
    tutor_whatsapp: '8110000000',
    tutor_email: '',
  }
  const result = await createPlayer(values, 'tenant-1')
  expect(mocks.from).toHaveBeenCalledWith('players')
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      tenant_id: 'tenant-1',
      full_name: 'Ana Ruiz',
      birth_date: '2015-06-10',
      curp: null,
      tutor_email: null,
    }),
  )
  expect(mocks.select).toHaveBeenCalledWith('id')
  expect(result).toEqual({ ok: true, id: 'newid' })
})

test('createPlayer surfaces an RLS/DB error as ok:false', async () => {
  mocks.single.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
  const result = await createPlayer({ ...emptyPlayer(), full_name: 'X', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' }, 'tenant-1')
  expect(result).toEqual({ ok: false, error: 'permission denied' })
})

test('updatePlayer updates by id and returns ok', async () => {
  const result = await updatePlayer('p1', { ...emptyPlayer(), full_name: 'Ana', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' })
  expect(mocks.from).toHaveBeenCalledWith('players')
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Ana' }))
  expect(mocks.updateEq).toHaveBeenCalledWith('id', 'p1')
  expect(result).toEqual({ ok: true })
})

test('rowToValues maps nulls to empty strings', () => {
  const values = rowToValues(row({ curp: null, tutor_email: null, affiliation_date: null }))
  expect(values.curp).toBe('')
  expect(values.tutor_email).toBe('')
  expect(values.affiliation_date).toBe('')
  expect(values.status).toBe('activo')
})

test('emptyPlayer defaults status/affiliation and a today enrollment_date', () => {
  const v = emptyPlayer()
  expect(v.status).toBe('activo')
  expect(v.affiliation_status).toBe('pendiente')
  expect(v.enrollment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(v.full_name).toBe('')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: FAIL — `createPlayer`/`updatePlayer`/`emptyPlayer`/`rowToValues` not exported.

- [ ] **Step 3: Write the minimal implementation (append to `src/players/players.ts`)**

```ts
export interface PlayerFormValues {
  full_name: string
  birth_date: string
  curp: string
  status: PlayerStatus
  enrollment_date: string
  tutor_name: string
  tutor_whatsapp: string
  tutor_email: string
  emergency_contact_name: string
  emergency_contact_phone: string
  affiliation_status: AffiliationStatus
  affiliation_date: string
}

export interface CreatePlayerResult {
  ok: boolean
  id?: string
  error?: string
}

export interface UpdatePlayerResult {
  ok: boolean
  error?: string
}

export function emptyPlayer(): PlayerFormValues {
  const today = new Date().toISOString().slice(0, 10)
  return {
    full_name: '',
    birth_date: '',
    curp: '',
    status: 'activo',
    enrollment_date: today,
    tutor_name: '',
    tutor_whatsapp: '',
    tutor_email: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    affiliation_status: 'pendiente',
    affiliation_date: '',
  }
}

export function rowToValues(row: PlayerRow): PlayerFormValues {
  return {
    full_name: row.full_name,
    birth_date: row.birth_date,
    curp: row.curp ?? '',
    status: row.status,
    enrollment_date: row.enrollment_date,
    tutor_name: row.tutor_name,
    tutor_whatsapp: row.tutor_whatsapp,
    tutor_email: row.tutor_email ?? '',
    emergency_contact_name: row.emergency_contact_name ?? '',
    emergency_contact_phone: row.emergency_contact_phone ?? '',
    affiliation_status: row.affiliation_status,
    affiliation_date: row.affiliation_date ?? '',
  }
}

function toRecord(v: PlayerFormValues) {
  return {
    full_name: v.full_name.trim(),
    birth_date: v.birth_date,
    curp: v.curp.trim() || null,
    status: v.status,
    enrollment_date: v.enrollment_date,
    tutor_name: v.tutor_name.trim(),
    tutor_whatsapp: v.tutor_whatsapp.trim(),
    tutor_email: v.tutor_email.trim() || null,
    emergency_contact_name: v.emergency_contact_name.trim() || null,
    emergency_contact_phone: v.emergency_contact_phone.trim() || null,
    affiliation_status: v.affiliation_status,
    affiliation_date: v.affiliation_date || null,
  }
}

export async function createPlayer(
  values: PlayerFormValues,
  tenantId: string,
): Promise<CreatePlayerResult> {
  const { data, error } = await supabase
    .from('players')
    .insert({ ...toRecord(values), tenant_id: tenantId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string }).id }
}

export async function updatePlayer(
  id: string,
  values: PlayerFormValues,
): Promise<UpdatePlayerResult> {
  const { error } = await supabase.from('players').update(toRecord(values)).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: PASS (all Task 2 + Task 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/players/players.ts src/players/players.test.ts
git commit -m "feat: add player create/update and form-value mappers"
```

---

### Task 4: PlayerForm — presentational controlled form

**Files:**
- Create: `src/players/PlayerForm.tsx`
- Test: `src/players/PlayerForm.test.tsx`

**Interfaces:**
- Consumes: `PlayerFormValues`, `PlayerStatus`, `AffiliationStatus` from `./players`.
- Produces:
  - `interface PlayerFormProps { values: PlayerFormValues; onChange: (next: PlayerFormValues) => void; disabled?: boolean; categoryText?: string }`
  - `function PlayerForm(props: PlayerFormProps)` — renders labeled fields; every edit calls `onChange` with a full updated values object.

- [ ] **Step 1: Write the failing test**

Create `src/players/PlayerForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { PlayerForm } from './PlayerForm'
import { emptyPlayer } from './players'

test('renders the player, tutor and affiliation fields', () => {
  render(<PlayerForm values={emptyPlayer()} onChange={() => {}} categoryText="Infantil Mayor (1ro)" />)
  expect(screen.getByLabelText(/Nombre completo/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Fecha de nacimiento/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre del tutor/)).toBeInTheDocument()
  expect(screen.getByLabelText(/WhatsApp del tutor/)).toBeInTheDocument()
  expect(screen.getByLabelText('Estatus de afiliación')).toBeInTheDocument()
  expect(screen.getByText(/Infantil Mayor \(1ro\)/)).toBeInTheDocument()
})

test('typing a name emits the updated values via onChange', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<PlayerForm values={emptyPlayer()} onChange={onChange} />)
  await user.type(screen.getByLabelText(/Nombre completo/), 'A')
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'A' }))
})

test('disabled hides editing by disabling every input', () => {
  render(<PlayerForm values={emptyPlayer()} onChange={() => {}} disabled />)
  expect(screen.getByLabelText(/Nombre completo/)).toBeDisabled()
  expect(screen.getByLabelText('Estatus de afiliación')).toBeDisabled()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/players/PlayerForm.test.tsx`
Expected: FAIL — `Failed to resolve import "./PlayerForm"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/players/PlayerForm.tsx`:

```tsx
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { PlayerFormValues, PlayerStatus, AffiliationStatus } from './players'

export interface PlayerFormProps {
  values: PlayerFormValues
  onChange: (next: PlayerFormValues) => void
  disabled?: boolean
  categoryText?: string
}

export function PlayerForm({ values, onChange, disabled, categoryText }: PlayerFormProps) {
  const set = (patch: Partial<PlayerFormValues>) => onChange({ ...values, ...patch })

  return (
    <Stack spacing={2}>
      <TextField
        label="Nombre completo"
        value={values.full_name}
        onChange={(e) => set({ full_name: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        label="Fecha de nacimiento"
        type="date"
        value={values.birth_date}
        onChange={(e) => set({ birth_date: e.target.value })}
        required
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {categoryText != null && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Categoría: {categoryText}
        </Typography>
      )}
      <TextField
        label="CURP"
        value={values.curp}
        onChange={(e) => set({ curp: e.target.value })}
        disabled={disabled}
      />
      <TextField
        select
        label="Estatus"
        value={values.status}
        onChange={(e) => set({ status: e.target.value as PlayerStatus })}
        disabled={disabled}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ minWidth: 160 }}
      >
        <option value="activo">Activo</option>
        <option value="baja">Baja</option>
      </TextField>
      <TextField
        label="Fecha de inscripción"
        type="date"
        value={values.enrollment_date}
        onChange={(e) => set({ enrollment_date: e.target.value })}
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Nombre del tutor"
        value={values.tutor_name}
        onChange={(e) => set({ tutor_name: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        label="WhatsApp del tutor"
        value={values.tutor_whatsapp}
        onChange={(e) => set({ tutor_whatsapp: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        label="Correo del tutor"
        type="email"
        value={values.tutor_email}
        onChange={(e) => set({ tutor_email: e.target.value })}
        disabled={disabled}
      />
      <TextField
        label="Contacto de emergencia"
        value={values.emergency_contact_name}
        onChange={(e) => set({ emergency_contact_name: e.target.value })}
        disabled={disabled}
      />
      <TextField
        label="Teléfono de emergencia"
        value={values.emergency_contact_phone}
        onChange={(e) => set({ emergency_contact_phone: e.target.value })}
        disabled={disabled}
      />
      <TextField
        select
        label="Estatus de afiliación"
        value={values.affiliation_status}
        onChange={(e) => set({ affiliation_status: e.target.value as AffiliationStatus })}
        disabled={disabled}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ minWidth: 160 }}
      >
        <option value="pendiente">Pendiente</option>
        <option value="autoriza">Autoriza</option>
        <option value="no_autoriza">No autoriza</option>
      </TextField>
      <TextField
        label="Fecha de afiliación"
        type="date"
        value={values.affiliation_date}
        onChange={(e) => set({ affiliation_date: e.target.value })}
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </Stack>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/players/PlayerForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/players/PlayerForm.tsx src/players/PlayerForm.test.tsx
git commit -m "feat: add presentational PlayerForm"
```

---

### Task 5: PlayerFormPage + routes (create + edit/view)

**Files:**
- Create: `src/players/PlayerFormPage.tsx`
- Test: `src/players/PlayerFormPage.test.tsx`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: `PlayerForm` (Task 4); `fetchPlayer`, `createPlayer`, `updatePlayer`, `emptyPlayer`, `rowToValues`, `playerCategoryText`, `PlayerFormValues`, `PlayerRow` (Tasks 2–3); `useTenant` from `../tenant/TenantContext`; `isAdmin` from `../lib/authorize`; `useParams`, `useNavigate` from `react-router-dom`.
- Produces: `function PlayerFormPage()` rendered at `/jugadores/nuevo` (admin-only) and `/jugadores/:id` (all authed; editable only for admin).

- [ ] **Step 1: Write the failing test**

Create `src/players/PlayerFormPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { PlayerFormPage } from './PlayerFormPage'

const mocks = vi.hoisted(() => ({
  fetchPlayer: vi.fn(),
  createPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  useTenant: vi.fn(),
}))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, fetchPlayer: mocks.fetchPlayer, createPlayer: mocks.createPlayer, updatePlayer: mocks.updatePlayer }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/jugadores/nuevo', element: <PlayerFormPage /> },
      { path: '/jugadores/:id', element: <PlayerFormPage /> },
      { path: '/', element: <div>lista</div> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 'tenant-1' })
  mocks.createPlayer.mockResolvedValue({ ok: true, id: 'newid' })
  mocks.updatePlayer.mockResolvedValue({ ok: true })
  mocks.fetchPlayer.mockResolvedValue({
    id: 'p1', tenant_id: 'tenant-1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis', tutor_whatsapp: '811', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '', updated_at: '', edad_liga: 11, division: 'Infantil',
    category_name: 'Infantil Mayor', category_year: 1,
  })
})

test('create mode submits createPlayer with the tenant id', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/nuevo')
  await user.type(screen.getByLabelText(/Nombre completo/), 'Nuevo Jugador')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '2015-06-10')
  await user.type(screen.getByLabelText(/Nombre del tutor/), 'Tutor')
  await user.type(screen.getByLabelText(/WhatsApp del tutor/), '8110000000')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(mocks.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Nuevo Jugador' }),
      'tenant-1',
    ),
  )
})

test('edit mode loads the player and shows its category', async () => {
  renderAt('/jugadores/p1')
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeInTheDocument()
  expect(mocks.fetchPlayer).toHaveBeenCalledWith('p1')
  expect(screen.getByText(/Infantil Mayor \(1ro\)/)).toBeInTheDocument()
})

test('readonly role sees disabled fields and no Guardar button', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 'tenant-1' })
  renderAt('/jugadores/p1')
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})

test('a failed save surfaces the error', async () => {
  mocks.createPlayer.mockResolvedValue({ ok: false, error: 'permission denied' })
  const user = userEvent.setup()
  renderAt('/jugadores/nuevo')
  await user.type(screen.getByLabelText(/Nombre completo/), 'X')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '2015-06-10')
  await user.type(screen.getByLabelText(/Nombre del tutor/), 'T')
  await user.type(screen.getByLabelText(/WhatsApp del tutor/), '0')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./PlayerFormPage"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/players/PlayerFormPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { PlayerForm } from './PlayerForm'
import {
  fetchPlayer,
  createPlayer,
  updatePlayer,
  emptyPlayer,
  rowToValues,
  playerCategoryText,
} from './players'
import type { PlayerFormValues, PlayerRow } from './players'

export function PlayerFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, tenantId } = useTenant()
  const editing = Boolean(id)
  const canEdit = isAdmin(role)

  const [values, setValues] = useState<PlayerFormValues>(emptyPlayer())
  const [row, setRow] = useState<PlayerRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    void fetchPlayer(id).then((r) => {
      if (!active || !r) return
      setRow(r)
      setValues(rowToValues(r))
    })
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!tenantId) {
      setMessage('Error: no hay tenant activo')
      return
    }
    setSubmitting(true)
    const result = editing ? await updatePlayer(id!, values) : await createPlayer(values, tenantId)
    setSubmitting(false)
    if (!result.ok) {
      setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
      return
    }
    const targetId = editing ? id! : result.id!
    void navigate(`/jugadores/${targetId}`)
  }

  const categoryText = row ? playerCategoryText(row) : undefined

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1" gutterBottom>
          {editing ? 'Jugador' : 'Nuevo jugador'}
        </Typography>
        <PlayerForm values={values} onChange={setValues} disabled={!canEdit} categoryText={categoryText} />
        {message && (
          <Alert role="alert" severity={message.startsWith('Error') ? 'error' : 'success'} sx={{ mt: 1 }}>
            {message}
          </Alert>
        )}
        {canEdit && (
          <Button type="submit" variant="contained" disabled={submitting}>
            Guardar
          </Button>
        )}
      </Stack>
    </Box>
  )
}
```

- [ ] **Step 4: Wire the routes**

Modify `src/app/routes.tsx`: add the import and two route entries. The full file becomes:

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../auth/LoginPage'
import { AuthCallbackPage } from '../auth/AuthCallbackPage'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireAdmin } from '../auth/RequireAdmin'
import { AppLayout } from './AppLayout'
import { PlaceholderPage } from './PlaceholderPage'
import { UsersPage } from '../users/UsersPage'
import { PlayerFormPage } from '../players/PlayerFormPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <PlaceholderPage title="Jugadores" /> },
          { path: 'jugadores/:id', element: <PlayerFormPage /> },
          { path: 'quien-debe', element: <PlaceholderPage title="Quién debe" /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: 'jugadores/nuevo', element: <PlayerFormPage /> },
              { path: 'usuarios', element: <UsersPage /> },
            ],
          },
        ],
      },
    ],
  },
])
```

React Router v7 flattens all branches and ranks routes by score globally: a static segment (`jugadores/nuevo`) always outranks a dynamic one (`jugadores/:id`) regardless of nesting depth or declaration order, so `/jugadores/nuevo` resolves to the admin-gated create route even though both patterns match.

- [ ] **Step 5: Run the tests + typecheck to verify they pass**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx` → Expected: PASS (4 tests).
Run: `pnpm exec tsc -b` → Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx src/app/routes.tsx
git commit -m "feat: add player create/edit page and routes"
```

---

### Task 6: PlayersPage — list with search/filter + wire the index route

**Files:**
- Create: `src/players/PlayersPage.tsx`
- Test: `src/players/PlayersPage.test.tsx`
- Modify: `src/app/routes.tsx` (replace the index placeholder)

**Interfaces:**
- Consumes: `fetchPlayers`, `playerCategoryText`, `PlayerRow` (Task 2); `useTenant`; `isAdmin`; `NavLink`/`Link` from `react-router-dom`.
- Produces: `function PlayersPage()` — the index route content.

- [ ] **Step 1: Write the failing test**

Create `src/players/PlayersPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { PlayersPage } from './PlayersPage'
import type { PlayerRow } from './players'

const mocks = vi.hoisted(() => ({ fetchPlayers: vi.fn(), useTenant: vi.fn() }))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, fetchPlayers: mocks.fetchPlayers }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function player(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis', tutor_whatsapp: '811', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null, created_at: '', updated_at: '',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1, ...over,
  }
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <PlayersPage /> },
      { path: '/jugadores/nuevo', element: <div>nuevo</div> },
      { path: '/jugadores/:id', element: <div>detalle</div> },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p1', full_name: 'Ana Ruiz', category_name: 'Infantil Mayor', category_year: 1 }),
    player({ id: 'p2', full_name: 'Beto Gómez', status: 'baja', category_name: null, category_year: null, edad_liga: 25 }),
  ])
})

test('lists players with their category label', async () => {
  renderPage()
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.getByText(/Infantil Mayor \(1ro\)/)).toBeInTheDocument()
  expect(screen.getByText(/Fuera de categoría \(edad 25\)/)).toBeInTheDocument()
})

test('search filters the list by name', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.type(screen.getByLabelText('Buscar por nombre'), 'beto')
  await waitFor(() => expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument())
  expect(screen.getByText('Beto Gómez')).toBeInTheDocument()
})

test('status filter narrows to activos', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Beto Gómez')
  await user.selectOptions(screen.getByLabelText('Estatus'), 'activo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})

test('admin sees the "Nuevo jugador" button', async () => {
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(screen.getByRole('link', { name: 'Nuevo jugador' })).toHaveAttribute('href', '/jugadores/nuevo')
})

test('readonly does not see the "Nuevo jugador" button', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 't1' })
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(screen.queryByRole('link', { name: 'Nuevo jugador' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./PlayersPage"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/players/PlayersPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { fetchPlayers, playerCategoryText } from './players'
import type { PlayerRow, PlayerStatus } from './players'

export function PlayersPage() {
  const { role } = useTenant()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<'' | PlayerStatus>('')

  const load = useCallback(async (): Promise<PlayerRow[]> => fetchPlayers(), [])

  useEffect(() => {
    let active = true
    void load().then((rows) => {
      if (active) setPlayers(rows)
    })
    return () => {
      active = false
    }
  }, [load])

  const categories = useMemo(() => {
    const names = players.map((p) => p.category_name).filter((n): n is string => Boolean(n))
    return Array.from(new Set(names)).sort()
  }, [players])

  const visible = players.filter((p) => {
    if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (category && p.category_name !== category) return false
    if (status && p.status !== status) return false
    return true
  })

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h4" component="h1">
          Jugadores
        </Typography>
        {isAdmin(role) && (
          <Button variant="contained" component={RouterLink} to="/jugadores/nuevo">
            Nuevo jugador
          </Button>
        )}
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 2 }}
      >
        <TextField
          label="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 200 }}
        />
        <TextField
          select
          label="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 180 }}
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </TextField>
        <TextField
          select
          label="Estatus"
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | PlayerStatus)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 140 }}
        >
          <option value="">Todos</option>
          <option value="activo">Activo</option>
          <option value="baja">Baja</option>
        </TextField>
      </Stack>

      <List sx={{ mt: 2 }}>
        {visible.map((p) => (
          <ListItemButton key={p.id} component={RouterLink} to={`/jugadores/${p.id}`}>
            <ListItemText
              primary={p.full_name}
              secondary={`${playerCategoryText(p)} · ${p.status}`}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )
}
```

- [ ] **Step 4: Replace the index route with the list**

Modify `src/app/routes.tsx`: add `import { PlayersPage } from '../players/PlayersPage'` and change the index child from `{ index: true, element: <PlaceholderPage title="Jugadores" /> }` to:

```tsx
          { index: true, element: <PlayersPage /> },
```

Leave the `PlaceholderPage` import (still used by `/quien-debe`).

- [ ] **Step 5: Run the tests + typecheck + lint to verify**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → Expected: PASS (5 tests).
Run: `pnpm exec vitest run` → Expected: whole suite green (all pre-existing tests + the new players tests).
Run: `pnpm exec tsc -b` → Expected: exit 0.
Run: `pnpm lint` → Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx src/app/routes.tsx
git commit -m "feat: add players list with search/filter and wire index route"
```

---

## Scope notes & open decisions

- **Activo/Baja list filter (beyond spec §8):** §8 lists the list filters as name, category, and payment-status. This plan implements name + category + **player status (activo/baja)** and defers the payment-status filter to the payments plan. The activo/baja filter is an intentional convenience (players do get given `baja`); it is not a spec deviation to fix.
- **Category preview only after save (create mode):** age/category is computed server-side in `players_with_category` (spec §3/§5), so on `/jugadores/nuevo` the category field stays blank until the player is saved and the row loads in edit mode. On edit it shows read-only per spec §8. A client-side preview (compute `edad_liga` against the active season cutoff before save) is a possible later enhancement, not part of this plan.
- **OPEN DECISION — is CURP mandatory at registration?** The live DB has `curp text NULL`, so this plan renders CURP as optional (no `required`, empty → `null`). Spec §4.5 lists `curp` without the explicit `null` marker it uses for the other optional fields, so intent is ambiguous. Default = optional (matches the DB). If the owner wants CURP mandatory, the change is small: add `required` to the CURP `TextField` in `PlayerForm`, add a submit-time guard, and add a `NOT NULL` migration for `players.curp` — confirm before implementing Task 4.

## Deferred (explicitly OUT OF SCOPE for this plan — later Phase-3 plans)

- **Payment status + document status columns** in the list ("estatus de pago y de documentos de un vistazo", spec §8): need the payments/documents features first.
- **Payment filter** in the list search bar (spec §8 lists "filtro por estatus de pago"): deferred with payments.
- **Documents feature**: per-type status editing, digital upload, and the **consent lock** (no photo/doc upload while `image_consent`/`privacy_notice` are `pendiente`) — spec §7.
- **Photo upload / Storage** (`photo_path`): private bucket + signed URLs — spec §7.
- **Payments + "Quién debe"** screen — spec §8.
- **Excel export** (`xlsx`, client-side) — spec §9.

## Manual verification (after all tasks, owner-run — requires a real session)

The component tests mock Supabase, so the live create→seed→read path must be confirmed in the browser with a real admin session (magic-link login):
1. Log in as an admin, open `/`, click **Nuevo jugador**, fill the form, save.
2. Confirm the new player appears in the list with the correct auto-category, and (via MCP `execute_sql` or the app's later documents screen) that six `documents` rows exist for it in `pendiente`.
3. Edit the player, change a field, save, confirm persistence.
4. Log in as a `readonly` user: confirm no **Nuevo jugador** button, the detail form is disabled, and no **Guardar** button.
