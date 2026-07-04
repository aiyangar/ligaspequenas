# SideQuest A — Equipos y rosters por temporada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add teams (one or many per category, scoped per season) and single-team-per-player rosters, with server-enforced category validation and bidirectional assignment UI (from the player and from the team).

**Architecture:** Two new tables (`teams`, `team_players`) with composite-FK tenant integrity and a `unique (player_id, season_id)` roster rule; a `security definer` trigger validates the player's derived category against the team's category (locking the team row to close a TOCTOU with a category-change guard trigger); a `teams_with_meta` view feeds the teams list and the existing `players_with_category` view gains `category_id`/`team_id`/`team_name`. A new `src/teams/` React module mirrors the `src/players/` conventions; the players UI gains a team selector (edit mode) and a team column/filter.

**Tech Stack:** React 19 + MUI v9 + react-router-dom 7, Supabase (Postgres + RLS), Vitest 4 + Testing Library. DB changes are applied to **remote Supabase `main` via the Supabase MCP tools** (no local Docker stack — see the project memory `db-migrations-tests-via-mcp` / `no-local-docker-stack`).

## Global Constraints

- **Branch:** all work on `feature/teams-rosters` (already checked out). Never commit to `main`/`develop`. The `protect-git` hook enforces this.
- **Language:** code/identifiers/comments in English; commit messages in English; UI copy in Spanish (matches existing app).
- **Comments:** none by default; at most a one-line *why* for a non-obvious decision.
- **Exports:** named exports only (no `default`). Feature files live under `src/teams/`. Import paths are relative (no `@/` alias).
- **Tests:** colocated (`*.test.ts` / `*.test.tsx`). `test` is a Vitest global; import `{ beforeEach, expect, vi }` (and `waitFor` etc. from `@testing-library/react`) as the existing tests do.
- **MUI native selects:** use `slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}` and `<option>` children (existing pattern). Required `TextField`s render label + `" *"`, so tests query labels with regex.
- **Writes carry `tenant_id`** from `useTenant().tenantId`; reads rely on RLS (no tenant filter in queries).
- **DB verification via MCP:** `apply_migration` to apply; `execute_sql` returns only the LAST statement's result and there is no `pg_prove`. Value assertions = exactly two statements in one call: `select extensions.plan(N);` then a single `select extensions.is(...) union all select extensions.is(...) ...;` (pass iff no returned row starts with `not ok`). Structural checks (`col_is_unique`, `fk_ok`) do NOT work through `execute_sql` — verify constraints via direct `pg_constraint` catalog SELECTs. Fixtures persist (no rollback) — DELETE them at the end and confirm baseline. Run `get_advisors({ type: 'security' })` after each DDL.
- **Migration numbering:** next is `0009`; then `0010`, `0011`. Canonical `supabase/tests/000X_*.test.sql` files keep the `begin; select plan(N); …; select * from finish(); rollback;` form as future-tooling artifacts (NOT run through `execute_sql`).
- **Verification before completion:** each task ends green (`pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`). DB tasks additionally show the MCP assertion output and a clean security advisor list.

---

## File Structure

**Create (DB):**
- `supabase/migrations/0009_teams_rosters.sql` — tables, integrity uniques, RLS, `teams_with_meta` view.
- `supabase/migrations/0010_enforce_team_category.sql` — category-enforcement + category-change-guard triggers.
- `supabase/migrations/0011_players_view_add_team.sql` — extend `players_with_category`.
- `supabase/tests/0009_teams_rosters.test.sql`, `0010_enforce_team_category.test.sql`, `0011_players_view_add_team.test.sql` — canonical artifacts.

**Create (TS):**
- `src/teams/teams.ts` (+ `teams.test.ts`) — types + data layer + grouping helper.
- `src/teams/TeamForm.tsx` (+ `TeamForm.test.tsx`) — presentational form.
- `src/teams/TeamFormPage.tsx` (+ `TeamFormPage.test.tsx`) — create/edit page.
- `src/teams/TeamsPage.tsx` (+ `TeamsPage.test.tsx`) — list grouped by category.
- `src/teams/AddPlayerDialog.tsx` (+ `AddPlayerDialog.test.tsx`) — eligible-players dialog.
- `src/teams/TeamDetailPage.tsx` (+ `TeamDetailPage.test.tsx`) — team header + roster.

**Modify (TS):**
- `src/players/players.ts` — extend `PlayerRow` with `category_id`, `team_id`, `team_name` (+ fix existing fixtures).
- `src/players/PlayerFormPage.tsx` (+ test) — team selector in edit mode.
- `src/players/PlayersPage.tsx` (+ test) — team column + filter.
- `src/app/routes.tsx` — team routes.
- `src/app/AppLayout.tsx` — "Equipos" nav link.

---

## Task 1: Migration 0009 — tables, integrity, RLS, `teams_with_meta` view

**Files:**
- Create: `supabase/migrations/0009_teams_rosters.sql`
- Create: `supabase/tests/0009_teams_rosters.test.sql`

**Interfaces:**
- Consumes: existing `tenants`, `seasons`, `categories`, `players` tables; `players_id_tenant_uk` (0006); helpers `private.current_tenant_id()` / `private.is_admin()` (0003); `set_updated_at()` (0001).
- Produces: tables `public.teams`, `public.team_players`; uniques `seasons_id_tenant_uk`, `categories_id_tenant_uk`, `teams` composite unique `(id, tenant_id, season_id)`, roster `unique (player_id, season_id)`; view `public.teams_with_meta` with columns `id, tenant_id, season_id, category_id, name, coach, color, created_at, updated_at, category_name, division, category_sort_order, season_is_active, player_count`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0009_teams_rosters.sql`:

```sql
-- tenant-integrity uniques needed for the composite FKs below (0006 pattern)
alter table seasons add constraint seasons_id_tenant_uk unique (id, tenant_id);
alter table categories add constraint categories_id_tenant_uk unique (id, tenant_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  season_id uuid not null,
  category_id uuid not null,
  name text not null,
  coach text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_season_fk foreign key (season_id, tenant_id) references seasons (id, tenant_id),
  constraint teams_category_fk foreign key (category_id, tenant_id) references categories (id, tenant_id),
  constraint teams_tenant_season_name_uk unique (tenant_id, season_id, name),
  constraint teams_id_tenant_season_uk unique (id, tenant_id, season_id)
);
create index teams_tenant_idx on teams (tenant_id);

create table team_players (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  season_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_players_team_fk foreign key (team_id, tenant_id, season_id)
    references teams (id, tenant_id, season_id) on delete cascade,
  constraint team_players_player_fk foreign key (player_id, tenant_id)
    references players (id, tenant_id) on delete cascade,
  constraint team_players_player_season_uk unique (player_id, season_id)
);
create index team_players_tenant_idx on team_players (tenant_id);
create index team_players_team_idx on team_players (team_id);
create index team_players_player_idx on team_players (player_id);

create trigger trg_teams_updated before update on teams for each row execute function set_updated_at();
create trigger trg_team_players_updated before update on team_players for each row execute function set_updated_at();

alter table teams enable row level security;
alter table team_players enable row level security;

create policy teams_select on teams for select to authenticated using (tenant_id = private.current_tenant_id());
create policy teams_insert on teams for insert to authenticated with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy teams_update on teams for update to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy teams_delete on teams for delete to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin());

create policy team_players_select on team_players for select to authenticated using (tenant_id = private.current_tenant_id());
create policy team_players_insert on team_players for insert to authenticated with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy team_players_update on team_players for update to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy team_players_delete on team_players for delete to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin());

create view teams_with_meta with (security_invoker = true) as
select
  t.*,
  c.name as category_name,
  c.division,
  c.sort_order as category_sort_order,
  s.is_active as season_is_active,
  (select count(*) from team_players tp where tp.team_id = t.id) as player_count
from teams t
join categories c on c.id = t.category_id
join seasons s on s.id = t.season_id;
```

- [ ] **Step 2: Apply the migration via MCP**

Use `mcp__supabase__apply_migration` with `name: "0009_teams_rosters"` and the SQL above.
Expected: success (no error).

- [ ] **Step 3: Verify structure via the catalog (structural pgTAP does not work through execute_sql)**

Use `mcp__supabase__execute_sql`:

```sql
select
  to_regclass('public.teams') is not null as teams_exists,
  to_regclass('public.team_players') is not null as roster_exists,
  to_regclass('public.teams_with_meta') is not null as view_exists,
  exists(select 1 from pg_constraint where conname = 'team_players_player_season_uk' and contype = 'u') as player_season_uk,
  exists(select 1 from pg_constraint where conname = 'team_players_team_fk' and contype = 'f') as team_fk,
  exists(select 1 from pg_constraint where conname = 'teams_id_tenant_season_uk' and contype = 'u') as teams_composite_uk,
  (select count(*) from pg_policies where tablename in ('teams','team_players')) as policy_count;
