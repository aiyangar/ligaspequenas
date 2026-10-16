# Players List Payment and Document Status (#4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every player in the players list shows a payment-state chip and a `Docs N/6` chip, and the list gains **Pago** and **Documentos** filters that combine (AND) with the existing ones, backed by two new columns of `players_with_category`.

**Architecture:** One migration (`0015`) re-creates the `security_invoker` view `players_with_category` with the exact `0011` definition plus two columns appended at the end: `payment_state` (`left join player_payment_status`, `coalesce(…, 'sin_pagos')`) and `docs_delivered` (scalar `count(*)::int` of `fisico`/`digital` documents). `fetchPlayers`/`fetchPlayer` already `select('*')`, so only the `PlayerRow` type grows. `PlayersPage` renders the chips under the unchanged secondary line and filters client-side with two more native selects.

**Tech Stack:** React 19.2, react-router-dom 7, MUI 9 (`Chip`), `@supabase/supabase-js` 2.108 (PostgREST), Vitest 4 + Testing Library + user-event, TypeScript (`tsc -b`), ESLint, pnpm; Postgres on remote Supabase (`eksbaugyypadtanyjcje`) via the Supabase MCP; pgTAP in schema `extensions`.

**Spec:** `docs/superpowers/specs/2026-10-15-players-status-columns-design.md` (read it before starting; § numbers below refer to it).

## Global Constraints