```
Expected: all booleans `true`, `policy_count = 8`.

- [ ] **Step 4: Run security advisors**

Use `mcp__supabase__get_advisors` with `{ type: 'security' }`.
Expected: no new findings for `teams` / `team_players` / `teams_with_meta` (RLS enabled; view is `security_invoker`).

- [ ] **Step 5: Write the canonical test artifact**

Create `supabase/tests/0009_teams_rosters.test.sql`:

```sql
begin;
select plan(5);

select has_table('public', 'teams', 'teams table exists');
select has_table('public', 'team_players', 'team_players table exists');
select col_is_unique('public', 'team_players', array['player_id','season_id'], 'one team per player per season');
select fk_ok('public','team_players', array['team_id','tenant_id','season_id'], 'public','teams', array['id','tenant_id','season_id'], 'roster -> teams composite FK');
select fk_ok('public','team_players', array['player_id','tenant_id'], 'public','players', array['id','tenant_id'], 'roster -> players composite FK');

select * from finish();
rollback;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_teams_rosters.sql supabase/tests/0009_teams_rosters.test.sql
git commit -m "feat: add teams and per-season roster tables with RLS and meta view"
```

---

## Task 2: Migration 0010 — category-enforcement + category-change-guard triggers

**Files:**
- Create: `supabase/migrations/0010_enforce_team_category.sql`
- Create: `supabase/tests/0010_enforce_team_category.test.sql`

**Interfaces:**
- Consumes: `public.teams`, `public.team_players`, `public.players`, `public.seasons`, `public.categories` (from Task 1 + base schema); the `private` schema (0003).
- Produces: behavior only — inserting/updating a `team_players` row raises unless the player is `activo` and their derived category (against the team's season `cutoff_date`) equals the team's `category_id`; updating a `teams` row's `category_id`/`season_id` raises if that team has roster rows.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0010_enforce_team_category.sql`:

```sql
create or replace function private.enforce_team_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_birth date;
  v_status public.player_status;
  v_edad int;
  v_expected uuid;
begin
  -- lock the team row so a concurrent teams.category_id change serializes (TOCTOU guard)
  select * into v_team from public.teams where id = new.team_id for update;

  select birth_date, status into v_birth, v_status
  from public.players where id = new.player_id;

  if v_status <> 'activo'::public.player_status then
    raise exception 'player % is not activo; cannot be rostered', new.player_id;
  end if;

  select extract(year from age(s.cutoff_date, v_birth))::int into v_edad
  from public.seasons s where s.id = v_team.season_id;

  select c.id into v_expected
  from public.categories c
  where c.tenant_id = v_team.tenant_id
    and v_edad between c.min_edad_liga and c.max_edad_liga;

  if v_expected is null then
    raise exception 'player % is out of category (edad_liga %); cannot be rostered', new.player_id, v_edad;
  end if;

  if v_expected <> v_team.category_id then
    raise exception 'player category does not match team category';
  end if;

  return new;
end;
$$;

create trigger trg_team_players_enforce_category
  before insert or update on public.team_players
  for each row execute function private.enforce_team_category();

create or replace function private.guard_team_category_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.category_id <> old.category_id or new.season_id <> old.season_id)
     and exists (select 1 from public.team_players tp where tp.team_id = old.id) then
    raise exception 'cannot change category/season of a team with players; empty the roster first';
  end if;
  return new;
end;
$$;

create trigger trg_teams_guard_category_change
  before update on public.teams
  for each row execute function private.guard_team_category_change();
```

- [ ] **Step 2: Apply the migration via MCP**

`mcp__supabase__apply_migration` with `name: "0010_enforce_team_category"` and the SQL above.
Expected: success.

- [ ] **Step 3: Insert fixtures for behavioral tests**

`mcp__supabase__execute_sql` (ids are fixed test UUIDs; season/category resolved by subquery against the seeded Liga MTY AC tenant `00000000-0000-0000-0000-000000000001`):

```sql
-- player aged into "Infantil Mayor" (11-12) at cutoff 2027-04-30
insert into players (id, tenant_id, full_name, birth_date, status, tutor_name, tutor_whatsapp)
values ('aaaa1111-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','TEST Ana Mayor','2015-06-10','activo','T','0');
-- a "baja" player also in Infantil Mayor
insert into players (id, tenant_id, full_name, birth_date, status, tutor_name, tutor_whatsapp)
values ('aaaa1111-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','TEST Baja','2015-06-10','baja','T','0');
-- a second activo Infantil Mayor player (kept separate so each assertion isolates one rule)
insert into players (id, tenant_id, full_name, birth_date, status, tutor_name, tutor_whatsapp)
values ('aaaa1111-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','TEST Bob Mayor','2015-06-10','activo','T','0');
-- team in Infantil Mayor and a team in Infantil Menor (9-10), active season
insert into teams (id, tenant_id, season_id, category_id, name)
values (
  'bbbb2222-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
  (select id from seasons where tenant_id='00000000-0000-0000-0000-000000000001' and is_active),
  (select id from categories where tenant_id='00000000-0000-0000-0000-000000000001' and name='Infantil Mayor'),
  'TEST Mayor A');
insert into teams (id, tenant_id, season_id, category_id, name)
values (
  'bbbb2222-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
  (select id from seasons where tenant_id='00000000-0000-0000-0000-000000000001' and is_active),
  (select id from categories where tenant_id='00000000-0000-0000-0000-000000000001' and name='Infantil Menor'),
  'TEST Menor A');
select 'fixtures ready' as status;
```
Expected: `fixtures ready`.

- [ ] **Step 4: Assert trigger behavior (three ordered `execute_sql` calls)**

Each assertion uses a **distinct** player, so results never depend on branch evaluation order or on another assertion's side effect.

**4a — create the exception-capturing helpers** (`mcp__supabase__execute_sql`):

```sql
create or replace function public._test_try_assign(p_team uuid, p_player uuid) returns text
language plpgsql as $$
begin
  insert into team_players (tenant_id, season_id, team_id, player_id)
  select tenant_id, season_id, id, p_player from teams where id = p_team;
  return 'ok';
exception when others then
  return 'error';
end; $$;

create or replace function public._test_try_change_category(p_team uuid) returns text
language plpgsql as $$
begin
  update teams set category_id =
    (select id from categories where tenant_id='00000000-0000-0000-0000-000000000001' and name='Infantil Menor')
  where id = p_team;
  return 'ok';
exception when others then
  return 'error';
end; $$;
select 'helpers ready' as status;
```
Expected: `helpers ready`.

**4b — insert rules** (`mcp__supabase__execute_sql`): Ana (Mayor, activo) rejected from a Menor team (category), the baja player rejected from a Mayor team (status), Bob (Mayor, activo) accepted:

```sql
select extensions.plan(3);
select extensions.is(
  (select public._test_try_assign('bbbb2222-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000001')),
  'error', 'wrong-category assignment is rejected')
union all select extensions.is(
  (select public._test_try_assign('bbbb2222-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000002')),
  'error', 'baja player is rejected')
union all select extensions.is(
  (select public._test_try_assign('bbbb2222-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000003')),
  'ok', 'activo player matching category is accepted');
```
Expected: no returned row begins with `not ok`. Assertion 3 leaves Bob rostered on Mayor A.

**4c — category-change guard** (`mcp__supabase__execute_sql`), run after 4b so Mayor A has a roster:

```sql
select extensions.plan(1);
select extensions.is(
  (select public._test_try_change_category('bbbb2222-0000-0000-0000-000000000001')),
  'error', 'changing category of a team with roster is rejected');
```
Expected: no returned row begins with `not ok`.

- [ ] **Step 5: Clean up fixtures and helpers, confirm baseline**

`mcp__supabase__execute_sql`:

```sql
delete from team_players where player_id in ('aaaa1111-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000003');
delete from teams where id in ('bbbb2222-0000-0000-0000-000000000001','bbbb2222-0000-0000-0000-000000000002');
delete from players where id in ('aaaa1111-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000003');
drop function public._test_try_assign(uuid, uuid);
drop function public._test_try_change_category(uuid);
select (select count(*) from teams) as teams_left, (select count(*) from team_players) as roster_left;
```
Expected: `teams_left = 0`, `roster_left = 0`.

- [ ] **Step 6: Run security advisors**

`mcp__supabase__get_advisors` with `{ type: 'security' }`.
Expected: no new findings (the `private.*` trigger functions use `security definer` + `search_path = ''`, matching the 0003/0008 hardening).

- [ ] **Step 7: Write the canonical test artifact**

Create `supabase/tests/0010_enforce_team_category.test.sql`:

```sql
begin;
select plan(1);

select has_function('private', 'enforce_team_category', 'category-enforcement trigger fn exists');

select * from finish();
rollback;
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0010_enforce_team_category.sql supabase/tests/0010_enforce_team_category.test.sql
git commit -m "feat: enforce team category and guard category change via triggers"
```

---

## Task 3: Migration 0011 — extend `players_with_category` with team columns

**Files:**
- Create: `supabase/migrations/0011_players_view_add_team.sql`
- Create: `supabase/tests/0011_players_view_add_team.test.sql`

**Interfaces:**
- Consumes: `players_with_category` (0007), `team_players`, `teams` (Task 1).
- Produces: `players_with_category` gains `category_id uuid`, `team_id uuid`, `team_name text` (all nullable). Team columns reflect the **active season** roster only.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0011_players_view_add_team.sql` (full view redefinition, new columns appended; team join keyed on the active season, so `unique (player_id, season_id)` guarantees at most one match — no row multiplication):

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
  t.name as team_name
from players p
left join seasons s on s.tenant_id = p.tenant_id and s.is_active
left join categories c
  on c.tenant_id = p.tenant_id
 and extract(year from age(s.cutoff_date, p.birth_date))::int between c.min_edad_liga and c.max_edad_liga
left join team_players tp on tp.player_id = p.id and tp.season_id = s.id
left join teams t on t.id = tp.team_id;
```

- [ ] **Step 2: Apply the migration via MCP**

`mcp__supabase__apply_migration` with `name: "0011_players_view_add_team"` and the SQL above.
Expected: success.

- [ ] **Step 3: Verify the new columns exist and default to null for an unrostered player**

`mcp__supabase__execute_sql`:

```sql
select
  exists(select 1 from information_schema.columns where table_name='players_with_category' and column_name='category_id') as has_category_id,
  exists(select 1 from information_schema.columns where table_name='players_with_category' and column_name='team_id') as has_team_id,
  exists(select 1 from information_schema.columns where table_name='players_with_category' and column_name='team_name') as has_team_name;
```
Expected: all `true`.

- [ ] **Step 4: Run security advisors**

`mcp__supabase__get_advisors` with `{ type: 'security' }`.
Expected: no new findings (view stays `security_invoker`).

- [ ] **Step 5: Write the canonical test artifact**

Create `supabase/tests/0011_players_view_add_team.test.sql`:

```sql
begin;
select plan(3);

select has_column('public', 'players_with_category', 'category_id', 'view exposes category_id');
select has_column('public', 'players_with_category', 'team_id', 'view exposes team_id');
select has_column('public', 'players_with_category', 'team_name', 'view exposes team_name');

select * from finish();
rollback;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0011_players_view_add_team.sql supabase/tests/0011_players_view_add_team.test.sql
git commit -m "feat: expose category_id and active-season team on players view"
```

---

## Task 4: `teams.ts` — types, data layer, grouping helper

**Files:**
- Create: `src/teams/teams.ts`
- Create: `src/teams/teams.test.ts`
- Modify: `src/players/players.ts` (extend `PlayerRow`)
- Modify: `src/players/players.test.ts`, `src/players/PlayersPage.test.tsx`, `src/players/PlayerFormPage.test.tsx` (fixtures gain the 3 new fields)

**Interfaces:**
- Consumes: `supabase` client (`../lib/supabase`), `PlayerRow` (`../players/players`).
- Produces:
  - Types `TeamRow`, `TeamFormValues`, `SeasonRow`, `CategoryRow`, `EligibleGroup`, and results `CreateTeamResult`, `MutationResult`.
  - `fetchActiveSeason(): Promise<SeasonRow | null>`
  - `fetchCategories(): Promise<CategoryRow[]>`
  - `fetchTeams(): Promise<TeamRow[]>` (active season only, ordered by category then name)
  - `fetchTeam(id: string): Promise<TeamRow | null>`
  - `fetchRoster(teamId: string): Promise<PlayerRow[]>`
  - `fetchEligiblePlayers(categoryId: string, teamId: string): Promise<PlayerRow[]>`
  - `groupEligibleByCurrentTeam(players: PlayerRow[]): EligibleGroup[]`
  - `createTeam(values, tenantId, seasonId): Promise<CreateTeamResult>`
  - `updateTeam(id, values): Promise<MutationResult>`
  - `deleteTeam(id): Promise<MutationResult>`
  - `assignPlayer(teamId, playerId, tenantId, seasonId): Promise<MutationResult>`
  - `movePlayer(playerId, seasonId, newTeamId): Promise<MutationResult>`
  - `removeFromRoster(playerId, seasonId): Promise<MutationResult>`

- [ ] **Step 1: Extend `PlayerRow` and fix existing fixtures**

In `src/players/players.ts`, add three fields to the `PlayerRow` interface after `category_year`:

```ts
  category_year: number | null
  category_id: string | null
  team_id: string | null
  team_name: string | null
```

In `src/players/players.test.ts` (the `row()` helper literal), `src/players/PlayersPage.test.tsx` (the `player()` helper literal) and `src/players/PlayerFormPage.test.tsx` (the `fetchPlayer` mock literal), add to each fixture object (use `'cat1'` so the PlayerFormPage fixture already matches the team selector Task 10 exercises):

```ts
    category_id: 'cat1', team_id: null, team_name: null,
```

- [ ] **Step 2: Run the players tests to confirm they still pass (type + fixtures)**

Run: `pnpm exec vitest run src/players`
Expected: PASS (fixtures updated; no behavior change yet).

- [ ] **Step 3: Write the failing test for `teams.ts`**

Create `src/teams/teams.test.ts`:

```ts
import { beforeEach, expect, vi } from 'vitest'
import {
  fetchTeams, fetchTeam, fetchActiveSeason, fetchCategories, fetchRoster,
  fetchEligiblePlayers, groupEligibleByCurrentTeam,
  createTeam, updateTeam, deleteTeam, assignPlayer, movePlayer, removeFromRoster,
} from './teams'
import type { PlayerRow } from '../players/players'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), order: vi.fn(), eq: vi.fn(), eq2: vi.fn(),
  or: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), single: vi.fn(),
  update: vi.fn(), updateEq: vi.fn(), updateEq2: vi.fn(), del: vi.fn(), delEq: vi.fn(), delEq2: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

function eligible(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana', birth_date: '2015-06-10', curp: null,
    photo_path: null, status: 'activo', enrollment_date: '2026-07-01', tutor_name: 'T',
    tutor_whatsapp: '0', tutor_email: null, emergency_contact_name: null,
    emergency_contact_phone: null, affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '', updated_at: '', edad_liga: 11, division: 'Infantil',
    category_name: 'Infantil Mayor', category_year: 1, category_id: 'cat1',
    team_id: null, team_name: null, ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.mockResolvedValue({ data: [], error: null })
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  mocks.single.mockResolvedValue({ data: { id: 'newteam' }, error: null })
  mocks.or.mockReturnValue({ order: mocks.order })
  mocks.eq2.mockReturnValue({ maybeSingle: mocks.maybeSingle, order: mocks.order, or: mocks.or })
  mocks.eq.mockReturnValue({ eq: mocks.eq2, maybeSingle: mocks.maybeSingle, order: mocks.order, or: mocks.or })
  mocks.insert.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq, single: mocks.single })
  mocks.updateEq2.mockResolvedValue({ error: null })
  mocks.updateEq.mockReturnValue({ eq: mocks.updateEq2 })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
  mocks.delEq2.mockResolvedValue({ error: null })
  mocks.delEq.mockReturnValue({ eq: mocks.delEq2 })
  mocks.del.mockReturnValue({ eq: mocks.delEq })
  mocks.from.mockReturnValue({
    select: mocks.select, insert: mocks.insert, update: mocks.update, delete: mocks.del,
  })
})

test('fetchTeams reads active-season teams from teams_with_meta', async () => {
  await fetchTeams()
  expect(mocks.from).toHaveBeenCalledWith('teams_with_meta')
  expect(mocks.eq).toHaveBeenCalledWith('season_is_active', true)
})

test('fetchActiveSeason reads the active season', async () => {
  await fetchActiveSeason()
  expect(mocks.from).toHaveBeenCalledWith('seasons')
  expect(mocks.eq).toHaveBeenCalledWith('is_active', true)
})

test('fetchRoster reads players_with_category filtered by team_id', async () => {
  await fetchRoster('team9')
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.eq).toHaveBeenCalledWith('team_id', 'team9')
})

test('fetchEligiblePlayers filters by category, activo, and excludes this team', async () => {
  await fetchEligiblePlayers('cat1', 'team9')
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.eq).toHaveBeenCalledWith('category_id', 'cat1')
  expect(mocks.eq2).toHaveBeenCalledWith('status', 'activo')
  expect(mocks.or).toHaveBeenCalledWith('team_id.is.null,team_id.neq.team9')
})

test('createTeam inserts with tenant and season and coerces blanks to null', async () => {
  const res = await createTeam({ name: 'Rojo', category_id: 'cat1', coach: '', color: 'Rojo' }, 't1', 's1')
  expect(mocks.from).toHaveBeenCalledWith('teams')
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Rojo', category_id: 'cat1', coach: null, color: 'Rojo', tenant_id: 't1', season_id: 's1' }),
  )
  expect(res).toEqual({ ok: true, id: 'newteam' })
})

test('assignPlayer inserts a roster row', async () => {
  mocks.insert.mockResolvedValue({ error: null })
  const res = await assignPlayer('team9', 'p1', 't1', 's1')
  expect(mocks.from).toHaveBeenCalledWith('team_players')
  expect(mocks.insert).toHaveBeenCalledWith({ team_id: 'team9', player_id: 'p1', tenant_id: 't1', season_id: 's1' })
  expect(res).toEqual({ ok: true })
})

test('assignPlayer surfaces the unique-violation error', async () => {
  mocks.insert.mockResolvedValue({ error: { message: 'duplicate key value' } })
  const res = await assignPlayer('team9', 'p1', 't1', 's1')
  expect(res).toEqual({ ok: false, error: 'duplicate key value' })
})

test('movePlayer updates team_id keyed by player and season', async () => {
  const res = await movePlayer('p1', 's1', 'team2')
  expect(mocks.from).toHaveBeenCalledWith('team_players')
  expect(mocks.update).toHaveBeenCalledWith({ team_id: 'team2' })
  expect(mocks.updateEq).toHaveBeenCalledWith('player_id', 'p1')
  expect(mocks.updateEq2).toHaveBeenCalledWith('season_id', 's1')
  expect(res).toEqual({ ok: true })
})

test('removeFromRoster deletes keyed by player and season', async () => {
  const res = await removeFromRoster('p1', 's1')
  expect(mocks.from).toHaveBeenCalledWith('team_players')
  expect(mocks.delEq).toHaveBeenCalledWith('player_id', 'p1')
  expect(mocks.delEq2).toHaveBeenCalledWith('season_id', 's1')
  expect(res).toEqual({ ok: true })
})

test('groupEligibleByCurrentTeam puts free agents first, then groups by current team', () => {
  const groups = groupEligibleByCurrentTeam([
    eligible({ id: 'free', team_id: null, team_name: null }),
    eligible({ id: 'inB', team_id: 'B', team_name: 'MTY AC Azul' }),
    eligible({ id: 'inB2', team_id: 'B', team_name: 'MTY AC Azul' }),
  ])
  expect(groups[0]).toMatchObject({ teamId: null, teamName: null })
  expect(groups[0].players.map((p) => p.id)).toEqual(['free'])
  expect(groups[1]).toMatchObject({ teamId: 'B', teamName: 'MTY AC Azul' })
  expect(groups[1].players.map((p) => p.id)).toEqual(['inB', 'inB2'])
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run src/teams/teams.test.ts`
Expected: FAIL (module `./teams` not found / exports missing).