- One part, one branch: **`feature/players-status-columns`** (Tasks 1–3, PR body `Closes #4`), cut from `develop` and executed by a single implementer starting fresh.
- The worktree is created **by the orchestrator** before dispatch: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status`. The implementer skips creation; its first action is `pnpm install --frozen-lockfile` inside the worktree. Tests need no `.env`. Shorthand below: `WT=/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status`.
- Git inside the worktree: always `git -C <absolute worktree path> …`, **one git command per shell call**. Never use `CLAUDE_GIT_OVERRIDE`. Never touch `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (the main checkout).
- The implementer never pushes, opens PRs or merges. Every commit message is English and ends with a blank line plus exactly: `Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4` (pass it as a second `-m`). This is the orchestrator's session line and it **overrides** any per-agent attribution reminder you receive (a different `Claude-Session` URL, a `Co-Authored-By`, etc.): use this line and only this line.
- **DB work (Task 1 only)** runs against the live project through the Supabase MCP (no local Docker; the MCP cannot branch — SQL hits production). Steps marked **[MCP]** may be run by the implementer **or** the orchestrator: if the implementer has no `mcp__supabase__*` tools (or they are not authenticated), it writes the two SQL files, **stops, and reports** "Task 1 MCP steps pending"; the orchestrator runs every [MCP] step in order, records the evidence, and then tells the implementer to commit and continue with Task 2. Never look for another way to reach the database.
- **If you stop at any [MCP] step after the fixture setup (error, blocker, anything), run the cleanup block before reporting.** Fixtures persist on the live project.
- **`0015` is immutable once applied** (spec §8): after Step 5 of Task 1, never edit `supabase/migrations/0015_players_view_status_columns.sql`. Any change the review asks for ships as a new `0016_…` migration (`create or replace view`, append-only, with its own pgTAP) — and that is the orchestrator's call, not the implementer's: stop and report.
- Out of scope, do not touch (spec §1): `supabase/migrations/0014_*` and every earlier migration, the `documents`/`payments` tables and their RLS, `player_payment_status`, `fetchPlayers`/`fetchPlayer` bodies, `DebtorsPage`/`buildDebtGroups`, the `List` → `ListItemButton` structure (#71), the accessible name of list links (#72), a "sin resultados" empty message, the Excel export (#5). No explicit `grant`/`revoke` in the migration.
- Code, identifiers, comments, commit messages: English. Comments only for a non-obvious *why*, one short line max. UI copy: Spanish, **exactly** as written here:
  - Filter labels: `Pago` · `Documentos`.
  - Pago options (value → text): `''` `Todos` · `con_adeudo` `Con adeudo` · `sin_pagos` `Sin pagos` · `al_corriente` `Al corriente` (texts come from `PAYMENT_STATE_LABELS`).
  - Documentos options: `''` `Todos` · `completos` `Completos` · `incompletos` `Incompletos`.
  - Documents chip: `Docs {docs_delivered}/{DOCUMENT_TOTAL}` (e.g. `Docs 3/6`), built from `DOCUMENT_TOTAL` — never a literal `6` in UI code or UI tests.
- Colors: payment chip `con_adeudo` → `warning`, `sin_pagos` → `default`, `al_corriente` → `success`. Documents chip `success` iff `docs_delivered >= DOCUMENT_TOTAL`, else `warning` (0 included). The **same** `>=` threshold drives the Documentos filter.
- Lint rules that bite: `react-hooks/set-state-in-effect` — no synchronous `setState` in an effect body. This plan adds no effect.
- Mocks: keep the existing `vi.hoisted` + `vi.mock(...)` style of `PlayersPage.test.tsx`.
- The branch closes with all three green: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`. **Test counts are deltas from the baseline you measure in Step 0** (`B_files`, `B_tests`); the absolute numbers in parentheses are what to expect if `develop` is unchanged since this plan was written (`develop` 754e0bf + spec/plan docs: `Test Files 37 passed (37)`, `Tests 289 passed (289)`, measured 2026-10-15). If your baseline differs, the deltas still have to hold — report the baseline you measured.
- The branch adds **+0 test files, +12 tests** (Task 2: +2 — `payments.test.ts` +1, `documents.test.ts` +1; Task 3: +10 in `PlayersPage.test.tsx`). Task 1 adds no Vitest test (pgTAP runs via MCP).

## Review Focus

- **A player whose `docs_delivered` exceeds `DOCUMENT_TOTAL`** (the DB enum grew and `DOCUMENT_TYPES` did not) must count as complete — green chip and listed under **Completos**, never under **Incompletos** (pinned in Task 3 threshold test).
- **Choosing a Pago value and a Documentos value that each match a different player** must leave the list empty: the filters combine with AND, not OR (pinned in Task 3 `Al corriente + Completos` test, plus the Pago + Estatus test).
- **A player with several payments and several delivered documents** must appear exactly once in the list; a join that multiplies rows would duplicate them (pinned in Task 1 call B "one row per player" assertions for S2 and S3).
- **Re-creating the view without `with (security_invoker = true)`** would make it run as owner and leak other tenants' players with their payment state; the option must survive and isolation must hold for admin, readonly and anon (pinned in Task 1 call A + call C).
- **A player de baja** still shows both chips and is reachable through the Pago filter (pinned in Task 3: Beto is `baja` in the fixture and appears with `Sin pagos` / `Docs 2/N`; Task 1 call B asserts the baja player S4 appears as `con_adeudo`).

---

# Branch `feature/players-status-columns` (Tasks 1–3, `Closes #4`)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status` (created by the orchestrator from `develop`).

- [ ] **Step 0: Install dependencies and confirm the baseline**

Run (inside the worktree): `pnpm install --frozen-lockfile`, then `pnpm exec vitest run`.
Expected: everything passes. Write down `B_files` (Test Files) and `B_tests` (Tests) — every count below is relative to them. Expected if `develop` is unchanged: `Test Files 37 passed (37)` · `Tests 289 passed (289)`.

### How to run pgTAP against the remote (Task 1)

Facts (project memory, verified on migrations 0001–0014):
- pgTAP lives in schema `extensions`: always call `extensions.plan(n)`, `extensions.is(...)`.
- `mcp__supabase__execute_sql` returns only the **last** statement's result and runs the whole call in one implicit transaction that **commits** (fixtures persist). `set_config(..., true)` lives only for that call — so **acting as a role and the assertion that depends on it must be in the same call** (spec §3.3).
- Value assertions: one call = `select extensions.plan(N);` … setup statements … then a **single final** `select extensions.is(...) union all select extensions.is(...) …;` (or `select extensions.is(...) from r …`). Pass iff no returned row starts with `not ok`.
- Structural pgTAP (`has_view`, `has_column`) does not work across the call boundary; check catalog rows with `extensions.is(...)` instead.
- The remote has **no `tests` schema** (`tests.act_as` does not exist there). Act as a user with the inline pair:

```sql
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
```

Act as `anon` with `select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);` and return to `postgres` with `select set_config('role', 'postgres', true);`.

**Fixture UUIDs (prefix `eeeeeeee-`, used by no other test; never reuse real data):**

| What | UUID |
|---|---|
| Tenant A | `eeeeeeee-0000-0000-0000-000000000001` (slug `test-status-a`) |
| Tenant B | `eeeeeeee-0000-0000-0000-000000000002` (slug `test-status-b`) |
| Admin A (`admin-a@status.test`) | `eeeeeeee-1111-0000-0000-000000000001` |
| Readonly A (`readonly-a@status.test`) | `eeeeeeee-1111-0000-0000-000000000002` |
| Admin B (`admin-b@status.test`) | `eeeeeeee-1111-0000-0000-000000000003` |
| S1 (A, activo, no payments, documents untouched) → `sin_pagos`, `0` | `eeeeeeee-2222-0000-0000-000000000001` |
| S2 (A, activo, two `pagado`, 3 docs `fisico`) → `al_corriente`, `3` | `eeeeeeee-2222-0000-0000-000000000002` |
| S3 (A, activo, `pendiente` + `pagado`, 5 `fisico` + `image_consent` `digital`) → `con_adeudo`, `6` | `eeeeeeee-2222-0000-0000-000000000003` |
| S4 (A, **baja**, one `parcial`) → `con_adeudo`, `0` | `eeeeeeee-2222-0000-0000-000000000004` |
| S5 (B, activo, one `pendiente`) | `eeeeeeee-2222-0000-0000-000000000005` |
| Payments | `eeeeeeee-3333-0000-0000-00000000000N` (N = 1…6) |

Tenants A/B have no active season: the view still lists their players through the `left join seasons` (`0007`).

Fixture setup SQL (run as `postgres`, once, after the migration is applied):

```sql
insert into public.tenants (id, name, slug) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Test Status A', 'test-status-a'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'Test Status B', 'test-status-b');
insert into auth.users (id, email) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'admin-a@status.test'),
  ('eeeeeeee-1111-0000-0000-000000000002', 'readonly-a@status.test'),
  ('eeeeeeee-1111-0000-0000-000000000003', 'admin-b@status.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Admin A', 'admin'),
  ('eeeeeeee-1111-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'Readonly A', 'readonly'),
  ('eeeeeeee-1111-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000002', 'Admin B', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp, status) values
  ('eeeeeeee-2222-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Sin Pagos', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Al Corriente', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Con Adeudo', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Baja', '2015-06-10', 'Tutor', '111', 'baja'),
  ('eeeeeeee-2222-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000002', 'Status Test B', '2015-06-10', 'Tutor', '111', 'activo');
insert into public.payments (id, tenant_id, player_id, concept, amount, method, status) values
  ('eeeeeeee-3333-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000002', 'inscripcion', 500, 'efectivo', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000002', 'mensualidad', 200, 'efectivo', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000003', 'uniforme', 300, 'efectivo', 'pendiente'),
  ('eeeeeeee-3333-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000003', 'inscripcion', 500, 'transferencia', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000004', 'mensualidad', 100, 'efectivo', 'parcial'),
  ('eeeeeeee-3333-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-2222-0000-0000-000000000005', 'inscripcion', 500, 'efectivo', 'pendiente');
update public.documents set status = 'fisico'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000002'
    and doc_type in ('curp', 'birth_certificate', 'proof_of_address');
update public.documents set status = 'fisico'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000003'
    and doc_type <> 'image_consent';
update public.documents
  set status = 'digital',
      file_path = 'eeeeeeee-0000-0000-0000-000000000001/eeeeeeee-2222-0000-0000-000000000003/image_consent'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000003'
    and doc_type = 'image_consent';
```

Each player insert seeds its 6 `documents` rows in `pendiente` (trigger `trg_players_seed_documents`, `0008`); they and the payments cascade away with the player. The `digital` update satisfies `documents_file_path_iff_digital` and `trg_documents_enforce_rules` (`0013`: the path is `<tenant>/<player>/<doc_type>`, and the consent types need no prior consent). If any fixture statement fails, run the cleanup SQL, then stop and report the exact error — do not change any migration.

Cleanup SQL (run as `postgres`; documents and payments go with the players through `on delete cascade`):

```sql
delete from public.players where id::text like 'eeeeeeee-2222-%';
delete from public.profiles where id::text like 'eeeeeeee-1111-%';
delete from auth.users where id::text like 'eeeeeeee-1111-%';
delete from public.tenants where id::text like 'eeeeeeee-0000-%';
select (select count(*) from public.players where id::text like 'eeeeeeee-%') as leftover_players,
       (select count(*) from public.payments where id::text like 'eeeeeeee-%') as leftover_payments,
       (select count(*) from public.documents where player_id::text like 'eeeeeeee-%') as leftover_documents,
       (select count(*) from auth.users where id::text like 'eeeeeeee-%') as leftover_users,
       (select count(*) from public.tenants where id::text like 'eeeeeeee-%') as leftover_tenants;
```

Expected: all `0`. Then re-run the baseline query from Task 1 Step 1 and confirm every count matches.

### Task 1: `players_with_category` status columns (`0015`)

**Files:**
- Create: `supabase/migrations/0015_players_view_status_columns.sql`
- Create: `supabase/tests/0015_players_view_status_columns.test.sql`

**Interfaces:**
- Consumes: view `public.players_with_category` as defined in `0011` (24 columns, `security_invoker = true`); view `public.player_payment_status (player_id, tenant_id, payment_state text)` (`0014`, invoker); table `public.documents` (`status` ∈ `pendiente`/`fisico`/`digital`, index `documents_player_idx`).
- Produces: `public.players_with_category` with the same 24 columns in the same order plus, at the end, `payment_state text` (never null; `con_adeudo`/`sin_pagos`/`al_corriente`) and `docs_delivered integer` (0…n). Task 2's `PlayerRow` mirrors them.

- [ ] **Step 1 [MCP]: Record the remote baseline and the current column list**

Run with `mcp__supabase__execute_sql`:

```sql
select version(),
  (select count(*) from public.tenants) as tenants,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users) as users,
  (select count(*) from public.players) as players,
  (select count(*) from public.payments) as payments,
  (select count(*) from public.documents) as documents,
  (select count(*) from public.players where id::text like 'eeeeeeee-%') as stale_fixtures,
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category') as old_cols,
  (select name from supabase_migrations.schema_migrations where name like '0015%') as already_applied;
```

Write every value down for the report. Expected: `stale_fixtures = 0` (if not, run the cleanup SQL first), `already_applied = null` (if not null, stop and report — someone already applied `0015`), and `old_cols` exactly:

```
id,tenant_id,full_name,birth_date,curp,photo_path,status,enrollment_date,tutor_name,tutor_whatsapp,tutor_email,emergency_contact_name,emergency_contact_phone,affiliation_status,affiliation_date,created_at,updated_at,edad_liga,division,category_name,category_year,category_id,team_id,team_name
```

If `old_cols` differs from that literal, stop and report: the canonical test file and call A below assume it.

Then take the **advisors before-snapshot**: `mcp__supabase__get_advisors` with type `security`. Save the full list of findings (name + object for each) for the report — Step 8 diffs against it.

- [ ] **Step 2: Write the canonical test file**

Create `supabase/tests/0015_players_view_status_columns.test.sql` — the standard-form artifact (not run directly; Steps 3, 5 and 6 run its assertions through MCP):

```sql
begin;
select extensions.plan(20);

-- fixtures: tenants A/B, admin A, readonly A, admin B, players S1–S5, payments 1–6 (see plan Task 1 fixture block)
insert into public.tenants (id, name, slug) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Test Status A', 'test-status-a'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'Test Status B', 'test-status-b');
insert into auth.users (id, email) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'admin-a@status.test'),
  ('eeeeeeee-1111-0000-0000-000000000002', 'readonly-a@status.test'),
  ('eeeeeeee-1111-0000-0000-000000000003', 'admin-b@status.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Admin A', 'admin'),
  ('eeeeeeee-1111-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'Readonly A', 'readonly'),
  ('eeeeeeee-1111-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000002', 'Admin B', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp, status) values
  ('eeeeeeee-2222-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Sin Pagos', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Al Corriente', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Con Adeudo', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Baja', '2015-06-10', 'Tutor', '111', 'baja'),
  ('eeeeeeee-2222-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000002', 'Status Test B', '2015-06-10', 'Tutor', '111', 'activo');
insert into public.payments (id, tenant_id, player_id, concept, amount, method, status) values
  ('eeeeeeee-3333-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000002', 'inscripcion', 500, 'efectivo', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000002', 'mensualidad', 200, 'efectivo', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000003', 'uniforme', 300, 'efectivo', 'pendiente'),
  ('eeeeeeee-3333-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000003', 'inscripcion', 500, 'transferencia', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000004', 'mensualidad', 100, 'efectivo', 'parcial'),
  ('eeeeeeee-3333-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-2222-0000-0000-000000000005', 'inscripcion', 500, 'efectivo', 'pendiente');
update public.documents set status = 'fisico'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000002'
    and doc_type in ('curp', 'birth_certificate', 'proof_of_address');
update public.documents set status = 'fisico'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000003'
    and doc_type <> 'image_consent';
update public.documents
  set status = 'digital',
      file_path = 'eeeeeeee-0000-0000-0000-000000000001/eeeeeeee-2222-0000-0000-000000000003/image_consent'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000003'
    and doc_type = 'image_consent';

-- structure
select extensions.is(
  (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.players_with_category'::regclass),
  true, 'view still runs as security invoker');
select extensions.is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category'),
  'id,tenant_id,full_name,birth_date,curp,photo_path,status,enrollment_date,tutor_name,tutor_whatsapp,tutor_email,emergency_contact_name,emergency_contact_phone,affiliation_status,affiliation_date,created_at,updated_at,edad_liga,division,category_name,category_year,category_id,team_id,team_name,payment_state,docs_delivered',
  'existing columns keep their order and the two new ones are appended');
select extensions.is(
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'docs_delivered'),
  'integer', 'docs_delivered is integer');
select extensions.is(
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'payment_state'),
  'text', 'payment_state is text');

-- values (as postgres)
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001'), 'sin_pagos', 'no payments is sin_pagos');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001'), 0, 'untouched documents count 0');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002'), 'al_corriente', 'only pagado is al_corriente');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002'), 3, 'three fisico documents count 3');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo', 'a pendiente is con_adeudo');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 6, 'fisico and digital both count');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000004'), 'con_adeudo', 'baja player with a parcial appears as con_adeudo');
select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002')::int, 1, 'several payments and documents keep one row (S2)');
select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003')::int, 1, 'several payments and documents keep one row (S3)');

-- isolation (security_invoker → players/documents/player_payment_status RLS applies)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is((select count(*) from public.players_with_category)::int, 4, 'admin A sees the 4 tenant A players');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo', 'admin A reads payment_state');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 6, 'admin A reads docs_delivered');
select extensions.is((select count(*) from public.players_with_category where tenant_id = 'eeeeeeee-0000-0000-0000-000000000002')::int, 0, 'admin A sees no tenant B rows');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000002","role":"authenticated"}', true);
select extensions.is((select count(*) from public.players_with_category)::int, 4, 'readonly A sees the same rows as admin A');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is((select count(*) from public.players_with_category)::int, 1, 'admin B sees only its tenant row');
-- spec §3.3: record anon's privilege on the view before asserting what anon sees
select extensions.diag('anon select on players_with_category: ' || has_table_privilege('anon', 'public.players_with_category', 'select')::text);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is((select count(*) from public.players_with_category)::int, 0, 'anon sees no rows');
select set_config('role', 'postgres', true);

select * from extensions.finish();
rollback;
```

- [ ] **Step 3 [MCP]: Run the structure assertions before the migration (verify red)**

With `execute_sql` (call A):

```sql
select extensions.plan(4);
select extensions.is((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.players_with_category'::regclass), true, 'view still runs as security invoker')
union all select extensions.is((select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'players_with_category'), 'id,tenant_id,full_name,birth_date,curp,photo_path,status,enrollment_date,tutor_name,tutor_whatsapp,tutor_email,emergency_contact_name,emergency_contact_phone,affiliation_status,affiliation_date,created_at,updated_at,edad_liga,division,category_name,category_year,category_id,team_id,team_name,payment_state,docs_delivered', 'existing columns keep their order and the two new ones are appended')
union all select extensions.is((select data_type::text from information_schema.columns where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'docs_delivered'), 'integer', 'docs_delivered is integer')
union all select extensions.is((select data_type::text from information_schema.columns where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'payment_state'), 'text', 'payment_state is text');
```

Expected: row 1 `ok` (the view is already invoker since `0007`/`0011` — this row guards that `0015` keeps it), rows 2–4 `not ok`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0015_players_view_status_columns.sql` (spec §3.1, verbatim):

```sql
create or replace view players_with_category with (security_invoker = true) as
select
  p.*,
  extract(year from age(s.cutoff_date, p.birth_date))::int as edad_liga,
  c.division,
  c.name as category_name,
  case
    when c.id is not null
    then extract(year from age(s.cutoff_date, p.birth_date))::int - c.min_edad_liga + 1
  end as category_year,
  c.id as category_id,
  t.id as team_id,
  t.name as team_name,
  coalesce(pps.payment_state, 'sin_pagos') as payment_state,
  (
    select count(*)::int
    from documents d
    where d.player_id = p.id
      and d.tenant_id = p.tenant_id
      and d.status in ('fisico', 'digital')
  ) as docs_delivered
from players p
left join seasons s on s.tenant_id = p.tenant_id and s.is_active
left join categories c
  on c.tenant_id = p.tenant_id
 and extract(year from age(s.cutoff_date, p.birth_date))::int between c.min_edad_liga and c.max_edad_liga
left join team_players tp on tp.player_id = p.id and tp.season_id = s.id
left join teams t on t.id = tp.team_id
left join player_payment_status pps on pps.player_id = p.id;
```

- [ ] **Step 5 [MCP]: Apply it to the remote**

`mcp__supabase__apply_migration` with name `0015_players_view_status_columns` and the file's exact content. Expected: success. If Postgres rejects it (e.g. `cannot change name of view column` / `cannot drop columns from view`), stop and report the exact error — do not edit the SQL into another shape.

Re-run call A from Step 3 → four rows `ok`. Then confirm `old_cols` from Step 1 + `,payment_state,docs_delivered` equals the new list (row 2 of call A asserts exactly that literal).

**Rule from here on: never edit `0015` after it is applied.** The remote records it in `supabase_migrations.schema_migrations`; an edited file would silently diverge from production. If something about `0015` looks wrong after this step, stop and report instead of changing the file (a fix ships as `0016_…`, spec §8).

- [ ] **Step 6 [MCP]: Fixtures, values and isolation (verify green)**

1. Run the fixture setup SQL (section "How to run pgTAP").
2. Call B (as `postgres`, values):

```sql
select extensions.plan(9);
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001'), 'sin_pagos', 'no payments is sin_pagos')
union all select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001')::text, '0', 'untouched documents count 0')
union all select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002'), 'al_corriente', 'only pagado is al_corriente')
union all select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002')::text, '3', 'three fisico documents count 3')
union all select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo', 'a pendiente is con_adeudo')
union all select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003')::text, '6', 'fisico and digital both count')
union all select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000004'), 'con_adeudo', 'baja player with a parcial appears as con_adeudo')
union all select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002')::text, '1', 'several payments and documents keep one row (S2)')
union all select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003')::text, '1', 'several payments and documents keep one row (S3)');
```

Expected: nine `ok`. (Every branch of the `union all` compares `text` so the overloads line up.)

3. Record the anon privilege **before** the anon assertion (spec §3.3): `select has_table_privilege('anon', 'public.players_with_category', 'select');` — write the result down for the report (expected `true`: Supabase's default privileges on `public` cover `anon`; RLS is what yields 0 rows in call C).
4. Call C (isolation; acting and asserting in the **same** call). The final statement runs as `postgres`, so results are collected in a temp table opened to every role:

```sql
select extensions.plan(7);
create temp table r (n int, v text, expected text);
grant all on r to public;
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}', true);
insert into r values (1, (select count(*) from public.players_with_category)::text, '4');
insert into r values (2, (select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo');
insert into r values (3, (select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003')::text, '6');
insert into r values (4, (select count(*) from public.players_with_category where tenant_id = 'eeeeeeee-0000-0000-0000-000000000002')::text, '0');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000002","role":"authenticated"}', true);
insert into r values (5, (select count(*) from public.players_with_category)::text, '4');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000003","role":"authenticated"}', true);
insert into r values (6, (select count(*) from public.players_with_category)::text, '1');
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into r values (7, (select count(*) from public.players_with_category)::text, '0');
select set_config('role', 'postgres', true);
select extensions.is(v, expected, 'isolation row ' || n) from r order by n;
```

Expected: seven `ok` (1 admin A sees 4, 2–3 admin A reads S3's `con_adeudo`/`6`, 4 admin A sees 0 of B, 5 readonly A sees 4, 6 admin B sees 1, 7 anon sees 0). **If call C returns any error** (e.g. `anon` raising `permission denied` instead of returning a count) **or any `not ok` row: stop, run the cleanup (Step 9), and report to the orchestrator** with the exact error/output and the privilege value from item 3. Do not retry with a modified call and do not touch the migration.

- [ ] **Step 7 [MCP]: Query plan (spec §3.1)**

With the fixtures still in place, run with `execute_sql`:

```sql
explain select * from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003';
```

Save the full plan text for the report (it goes into the PR evidence). A hash join or seq scan over `payments`/`documents` is acceptable at league scale — just record it; do not add indexes.

- [ ] **Step 8 [MCP]: Advisors**

`mcp__supabase__get_advisors` with type `security`, then **diff against the Step 1 before-snapshot**: a finding is new if it is not in the snapshot (same name + object). Expected: no new finding (in particular none mentioning `players_with_category`; a `security_definer_view` finding would mean `security_invoker` did not survive — stop, run the cleanup, and report). Pre-existing findings are out of scope. Resolve nothing on your own; report the diff (new findings, or "none").

- [ ] **Step 9 [MCP]: Cleanup**

Run the cleanup SQL (all leftovers `0`) and the Step 1 baseline query. Every count (`tenants`, `profiles`, `users`, `players`, `payments`, `documents`) equals Step 1; `already_applied` is now `0015_players_view_status_columns`; `old_cols` now ends with `,payment_state,docs_delivered`.

- [ ] **Step 10: Existing suite and commit**

`pnpm exec vitest run` → still `B_files` / `B_tests` (no frontend change; `37` / `289` if `develop` is unchanged); `pnpm exec tsc -b`, `pnpm lint` → exit 0.

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status add supabase/migrations/0015_players_view_status_columns.sql supabase/tests/0015_players_view_status_columns.test.sql
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status commit -m "feat: add payment state and delivered documents to players_with_category (#4)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

**Report for Task 1:** who ran the [MCP] steps, baseline counts before/after, `old_cols` before and the list after, Postgres version, every assertion result (call A red 1 ok / 3 not ok, call A green 4/4, B 9/9, C 7/7), the anon privilege value (recorded before call C), the `explain` plan, advisors before-snapshot and the Step 8 diff, cleanup leftovers, commit SHA.

### Task 2: `PlayerRow` status fields, `PAYMENT_STATE_COLOR`, `DOCUMENT_TOTAL` and fixtures

**Files:**
- Modify: `src/payments/payments.ts` (after `PAYMENT_STATE_LABELS`, ~line 197)
- Modify: `src/documents/documents.ts` (after `DOCUMENT_TYPES`, line 39)
- Modify: `src/players/players.ts:1-33` (import + `PlayerRow`)
- Test: `src/payments/payments.test.ts`, `src/documents/documents.test.ts`
- Modify (fixtures only, no assertion changes): `src/payments/payments.test.ts:195-205`, `src/payments/DebtorsPage.test.tsx:28-38`, `src/players/players.test.ts:23-34`, `src/players/PlayersPage.test.tsx:15-25`, `src/players/PlayerFormPage.test.tsx:74-83`, `src/teams/teams.test.ts:16-26`, `src/teams/TeamDetailPage.test.tsx:23-31`, `src/teams/AddPlayerDialog.test.tsx:13-21`

**Interfaces:**
- Consumes: `PaymentState` (`'con_adeudo' | 'al_corriente' | 'sin_pagos'`) and `PAYMENT_STATE_LABELS` from `src/payments/payments.ts`; `DOCUMENT_TYPES: readonly DocumentType[]` from `src/documents/documents.ts`; the two view columns from Task 1.
- Produces:
  - `export const PAYMENT_STATE_COLOR: Record<PaymentState, 'warning' | 'default' | 'success'>` in `src/payments/payments.ts`.
  - `export const DOCUMENT_TOTAL: number` (`= DOCUMENT_TYPES.length`) in `src/documents/documents.ts`.
  - `PlayerRow` gains, at the end: `payment_state: PaymentState` and `docs_delivered: number`.

- [ ] **Step 1: Write the failing tests**

In `src/payments/payments.test.ts`, add `PAYMENT_STATE_COLOR` to the value import (line 5 becomes):

```ts
  deletePayment, PAYMENT_STATE_LABELS, PAYMENT_STATE_COLOR, fetchPaymentStatuses, fetchOutstandingPayments, buildDebtGroups,
```

and add right after the `PAYMENT_STATE_LABELS has the three group names` test (~line 215):

```ts
test('PAYMENT_STATE_COLOR maps each state to its chip color', () => {
  expect(PAYMENT_STATE_COLOR).toEqual({
    con_adeudo: 'warning', sin_pagos: 'default', al_corriente: 'success',
  })
})
```

In `src/documents/documents.test.ts`, add `DOCUMENT_TOTAL` to the value import (line 3 becomes):

```ts
  DOCUMENT_TYPES, DOCUMENT_TOTAL, consentGranted, filesInUse, playerFilePath, documentErrorMessage,
```

and add before `consentGranted needs both consents out of pendiente` (line 57):

```ts
test('DOCUMENT_TOTAL is the number of document types', () => {
  expect(DOCUMENT_TOTAL).toBe(DOCUMENT_TYPES.length)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/payments/payments.test.ts src/documents/documents.test.ts`
Expected: exactly 2 failures — `PAYMENT_STATE_COLOR maps each state to its chip color` (received `undefined`) and `DOCUMENT_TOTAL is the number of document types` (expected `undefined` to be `6`). Everything else in both files passes.

- [ ] **Step 3: Add the constants**

In `src/payments/payments.ts`, right after the `PAYMENT_STATE_LABELS` object:

```ts
export const PAYMENT_STATE_COLOR: Record<PaymentState, 'warning' | 'default' | 'success'> = {
  con_adeudo: 'warning',
  sin_pagos: 'default',
  al_corriente: 'success',
}
```

In `src/documents/documents.ts`, right after the `DOCUMENT_TYPES` array (after line 39):

```ts
export const DOCUMENT_TOTAL = DOCUMENT_TYPES.length
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/payments/payments.test.ts src/documents/documents.test.ts`
Expected: all pass, 0 failures.

- [ ] **Step 5: Grow `PlayerRow` and see the typecheck go red**

In `src/players/players.ts`, add after line 3 (the `../documents/documents` import):

```ts
import type { PaymentState } from '../payments/payments'
```

and append two fields at the end of `PlayerRow`, after `team_name: string | null` (view order):

```ts
  payment_state: PaymentState
  docs_delivered: number
```

`import type` is erased at runtime, so it adds no cycle even though `payments.ts` already imports `PlayerRow` from here.

Run: `pnpm exec tsc -b`
Expected: non-zero exit with `TS2741`/`TS2739` errors ("Property 'payment_state' is missing…" / "missing the following properties … payment_state, docs_delivered") in exactly these 8 files: `src/payments/payments.test.ts`, `src/payments/DebtorsPage.test.tsx`, `src/players/players.test.ts`, `src/players/PlayersPage.test.tsx`, `src/players/PlayerFormPage.test.tsx`, `src/teams/teams.test.ts`, `src/teams/TeamDetailPage.test.tsx`, `src/teams/AddPlayerDialog.test.tsx`. If any **non-test** file errors, stop and report (spec §3.2 found none).

- [ ] **Step 6: Update the 8 `PlayerRow` fixtures**

Mechanical: add `payment_state: 'sin_pagos', docs_delivered: 0` to each fixture, before `...over` where there is one. No assertion changes. Exact replacements (each `old` string is unique inside its file):

| File | Replace | With |
|---|---|---|
| `src/payments/payments.test.ts` (fn `player`, ~l.203) | `    team_id: null, team_name: null, ...over,` | `    team_id: null, team_name: null, payment_state: 'sin_pagos', docs_delivered: 0, ...over,` |
| `src/payments/DebtorsPage.test.tsx` (fn `player`, ~l.37) | `    team_id: null, team_name: null, ...over,` | `    team_id: null, team_name: null, payment_state: 'sin_pagos', docs_delivered: 0, ...over,` |
| `src/players/players.test.ts` (fn `row`, ~l.32) | `    category_id: 'cat1', team_id: null, team_name: null,\n    ...over,` | `    category_id: 'cat1', team_id: null, team_name: null,\n    payment_state: 'sin_pagos', docs_delivered: 0,\n    ...over,` |
| `src/players/PlayersPage.test.tsx` (fn `player`, l.23) | `    category_id: 'cat1', team_id: null, team_name: null, ...over,` | `    category_id: 'cat1', team_id: null, team_name: null,\n    payment_state: 'sin_pagos', docs_delivered: 0, ...over,` |
| `src/players/PlayerFormPage.test.tsx` (const `ana`, l.82) | `  category_id: 'cat1', team_id: null, team_name: null,\n}` | `  category_id: 'cat1', team_id: null, team_name: null,\n  payment_state: 'sin_pagos', docs_delivered: 0,\n}` |
| `src/teams/teams.test.ts` (fn `eligible`, ~l.24) | `    team_id: null, team_name: null, ...over,` | `    team_id: null, team_name: null, payment_state: 'sin_pagos', docs_delivered: 0, ...over,` |
| `src/teams/TeamDetailPage.test.tsx` (fn `p`, l.30) | `    category_id: 'cat1', team_id: 'team9', team_name: 'MTY AC Rojo', ...over,` | `    category_id: 'cat1', team_id: 'team9', team_name: 'MTY AC Rojo',\n    payment_state: 'sin_pagos', docs_delivered: 0, ...over,` |
| `src/teams/AddPlayerDialog.test.tsx` (fn `p`, l.20) | `    category_id: 'cat1', team_id: null, team_name: null, ...over,` | `    category_id: 'cat1', team_id: null, team_name: null,\n    payment_state: 'sin_pagos', docs_delivered: 0, ...over,` |

(`\n` = a line break keeping the file's indentation.)

- [ ] **Step 7: Verify green**

Run: `pnpm exec tsc -b` → exit 0, no output.
Run: `pnpm exec vitest run` → `B_files` files · `B_tests + 2` tests, all passing (`37` / `291` if `develop` is unchanged).
Run: `pnpm lint` → exit 0.

- [ ] **Step 8: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status add src/payments/payments.ts src/payments/payments.test.ts src/documents/documents.ts src/documents/documents.test.ts src/players/players.ts src/payments/DebtorsPage.test.tsx src/players/players.test.ts src/players/PlayersPage.test.tsx src/players/PlayerFormPage.test.tsx src/teams/teams.test.ts src/teams/TeamDetailPage.test.tsx src/teams/AddPlayerDialog.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status commit -m "feat: type the players view status columns and add chip constants (#4)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

### Task 3: Status chips and Pago / Documentos filters on `PlayersPage`

**Files:**
- Modify: `src/players/PlayersPage.tsx` (imports l.1-15, state l.30-36, `visible` l.71-77, filter `Stack` l.101-155, list l.157-166)
- Test: `src/players/PlayersPage.test.tsx`

**Interfaces:**
- Consumes: `PlayerRow.payment_state: PaymentState`, `PlayerRow.docs_delivered: number` (Task 2); `PAYMENT_STATE_LABELS`, `PAYMENT_STATE_COLOR`, `type PaymentState` from `../payments/payments`; `DOCUMENT_TOTAL` from `../documents/documents`.
- Produces: UI only — `Pago` and `Documentos` native selects; per-player `Chip`s (`MuiChip-colorWarning|Default|Success` classes, MUI 9). Nothing downstream imports from this task.

- [ ] **Step 1: Write the failing tests**

In `src/players/PlayersPage.test.tsx`:

1. Line 1 becomes:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
```

and add after line 6 (`import type { PlayerRow } from './players'`):

```tsx
import { DOCUMENT_TOTAL } from '../documents/documents'
```

2. Replace the `mocks.fetchPlayers.mockResolvedValue([...])` inside `beforeEach` (l.42-45) with the spec §6 three-player fixture. Carla gets her own category so the existing `/Infantil Mayor \(1ro\)/` assertion keeps matching a single element:

```tsx
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p1', full_name: 'Ana Ruiz', category_name: 'Infantil Mayor', category_year: 1, team_id: 'team9', team_name: 'MTY AC Rojo', payment_state: 'con_adeudo', docs_delivered: DOCUMENT_TOTAL }),
    player({ id: 'p2', full_name: 'Beto Gómez', status: 'baja', category_id: null, category_name: null, category_year: null, edad_liga: 25, team_id: null, team_name: null, payment_state: 'sin_pagos', docs_delivered: 2 }),
    player({ id: 'p3', full_name: 'Carla Paz', category_id: 'cat2', category_name: 'Infantil Menor', category_year: 2, payment_state: 'al_corriente', docs_delivered: DOCUMENT_TOTAL - 1 }),
  ])
```

3. Add a helper after `renderPage()`:

```tsx
// Chip texts also appear as filter <option>s, so look them up inside the list only.
function chip(text: string) {
  return within(screen.getByRole('list')).getByText(text).closest('.MuiChip-root')
}
```

4. Append these 10 tests at the end of the file:

```tsx
test('each player shows a payment chip and a Docs N/total chip, baja included', async () => {
  renderPage()
  await screen.findByText('Ana Ruiz')
  const list = screen.getByRole('list')
  expect(within(list).getByText('Con adeudo')).toBeInTheDocument()
  expect(within(list).getByText('Sin pagos')).toBeInTheDocument()
  expect(within(list).getByText('Al corriente')).toBeInTheDocument()
  expect(within(list).getByText(`Docs ${DOCUMENT_TOTAL}/${DOCUMENT_TOTAL}`)).toBeInTheDocument()
  expect(within(list).getByText(`Docs 2/${DOCUMENT_TOTAL}`)).toBeInTheDocument()
  expect(within(list).getByText(`Docs ${DOCUMENT_TOTAL - 1}/${DOCUMENT_TOTAL}`)).toBeInTheDocument()
})

test('payment chips are colored by state', async () => {
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(chip('Con adeudo')).toHaveClass('MuiChip-colorWarning')
  expect(chip('Sin pagos')).toHaveClass('MuiChip-colorDefault')
  expect(chip('Al corriente')).toHaveClass('MuiChip-colorSuccess')
})

test('documents chip is green when complete and amber otherwise', async () => {
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(chip(`Docs ${DOCUMENT_TOTAL}/${DOCUMENT_TOTAL}`)).toHaveClass('MuiChip-colorSuccess')
  expect(chip(`Docs 2/${DOCUMENT_TOTAL}`)).toHaveClass('MuiChip-colorWarning')
  expect(chip(`Docs ${DOCUMENT_TOTAL - 1}/${DOCUMENT_TOTAL}`)).toHaveClass('MuiChip-colorWarning')
})

test('more delivered documents than the total still count as complete, zero as incomplete', async () => {
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p4', full_name: 'Dani Sol', docs_delivered: DOCUMENT_TOTAL + 1 }),
    player({ id: 'p5', full_name: 'Eva Luna', docs_delivered: 0 }),
  ])
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Dani Sol')
  expect(chip(`Docs ${DOCUMENT_TOTAL + 1}/${DOCUMENT_TOTAL}`)).toHaveClass('MuiChip-colorSuccess')
  expect(chip(`Docs 0/${DOCUMENT_TOTAL}`)).toHaveClass('MuiChip-colorWarning')
  await user.selectOptions(screen.getByLabelText('Documentos'), 'completos')
  await waitFor(() => expect(screen.queryByText('Eva Luna')).not.toBeInTheDocument())
  expect(screen.getByText('Dani Sol')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Documentos'), 'incompletos')
  await waitFor(() => expect(screen.queryByText('Dani Sol')).not.toBeInTheDocument())
  expect(screen.getByText('Eva Luna')).toBeInTheDocument()
})

test('Pago filter keeps only that payment state and Todos restores everyone', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  const pago = screen.getByLabelText('Pago')
  await user.selectOptions(pago, 'con_adeudo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument()
  await user.selectOptions(pago, 'sin_pagos')
  await waitFor(() => expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument())
  expect(screen.getByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument()
  await user.selectOptions(pago, 'al_corriente')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Carla Paz')).toBeInTheDocument()
  expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument()
  await user.selectOptions(pago, 'Todos')
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.getByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.getByText('Carla Paz')).toBeInTheDocument()
})

test('Documentos filter splits Completos from Incompletos and Todos restores everyone', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  const docs = screen.getByLabelText('Documentos')
  await user.selectOptions(docs, 'completos')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument()
  await user.selectOptions(docs, 'incompletos')
  await waitFor(() => expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument())
  expect(screen.getByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.getByText('Carla Paz')).toBeInTheDocument()
  await user.selectOptions(docs, 'Todos')
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.getByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.getByText('Carla Paz')).toBeInTheDocument()
})

test('Pago Con adeudo plus Documentos Completos leaves only the player matching both', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.selectOptions(screen.getByLabelText('Pago'), 'con_adeudo')
  await user.selectOptions(screen.getByLabelText('Documentos'), 'completos')
  await waitFor(() => expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument()
})

test('Pago and Documentos combine with AND, not OR', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  // Carla matches Al corriente but not Completos; Ana matches Completos but not Al corriente.
  await user.selectOptions(screen.getByLabelText('Pago'), 'al_corriente')
  await user.selectOptions(screen.getByLabelText('Documentos'), 'completos')
  await waitFor(() => expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument())
  expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument()
  expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Documentos'), 'Todos')
  expect(await screen.findByText('Carla Paz')).toBeInTheDocument()
})

test('Pago combines with Estatus', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Beto Gómez')
  await user.selectOptions(screen.getByLabelText('Estatus'), 'activo')
  await user.selectOptions(screen.getByLabelText('Pago'), 'sin_pagos')
  await waitFor(() => expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument())
  expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument()
  expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Estatus'), 'Todos')
  expect(await screen.findByText('Beto Gómez')).toBeInTheDocument()
  expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument()
})

test('readonly sees the same chips and filters', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 't1' })
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(screen.getByLabelText('Pago')).toBeInTheDocument()
  expect(screen.getByLabelText('Documentos')).toBeInTheDocument()
  expect(chip('Con adeudo')).toHaveClass('MuiChip-colorWarning')
  expect(chip(`Docs ${DOCUMENT_TOTAL}/${DOCUMENT_TOTAL}`)).toHaveClass('MuiChip-colorSuccess')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: the 10 new tests fail (`Unable to find an element with the text: Con adeudo` / `Unable to find a label with the text of: Documentos` / `…: Pago`); the 11 existing tests still pass with the three-player fixture. If an existing test fails, fix the fixture (not the assertion) and say so in the report.

- [ ] **Step 3: Implement chips and filters**

Replace `src/players/PlayersPage.tsx` with:

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
import Chip from '@mui/material/Chip'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { LoadError } from '../app/LoadError'
import { PAYMENT_STATE_COLOR, PAYMENT_STATE_LABELS } from '../payments/payments'
import type { PaymentState } from '../payments/payments'
import { DOCUMENT_TOTAL } from '../documents/documents'
import { fetchPlayers, playerCategoryText } from './players'
import type { PlayerRow, PlayerStatus } from './players'

interface FilterOption {
  id: string
  name: string
}

type DocsFilter = '' | 'completos' | 'incompletos'

const PAYMENT_STATE_OPTIONS: readonly PaymentState[] = ['con_adeudo', 'sin_pagos', 'al_corriente']

function uniqueOptions(pairs: Array<[string | null, string | null]>): FilterOption[] {
  const byId = new Map<string, string>()
  for (const [id, name] of pairs) if (id && name) byId.set(id, name)
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

// >= so a count above the TS list (enum grew first) still reads as complete
function docsComplete(p: Pick<PlayerRow, 'docs_delivered'>): boolean {
  return p.docs_delivered >= DOCUMENT_TOTAL
}

export function PlayersPage() {
  const { role } = useTenant()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<'' | PlayerStatus>('')
  const [teamId, setTeamId] = useState('')
  const [paymentState, setPaymentState] = useState<'' | PaymentState>('')
  const [docsFilter, setDocsFilter] = useState<DocsFilter>('')
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (): Promise<PlayerRow[]> => fetchPlayers(), [])

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

  const categories = useMemo(
    () => uniqueOptions(players.map((p) => [p.category_id, p.category_name])),
    [players],
  )

  const teams = useMemo(
    () => uniqueOptions(players.map((p) => [p.team_id, p.team_name])),
    [players],
  )

  const visible = players.filter((p) => {
    if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryId && p.category_id !== categoryId) return false
    if (status && p.status !== status) return false
    if (teamId && p.team_id !== teamId) return false
    if (paymentState && p.payment_state !== paymentState) return false
    if (docsFilter === 'completos' && !docsComplete(p)) return false
    if (docsFilter === 'incompletos' && docsComplete(p)) return false
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

      {loadError ? (
        <LoadError onRetry={handleRetry} />
      ) : (
        <>
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
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 180 }}
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
            <TextField
              select
              label="Equipo"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            >
              <option value="">Todos</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </TextField>
            <TextField
              select
              label="Pago"
              value={paymentState}
              onChange={(e) => setPaymentState(e.target.value as '' | PaymentState)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            >
              <option value="">Todos</option>
              {PAYMENT_STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATE_LABELS[s]}
                </option>
              ))}
            </TextField>
            <TextField
              select
              label="Documentos"
              value={docsFilter}
              onChange={(e) => setDocsFilter(e.target.value as DocsFilter)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            >
              <option value="">Todos</option>
              <option value="completos">Completos</option>
              <option value="incompletos">Incompletos</option>
            </TextField>
          </Stack>

          <List sx={{ mt: 2 }}>
            {visible.map((p) => (
              <ListItemButton key={p.id} component={RouterLink} to={`/jugadores/${p.id}`}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <ListItemText
                    primary={p.full_name}
                    secondary={`${playerCategoryText(p)} · ${p.status}${p.team_name ? ` · ${p.team_name}` : ''}`}
                  />
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                    <Chip
                      size="small"
                      label={PAYMENT_STATE_LABELS[p.payment_state]}
                      color={PAYMENT_STATE_COLOR[p.payment_state]}
                    />
                    <Chip
                      size="small"
                      label={`Docs ${p.docs_delivered}/${DOCUMENT_TOTAL}`}
                      color={docsComplete(p) ? 'success' : 'warning'}
                    />
                  </Stack>
                </Box>
              </ListItemButton>
            ))}
          </List>
        </>
      )}
    </Box>
  )
}
```

Notes for the implementer (do not deviate):
- The chips stay **outside** `ListItemText`'s `secondary` (a `<p>`; a `div` inside it would be invalid HTML) and the secondary string is byte-for-byte unchanged (existing tests match it).
- The `Box` wrapper is the single flex child of `ListItemButton` (a row flexbox): without it the text and the chips would sit side by side. `minWidth: 0` keeps long content from widening the row on 360 px.
- Keep `List` → `ListItemButton` as is (no `ListItem`): that is #71.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: 21 tests, all passing (11 existing + 10 new).

- [ ] **Step 5: Full verification**

Run: `pnpm exec vitest run` → `B_files` files · `B_tests + 12` tests, all passing (`Test Files 37 passed (37)` · `Tests 301 passed (301)` if `develop` is unchanged).
Run: `pnpm exec tsc -b` → exit 0, no output.
Run: `pnpm lint` → exit 0.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status add src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-status commit -m "feat: show payment and document status chips and filters on the players list (#4)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

## Verification checklist (implementer, before reporting)

- [ ] `pnpm exec vitest run` → `B_files + 0` files · `B_tests + 12` tests, all passing (`Test Files 37 passed (37)` · `Tests 301 passed (301)` if `develop` is unchanged).
- [ ] `pnpm exec tsc -b` → exit 0, no output.
- [ ] `pnpm lint` → exit 0.
- [ ] Task 1 MCP evidence in the report: call A red (1 `ok` / 3 `not ok`) then green 4/4, B 9/9, C 7/7 all `ok`; `old_cols` before + the list after (= before + `,payment_state,docs_delivered`); anon privilege value (recorded before call C); `explain` plan text; advisors diff vs the Step 1 snapshot with no new finding; cleanup leftovers all `0` and baseline counts equal (incl. `auth.users` and `documents`).
- [ ] `git -C $WT diff --stat develop..HEAD -- supabase` lists only the two `0015` files; `git -C $WT diff develop..HEAD -- supabase/migrations/0015_players_view_status_columns.sql` matches Task 1 Step 4 exactly (never edited after apply).
- [ ] `grep -rnE "Docs [0-9]" src/players` → no output (every `Docs …` text is built from `DOCUMENT_TOTAL`; no literal total in UI code or UI tests).
- [ ] `git -C $WT log --oneline develop..HEAD` shows exactly 3 commits (Tasks 1–3), each ending with the `Claude-Session` line; `git -C $WT status --short` is empty.
- [ ] `git -C $WT ls-files | grep -E '^\.env'` → empty.

**Report:** commit SHAs, baseline and final test counts, Task 1 evidence (or "MCP run by orchestrator" with their evidence), anything adapted from the plan and why. The orchestrator copies the `explain` plan and the pgTAP results into the PR body (`Closes #4`).

## Manual browser E2E (orchestrator's tester, after the PR is merged to `develop`)

Orchestrator runs the dev server from the main checkout on `develop`; a tester agent drives Playwright; the owner pastes the magic link. Production runs `main`, which ignores the extra columns (`select('*')` with the old `PlayerRow`), so `0015` being live before the merge to `main` is harmless.

**Preflight (orchestrator):** if the list shows chips without text, PostgREST has a stale schema cache: run `notify pgrst, 'reload schema';` via `execute_sql` and reload. Confirm no leftovers from a previous run: `select count(*) from public.players where full_name like 'E2E Status%';` → `0`.

**Test data rule:** the tester creates two dedicated players through **Nuevo jugador**: `E2E Status Uno` and `E2E Status Dos` (any valid birth date, tutor data). Payments and document changes are made **only** on these two. Never modify a real player.

**Admin:**
- [ ] Both new players show `Sin pagos` (grey) and `Docs 0/6` (amber) under the unchanged `categoría · estatus · equipo` line.
- [ ] Open `E2E Status Uno`, register a payment with Estatus **Pendiente**, go back to the list → its chip is `Con adeudo` (amber).
- [ ] Open `E2E Status Dos`, mark all 6 documents **Físico**, go back → `Docs 6/6` (green). Register a **Pagado** payment → `Al corriente` (green).
- [ ] Filter **Pago** = Con adeudo → `E2E Status Uno` listed, `E2E Status Dos` not. **Documentos** = Completos (Pago back to Todos) → `Dos` listed, `Uno` not.
- [ ] Pago = Al corriente + Documentos = Completos → `Dos` listed; add Estatus = Baja → `Dos` disappears (real players may remain — only check the `E2E Status` ones); Estatus = Todos restores `Dos`.
- [ ] Pago = Con adeudo + Documentos = Completos → `Uno` not listed (AND).
- [ ] Every filter back to Todos/Todas → the full list returns.

**Readonly:**
- [ ] Same list with the same chips (both `E2E Status` players with their colors); **Pago** and **Documentos** filters work; no **Nuevo jugador** button.

**Mobile (admin and readonly), viewport 360 × 740 and 390 × 844:**
- [ ] The 6 filters stack in one column; chips wrap under the name; no horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`).

**Cleanup (orchestrator, via SQL; payments and documents cascade):**

```sql
delete from public.players where full_name like 'E2E Status%';
select count(*) from public.players where full_name like 'E2E Status%';
```

Expected: `0`. If the tester uploaded any digital file for these players, also remove the Storage objects under `<tenant>/<player>/` before deleting (the plan's E2E only uses Físico, so there should be none).

After merge: #4 closes via `Closes #4`. The orchestrator files the follow-up issue for a "sin resultados" message when filters leave the list empty (spec §5.2/§5.5).

---

## Spec coverage (self-review)

| Spec § | Requirement | Task |
|---|---|---|
| §1 | Out of scope: #71, #5, #72, `0014`, `documents`/`payments`/RLS, `DebtorsPage` | Global Constraints; no task touches them; Task 3 note on `List` |
| §2 data in the view, two columns appended | `payment_state`, `docs_delivered` | Task 1 Step 4 |
| §2 migration shape (`create or replace`, same `security_invoker`, same order) | | Task 1 Steps 3–5 (call A row 1 + row 2) |
| §2 `left join player_payment_status` + `coalesce(…,'sin_pagos')` | | Task 1 Step 4; S1 asserts `sin_pagos` |
| §2 scalar `count(*)::int`, `fisico`+`digital` | | Task 1 Step 4; S2 = 3, S3 = 6 (digital counted), type `integer` |
| §2 `DOCUMENT_TOTAL` | | Task 2 Steps 1–4 |
| §2 `PAYMENT_STATE_COLOR` | | Task 2 Steps 1–4 |
| §2 chips under the secondary line, wrap | | Task 3 Step 3 |
| §2 client filters, native selects, AND | | Task 3 (tests 5–9) |
| §2 `fetchPlayers`/`fetchPlayer` unchanged | no change, no new data-layer test | Task 2 (only `PlayerRow`) |
| §3.1 view SQL verbatim, no grants, `d.tenant_id = p.tenant_id` | | Task 1 Step 4 |
| §3.1 PostgREST reload | `notify pgrst` if columns missing | E2E preflight |
| §3.1 `explain` recorded in PR | | Task 1 Step 7, Report |
| §3.2 consumers: 8 `PlayerRow` fixtures | | Task 2 Steps 5–6 |
| §3.3 canonical file + MCP run (`eeeeeeee-` prefix, explicit cleanup incl. `auth.users`, counts to baseline, role + assertion same call, `is()`-only, catalog structure, advisors) | | Task 1 Steps 1–9 |
| §3.3 old column list captured before apply and compared | | Task 1 Steps 1, 5 |
| §3.3 value cases (sin pagos/0, pagado, pendiente, 3 fisico, 5 fisico + digital = 6, baja parcial, one row per player) | | Task 1 call B |
| §3.3 isolation (admin A rows + values, 0 of B, readonly = admin, admin B, anon diag then 0) | | Task 1 Step 6 item 3 + call C |
| §4 `PlayerRow` + 2 fields, `import type` | | Task 2 Step 5 |
| §5.1 Box/Stack layout, payment chip, docs chip colors, baja included | | Task 3 Step 3; tests 1–3 |
| §5.2 Pago/Documentos filters, options, `>=` threshold | | Task 3 Step 3; tests 4–6 |
| §5.3 roles: same list for readonly, only Nuevo jugador differs | | Task 3 test 10 (+ existing readonly test) |
| §5.4 mobile 360 px, no horizontal scroll | | E2E mobile (360 and 390) |
| §5.5 errors: `LoadError` unchanged; no defensive code; empty list | | Task 3 Step 3 (existing retry test still green) |
| §6 three-player fixture (Ana/Beto/Carla), chip colors via `.MuiChip-root`, threshold, filters, AND combos, Pago+Estatus, readonly, `within(list)` | | Task 3 Step 1 |
| §6 `payments.test.ts` `PAYMENT_STATE_COLOR`, `documents.test.ts` `DOCUMENT_TOTAL` | | Task 2 Step 1 |
| §7 file list | all 10 + 7 fixture files | Tasks 1–3 |
| §8 one branch, `Closes #4`, order migration → types → UI, immutability, verification, E2E with `E2E Status` players and SQL cleanup | | Global Constraints, Tasks 1–3, checklists, E2E |
| §9 risks | accepted; no task (rollback/`0016` path noted in Global Constraints) | — |

Decisions the spec left open, resolved here:
- pgTAP fixtures fold the spec's seven value cases into five players (S2 carries both "pagado" and "3 fisico" plus two payments; S3 carries "pendiente", "5 fisico + digital" and two payments), so "one row per player" is asserted on the two players that would multiply under a bad join.
- Call A's `security_invoker` row is already `ok` before the migration (the view has been invoker since `0007`); red is rows 2–4. It stays in call A as the guard that `0015` keeps the option.
- `docs_delivered` comparisons in the MCP calls are cast to `text` so every `union all` branch uses the same `is()` overload.
- In the UI fixture Carla gets her own category (`cat2`, `Infantil Menor`) so the existing `/Infantil Mayor \(1ro\)/` `getByText` keeps matching a single element.
- A shared `docsComplete()` helper drives both the chip color and the Documentos filter, so the `>=` threshold cannot drift between them; Pago options come from a fixed `PAYMENT_STATE_OPTIONS` order with texts from `PAYMENT_STATE_LABELS`.
- Mobile E2E checks both 360 px (spec §5.4) and 390 px (orchestrator's standard viewport).
- E2E creates the two `E2E Status` players through the UI (no SQL seeding), which also exercises the `0008` document seeding on a fresh player (`Docs 0/6`).
- No literal total: the verification checklist greps `src/players` for a hard-coded `Docs N` text.