- [ ] **Step 5: Implement `teams.ts`**

Create `src/teams/teams.ts`:

```ts
import { supabase } from '../lib/supabase'
import type { PlayerRow } from '../players/players'

export interface TeamRow {
  id: string
  tenant_id: string
  season_id: string
  category_id: string
  name: string
  coach: string | null
  color: string | null
  created_at: string
  updated_at: string
  category_name: string
  division: string
  category_sort_order: number
  season_is_active: boolean
  player_count: number
}

export interface SeasonRow {
  id: string
  tenant_id: string
  name: string
  cutoff_date: string
  is_active: boolean
}

export interface CategoryRow {
  id: string
  name: string
  division: string
  sort_order: number
}

export interface TeamFormValues {
  name: string
  category_id: string
  coach: string
  color: string
}

export interface EligibleGroup {
  teamId: string | null
  teamName: string | null
  players: PlayerRow[]
}

export interface CreateTeamResult {
  ok: boolean
  id?: string
  error?: string
}

export interface MutationResult {
  ok: boolean
  error?: string
}

export async function fetchActiveSeason(): Promise<SeasonRow | null> {
  const { data } = await supabase.from('seasons').select('*').eq('is_active', true).maybeSingle()
  return (data as SeasonRow | null) ?? null
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data } = await supabase.from('categories').select('*').order('sort_order', { ascending: true })
  return (data as CategoryRow[] | null) ?? []
}

export async function fetchTeams(): Promise<TeamRow[]> {
  const { data } = await supabase
    .from('teams_with_meta')
    .select('*')
    .eq('season_is_active', true)
    .order('category_sort_order', { ascending: true })
  const rows = (data as TeamRow[] | null) ?? []
  return rows.sort((a, b) =>
    a.category_sort_order - b.category_sort_order || a.name.localeCompare(b.name),
  )
}

export async function fetchTeam(id: string): Promise<TeamRow | null> {
  const { data } = await supabase.from('teams_with_meta').select('*').eq('id', id).maybeSingle()
  return (data as TeamRow | null) ?? null
}

export async function fetchRoster(teamId: string): Promise<PlayerRow[]> {
  const { data } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('team_id', teamId)
    .order('full_name', { ascending: true })
  return (data as PlayerRow[] | null) ?? []
}

export async function fetchEligiblePlayers(categoryId: string, teamId: string): Promise<PlayerRow[]> {
  const { data } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('category_id', categoryId)
    .eq('status', 'activo')
    .or(`team_id.is.null,team_id.neq.${teamId}`)
    .order('full_name', { ascending: true })
  return (data as PlayerRow[] | null) ?? []
}

export function groupEligibleByCurrentTeam(players: PlayerRow[]): EligibleGroup[] {
  const free: PlayerRow[] = []
  const byTeam = new Map<string, EligibleGroup>()
  for (const p of players) {
    if (!p.team_id) {
      free.push(p)
    } else {
      const g = byTeam.get(p.team_id) ?? { teamId: p.team_id, teamName: p.team_name, players: [] }
      g.players.push(p)
      byTeam.set(p.team_id, g)
    }
  }
  const others = Array.from(byTeam.values()).sort((a, b) =>
    (a.teamName ?? '').localeCompare(b.teamName ?? ''),
  )
  const groups: EligibleGroup[] = []
  if (free.length) groups.push({ teamId: null, teamName: null, players: free })
  return groups.concat(others)
}

export async function createTeam(
  values: TeamFormValues,
  tenantId: string,
  seasonId: string,
): Promise<CreateTeamResult> {
  const { data, error } = await supabase
    .from('teams')
    .insert({
      name: values.name.trim(),
      category_id: values.category_id,
      coach: values.coach.trim() || null,
      color: values.color.trim() || null,
      tenant_id: tenantId,
      season_id: seasonId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateTeam(id: string, values: TeamFormValues): Promise<MutationResult> {
  const { error } = await supabase
    .from('teams')
    .update({
      name: values.name.trim(),
      category_id: values.category_id,
      coach: values.coach.trim() || null,
      color: values.color.trim() || null,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteTeam(id: string): Promise<MutationResult> {
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function assignPlayer(
  teamId: string,
  playerId: string,
  tenantId: string,
  seasonId: string,
): Promise<MutationResult> {
  const { error } = await supabase
    .from('team_players')
    .insert({ team_id: teamId, player_id: playerId, tenant_id: tenantId, season_id: seasonId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function movePlayer(
  playerId: string,
  seasonId: string,
  newTeamId: string,
): Promise<MutationResult> {
  const { error } = await supabase
    .from('team_players')
    .update({ team_id: newTeamId })
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeFromRoster(playerId: string, seasonId: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('team_players')
    .delete()
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/teams/teams.test.ts src/players`
Expected: PASS (all).

- [ ] **Step 7: Typecheck + lint + commit**

```bash
pnpm exec tsc -b && pnpm lint
git add src/teams/teams.ts src/teams/teams.test.ts src/players/players.ts src/players/players.test.ts src/players/PlayersPage.test.tsx src/players/PlayerFormPage.test.tsx
git commit -m "feat: add teams data layer and extend PlayerRow with team fields"
```

---

## Task 5: `TeamForm.tsx` + `TeamFormPage.tsx` — create/edit team

**Files:**
- Create: `src/teams/TeamForm.tsx`, `src/teams/TeamForm.test.tsx`
- Create: `src/teams/TeamFormPage.tsx`, `src/teams/TeamFormPage.test.tsx`

**Interfaces:**
- Consumes: `TeamFormValues`, `CategoryRow`, `TeamRow`, `fetchTeam`, `fetchCategories`, `fetchActiveSeason`, `createTeam`, `updateTeam` (`./teams`); `useTenant` (`../tenant/TenantContext`); `isAdmin` (`../lib/authorize`).
- Produces: `TeamForm` (props `{ values, categories, onChange, disabled?, categoryLocked? }`) and `TeamFormPage` (routed at `equipos/nuevo` and `equipos/:id/editar`).

- [ ] **Step 1: Write the failing test for `TeamForm`**

Create `src/teams/TeamForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { TeamForm } from './TeamForm'
import type { CategoryRow, TeamFormValues } from './teams'

const cats: CategoryRow[] = [
  { id: 'cat1', name: 'Infantil Mayor', division: 'Infantil', sort_order: 5 },
  { id: 'cat2', name: 'Infantil Menor', division: 'Infantil', sort_order: 4 },
]
const base: TeamFormValues = { name: '', category_id: 'cat1', coach: '', color: '' }

test('edits the name field', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<TeamForm values={base} categories={cats} onChange={onChange} />)
  await user.type(screen.getByLabelText(/Nombre/), 'R')
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'R' }))
})

test('locks the category select when categoryLocked is set', () => {
  render(<TeamForm values={base} categories={cats} onChange={vi.fn()} categoryLocked />)
  expect(screen.getByLabelText(/Categoría/)).toBeDisabled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/teams/TeamForm.test.tsx`
Expected: FAIL (`./TeamForm` not found).

- [ ] **Step 3: Implement `TeamForm`**

Create `src/teams/TeamForm.tsx`:

```tsx
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import type { CategoryRow, TeamFormValues } from './teams'

export interface TeamFormProps {
  values: TeamFormValues
  categories: CategoryRow[]
  onChange: (next: TeamFormValues) => void
  disabled?: boolean
  categoryLocked?: boolean
}

export function TeamForm({ values, categories, onChange, disabled, categoryLocked }: TeamFormProps) {
  const set = (patch: Partial<TeamFormValues>) => onChange({ ...values, ...patch })
  return (
    <Stack spacing={2}>
      <TextField
        label="Nombre"
        value={values.name}
        onChange={(e) => set({ name: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        select
        label="Categoría"
        value={values.category_id}
        onChange={(e) => set({ category_id: e.target.value })}
        disabled={disabled || categoryLocked}
        helperText={categoryLocked ? 'Vacía el roster para cambiar la categoría.' : undefined}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ minWidth: 200 }}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </TextField>
      <TextField
        label="Coach"
        value={values.coach}
        onChange={(e) => set({ coach: e.target.value })}
        disabled={disabled}
      />
      <TextField
        label="Color"
        value={values.color}
        onChange={(e) => set({ color: e.target.value })}
        disabled={disabled}
      />
    </Stack>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/teams/TeamForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `TeamFormPage`**

Create `src/teams/TeamFormPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TeamFormPage } from './TeamFormPage'

const mocks = vi.hoisted(() => ({
  fetchTeam: vi.fn(), fetchCategories: vi.fn(), fetchActiveSeason: vi.fn(),
  createTeam: vi.fn(), updateTeam: vi.fn(), useTenant: vi.fn(),
}))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return { ...actual, fetchTeam: mocks.fetchTeam, fetchCategories: mocks.fetchCategories, fetchActiveSeason: mocks.fetchActiveSeason, createTeam: mocks.createTeam, updateTeam: mocks.updateTeam }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/equipos/nuevo', element: <TeamFormPage /> },
      { path: '/equipos/:id/editar', element: <TeamFormPage /> },
      { path: '/equipos/:id', element: <div>detalle</div> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchCategories.mockResolvedValue([{ id: 'cat1', name: 'Infantil Mayor', division: 'Infantil', sort_order: 5 }])
  mocks.fetchActiveSeason.mockResolvedValue({ id: 's1', tenant_id: 't1', name: '2026-2027', cutoff_date: '2027-04-30', is_active: true })
  mocks.createTeam.mockResolvedValue({ ok: true, id: 'newteam' })
  mocks.updateTeam.mockResolvedValue({ ok: true })
  mocks.fetchTeam.mockResolvedValue({
    id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: null, color: null, created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 0,
  })
})

test('create mode submits createTeam with tenant and active season id', async () => {
  const user = userEvent.setup()
  renderAt('/equipos/nuevo')
  await screen.findByLabelText(/Nombre/)
  await user.type(screen.getByLabelText(/Nombre/), 'MTY AC Rojo')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(mocks.createTeam).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MTY AC Rojo', category_id: 'cat1' }),
      't1',
      's1',
    ),
  )
})

test('edit mode loads the team and locks category when roster is non-empty', async () => {
  mocks.fetchTeam.mockResolvedValue({
    id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: null, color: null, created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 3,
  })
  renderAt('/equipos/team9/editar')
  expect(await screen.findByDisplayValue('MTY AC Rojo')).toBeInTheDocument()
  expect(screen.getByLabelText(/Categoría/)).toBeDisabled()
})

test('create mode with no active season blocks the form', async () => {
  mocks.fetchActiveSeason.mockResolvedValue(null)
  renderAt('/equipos/nuevo')
  expect(await screen.findByText(/No hay temporada activa/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm exec vitest run src/teams/TeamFormPage.test.tsx`
Expected: FAIL (`./TeamFormPage` not found).

- [ ] **Step 7: Implement `TeamFormPage`**

Create `src/teams/TeamFormPage.tsx`:

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
import { TeamForm } from './TeamForm'
import {
  fetchTeam, fetchCategories, fetchActiveSeason, createTeam, updateTeam,
} from './teams'
import type { TeamFormValues, CategoryRow, SeasonRow } from './teams'

const EMPTY: TeamFormValues = { name: '', category_id: '', coach: '', color: '' }

export function TeamFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, tenantId } = useTenant()
  const editing = Boolean(id)
  const canEdit = isAdmin(role)

  const [values, setValues] = useState<TeamFormValues>(EMPTY)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([
      fetchCategories(),
      fetchActiveSeason(),
      id ? fetchTeam(id) : Promise.resolve(null),
    ]).then(([cats, s, team]) => {
      if (!active) return
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
    return () => {
      active = false
    }
  }, [id, editing])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!tenantId) {
      setMessage('Error: no hay tenant activo')
      return
    }
    setSubmitting(true)
    if (editing) {
      const result = await updateTeam(id!, values)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      void navigate(`/equipos/${id!}`, { state: { flash: 'Cambios guardados' } })
    } else {
      if (!season) return
      const result = await createTeam(values, tenantId, season.id)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      void navigate(`/equipos/${result.id!}`, { state: { flash: 'Equipo creado' } })
    }
  }

  if (!loaded) return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  if (!editing && !season) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <Alert severity="warning">No hay temporada activa. No se pueden crear equipos.</Alert>
      </Box>
    )
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1" gutterBottom>
          {editing ? 'Editar equipo' : 'Nuevo equipo'}
        </Typography>
        <TeamForm
          values={values}
          categories={categories}
          onChange={setValues}
          disabled={!canEdit}
          categoryLocked={editing && categoryLocked}
        />
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

The single load effect sets `loaded` true only after categories, season, and (in edit mode) the team resolve, so the no-active-season warning renders after load in create mode.

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm exec vitest run src/teams/TeamFormPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck + lint + commit**

```bash
pnpm exec tsc -b && pnpm lint
git add src/teams/TeamForm.tsx src/teams/TeamForm.test.tsx src/teams/TeamFormPage.tsx src/teams/TeamFormPage.test.tsx
git commit -m "feat: add team create/edit form and page with category lock"
```

---

## Task 6: `TeamsPage.tsx` — list grouped by category

**Files:**
- Create: `src/teams/TeamsPage.tsx`, `src/teams/TeamsPage.test.tsx`

**Interfaces:**
- Consumes: `fetchTeams`, `TeamRow` (`./teams`); `useTenant`; `isAdmin`.
- Produces: `TeamsPage` (routed at `equipos`).

- [ ] **Step 1: Write the failing test**

Create `src/teams/TeamsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TeamsPage } from './TeamsPage'
import type { TeamRow } from './teams'

const mocks = vi.hoisted(() => ({ fetchTeams: vi.fn(), useTenant: vi.fn() }))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return { ...actual, fetchTeams: mocks.fetchTeams }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function team(over: Partial<TeamRow>): TeamRow {
  return {
    id: 't1', tenant_id: 'tn', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: 'Luis', color: 'Rojo', created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 2, ...over,
  }
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/equipos', element: <TeamsPage /> },
      { path: '/equipos/nuevo', element: <div>nuevo</div> },
      { path: '/equipos/:id', element: <div>detalle</div> },
    ],
    { initialEntries: ['/equipos'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchTeams.mockResolvedValue([
    team({ id: 't1', name: 'MTY AC Rojo', category_name: 'Infantil Mayor', player_count: 2 }),
    team({ id: 't2', name: 'MTY AC Azul', category_name: 'Infantil Mayor', player_count: 1 }),
  ])
})

test('lists teams grouped under their category with player count', async () => {
  renderPage()
  expect(await screen.findByText('MTY AC Rojo')).toBeInTheDocument()
  expect(screen.getByText('MTY AC Azul')).toBeInTheDocument()
  expect(screen.getAllByText('Infantil Mayor').length).toBeGreaterThan(0)
  expect(screen.getByText(/2 jugadores/)).toBeInTheDocument()
})

test('admin sees the "Nuevo equipo" button', async () => {
  renderPage()
  await screen.findByText('MTY AC Rojo')
  expect(screen.getByRole('link', { name: 'Nuevo equipo' })).toHaveAttribute('href', '/equipos/nuevo')
})

test('empty active season shows an explanatory state', async () => {
  mocks.fetchTeams.mockResolvedValue([])
  renderPage()
  expect(await screen.findByText(/No hay equipos/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/teams/TeamsPage.test.tsx`
Expected: FAIL (`./TeamsPage` not found).

- [ ] **Step 3: Implement `TeamsPage`**

Create `src/teams/TeamsPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { fetchTeams } from './teams'
import type { TeamRow } from './teams'

export function TeamsPage() {
  const { role } = useTenant()
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (): Promise<TeamRow[]> => fetchTeams(), [])

  useEffect(() => {
    let active = true
    void load().then((rows) => {
      if (!active) return
      setTeams(rows)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [load])

  const grouped = useMemo(() => {
    const map = new Map<string, TeamRow[]>()
    for (const t of teams) {
      const list = map.get(t.category_name) ?? []
      list.push(t)
      map.set(t.category_name, list)
    }
    return Array.from(map.entries())
  }, [teams])

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h4" component="h1">
          Equipos
        </Typography>
        {isAdmin(role) && (
          <Button variant="contained" component={RouterLink} to="/equipos/nuevo">
            Nuevo equipo
          </Button>
        )}
      </Stack>

      {loaded && teams.length === 0 && (
        <Typography sx={{ mt: 3, color: 'text.secondary' }}>
          No hay equipos en la temporada activa (o no hay temporada activa).
        </Typography>
      )}

      {grouped.map(([category, list]) => (
        <List
          key={category}
          subheader={<ListSubheader>{category}</ListSubheader>}
          sx={{ mt: 1 }}
        >
          {list.map((t) => (
            <ListItemButton key={t.id} component={RouterLink} to={`/equipos/${t.id}`}>
              <ListItemText
                primary={t.name}
                secondary={`${t.color ?? 'Sin color'} · ${t.coach ?? 'Sin coach'} · ${t.player_count} jugadores`}
              />
            </ListItemButton>
          ))}
        </List>
      ))}
    </Box>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/teams/TeamsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm exec tsc -b && pnpm lint
git add src/teams/TeamsPage.tsx src/teams/TeamsPage.test.tsx
git commit -m "feat: add teams list grouped by category"
```

---

## Task 7: `AddPlayerDialog.tsx` — eligible players with grouping + move confirmation

**Files:**
- Create: `src/teams/AddPlayerDialog.tsx`, `src/teams/AddPlayerDialog.test.tsx`

**Interfaces:**
- Consumes: `fetchEligiblePlayers`, `groupEligibleByCurrentTeam`, `EligibleGroup` (`./teams`); `PlayerRow` (`../players/players`); `playerCategoryText` (`../players/players`).
- Produces: `AddPlayerDialog` with props `{ open, categoryId, teamId, onAssign, onMove, onClose }` where `onAssign(playerId: string)` handles free agents and `onMove(playerId: string, fromTeamName: string)` handles reassignment (parent performs the mutation).

- [ ] **Step 1: Write the failing test**

Create `src/teams/AddPlayerDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { AddPlayerDialog } from './AddPlayerDialog'
import type { PlayerRow } from '../players/players'

const mocks = vi.hoisted(() => ({ fetchEligiblePlayers: vi.fn() }))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return { ...actual, fetchEligiblePlayers: mocks.fetchEligiblePlayers }
})

function p(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana', birth_date: '2015-06-10', curp: null,
    photo_path: null, status: 'activo', enrollment_date: '', tutor_name: 'T', tutor_whatsapp: '0',
    tutor_email: null, emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null, created_at: '', updated_at: '',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: null, team_name: null, ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchEligiblePlayers.mockResolvedValue([
    p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null }),
    p({ id: 'inB', full_name: 'Otro Equipo', team_id: 'B', team_name: 'MTY AC Azul' }),
  ])
})

test('free agents assign directly on click', async () => {
  const onAssign = vi.fn()
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={onAssign} onMove={vi.fn()} onClose={vi.fn()} />)
  await user.click(await screen.findByText('Free Agent'))
  expect(onAssign).toHaveBeenCalledWith('free')
})

test('clicking a player in another team asks for confirmation before moving', async () => {
  const onMove = vi.fn()
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={onMove} onClose={vi.fn()} />)
  await user.click(await screen.findByText('Otro Equipo'))
  expect(onMove).not.toHaveBeenCalled()
  expect(await screen.findByText(/Se moverá de MTY AC Azul/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Mover' }))
  await waitFor(() => expect(onMove).toHaveBeenCalledWith('inB', 'MTY AC Azul'))
})

test('search narrows the eligible list', async () => {
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={vi.fn()} onClose={vi.fn()} />)
  await screen.findByText('Free Agent')
  await user.type(screen.getByLabelText(/Buscar/), 'otro')
  await waitFor(() => expect(screen.queryByText('Free Agent')).not.toBeInTheDocument())
  expect(screen.getByText('Otro Equipo')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: FAIL (`./AddPlayerDialog` not found).

- [ ] **Step 3: Implement `AddPlayerDialog`**

Create `src/teams/AddPlayerDialog.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { fetchEligiblePlayers, groupEligibleByCurrentTeam } from './teams'
import type { PlayerRow } from '../players/players'

export interface AddPlayerDialogProps {
  open: boolean
  categoryId: string
  teamId: string
  onAssign: (playerId: string) => void
  onMove: (playerId: string, fromTeamName: string) => void
  onClose: () => void
}

interface Pending {
  player: PlayerRow
  fromTeamName: string
}

export function AddPlayerDialog({ open, categoryId, teamId, onAssign, onMove, onClose }: AddPlayerDialogProps) {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)

  // Reset search/pending inside the async callback (not synchronously in the
  // effect body) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!open) return
    let active = true
    void fetchEligiblePlayers(categoryId, teamId).then((rows) => {
      if (!active) return
      setPlayers(rows)
      setSearch('')
      setPending(null)
    })
    return () => {
      active = false
    }
  }, [open, categoryId, teamId])

  const groups = useMemo(() => {
    const filtered = players.filter((p) =>
      p.full_name.toLowerCase().includes(search.toLowerCase()),
    )
    return groupEligibleByCurrentTeam(filtered)
  }, [players, search])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Añadir jugador</DialogTitle>
      <DialogContent>
        <TextField
          label="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          sx={{ mt: 1 }}
        />
        {groups.length === 0 && (
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>
            No hay jugadores elegibles.
          </Typography>
        )}
        {groups.map((g) => (
          <List
            key={g.teamId ?? 'free'}
            subheader={<ListSubheader>{g.teamId ? `En ${g.teamName}` : 'Sin equipo'}</ListSubheader>}
          >
            {g.players.map((p) => (
              <ListItemButton
                key={p.id}
                onClick={() =>
                  g.teamId
                    ? setPending({ player: p, fromTeamName: g.teamName ?? '' })
                    : onAssign(p.id)
                }
              >
                <ListItemText primary={p.full_name} secondary={`edad ${p.edad_liga ?? '—'}`} />
              </ListItemButton>
            ))}
          </List>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>

      <Dialog open={pending !== null} onClose={() => setPending(null)}>
        <DialogTitle>Mover jugador</DialogTitle>
        <DialogContent>
          <Typography>
            {pending && `Se moverá de ${pending.fromTeamName} a este equipo.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pending) onMove(pending.player.id, pending.fromTeamName)
              setPending(null)
            }}
          >
            Mover
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm exec tsc -b && pnpm lint
git add src/teams/AddPlayerDialog.tsx src/teams/AddPlayerDialog.test.tsx
git commit -m "feat: add eligible-players dialog with grouping and move confirmation"
```

---

## Task 8: `TeamDetailPage.tsx` — header, roster, add-player wiring

**Files:**
- Create: `src/teams/TeamDetailPage.tsx`, `src/teams/TeamDetailPage.test.tsx`

**Interfaces:**
- Consumes: `fetchTeam`, `fetchRoster`, `assignPlayer`, `movePlayer`, `removeFromRoster`, `deleteTeam`, `TeamRow` (`./teams`); `AddPlayerDialog` (`./AddPlayerDialog`); `PlayerRow`, `playerCategoryText` (`../players/players`); `useTenant`; `isAdmin`.
- Produces: `TeamDetailPage` (routed at `equipos/:id`).

- [ ] **Step 1: Write the failing test**

Create `src/teams/TeamDetailPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TeamDetailPage } from './TeamDetailPage'
import type { PlayerRow } from '../players/players'

const mocks = vi.hoisted(() => ({
  fetchTeam: vi.fn(), fetchRoster: vi.fn(), assignPlayer: vi.fn(), movePlayer: vi.fn(),
  removeFromRoster: vi.fn(), deleteTeam: vi.fn(), fetchEligiblePlayers: vi.fn(), useTenant: vi.fn(),
}))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return {
    ...actual, fetchTeam: mocks.fetchTeam, fetchRoster: mocks.fetchRoster,
    assignPlayer: mocks.assignPlayer, movePlayer: mocks.movePlayer,
    removeFromRoster: mocks.removeFromRoster, deleteTeam: mocks.deleteTeam,
    fetchEligiblePlayers: mocks.fetchEligiblePlayers,
  }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function p(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Roster', birth_date: '2015-06-10', curp: null,
    photo_path: null, status: 'activo', enrollment_date: '', tutor_name: 'T', tutor_whatsapp: '0',
    tutor_email: null, emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null, created_at: '', updated_at: '',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: 'team9', team_name: 'MTY AC Rojo', ...over,
  }
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/equipos/:id', element: <TeamDetailPage /> },
      { path: '/equipos', element: <div>lista</div> },
      { path: '/equipos/:id/editar', element: <div>editar</div> },
    ],
    { initialEntries: ['/equipos/team9'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchTeam.mockResolvedValue({
    id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: 'Luis', color: 'Rojo', created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 1,
  })
  mocks.fetchRoster.mockResolvedValue([p({ id: 'p1', full_name: 'Ana Roster' })])
  mocks.fetchEligiblePlayers.mockResolvedValue([])
  mocks.assignPlayer.mockResolvedValue({ ok: true })
  mocks.movePlayer.mockResolvedValue({ ok: true })
  mocks.removeFromRoster.mockResolvedValue({ ok: true })
  mocks.deleteTeam.mockResolvedValue({ ok: true })
})

test('shows team header and its roster', async () => {
  renderPage()
  expect(await screen.findByRole('heading', { name: /MTY AC Rojo/ })).toBeInTheDocument()
  expect(screen.getByText('Ana Roster')).toBeInTheDocument()
})

test('admin sees Editar and Eliminar actions', async () => {
  renderPage()
  await screen.findByText('Ana Roster')
  expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/equipos/team9/editar')
  expect(screen.getByRole('button', { name: 'Eliminar equipo' })).toBeInTheDocument()
})

test('removing a roster player calls removeFromRoster and refreshes', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  await waitFor(() => expect(mocks.removeFromRoster).toHaveBeenCalledWith('p1', 's1'))
})

test('readonly hides mutating actions', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'L', tenantId: 't1' })
  renderPage()
  await screen.findByText('Ana Roster')
  expect(screen.queryByRole('button', { name: 'Eliminar equipo' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Añadir jugador' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: FAIL (`./TeamDetailPage` not found).

- [ ] **Step 3: Implement `TeamDetailPage`**

Create `src/teams/TeamDetailPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { AddPlayerDialog } from './AddPlayerDialog'
import {
  fetchTeam, fetchRoster, assignPlayer, movePlayer, removeFromRoster, deleteTeam,
} from './teams'
import type { TeamRow } from './teams'
import type { PlayerRow } from '../players/players'
import { playerCategoryText } from '../players/players'

export function TeamDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, tenantId } = useTenant()
  const canEdit = isAdmin(role)

  const [team, setTeam] = useState<TeamRow | null>(null)
  const [roster, setRoster] = useState<PlayerRow[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState<PlayerRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const [t, r] = await Promise.all([fetchTeam(id), fetchRoster(id)])
    setTeam(t)
    setRoster(r)
  }, [id])

  useEffect(() => {
    let active = true
    void load().then(() => {
      if (!active) return
    })
    return () => {
      active = false
    }
  }, [load])

  if (!team) return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  async function handleAssign(playerId: string) {
    if (!tenantId) return
    const res = await assignPlayer(team!.id, playerId, tenantId, team!.season_id)
    if (!res.ok) setError(res.error ?? 'No se pudo asignar')
    setAddOpen(false)
    await load()
  }

  async function handleMove(playerId: string) {
    const res = await movePlayer(playerId, team!.season_id, team!.id)
    if (!res.ok) setError(res.error ?? 'No se pudo mover')
    setAddOpen(false)
    await load()
  }

  async function handleRemove() {
    if (!removing) return
    const res = await removeFromRoster(removing.id, team!.season_id)
    if (!res.ok) setError(res.error ?? 'No se pudo quitar')
    setRemoving(null)
    await load()
  }

  async function handleDelete() {
    const res = await deleteTeam(team!.id)
    setConfirmDelete(false)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo eliminar')
      return
    }
    void navigate('/equipos')
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {team.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {team.category_name} · {team.color ?? 'Sin color'} · {team.coach ?? 'Sin coach'}
          </Typography>
        </Box>
        {canEdit && (
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" component={RouterLink} to={`/equipos/${team.id}/editar`}>
              Editar
            </Button>
            <Button color="error" variant="outlined" onClick={() => setConfirmDelete(true)}>
              Eliminar equipo
            </Button>
          </Stack>
        )}
      </Stack>

      {error && (
        <Alert role="alert" severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack direction="row" sx={{ mt: 3, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Roster ({roster.length})</Typography>
        {canEdit && (
          <Button variant="contained" onClick={() => setAddOpen(true)}>
            Añadir jugador
          </Button>
        )}
      </Stack>

      <List>
        {roster.map((pl) => (
          <ListItem
            key={pl.id}
            secondaryAction={
              canEdit ? (
                <Button size="small" onClick={() => setRemoving(pl)}>
                  Quitar
                </Button>
              ) : undefined
            }
          >
            <ListItemText primary={pl.full_name} secondary={playerCategoryText(pl)} />
          </ListItem>
        ))}
      </List>

      {canEdit && (
        <AddPlayerDialog
          open={addOpen}
          categoryId={team.category_id}
          teamId={team.id}
          onAssign={handleAssign}
          onMove={(playerId) => handleMove(playerId)}
          onClose={() => setAddOpen(false)}
        />
      )}

      <Dialog open={removing !== null} onClose={() => setRemoving(null)}>
        <DialogTitle>Quitar del equipo</DialogTitle>
        <DialogContent>
          <Typography>{removing && `¿Quitar a ${removing.full_name} del equipo?`}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleRemove}>
            Quitar del equipo
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Eliminar equipo</DialogTitle>
        <DialogContent>
          <Typography>
            Se eliminará el equipo y se vaciará su roster. Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm exec tsc -b && pnpm lint
git add src/teams/TeamDetailPage.tsx src/teams/TeamDetailPage.test.tsx
git commit -m "feat: add team detail page with roster and add/remove/delete"
```

---

## Task 9: Wire team routes and nav

**Files:**
- Modify: `src/app/routes.tsx`
- Modify: `src/app/AppLayout.tsx`
- Modify: `src/app/AppLayout.test.tsx` (assert the new nav link)

**Interfaces:**
- Consumes: `TeamsPage`, `TeamDetailPage`, `TeamFormPage` (Tasks 6/8/5).
- Produces: routes `equipos`, `equipos/:id` (authenticated), `equipos/nuevo`, `equipos/:id/editar` (admin); an "Equipos" nav link.

- [ ] **Step 1: Add the imports and routes to `routes.tsx`**

In `src/app/routes.tsx`, add imports after the players imports:

```tsx
import { TeamsPage } from '../teams/TeamsPage'
import { TeamDetailPage } from '../teams/TeamDetailPage'
import { TeamFormPage } from '../teams/TeamFormPage'
```

Add authenticated routes alongside `jugadores/:id` (inside the `AppLayout` children, before the `RequireAdmin` block):

```tsx
          { path: 'equipos', element: <TeamsPage /> },
          { path: 'equipos/:id', element: <TeamDetailPage /> },
```

Add admin routes inside the `RequireAdmin` `children` array:

```tsx
              { path: 'equipos/nuevo', element: <TeamFormPage /> },
              { path: 'equipos/:id/editar', element: <TeamFormPage /> },
```

- [ ] **Step 2: Add the nav link in `AppLayout.tsx`**

In `src/app/AppLayout.tsx`, add a link after the "Jugadores" button:

```tsx
          <Button color="inherit" component={NavLink} to="/equipos">Equipos</Button>
```

- [ ] **Step 3: Update `AppLayout.test.tsx` to assert the link**

Add this test to `src/app/AppLayout.test.tsx`. It uses the file's existing `renderLayout()` helper and per-test `useTenant` mock; the nav renders synchronously, so no `findBy` is needed:

```tsx
test('shows the Equipos nav link', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout()
  expect(screen.getByRole('link', { name: 'Equipos' })).toHaveAttribute('href', '/equipos')
})
```

- [ ] **Step 4: Run the app-layout + routing tests**

Run: `pnpm exec vitest run src/app`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `pnpm exec vitest run && pnpm exec tsc -b && pnpm lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/routes.tsx src/app/AppLayout.tsx src/app/AppLayout.test.tsx
git commit -m "feat: wire team routes and Equipos nav link"
```

---

## Task 10: Team selector in `PlayerFormPage` (edit mode only)

**Files:**
- Modify: `src/players/PlayerFormPage.tsx`
- Modify: `src/players/PlayerFormPage.test.tsx`

**Interfaces:**
- Consumes: `fetchTeams`, `fetchActiveSeason`, `assignPlayer`, `movePlayer`, `removeFromRoster` (`../teams/teams`); the loaded `PlayerRow` (`team_id`, `category_id`, `status`, `edad_liga`).
- Produces: a "Equipo" native select rendered only when `editing` is true, listing active-season teams in the player's category plus "Sin equipo", disabled for `readonly`, out-of-category, `baja`, or no active season.

- [ ] **Step 1: Write the failing test**

Add to `src/players/PlayerFormPage.test.tsx` — extend the top `mocks` with team functions and mock `../teams/teams`:

```tsx
// add to vi.hoisted mocks object: fetchTeams, fetchActiveSeason, assignPlayer, movePlayer, removeFromRoster
vi.mock('../teams/teams', async (importActual) => {
  const actual = await importActual<typeof import('../teams/teams')>()
  return {
    ...actual,
    fetchTeams: mocks.fetchTeams, fetchActiveSeason: mocks.fetchActiveSeason,
    assignPlayer: mocks.assignPlayer, movePlayer: mocks.movePlayer, removeFromRoster: mocks.removeFromRoster,
  }
})
```

In `beforeEach`, add defaults (the edit-mode `fetchPlayer` fixture already has `category_id: 'cat1', team_id: null, team_name: null` from Task 4):

```tsx
  mocks.fetchTeams.mockResolvedValue([
    { id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
      coach: null, color: null, created_at: '', updated_at: '', category_name: 'Infantil Mayor',
      division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 0 },
  ])
  mocks.fetchActiveSeason.mockResolvedValue({ id: 's1', tenant_id: 't1', name: '2026-2027', cutoff_date: '2027-04-30', is_active: true })
  mocks.assignPlayer.mockResolvedValue({ ok: true })
  mocks.movePlayer.mockResolvedValue({ ok: true })
  mocks.removeFromRoster.mockResolvedValue({ ok: true })
```

Add the tests:

```tsx
test('edit mode shows a team selector with category teams and assigns on change', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.selectOptions(await screen.findByLabelText('Equipo'), 'team9')
  await waitFor(() => expect(mocks.assignPlayer).toHaveBeenCalledWith('team9', 'p1', 'tenant-1', 's1'))
})

test('create mode does not render the team selector', async () => {
  renderAt('/jugadores/nuevo')
  await screen.findByLabelText(/Nombre completo/)
  expect(screen.queryByLabelText('Equipo')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: FAIL (no "Equipo" select; `assignPlayer` not called).

- [ ] **Step 3: Implement the selector in `PlayerFormPage.tsx`**

Add imports:

```tsx
import TextField from '@mui/material/TextField'
import { fetchTeams, fetchActiveSeason, assignPlayer, movePlayer, removeFromRoster } from '../teams/teams'
import type { TeamRow, SeasonRow } from '../teams/teams'
```

Add state + load (after the existing `row` state/effect):

```tsx
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [season, setSeason] = useState<SeasonRow | null>(null)

  useEffect(() => {
    if (!editing) return
    let active = true
    void Promise.all([fetchTeams(), fetchActiveSeason()]).then(([ts, s]) => {
      if (!active) return
      setTeams(ts)
      setSeason(s)
    })
    return () => {
      active = false
    }
  }, [editing])
```

Add a handler and a derived list (before `return`):

```tsx
  const categoryTeams = teams.filter((t) => t.category_id === row?.category_id)
  const teamSelectDisabled =
    !canEdit || !season || row?.status === 'baja' || row?.category_id == null
  const currentTeamId = row?.team_id ?? ''

  async function handleTeamChange(next: string) {
    if (!row || !season) return
    let res
    if (next === '') res = await removeFromRoster(row.id, season.id)
    else if (currentTeamId === '') res = await assignPlayer(next, row.id, tenantId!, season.id)
    else res = await movePlayer(row.id, season.id, next)
    if (!res.ok) {
      setMessage(`Error: ${res.error ?? 'no se pudo actualizar el equipo'}`)
      return
    }
    const refreshed = await fetchPlayer(row.id)
    if (refreshed) setRow(refreshed)
  }
```

Render the selector inside the form `Stack`, only when `editing` and `row` is loaded (place it after `<PlayerForm .../>`):

```tsx
        {editing && row && (
          <TextField
            select
            label="Equipo"
            value={currentTeamId}
            onChange={(e) => handleTeamChange(e.target.value)}
            disabled={teamSelectDisabled}
            helperText={
              row.category_id == null
                ? 'Fuera de categoría: no asignable a un equipo.'
                : !season
                  ? 'No hay temporada activa.'
                  : row.status === 'baja'
                    ? 'Jugador de baja: no asignable.'
                    : undefined
            }
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            sx={{ minWidth: 200 }}
          >
            <option value="">Sin equipo</option>
            {categoryTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </TextField>
        )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm exec tsc -b && pnpm lint
git add src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git commit -m "feat: assign a player to a team from the player edit page"
```

---

## Task 11: Team column + filter in `PlayersPage`

**Files:**
- Modify: `src/players/PlayersPage.tsx`
- Modify: `src/players/PlayersPage.test.tsx`

**Interfaces:**
- Consumes: `PlayerRow.team_name` / `team_id` (from the extended view).
- Produces: a "Equipo" column in each list item's secondary text and a team filter select.

- [ ] **Step 1: Write the failing test**

Add to `src/players/PlayersPage.test.tsx` — update the `beforeEach` fixtures so one player has a team:

```tsx
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p1', full_name: 'Ana Ruiz', category_name: 'Infantil Mayor', category_year: 1, team_id: 'team9', team_name: 'MTY AC Rojo' }),
    player({ id: 'p2', full_name: 'Beto Gómez', status: 'baja', category_name: null, category_year: null, edad_liga: 25, team_id: null, team_name: null }),
  ])
```

Add the tests:

```tsx
test('shows the team name for a rostered player', async () => {
  renderPage()
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  // The "· " prefix targets the list item's secondary text, not the filter <option>.
  expect(screen.getByText(/· MTY AC Rojo/)).toBeInTheDocument()
})

test('team filter narrows to a single team', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.selectOptions(screen.getByLabelText('Equipo'), 'MTY AC Rojo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: FAIL (no team text / no "Equipo" filter).

- [ ] **Step 3: Implement the column + filter in `PlayersPage.tsx`**

Add a `team` filter state next to the others:

```tsx
  const [team, setTeam] = useState('')
```

Add the team options derived list (next to `categories`):

```tsx
  const teams = useMemo(() => {
    const names = players.map((p) => p.team_name).filter((n): n is string => Boolean(n))
    return Array.from(new Set(names)).sort()
  }, [players])
```

Extend the `visible` filter with the team clause:

```tsx
    if (team && p.team_name !== team) return false
```

Add the team filter `TextField` after the "Estatus" select:

```tsx
        <TextField
          select
          label="Equipo"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        >
          <option value="">Todos</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </TextField>
```

Show the team in each item's secondary text:

```tsx
            <ListItemText
              primary={p.full_name}
              secondary={`${playerCategoryText(p)} · ${p.status}${p.team_name ? ` · ${p.team_name}` : ''}`}
            />
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `pnpm exec vitest run && pnpm exec tsc -b && pnpm lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx
git commit -m "feat: show team column and team filter in players list"
```

---

## Post-implementation: manual browser verification

After all tasks pass, run `pnpm dev` and verify (as an admin against the live Supabase):

1. Create a team in a category (nombre, coach, color). Confirm it appears grouped under its category on `/equipos`.
2. Open the team → "Añadir jugador" → assign a free agent. Confirm the roster count updates.
3. Create a second team in the same category; from the first team's dialog, pick a player who is in the second team → confirm the "Se moverá de …" dialog → move. Confirm the roster reflects the move.
4. From a player's edit page, change their "Equipo" selector (assign / change / "Sin equipo"). Confirm it persists on reload.
5. Confirm an out-of-category or `baja` player shows the disabled selector with the hint.
6. In the players list, confirm the "Equipo" column and filter work.
7. Delete a team and confirm the roster is emptied (players return to "Sin equipo").

These are UI/live-service checks that cannot be executed here — list them for the owner and wait for explicit approval before declaring SideQuest A complete.

---

## Self-Review (author)

- **Spec coverage:** §3 tables/integrity → Task 1; §4 triggers (activo check, category lock, `for update` TOCTOU guard, category-change guard) → Task 2; §5 view columns → Task 3; data layer → Task 4; §7.3 form + category lock → Task 5; §7.2 list → Task 6; §7.4 add-player dialog with grouping + move confirm + search → Task 7; §7.4 detail/roster/remove/delete → Task 8; §7.1 routes + nav → Task 9; §7.5 player-page selector (edit-only, disabled states) → Task 10; §7.6 list column + filter → Task 11. §8 edge cases are exercised across Tasks 2 (DB), 5/8/10 (UI states).
- **Placeholder scan:** no TBD/TODO/"handle edge cases" placeholders; every code step shows complete, runnable code (including the Task 9 AppLayout nav test, which uses the file's existing `renderLayout()` helper).
- **Adversarial review applied (2026-07-03):** fixed the `.or()` mock chain (Task 4), the `tenant-1` assertion (Task 10), the `set-state-in-effect` in AddPlayerDialog (Task 7), and the ambiguous team-name query (Task 11); hardened the trigger DB test to be isolated and order-independent (Task 2, three distinct fixture players) and made the `c1`/`cat1` fixture value consistent from Task 4.
- **Type consistency:** `MutationResult`/`CreateTeamResult`, `assignPlayer(teamId, playerId, tenantId, seasonId)`, `movePlayer(playerId, seasonId, newTeamId)`, `removeFromRoster(playerId, seasonId)`, `groupEligibleByCurrentTeam → EligibleGroup[]`, `TeamRow`/`TeamFormValues`/`SeasonRow`/`CategoryRow` are used consistently across Tasks 4–11.
</content>
</invoke>
