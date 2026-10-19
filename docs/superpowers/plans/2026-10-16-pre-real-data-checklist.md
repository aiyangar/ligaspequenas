# Pre-Real-Data Checklist and Anon Privilege Revoke (#6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `anon` loses every privilege on the app's objects (today and for future objects), proven by a new pgTAP file that is red before and green after migration `0016`, with the existing tests 0002/0012/0013 still green; the consent lock is verified end to end in a real browser; and a reproducible, dated checklist (`docs/security/pre-real-data-checklist.md`) records the first green run so #6 can close.

**Architecture:** Two branches plus one orchestrator-only phase. Branch 1 (`fix/revoke-anon-privileges`) adds explicit `grant execute … to public` lines to the test helpers of 0002/0012/0013, the new `supabase/tests/0016_revoke_anon_privileges.test.sql` and the migration `supabase/migrations/0016_revoke_anon_privileges.sql`. The implementer only writes and commits files; the **orchestrator** runs every SQL against the remote project through the Supabase MCP (red run before applying, apply after the pre-PR review, green run + regression + advisors before merging). After branch 1 is merged the orchestrator runs the Playwright E2E (spec §6) and collects the checklist evidence; branch 2 (`update/pre-real-data-checklist`) writes the checklist document with that first run.

**Tech Stack:** Postgres 17.6 on remote Supabase (`eksbaugyypadtanyjcje`), pgTAP 1.3.3 in schema `extensions` (owner `supabase_admin`), Supabase MCP (`execute_sql`, `apply_migration`, `get_advisors`); Playwright 1.64 over CDP (orchestrator); React 19 / Vite / Vitest / TypeScript / ESLint / pnpm (unchanged, must stay green).

**Spec:** `docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md` (approved by the owner 2026-10-16; read it before starting — § numbers below refer to it).

## Global Constraints

- **Two branches, in order, one task each** (spec §2 "Entrega"):
  1. `fix/revoke-anon-privileges` — Tasks 1–2, then orchestrator phase O. PR body: `Refs #6`.
  2. `update/pre-real-data-checklist` — Task 3, cut from `origin/develop` **after** branch 1 is merged, 0016 is applied, and the orchestrator E2E (phase E) and evidence run (phase R) are done. PR body: `Closes #6`. Because `Closes #6` auto-closes the issue on merge to `develop`, this PR is opened **only** when phase E passed completely (E1–E5) and phase R is green; if anything in E/R is red, branch 2 is not opened and #6 stays open.
- Both branches are cut from `origin/develop` after `git fetch` (the spec/plan PR is merged first). Worktrees are created **by the orchestrator** before dispatch: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/revoke-anon-privileges` and `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/pre-real-data-checklist`. Implementers skip creation; their first action is `pnpm install --frozen-lockfile` in their worktree. Tests need no `.env`.
- Git inside a worktree: always `git -C <absolute worktree path> …`, **one git command per shell call**. Never `CLAUDE_GIT_OVERRIDE`, never `git stash`, never touch `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (the main checkout). Implementers never push, open PRs or merge.
- Every commit message is English and ends with a blank line plus exactly `Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4` (pass it as a second `-m`). This is the orchestrator's session line and overrides any per-agent attribution reminder (other `Claude-Session` URL, `Co-Authored-By`, …).
- **Who runs SQL.** Implementers do **not** use the Supabase MCP (they may not have it) and never reach the database any other way. Every `execute_sql`, `apply_migration` and `get_advisors` in this plan is an **ORCHESTRATOR step**, marked as such. The implementer writes the files exactly as given here and commits; the orchestrator copies SQL out of the committed files (or out of this plan where the plan says so), runs it, and pastes results into the PR / the checklist.
- **MCP mechanics** (project memory, re-verified 2026-10-16): `execute_sql` runs as `postgres` (`session_user = postgres`, `search_path = "$user", public, extensions`); one call = one implicit transaction that **commits** on success and rolls back entirely on any error; only the **last** statement's rows are returned; `pg_temp` objects and `set_config(…, true)` live only for that call. Each pgTAP run therefore is **one** `execute_sql` call. Only `extensions.is()` (plus `throws_ok`/`lives_ok` inside 0002) — no structural pgTAP.
- **Remote DB is shared and live.** Applying 0016 is irreversible except through the forward rollback (spec §4.4, reproduced in phase O). Order on branch 1: red run (read-only in effect: its fixtures are cleaned up) any time → pre-PR review clean → **apply 0016** → green run + regression + advisors → PR with the evidence → merge. Nothing is applied before the review is clean.
- Fixture hygiene: fixed UUID prefixes only (`eeeeeeee-` for 0016; `aaaaaaaa-`/`bbbbbbbb-`/`11111111-`/`22222222-`/`33333333-`/`99999999-` for 0002; `cccccccc-` for 0012/0013; `dddddddd-` for 0014; `eeeeeeee-` also for 0015, which shares UUIDs with 0016 — never run R-0015 interleaved with 0016's calls). After **every** run the orchestrator runs the residue query (phase O, "Residue check") — all zeros/nulls — and the baseline count query — equal to Step O1.
- Migration name in `apply_migration`: **`0016_revoke_anon_privileges`** (matches the remote history `0001_schema` … `0015_players_view_status_columns`; spec §4.2 said `revoke_anon_privileges` — the numbered form is the repo convention).
- **Extensions after 0016.** `alter default privileges for role postgres revoke execute on functions from public` also covers functions of any extension installed later whose objects end up owned by `postgres` (e.g. `pg_trgm`/`unaccent` enabled from the Dashboard): `authenticated` would lose EXECUTE on them. After every future `create extension`, check `has_function_privilege('authenticated', '<schema>.<fn>(<args>)', 'EXECUTE')` for the functions the app or a policy calls and `grant execute … to authenticated` where it is `false`. Written into the checklist's Convenciones (Task 3, rule 3).
- Code, identifiers, comments, commit messages: English. Comments only for a non-obvious *why*, one short line. The checklist document (Task 3) is **Spanish**, like the specs it belongs with.
- Frontend is untouched, but each branch still closes with all three green: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`. Baseline (`origin/develop` at dispatch): `Test Files 39 passed (39)` · `Tests 330 passed (330)`. Neither branch changes those numbers.

## Review Focus

- **A failed MCP call leaving fixtures on the live project** (e.g. call 1 of 0016 commits, call 2 errors): the residue query must come back all zeros/nulls and the baseline counts unchanged after every run, success or failure — pinned by the "Residue check" after O2, O3, O5, O6 and R.
- **A test helper created by `postgres` without the explicit grant, after 0016**: must fail loudly with `42501`, not pass silently — pinned by the load-bearing check O7 (an ungranted `pg_temp` helper called as `authenticated` → `42501`), which also proves the grant lines in Task 1 are not decorative.
- **A policy helper losing EXECUTE when PUBLIC is revoked**: `authenticated` must keep EXECUTE on the 4 explicitly granted `private` helpers, and the real app flows must still work — pinned by B3 (Task 2), the 0002/0012/0013 regression (O6) and the E2E E2/E2b/E4 (phase E).
- **A bundle scan that proves nothing** (lazy chunk not found, or a build without env vars, so the bundle has no app code): checklist C(4)/(5) must fail unless their positive controls hold (lazy `browser-*.js` chunk listed; `sb_publishable_` present in the built bundle) — pinned in phase R and written into the checklist (Task 3). The spec's chunk regex (`assets/…\.js`) misses Vite's relative `` `./browser-….js` `` reference (verified 2026-10-16 against the deploy), and the spec's `VITE_` grep matches `INVITE_ERROR_MESSAGES`; both are fixed here.
- **A session that falls back to `anon`** (no or expired JWT) must now get `401`/`42501` from PostgREST instead of `200 []` — pinned by D1/D2 (Task 2) and E5 (phase E). The UI path with an expired token is not exercised by any step; reviewers should confirm supabase-js refresh makes it unreachable in practice (spec §9).

---

# Branch `fix/revoke-anon-privileges` (Tasks 1–2 + phase O, `Refs #6`)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/revoke-anon-privileges`, created by the orchestrator from `origin/develop`. `$WT1` below is shorthand for that absolute path, not a variable that exists in your shell: substitute the literal path in every command (or start each shell call with `WT1=/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/revoke-anon-privileges;`).

- [ ] **Step 0 (implementer): Install and confirm the baseline**

Run `git -C $WT1 branch --show-current` → `fix/revoke-anon-privileges`; `git -C $WT1 fetch origin`; `git -C $WT1 log --oneline origin/develop..HEAD` → empty. Then in `$WT1`: `pnpm install --frozen-lockfile`, `pnpm exec vitest run`.
Expected: `Test Files 39 passed (39)` · `Tests 330 passed (330)`. Record the numbers you saw.

### Task 1: Explicit EXECUTE grants for the test helpers of 0002/0012/0013 (spec §4.3 rule 2, §5.4)

After 0016, functions created by `postgres` (including `pg_temp.*` and `tests.*`) are born without EXECUTE for PUBLIC. These three files call their helpers after switching to `authenticated`, so each helper gets an explicit grant right after its `create`.

**Files:**
- Modify: `supabase/tests/0002_rls.test.sql` (after line 29)
- Modify: `supabase/tests/0012_player_files_storage.test.sql` (after line 50)
- Modify: `supabase/tests/0013_document_consent_rules.test.sql` (after line 23)

**Interfaces:**
- Consumes: nothing.
- Produces: the three edited files; phase O (Step O6) runs them against the remote after 0016.

- [ ] **Step 1: Confirm the inventory**

Run: `grep -rnE 'create (or replace )?function' supabase/tests | sort`
Expected (exactly these 5 lines; `grep -r` order is filesystem-dependent, hence the `sort`):

```
supabase/tests/0002_rls.test.sql:24:create or replace function tests.act_as(uid uuid) returns void language plpgsql as $$
supabase/tests/0012_player_files_storage.test.sql:32:create or replace function pg_temp.try_sql(p_sql text) returns text
supabase/tests/0012_player_files_storage.test.sql:42:create or replace function pg_temp.count_sql(p_sql text) returns int
supabase/tests/0013_document_consent_rules.test.sql:5:create or replace function pg_temp.try_sql(p_sql text) returns text
supabase/tests/0013_document_consent_rules.test.sql:15:create or replace function pg_temp.count_sql(p_sql text) returns int
```

If the output differs, stop and report (a new helper needs the same treatment).

- [ ] **Step 2: Edit `0002_rls.test.sql`**

Replace lines 24–29 so the block reads (only the last line is new):

```sql
create or replace function tests.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function tests.act_as(uuid) to public;
```

Do **not** touch anything else in the file (including the pre-existing `select reset();` on line 60 — see "Notes for the orchestrator" in phase O).

- [ ] **Step 3: Edit `0012_player_files_storage.test.sql`**

Insert one line right after the `$$;` that closes `pg_temp.count_sql` (current line 50), before the blank line and `select set_config('role', 'postgres', true);`:

```sql
grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;
```

- [ ] **Step 4: Edit `0013_document_consent_rules.test.sql`**

Insert the same line right after the `$$;` that closes `pg_temp.count_sql` (current line 23), before the blank line and `-- act as admin X`:

```sql
grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;
```

- [ ] **Step 5: Static verification**

Run:
- `grep -n 'grant execute on function' supabase/tests/0002_rls.test.sql supabase/tests/0012_player_files_storage.test.sql supabase/tests/0013_document_consent_rules.test.sql`
  Expected: exactly 3 lines — `0002_rls.test.sql:30:grant execute on function tests.act_as(uuid) to public;`, `0012_player_files_storage.test.sql:51:grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;`, `0013_document_consent_rules.test.sql:24:grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;`
- `git -C $WT1 diff --stat` → last line `3 files changed, 3 insertions(+)` (git omits the deletions count when it is 0).

(The behavioral proof is the orchestrator's: O3 before 0016 and O6 after it.)

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/revoke-anon-privileges add supabase/tests/0002_rls.test.sql supabase/tests/0012_player_files_storage.test.sql supabase/tests/0013_document_consent_rules.test.sql
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/revoke-anon-privileges commit -m "test: grant EXECUTE on test helpers explicitly so they survive the PUBLIC revoke (#6)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

### Task 2: pgTAP `0016` and migration `0016_revoke_anon_privileges.sql` (spec §4, §5)

**Files:**
- Create: `supabase/tests/0016_revoke_anon_privileges.test.sql`
- Create: `supabase/migrations/0016_revoke_anon_privileges.sql`

**Interfaces:**
- Consumes: `private.current_tenant_id()`, `private.is_admin()` (0003), `private.player_consent_granted(uuid)`, `private.player_file_path_allowed(text)` (0012), the seed trigger (0008), the document-rules trigger (0013), `public.set_updated_at()` on `seasons` (`trg_seasons_updated`, BEFORE UPDATE only — verified, so the fixture's `updated_at '2000-01-01'` survives the insert).
- Produces: the test file, whose marked blocks the orchestrator runs as MCP call 1 (fixtures) and MCP call 2 (assertions); the migration file, applied by the orchestrator in O5.

- [ ] **Step 1: Write the test file**

Create `supabase/tests/0016_revoke_anon_privileges.test.sql` with exactly this content. The two `-- MCP call …` comment lines are load-bearing: the orchestrator copies the text between them verbatim.

```sql
begin;

-- MCP call 1 (fixtures, as postgres): from here to the next marker
insert into public.tenants (id, name, slug) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'ZZ ACL X', 'zz-acl-x');
insert into auth.users (id, email) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'admin-x@zz-acl.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ZZ Admin X', 'admin');
insert into public.seasons (id, tenant_id, name, cutoff_date, is_active, updated_at) values
  ('eeeeeeee-3333-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ZZ Season', '2026-01-01', false, '2000-01-01');

-- MCP call 2 (assertions, as postgres): from here to the end marker
create or replace function pg_temp.as_role(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('role', p_role, true);
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  begin
    execute p_sql into r;
  exception when others then
    r := sqlstate || ' ' || split_part(sqlerrm, ':', 1);
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;
grant execute on function pg_temp.as_role(text, text, text) to public;

create table public.zz_acl_probe (id int);
alter table public.zz_acl_probe enable row level security;
create function private.zz_acl_probe() returns int language sql as 'select 1';

create temp table zz_results (k text primary key, v text);
insert into zz_results values ('D3', pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
  $q$with w as (insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values ('eeeeeeee-2222-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ZZ Player P', '2015-06-10', 'Tutor', '111') returning 1) select count(*)::text from w$q$));
insert into zz_results values ('D6w', pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
  $q$with w as (update public.seasons set name = name where id = 'eeeeeeee-3333-0000-0000-000000000001' returning 1) select count(*)::text from w$q$));

select extensions.plan(22);
select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as priv
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S') and has_table_privilege('anon', c.oid, priv)),
  0, 'A1 anon has no privilege on any public relation')
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (has_table_privilege('authenticated', c.oid, 'SELECT') and has_table_privilege('authenticated', c.oid, 'INSERT')
              and has_table_privilege('authenticated', c.oid, 'UPDATE') and has_table_privilege('authenticated', c.oid, 'DELETE'))),
  0, 'A2 authenticated keeps SELECT/INSERT/UPDATE/DELETE on every public table')
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v' and not has_table_privilege('authenticated', c.oid, 'SELECT')),
  0, 'A3 authenticated keeps SELECT on every public view')
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S') and not has_table_privilege('service_role', c.oid, 'SELECT')),
  0, 'A4 service_role keeps SELECT on every public relation')
union all select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'B1 anon cannot execute any private function')
union all select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
  0, 'B2 no private function is executable by PUBLIC')
union all select extensions.is(has_function_privilege('authenticated', 'private.current_tenant_id()', 'EXECUTE'), true, 'B3 authenticated executes current_tenant_id')
union all select extensions.is(has_function_privilege('authenticated', 'private.is_admin()', 'EXECUTE'), true, 'B3 authenticated executes is_admin')
union all select extensions.is(has_function_privilege('authenticated', 'private.player_consent_granted(uuid)', 'EXECUTE'), true, 'B3 authenticated executes player_consent_granted')
union all select extensions.is(has_function_privilege('authenticated', 'private.player_file_path_allowed(text)', 'EXECUTE'), true, 'B3 authenticated executes player_file_path_allowed')
union all select extensions.is(has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE'), false, 'B4 anon cannot execute set_updated_at')
union all select extensions.is(
  (select count(*)::int from pg_default_acl d cross join aclexplode(d.defaclacl) a
   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole),
  0, 'C1 no default privilege for anon in public')
union all select extensions.is(
  (select count(*)::int from pg_default_acl d
   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
     and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)),
  1, 'C2 global function default of postgres exists and excludes PUBLIC')
union all select extensions.is(has_table_privilege('anon', 'public.zz_acl_probe', 'SELECT'), false, 'C3 a new public table is not readable by anon')
union all select extensions.is(has_table_privilege('authenticated', 'public.zz_acl_probe', 'SELECT'), true, 'C4 a new public table is readable by authenticated')
union all select extensions.is(has_function_privilege('anon', 'private.zz_acl_probe()', 'EXECUTE'), false, 'C5 a new private function is not executable by anon')
union all select extensions.is(left(pg_temp.as_role('anon', null, 'select count(*)::text from public.players'), 5), '42501', 'D1 anon is denied on players')
union all select extensions.is(left(pg_temp.as_role('anon', null, 'select count(*)::text from public.player_payment_status'), 5), '42501', 'D2 anon is denied on a security_invoker view')
union all select extensions.is((select v from zz_results where k = 'D3'), '1', 'D3 admin inserts a player')
union all select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$select count(*)::text from public.documents where player_id = 'eeeeeeee-2222-0000-0000-000000000001'$q$),
  '6', 'D4 the seed trigger still fires')
union all select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$with w as (update public.documents set status = 'digital', file_path = 'eeeeeeee-0000-0000-0000-000000000001/eeeeeeee-2222-0000-0000-000000000001/curp' where player_id = 'eeeeeeee-2222-0000-0000-000000000001' and doc_type = 'curp' returning 1) select count(*)::text from w$q$),
  'P0001 consent_required', 'D5 the document rules trigger still fires')
union all select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$select (updated_at > '2000-01-01')::text from public.seasons where id = 'eeeeeeee-3333-0000-0000-000000000001'$q$),
  'true', 'D6 set_updated_at still fires');
-- MCP call 2 ends here

select * from extensions.finish();
rollback;
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0016_revoke_anon_privileges.sql` with exactly (spec §4.2):

```sql
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- anon's EXECUTE on these comes from PUBLIC, not from a direct grant
revoke execute on all functions in schema private from public, anon;
revoke execute on function public.set_updated_at() from public, anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
```

Nothing is granted to `authenticated` (its explicit grants from 0003/0012 survive the PUBLIC revoke — spec §4.2).

- [ ] **Step 3: Static verification**

Run:
- `grep -c 'extensions.is(' supabase/tests/0016_revoke_anon_privileges.test.sql` → `22` (equals `plan(22)`).
- `grep -n 'MCP call' supabase/tests/0016_revoke_anon_privileges.test.sql` → 3 lines (call 1 start, call 2 start, call 2 end).
- `grep -c 'eeeeeeee-' supabase/tests/0016_revoke_anon_privileges.test.sql` → a number ≥ 1, and `grep -nE "'(aaaaaaaa|cccccccc)-" supabase/tests/0016_revoke_anon_privileges.test.sql` → empty (no fixture prefix collision with 0002/0012/0013).
- `grep -cE '^(revoke|alter default privileges)' supabase/migrations/0016_revoke_anon_privileges.sql` → `8`; `grep -c 'grant ' supabase/migrations/0016_revoke_anon_privileges.sql` → `0`.
- `pnpm exec vitest run` → `Test Files 39 passed (39)` · `Tests 330 passed (330)`; `pnpm exec tsc -b` → exit 0; `pnpm lint` → exit 0.
- `git -C $WT1 status --porcelain` → exactly 2 lines, both `??`: `supabase/migrations/0016_revoke_anon_privileges.sql` and `supabase/tests/0016_revoke_anon_privileges.test.sql` (the new files are untracked until Step 4, so a `diff --stat` here would show only Task 1's 3 files).

- [ ] **Step 4: Commit and report**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/revoke-anon-privileges add supabase/tests/0016_revoke_anon_privileges.test.sql supabase/migrations/0016_revoke_anon_privileges.sql
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/revoke-anon-privileges commit -m "fix: revoke anon privileges on app objects and PUBLIC execute on private functions (#6)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

After the commit: `git -C $WT1 diff --stat origin/develop` → exactly 5 files (the 3 tests from Task 1 + the 2 new files); `git -C $WT1 status --porcelain` → empty.

**Report (implementer, then stop):** the Step 0 baseline, every Step 1/5 and Task 2 Step 3 output, both commit SHAs. Do not attempt any SQL.

If the orchestrator later returns a failing red/green row caused by the test file itself (syntax error, wrong expected literal), fix only the test file in a new commit `test: fix 0016 assertion <id> (#6)` and report again. Never edit the migration to make a test pass without the orchestrator's instruction.

---

## Phase O — Orchestrator: red run, review, apply, green run (branch 1)

Every step here is run by the **orchestrator** with the Supabase MCP. "Copy call 1" means: the text of `supabase/tests/0016_revoke_anon_privileges.test.sql` in `$WT1` from the line after `-- MCP call 1 …` up to (not including) `-- MCP call 2 (assertions …`; "copy call 2": from the line after that marker up to (not including) `-- MCP call 2 ends here`. Pass a copied block as one `execute_sql` `query`.

**Baseline count query** (used in O1 and after every run):

```sql
select (select count(*) from public.tenants) as tenants, (select count(*) from public.profiles) as profiles,
       (select count(*) from auth.users) as users, (select count(*) from public.players) as players,
       (select count(*) from public.documents) as documents, (select count(*) from public.seasons) as seasons,
       (select count(*) from storage.objects where bucket_id = 'player-files') as objects;
```

**Residue check** (after every run; expected: every count `0`, every `to_reg*` `null`):

```sql
select
  (select count(*) from public.tenants where id::text like any (array['aaaaaaaa-%', 'bbbbbbbb-%', 'cccccccc-%', 'dddddddd-%', 'eeeeeeee-%'])) as tenants,
  (select count(*) from auth.users where id::text like any (array['11111111-%', '22222222-%', '33333333-%', 'cccccccc-%', 'dddddddd-%', 'eeeeeeee-%'])) as users,
  (select count(*) from public.profiles where id::text like any (array['11111111-%', '22222222-%', '33333333-%', 'cccccccc-%', 'dddddddd-%', 'eeeeeeee-%'])) as profiles,
  (select count(*) from public.players where id::text like any (array['99999999-%', 'cccccccc-%', 'dddddddd-%', 'eeeeeeee-%']) or tenant_id::text like any (array['aaaaaaaa-%', 'bbbbbbbb-%', 'cccccccc-%', 'dddddddd-%', 'eeeeeeee-%'])) as players,
  (select count(*) from public.documents where tenant_id::text like any (array['aaaaaaaa-%', 'bbbbbbbb-%', 'cccccccc-%', 'dddddddd-%', 'eeeeeeee-%'])) as documents,
  (select count(*) from public.payments where id::text like any (array['dddddddd-%', 'eeeeeeee-%']) or tenant_id::text like any (array['dddddddd-%', 'eeeeeeee-%'])) as payments,
  (select count(*) from public.seasons where id::text like 'eeeeeeee-%') as seasons,
  (select count(*) from storage.objects where bucket_id = 'player-files' and name like any (array['cccccccc-%', 'eeeeeeee-%'])) as objects,
  to_regclass('public.zz_acl_probe') as probe_table,
  to_regprocedure('private.zz_acl_probe()') as probe_fn,
  to_regnamespace('tests') as tests_schema;
```

(Both queries were run read-only on 2026-10-16: residue all `0`/`null`; baseline `tenants 1, profiles 3, users 3, players 1, documents 6, seasons 1, objects 1`.)

**0016 cleanup** (as `postgres`, one call; safe to run even if call 2 rolled back):

```sql
delete from public.players where id = 'eeeeeeee-2222-0000-0000-000000000001';
delete from public.seasons where id = 'eeeeeeee-3333-0000-0000-000000000001';
delete from public.profiles where id = 'eeeeeeee-1111-0000-0000-000000000001';
delete from auth.users where id = 'eeeeeeee-1111-0000-0000-000000000001';
delete from public.tenants where id = 'eeeeeeee-0000-0000-0000-000000000001';
drop table if exists public.zz_acl_probe;
drop function if exists private.zz_acl_probe();
```

(The player's 6 `documents` go with it via `on delete cascade`. If the first `DELETE` fails with "Invalid or expired requestState", verify nothing changed and retry once.)

- [ ] **Step O1 (orchestrator): Baseline**

`list_migrations` → last entry `0015_players_view_status_columns` (0016 not applied). Run the baseline count query and the residue check; record both. Residue must be all `0`/`null`; if not, stop and clean up before anything else.

- [ ] **Step O2 (orchestrator): Red run of 0016 (before applying)**

1. `execute_sql` with **call 1**. Expected: success, no rows.
2. `execute_sql` with **call 2**. Expected: 22 rows; **exactly these 10 start with `not ok`**: `A1`, `B1`, `B2`, `B4`, `C1`, `C2`, `C3`, `C5`, `D1`, `D2`; the other 12 (`A2`, `A3`, `A4`, the four `B3`, `C4`, `D3`, `D4`, `D5`, `D6`) are `ok`. Expected diagnostics on today's state: `A1` got `104` (the 96 audited privileges + 8 from `public.zz_acl_probe`, which call 2 creates before the assertions and which inherits today's default `anon=arwdDxtm`), `B1` got `10` and `B2` got `10` (the 9 audited `private` functions + `private.zz_acl_probe()`, born with `proacl` NULL = EXECUTE to PUBLIC), `C1` got `12`, `C2` got `0`, `D1`/`D2` got `0` (RLS filtered instead of denying).
3. `execute_sql` with the **0016 cleanup**; then the residue check (all zero/null) and the baseline count query (equal to O1).

If call 2 errors (syntax, missing column) the whole call rolled back: run the cleanup anyway (call 1 committed), send the exact error to the implementer, and repeat O2 after their fix commit. If a row outside the list above is `not ok`, or one inside it is `ok`, stop and investigate with `superpowers:systematic-debugging` before going on — the red state does not match the audit (spec §3.1-B) and applying 0016 would be unproven.

- [ ] **Step O3 (orchestrator): Regression harness on today's state (before applying)**

Run the five regression calls R-0002, R-0012, R-0013, R-0014, R-0015 (defined below) once now, with the Task 1 edits and the 0014/0015 anon edits in place. Expected: R-0002/R-0012/R-0013 all `ok` (0002: 6 rows; 0012: 25; 0013: 21); R-0014 17 rows with exactly `not ok 17` (anon is denied on player_payment_status) and R-0015 21 rows with exactly `not ok 21` (anon is denied on players_with_category) — anon still gets 0 rows without an error before 0016; every other row `ok`. This proves the harness and the edited files are green (or red only where 0016 must change behaviour) **before** 0016, so a failure in O6 is attributable to 0016. Residue check + baseline after each.

- [ ] **Step O4: Pre-PR review**

Dispatch the pre-PR reviewer on `$WT1` with this plan, the spec, and the O2/O3 outputs. Normal delivery cycle (no Blockers/Majors → continue; otherwise fix round, max 3). **Do not apply 0016 before the review is clean.**

- [ ] **Step O5 (orchestrator): Apply 0016**

`apply_migration` with name `0016_revoke_anon_privileges` and the exact content of `$WT1/supabase/migrations/0016_revoke_anon_privileges.sql`. Expected: success. Then `list_migrations` → last entry `0016_revoke_anon_privileges`.

- [ ] **Step O6 (orchestrator): Green run + regression**

1. Call 1, call 2 of 0016. Expected: 22 rows, **all `ok`**.
2. 0016 cleanup, residue check, baseline count query.
3. R-0002, R-0012, R-0013, R-0014, R-0015 again. Expected: all `ok` (6 / 25 / 21 / 17 / 21) — R-0014 row 17 and R-0015 row 21 flip from `not ok` to `ok`. Residue + baseline after each.

- [ ] **Step O7 (orchestrator): Load-bearing check for the helper grants**

One call (creates only `pg_temp` objects, nothing persists):

```sql
create or replace function pg_temp.zz_ungranted() returns text language sql as 'select ''ran''';
create or replace function pg_temp.zz_granted() returns text language sql as 'select ''ran''';
grant execute on function pg_temp.zz_granted() to public;
create or replace function pg_temp.zz_try(p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('role', 'authenticated', true);
  begin
    execute p_sql into r;
  exception when others then
    r := sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  return r;
end;
$$;
select pg_temp.zz_try('select pg_temp.zz_ungranted()') as ungranted, pg_temp.zz_try('select pg_temp.zz_granted()') as granted;
```

Expected after 0016: `ungranted = 42501`, `granted = ran`. (Before 0016 both would be `ran`; that is why the Task 1 grants matter.)

- [ ] **Step O8 (orchestrator): Advisors**

`get_advisors` type `security`. Expected: only `auth_leaked_password_protection` (accepted, spec §8); in particular no `rls_disabled_in_public` (the probe table is gone). Any other lint → stop and report to the owner.

- [ ] **Step O9 (orchestrator): Frontend still green, PR, merge**

In `$WT1`: `pnpm exec vitest run` (39/330), `pnpm exec tsc -b`, `pnpm lint` → green. Push and open the PR to `develop` with body `Refs #6`, containing: O2 red output (22 rows), O5 apply result, O6 green output (22 rows) and the five regression outputs (O3 and O6), O7 output, O8 advisors, residue/baseline before/after, and the line `0016 applied to remote eksbaugyypadtanyjcje on <date> before merge`. Merge (orchestrator is authorized for `develop`). The production deploy (`main`) is not affected by the merge, but the **database change is already live for production** since O5 — say so in the PR.

### Rollback (only if 0016 breaks the app — spec §4.4)

Trigger: O6 regression (not the 0016 file itself) or phase E fails **because of** 0016 (e.g. `42501` from a policy helper or a legitimate flow), or production breaks. A failure that is a bug in the 0016 test file is fixed in the test file, not rolled back.

`apply_migration` named `0017_regrant_anon_privileges` (next free number — check `list_migrations`) with:

```sql
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
grant execute on all functions in schema private to public;
grant execute on function public.set_updated_at() to public, anon;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant execute on functions to anon;
alter default privileges for role postgres grant execute on functions to public;
```

Then repeat O2 **completely** — call 1 → call 2 → 0016 cleanup → residue check + baseline (call 2 alone would fail more rows, because the fixtures were already cleaned up). The red state must be back: the same 10 `not ok` with the O2 diagnostics (`A1` 104, `B1`/`B2` 10, `C1` 12, `C2` 0, `D1`/`D2` 0). Then escalate to the owner, and open a new branch to retry (spec §4.4). The repo bookkeeping (committing `0017_regrant_anon_privileges.sql` so the repo matches the remote history) goes on its own `fix/*` branch decided with the owner.

### Regression calls (orchestrator) — R-0002, R-0012, R-0013, R-0014, R-0015

The canonical files keep the `begin; plan; …; finish; rollback;` form and cannot be pasted as they are (0002 relies on a `tests` schema that does not exist on the remote and calls a nonexistent `reset()`; 0012 keeps its consent setup in comments). Each R-call below is **one** `execute_sql` that wraps the file's statements **unchanged in order and content** except for these mechanical rules:

1. Results go to a temp table: the call starts with `create temp table tap (line text); grant all on tap to public;` and every assertion statement `select [extensions.]is(…)` / `throws_ok(…)` / `lives_ok(…)` becomes `insert into tap select …(…)`.
2. `begin;`, `select * from [extensions.]finish();` and `rollback;` are dropped; the file's `plan(N)` stays (it runs as `postgres`, and pgTAP's `plan()` grants its own temp tables to PUBLIC — verified in `extensions.plan` source).
3. Fixtures are inserted at the top and cleaned up at the bottom of the **same** call (atomic: an error rolls everything back, success commits the cleanup).
4. The last statement is `select line from tap order by substring(line from '^(?:not )?ok (\d+)')::int;` (verified). Pass = N rows, none starting with `not ok`.

Notes for the orchestrator:
- 0002's `select reset();` (line 60) does not exist as a function on the remote (`pg_proc` has no `reset`); R-0002 replaces it with `select set_config('role', 'postgres', true);`. File a follow-up issue (`review-followup`, `tech-debt`) to fix the canonical file; it is out of this branch's scope.
- R-0002 creates the `tests` schema (absent on the remote) with `grant usage on schema tests to authenticated` and drops it at the end of the call.

**R-0002** (`plan(6)`):

```sql
create temp table tap (line text);
grant all on tap to public;
create schema tests;
grant usage on schema tests to authenticated;
select plan(6);

insert into tenants (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b');
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'readonly-a@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin-b@test.com');
insert into profiles (id, tenant_id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin A', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Readonly A', 'readonly'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin B', 'admin');
insert into players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Player A', '2015-06-10', 'Tutor', '111');

create or replace function tests.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function tests.act_as(uuid) to public;

select tests.act_as('11111111-1111-1111-1111-111111111111');
insert into tap select is((select count(*) from players)::int, 1, 'admin A sees tenant A player');
select tests.act_as('22222222-2222-2222-2222-222222222222');
insert into tap select is((select count(*) from players)::int, 1, 'readonly A sees tenant A player');
select tests.act_as('33333333-3333-3333-3333-333333333333');
insert into tap select is((select count(*) from players)::int, 0, 'admin B does not see tenant A player');
select tests.act_as('22222222-2222-2222-2222-222222222222');
insert into tap select throws_ok(
  $$insert into players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nope', '2016-01-01', 'T', '1')$$,
  '42501', null, 'readonly cannot insert players'
);
select tests.act_as('11111111-1111-1111-1111-111111111111');
insert into tap select lives_ok(
  $$insert into players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Yes', '2016-01-01', 'T', '1')$$,
  'admin can insert players'
);
select set_config('role', 'postgres', true);
insert into tap select is(
  (select relrowsecurity from pg_class where relname = 'players'),
  true,
  'RLS enabled on players'
);

select set_config('request.jwt.claims', '', true);
delete from players where tenant_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
delete from tenants where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
drop schema tests cascade;
select line from tap order by substring(line from '^(?:not )?ok (\d+)')::int;
```

Expected: 6 rows `ok 1` … `ok 6`.

**Shared fixture/cleanup for R-0012 and R-0013** (from the documents plan, `cccccccc-` UUIDs):

Fixture block (as `postgres`):

```sql
insert into public.tenants (id, name, slug) values
  ('cccccccc-0000-0000-0000-000000000001', 'Test Docs X', 'test-docs-x'),
  ('cccccccc-0000-0000-0000-000000000002', 'Test Docs Y', 'test-docs-y');
insert into auth.users (id, email) values
  ('cccccccc-1111-0000-0000-000000000001', 'admin-x@docs.test'),
  ('cccccccc-1111-0000-0000-000000000002', 'readonly-x@docs.test'),
  ('cccccccc-1111-0000-0000-000000000003', 'admin-y@docs.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('cccccccc-1111-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Admin X', 'admin'),
  ('cccccccc-1111-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'Readonly X', 'readonly'),
  ('cccccccc-1111-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', 'Admin Y', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Docs Test P', '2015-06-10', 'Tutor', '111'),
  ('cccccccc-2222-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'Docs Test Q', '2015-06-10', 'Tutor', '111');
```

Cleanup block (as `postgres`):

```sql
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'player-files' and name like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.players where id in ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000002');
delete from public.profiles where id::text like 'cccccccc-1111-%';
delete from auth.users where id::text like 'cccccccc-1111-%';
delete from public.tenants where id::text like 'cccccccc-0000-%';
```

**R-0012** (`plan(25)`): in this order —

```sql
create temp table tap (line text);
grant all on tap to public;
select extensions.plan(25);
```

then the **fixture block**, then:

```sql
insert into tap select extensions.is((select public from storage.buckets where id = 'player-files'), false, 'bucket is private');
insert into tap select extensions.is((select file_size_limit from storage.buckets where id = 'player-files'), 10485760::bigint, 'bucket limit is 10 MB');
insert into tap select extensions.is(
  (select allowed_mime_types::text from storage.buckets where id = 'player-files'),
  '{application/pdf,image/jpeg,image/png,image/webp}', 'bucket MIME allow-list');

insert into tap select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000099'), false, 'unknown player is not granted');
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type in ('image_consent', 'privacy_notice');
insert into tap select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000001'), true, 'both consents fisico are granted');
delete from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'privacy_notice';
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'image_consent';
insert into tap select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000002'), false, 'a missing consent row is not granted');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'), true, 'document with consent allowed');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo'), true, 'photo with consent allowed');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp'), false, 'document without consent blocked');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/image_consent'), true, 'consent document exempt from the lock');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000002/cccccccc-2222-0000-0000-000000000001/curp'), false, 'other tenant prefix blocked');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/not-a-uuid/curp'), false, 'non-uuid player segment is false, not an error');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001'), false, 'two segments blocked');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp/x'), false, 'four segments blocked');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/passport'), false, 'unknown file name blocked');
insert into tap select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000099/curp'), false, 'unknown player blocked');
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
```

(The consent setup comes from the file's comments on lines 14 and 16; the path block is "acting as admin X" per line 19; the switch back to `postgres` before the helpers matters — helpers created as `authenticated` would be owned by it and would not exercise 0016.) Then the file's text **verbatim** from the line `-- storage.objects policies (see plan Task 1 Step 6 for the MCP form)` through the last `select set_config('role', 'postgres', true);` (the line right before `select * from extensions.finish();`) — helpers, the Task 1 grant line and the policy section — applying rule 1 to each of its 9 `select extensions.is(` statements (they become `insert into tap select extensions.is(`). Then the **cleanup block**, then the final `select line from tap order by …`.

Expected: 25 rows, all `ok`.

**R-0013** (`plan(21)`): `create temp table tap (line text); grant all on tap to public; select extensions.plan(21);`, then the **fixture block**, then the file's text **verbatim** from the first `create or replace function pg_temp.try_sql` through the last `select set_config('role', 'postgres', true);` (the line right before `select * from extensions.finish();`) — helpers, the Task 1 grant line and body — applying rule 1 to every `select extensions.is(` (21 occurrences), then the **cleanup block**, then the final `select line from tap order by …`.

Expected: 21 rows, all `ok`.

**R-0014 and R-0015** (anon assertion changed to `throws_ok(…, '42501', …)` in this branch): the files' own fixtures, assertions and cleanup in one call each. Rule 1 also covers the structural assertions of 0014 (`has_view`, `has_column`). The `diag` line stays a plain `select` (informational, not counted by `plan`). The cleanup deletes every fixture row the file inserts, FK-safe (payments → documents seeded by `trg_players_seed_documents` → players → profiles → auth.users → tenants); neither file inserts seasons, teams, team_players or storage objects.

**R-0014** (`plan(17)`, `dddddddd-` UUIDs):

```sql
create temp table tap (line text);
grant all on tap to public;
select extensions.plan(17);

-- fixtures: tenants A/B, admin A, readonly A, admin B, players P1–P6, payments 1–6 (see plan Task 1 fixture block)
insert into public.tenants (id, name, slug) values
  ('dddddddd-0000-0000-0000-000000000001', 'Test Pay A', 'test-pay-a'),
  ('dddddddd-0000-0000-0000-000000000002', 'Test Pay B', 'test-pay-b');
insert into auth.users (id, email) values
  ('dddddddd-1111-0000-0000-000000000001', 'admin-a@pay.test'),
  ('dddddddd-1111-0000-0000-000000000002', 'readonly-a@pay.test'),
  ('dddddddd-1111-0000-0000-000000000003', 'admin-b@pay.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('dddddddd-1111-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Admin A', 'admin'),
  ('dddddddd-1111-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Readonly A', 'readonly'),
  ('dddddddd-1111-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 'Admin B', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp, status) values
  ('dddddddd-2222-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Sin Pagos', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Pagado', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Parcial', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Pendiente', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Baja', '2015-06-10', 'Tutor', '111', 'baja'),
  ('dddddddd-2222-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000002', 'Pay Test B', '2015-06-10', 'Tutor', '111', 'activo');
insert into public.payments (id, tenant_id, player_id, concept, amount, method, status) values
  ('dddddddd-3333-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000002', 'inscripcion', 500, 'efectivo', 'pagado'),
  ('dddddddd-3333-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000003', 'inscripcion', 500, 'efectivo', 'pagado'),
  ('dddddddd-3333-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000003', 'mensualidad', 200, 'transferencia', 'parcial'),
  ('dddddddd-3333-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000004', 'uniforme', 300, 'efectivo', 'pendiente'),
  ('dddddddd-3333-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000005', 'mensualidad', 100, 'efectivo', 'pendiente'),
  ('dddddddd-3333-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000002', 'dddddddd-2222-0000-0000-000000000006', 'inscripcion', 500, 'efectivo', 'pendiente');

-- structure
insert into tap select extensions.has_view('public', 'player_payment_status', 'player_payment_status is a view');
insert into tap select extensions.has_column('public', 'player_payment_status', 'player_id', 'view has player_id');
insert into tap select extensions.has_column('public', 'player_payment_status', 'tenant_id', 'view has tenant_id');
insert into tap select extensions.has_column('public', 'player_payment_status', 'payment_state', 'view has payment_state');
insert into tap select extensions.is(
  (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.player_payment_status'::regclass),
  true, 'view runs as security invoker');
insert into tap select extensions.is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'player_payment_status'),
  'player_id,tenant_id,payment_state', 'view exposes exactly player_id, tenant_id, payment_state');

-- grouping (as postgres)
insert into tap select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000001'), 'sin_pagos', 'no payments is sin_pagos');
insert into tap select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000002'), 'al_corriente', 'only pagado is al_corriente');
insert into tap select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000003'), 'con_adeudo', 'pagado + parcial is con_adeudo');
insert into tap select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000004'), 'con_adeudo', 'only pendiente is con_adeudo');
insert into tap select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000005'), 'con_adeudo', 'baja player still appears');
insert into tap select extensions.is((select count(*) from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000003')::int, 1, 'one row per player with several payments');

-- isolation (security_invoker → players/payments RLS applies)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"dddddddd-1111-0000-0000-000000000001","role":"authenticated"}', true);
insert into tap select extensions.is((select count(*) from public.player_payment_status)::int, 5, 'admin A sees the 5 tenant A players');
insert into tap select extensions.is((select count(*) from public.player_payment_status where tenant_id = 'dddddddd-0000-0000-0000-000000000002')::int, 0, 'admin A sees no tenant B rows');
select set_config('request.jwt.claims', '{"sub":"dddddddd-1111-0000-0000-000000000002","role":"authenticated"}', true);
insert into tap select extensions.is((select count(*) from public.player_payment_status)::int, 5, 'readonly A reads its tenant rows');
select set_config('request.jwt.claims', '{"sub":"dddddddd-1111-0000-0000-000000000003","role":"authenticated"}', true);
insert into tap select extensions.is((select count(*) from public.player_payment_status)::int, 1, 'admin B sees only its tenant row');
-- spec §3.2: record anon's privilege on the view before asserting what anon sees
select extensions.diag('anon select on player_payment_status: ' || has_table_privilege('anon', 'public.player_payment_status', 'select')::text);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into tap select extensions.throws_ok($$select count(*) from public.player_payment_status$$, '42501', null, 'anon is denied on player_payment_status');
select set_config('role', 'postgres', true);

select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
delete from public.payments where id::text like 'dddddddd-3333-%';
delete from public.documents where player_id::text like 'dddddddd-2222-%';
delete from public.players where id::text like 'dddddddd-2222-%';
delete from public.profiles where id::text like 'dddddddd-1111-%';
delete from auth.users where id::text like 'dddddddd-1111-%';
delete from public.tenants where id::text like 'dddddddd-0000-%';
select line from tap order by substring(line from '^(?:not )?ok (\d+)')::int;
```

Expected: **before** 0016 (O3), 17 rows — `ok 1` … `ok 16` and `not ok 17 - anon is denied on player_payment_status` (anon gets 0 rows, no error; the `diag` reports `true`). **After** 0016 (O6), 17 rows, all `ok` (the `diag` reports `false`).

**R-0015** (`plan(21)`, `eeeeeeee-` UUIDs):

```sql
create temp table tap (line text);
grant all on tap to public;
select extensions.plan(21);

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
insert into tap select extensions.is(
  (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.players_with_category'::regclass),
  true, 'view still runs as security invoker');
insert into tap select extensions.is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category'),
  'id,tenant_id,full_name,birth_date,curp,photo_path,status,enrollment_date,tutor_name,tutor_whatsapp,tutor_email,emergency_contact_name,emergency_contact_phone,affiliation_status,affiliation_date,created_at,updated_at,edad_liga,division,category_name,category_year,category_id,team_id,team_name,payment_state,docs_delivered',
  'existing columns keep their order and the two new ones are appended');
insert into tap select extensions.is(
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'docs_delivered'),
  'integer', 'docs_delivered is integer');
insert into tap select extensions.is(
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'payment_state'),
  'text', 'payment_state is text');

-- values (as postgres)
insert into tap select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001'), 'sin_pagos', 'no payments is sin_pagos');
insert into tap select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001'), 0, 'untouched documents count 0');
insert into tap select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002'), 'al_corriente', 'only pagado is al_corriente');
insert into tap select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002'), 3, 'three fisico documents count 3');
insert into tap select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo', 'a pendiente is con_adeudo');
insert into tap select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 6, 'fisico and digital both count');
insert into tap select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000004'), 'con_adeudo', 'baja player with a parcial appears as con_adeudo');
insert into tap select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002')::int, 1, 'several payments and documents keep one row (S2)');
insert into tap select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003')::int, 1, 'several payments and documents keep one row (S3)');

-- isolation (security_invoker → players/documents/player_payment_status RLS applies)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}', true);
insert into tap select extensions.is((select count(*) from public.players_with_category)::int, 4, 'admin A sees the 4 tenant A players');
insert into tap select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo', 'admin A reads payment_state');
insert into tap select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 6, 'admin A reads docs_delivered');
insert into tap select extensions.is((select count(*) from public.players_with_category where tenant_id = 'eeeeeeee-0000-0000-0000-000000000002')::int, 0, 'admin A sees no tenant B rows');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000002","role":"authenticated"}', true);
insert into tap select extensions.is((select count(*) from public.players_with_category)::int, 4, 'readonly A sees the same rows as admin A');
insert into tap select extensions.is((select payment_state || '/' || docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo/6', 'readonly A reads payment_state and docs_delivered');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000003","role":"authenticated"}', true);
insert into tap select extensions.is((select count(*) from public.players_with_category)::int, 1, 'admin B sees only its tenant row');
-- spec §3.3: record anon's privilege on the view before asserting what anon sees
select extensions.diag('anon select on players_with_category: ' || has_table_privilege('anon', 'public.players_with_category', 'select')::text);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into tap select extensions.throws_ok($$select count(*) from public.players_with_category$$, '42501', null, 'anon is denied on players_with_category');
select set_config('role', 'postgres', true);

select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
delete from public.payments where id::text like 'eeeeeeee-3333-%';
delete from public.documents where player_id::text like 'eeeeeeee-2222-%';
delete from public.players where id::text like 'eeeeeeee-2222-%';
delete from public.profiles where id::text like 'eeeeeeee-1111-%';
delete from auth.users where id::text like 'eeeeeeee-1111-%';
delete from public.tenants where id::text like 'eeeeeeee-0000-%';
select line from tap order by substring(line from '^(?:not )?ok (\d+)')::int;
```

Expected: **before** 0016 (O3), 21 rows — `ok 1` … `ok 20` and `not ok 21 - anon is denied on players_with_category`. **After** 0016 (O6), 21 rows, all `ok`.

R-0015 reuses the `eeeeeeee-` IDs of the 0016 fixtures (same tenant/user/player UUIDs; `eeeeeeee-3333-…-0001` is a season in 0016 and a payment here): run it only after the 0016 cleanup and a clean residue check, never interleaved with 0016's call 1/call 2.

---

## Phase E — Orchestrator: consent-lock E2E in the browser (spec §6)

Run by the **orchestrator** with Playwright after branch 1 is merged and 0016 is applied (it proves the lock and that `authenticated` is unchanged). No tester agent. Results go into the evidence bundle (phase R).

- [ ] **Step E0: Environment**
  1. `git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas fetch origin`; create a detached worktree at `origin/develop` (e.g. `…/ligaspequenas-worktrees/e2e-develop`), copy `.env` from the main checkout into it, `pnpm install --frozen-lockfile`, start `pnpm dev --port 5173 --strictPort` in the background. Record the `origin/develop` SHA.
  2. Persistent Chromium: `curl -s 127.0.0.1:9222/json/version` must answer; if not, relaunch `~/.cache/ligaspequenas-e2e/launch.mjs` in the background (profile keeps the login). Connect with `chromium.connectOverCDP('http://127.0.0.1:9222')`; scripts end with `process.exit(0)` and **never** call `browser.close()`.
  3. Admin `ing.gustavo.cardenas@gmail.com` is already logged in on the default context. Readonly `ing.gustavo.cardenas+lp-test1@gmail.com` ("LP Test d") uses a separate `browser.newContext()`; request one magic link there and wait for the owner to open it in that window (poll until the URL leaves `/login`). Close only that context at the end.
  4. Publishable key for the API probes: read `VITE_SUPABASE_PUBLISHABLE_KEY` from the E2E worktree's `.env` in the Node script and pass it to `page.evaluate` (it is public; never print it in reports).

- [ ] **Step E1: Fixture**

As admin in the UI: create a player `full_name = 'E2E Consent Lock'` (any valid birth date/tutor). Then with `execute_sql`:

```sql
select p.id as player_id, p.tenant_id, d.id as doc_id, d.doc_type, d.status
from public.players p join public.documents d on d.player_id = p.id
where p.full_name = 'E2E Consent Lock' order by d.doc_type;
```

Expected: 6 rows, all `pendiente`. Keep `tenant`, `player`, and the `doc_id` of the `curp` and `privacy_notice` rows. Test file: a minimal PDF (< 10 MB) and a small JPG for the photo, both in the orchestrator's scratchpad.

API probe helper (inside `page.evaluate`, args `{ key, tenant, player, docId, uploadDoc }`; `uploadDoc` is the last path segment of the upload, `curp` unless a row says otherwise):

```js
async ({ key, tenant, player, docId, uploadDoc = 'curp' }) => {
  const base = 'https://eksbaugyypadtanyjcje.supabase.co'
  const { access_token } = JSON.parse(localStorage.getItem('sb-eksbaugyypadtanyjcje-auth-token'))
  const auth = { apikey: key, Authorization: `Bearer ${access_token}` }
  const up = await fetch(`${base}/storage/v1/object/player-files/${tenant}/${player}/${uploadDoc}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
    body: new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }),
  })
  const patch = await fetch(`${base}/rest/v1/documents?id=eq.${docId}`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'digital', file_path: `${tenant}/${player}/curp` }),
  })
  return { upload: [up.status, await up.text()], patch: [patch.status, await patch.text()] }
}
```

- [ ] **Step E2: Scenarios** (each: UI check **and** server check; record date + result per row)

| # | Context | Steps | Expected |
|---|---|---|---|
| E1 | admin; both consents `Pendiente` | Open the player page | Info alert `Para subir la foto o documentos digitales, primero registra el consentimiento de imagen y el aviso de privacidad.`; `Subir archivo` **disabled** on CURP, Acta de nacimiento, Comprobante de domicilio, Constancia médica; **enabled** on Consentimiento de imagen and Aviso de privacidad; `Subir foto` disabled with caption `Requiere consentimiento de imagen y aviso de privacidad`. |
| E1-API | same | API probe | `upload` 4xx with `new row violates row-level security policy`; `patch` 4xx with `consent_required`. SQL: `select count(*) from storage.objects where name = '<tenant>/<player>/curp'` → `0`; curp row still `pendiente`. |
| E2 | admin | Consentimiento de imagen → `Físico`; Aviso de privacidad → `Físico` | Alert disappears; upload buttons and `Subir foto` enabled. |
| E2b | admin, consent given | Upload the PDF on CURP; upload the photo | CURP chip `Digital`; `Ver` opens a tab whose URL contains `/storage/v1/object/sign/player-files/` and `token=`; the photo renders. |
| E3 | admin; CURP digital + photo | Try Aviso de privacidad → `Pendiente` | Option disabled with helper `Quita primero la foto y los documentos digitales.` Direct PATCH of the privacy_notice row to `pendiente` (same headers as the probe, body `{"status":"pendiente"}`) → 4xx with `consent_in_use`. |
| E3b | admin | CURP → `Físico` (confirm `Eliminar archivo`); `Quitar` the photo (confirm `Quitar foto`); Aviso de privacidad → `Pendiente` | Accepted; the info alert is back; non-consent upload buttons disabled again. API probe `upload` → 4xx RLS. |
| E3c | admin (prep for E4) | Aviso de privacidad → `Físico`; upload the PDF on CURP | CURP chip `Digital`. |
| E4 | readonly context | Open the same player page | No `Estatus` selects, no upload buttons, no info alert. `Ver` on CURP opens a `/storage/v1/object/sign/player-files/…token=` URL. API probe with `uploadDoc = 'birth_certificate'` (a path with no object, so the answer cannot be a duplicate error from the CURP object E3c left with `x-upsert: false`): `upload` any 4xx; `patch` → `200 []` or an RLS error; re-read with SQL: `select name, updated_at from storage.objects where name like '<tenant>/<player>/%'` → only the `…/curp` object, `updated_at` unchanged from before the probe (no `…/birth_certificate`), and the curp row unchanged (`digital`, same `file_path`). |
| E5 | no session (shell, not the browser) | From the E2E worktree, in **one** bash call (the key is read from `.env` and never echoed or printed): `KEY=$(grep '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env \| cut -d= -f2-); curl -s -w '\n%{http_code}\n' 'https://eksbaugyypadtanyjcje.supabase.co/rest/v1/players?select=id' -H "apikey: $KEY"`; `curl -s -o /dev/null -w '%{http_code}\n' 'https://eksbaugyypadtanyjcje.supabase.co/storage/v1/object/public/player-files/<tenant>/<player>/curp'` | REST → `401` with `42501` in the body (before 0016 it was `200 []`); public Storage URL → not `200` (bucket private → `400`). |

A failure in E1–E4 blocks the data load: stop, keep #6 open, debug with `superpowers:systematic-debugging` on its own branch; if 0016 caused it, apply the Rollback first.

- [ ] **Step E3: Cleanup** (this order — spec §6)
  1. As admin, remove the Storage objects **through the Storage API**: CURP → `Físico` (confirm `Eliminar archivo`) in the UI (and the photo if any is left), or `supabase.storage.from('player-files').remove([...])` through `page.evaluate` with the admin session. Never by SQL (`storage.protect_delete()` blocks it).
  2. `select count(*) from storage.objects where name like '<tenant>/<player>/%';` → `0`.
  3. `delete from public.players where id = '<player>';` (documents cascade) → then `select count(*) from public.players where full_name = 'E2E Consent Lock';` → `0`. Baseline count query equal to O1 except as explained by real activity.
  4. Close only the readonly context; stop the dev server; keep Chromium running.

---

## Phase R — Orchestrator: checklist evidence run (before dispatching branch 2)

On `origin/develop` after branch 1 is merged and phase E passed. Collect every output below into an **evidence bundle** (plain text pasted into the Task 3 dispatch prompt). All SQL via `execute_sql`; shell commands run under **bash** (zsh does not word-split the unquoted lists in C(4)) from the E2E worktree at `origin/develop` (`.env` present).

- [ ] **Step R1:** Date (`YYYY-MM-DD`), `origin/develop` SHA, production deploy commit (Vercel Dashboard → Deployments, or `vercel inspect ligaspequenas.vercel.app`), operator (`orquestador (Claude) + owner`).
- [ ] **Step R2: A** — the two §3.1-A queries (expected 0 rows each) and the informative listing:

```sql
select c.relname, p.polname, p.polcmd, array(select r.rolname from pg_roles r where r.oid = any(p.polroles)) as roles
from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' order by c.relname, p.polname;
```

(31 rows on 2026-10-16; record the count.)
- [ ] **Step R3: B** — the §3.1-B union (expected 0 rows) and the global-row query (expected `1`), both copied from the Task 3 template block in this plan (`docs/security/pre-real-data-checklist.md` does not exist until branch 2).
- [ ] **Step R4: C** — (1)–(5) exactly as written in the Task 3 template block in this plan (section C), with their positive controls: C(2) prints exactly `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_URL`; C(4) prints a list that contains a `/assets/browser-*.js` chunk and the match section is empty; C(5) `sb_publishable_` count ≥ 1, `browser-*.js` present in `dist/assets`, match section empty. If the auto-mode classifier blocks C(4)/(5) (it blocks scripts that grep for credential patterns), ask the owner to run them with `! bash <script>` and paste the output.
- [ ] **Step R5: D** — the two §3.1-D queries (0 rows) and the live curl against a real object path (status ≠ 200). The real path: any existing `storage.objects` row in `player-files` (`select name from storage.objects where bucket_id = 'player-files' limit 1;`) — if none exists after E3 cleanup, use the E5 result from phase E.
- [ ] **Step R6: E** — R-0012 and R-0013 results (from O6 or a fresh run) + the phase E table.
- [ ] **Step R7: F** — owner decision line (spec §3.1-F) and the current state of #87 (`gh issue view 87 --json state -q .state`).
- [ ] **Step R8: G** — `get_advisors(security)`: only `auth_leaked_password_protection`.
- [ ] **Step R9:** Residue check + baseline count query.

If any of A–E is red or G shows a new lint, stop: #6 stays open and branch 2 is not dispatched.

---

# Branch `update/pre-real-data-checklist` (Task 3, `Closes #6`)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/pre-real-data-checklist`, created by the orchestrator from `origin/develop` after phase R is green. `$WT2` is shorthand for that absolute path (same rule as `$WT1`: substitute the literal path, or start the shell call with `WT2=/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/pre-real-data-checklist;`).

- [ ] **Step 0 (implementer): Install and baseline** — as branch 1 Step 0 (`update/pre-real-data-checklist`; expected 39/330).

### Task 3: Checklist document with the first dated run (spec §3, §4.3, §4.4)

**Files:**
- Create: `docs/security/pre-real-data-checklist.md`

**Interfaces:**
- Consumes: the evidence bundle from phase R (pasted in the dispatch prompt). Every `{{…}}` placeholder below names the bundle field that replaces it.
- Produces: the checklist; #6 closes when this PR merges.

- [ ] **Step 1: Write the document**

Create `docs/security/pre-real-data-checklist.md` with exactly this content, replacing each `{{…}}` with the bundle value (keep the surrounding Markdown):

````markdown
# Checklist previo a datos reales

Se corre **completo** antes de cada carga de datos reales de menores (CURP, actas, fotos). Todo el SQL es read-only y corre con `mcp__supabase__execute_sql` (como `postgres`) sobre el proyecto `eksbaugyypadtanyjcje`. Cada query devuelve **filas solo si hay un problema**: un resultado vacío es verde. Los comandos de shell se corren con **bash** desde la raíz de un checkout de `develop` con `.env`.

Diseño y motivos: `docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md` (issue #6).

## A. RLS activo y al menos una policy en cada tabla de `public`

```sql
select c.relname, c.relrowsecurity, count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind in ('r', 'p')
group by c.relname, c.relrowsecurity
having not c.relrowsecurity or count(p.polname) = 0;
```

Las vistas no tienen RLS propio; deben ser `security_invoker`:

```sql
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and not coalesce('security_invoker=true' = any(c.reloptions), false);
```

Verde: 0 filas en ambas. Informativo (se anexa el conteo a la corrida, no falla el check):

```sql
select c.relname, p.polname, p.polcmd, array(select r.rolname from pg_roles r where r.oid = any(p.polroles)) as roles
from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' order by c.relname, p.polname;
```

## B. `anon` sin privilegios sobre objetos de la app

```sql
select 'relation' as kind, c.relname as name, priv
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as priv
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
  and has_table_privilege('anon', c.oid, priv)
union all
select 'function', n.nspname || '.' || p.proname, 'EXECUTE'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'private' or (n.nspname = 'public' and p.proname = 'set_updated_at'))
  and has_function_privilege('anon', p.oid, 'EXECUTE')
union all
select 'default_acl', coalesce(ns.nspname, '<global>') || ':' || d.defaclobjtype::text, a.privilege_type
from pg_default_acl d
left join pg_namespace ns on ns.oid = d.defaclnamespace
cross join aclexplode(d.defaclacl) a
where d.defaclrole = 'postgres'::regrole
  and (ns.nspname in ('public', 'private') or d.defaclnamespace = 0)
  and a.grantee in ('anon'::regrole, 0);
```

Verde: 0 filas (`grantee = 0` es `PUBLIC`). Además esta query debe devolver `1` (sin fila global, el EXECUTE a PUBLIC es implícito):

```sql
select count(*) from pg_default_acl d
where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
  and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0);
```

Lo garantiza la migración `0016_revoke_anon_privileges.sql`. Rojo antes de 0016 (2026-10-16): `relation` 96, `function` 10, `default_acl` 12, query global `0`.

## C. Ningún secreto en variables públicas ni `.env` en git

```bash
# (1) .env versionados — verde: vacío
git ls-files | grep -E '(^|/)\.env' | grep -v '^\.env\.example$'

# (2) variables VITE_ usadas en src — verde: exactamente VITE_SUPABASE_PUBLISHABLE_KEY y VITE_SUPABASE_URL
grep -rnoE '(^|[^A-Za-z0-9_])VITE_[A-Z0-9_]+' src | sed 's/.*VITE_/VITE_/' | sort -u

# (3) secretos en src — verde: vacío
grep -rnE 'sb_secret_|service_role|SERVICE_ROLE' src .env.example
```

```bash
# (4) bundle desplegado en producción (entry + chunks lazy)
PAT='sb_secret_[A-Za-z0-9_-]+|service_role|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
base=https://ligaspequenas.vercel.app
entries=$(curl -s "$base/" | grep -oE '/assets/[^"]+\.js' | sort -u)
chunks=$(for a in $entries; do curl -s "$base$a" | grep -oE '(assets/|["'"'"'`]\./)[A-Za-z0-9_.-]+\.js' | sed -E 's#^(assets/|.\./)#/assets/#'; done | sort -u)
all=$(printf '%s\n' $entries $chunks | sort -u)
printf '%s\n' $all
echo '--- matches:'
for a in $all; do curl -s "$base$a"; done | grep -oE "$PAT" | sort -u
```

```bash
# (5) bundle de develop, construido con el .env real
PAT='sb_secret_[A-Za-z0-9_-]+|service_role|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
pnpm build
ls dist/assets | grep -E '^browser-.*\.js$'
cat dist/assets/*.js | grep -o 'sb_publishable_' | wc -l
echo '--- matches:'
cat dist/assets/*.js | grep -oE "$PAT" | sort -u
```

Verde: (1) vacío; (2) exactamente las dos variables; (3) vacío; (4) la lista impresa contiene un chunk `/assets/browser-*.js` (el `import('write-excel-file/browser')` de `src/players/exportPlayers.ts`; si no aparece, la detección falló y el punto es rojo) y la sección de matches está vacía; (5) existe `browser-*.js`, el conteo de `sb_publishable_` es ≥ 1 (prueba que el build llevó el `.env`; sin él el bundle no trae código de la app y el escaneo no prueba nada) y la sección de matches está vacía. Si (4) o (5) encuentran un JWT, se decodifica el payload (`echo <payload> | base64 -d`): debe ser `"role":"anon"`; cualquier otro rol es rojo. (4) escanea lo desplegado (`main`), (5) cubre `develop`. `SUPABASE_SERVICE_ROLE_KEY` solo puede aparecer en `supabase/functions/` vía `Deno.env.get`.

Si imports dinámicos anidados aparecen en el futuro, (4) se repite sobre los chunks nuevos hasta que la lista no crezca.

## D. Storage privado, acceso solo con URL firmada

```sql
select id from storage.buckets where public;
select policyname, roles::text from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (roles <> '{authenticated}' or policyname not like 'player_files_%');
```

Verde: ambos vacíos. Prueba en vivo sin sesión, con una ruta real de `player-files`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://eksbaugyypadtanyjcje.supabase.co/storage/v1/object/public/player-files/<tenant>/<player>/<doc>"
```

Verde: distinto de 200 (bucket privado → 400). Desde la app, "Ver" abre `…/storage/v1/object/sign/player-files/…?token=…` (TTL 300 s); lo cubre el E2E (E2b, E4).

## E. Lock de consentimiento de punta a punta

El pgTAP de 0012/0013 sigue verde por MCP y el E2E en navegador (escenarios E1–E5 del spec §6) pasa completo, con fecha y resultado por escenario en la corrida.

## F. Plan de Supabase y respaldos

2026-10-16 — Free + backups automáticos cifrados (#87). Motivo: liga en arranque, ≤ ~40 jugadores esta temporada; Free alcanza (spec §7). Verde con esta línea. El estado de #87 se anota como dato informativo; no bloquea.

## G. (informativo) Advisors de seguridad

`get_advisors(security)`: solo se acepta `auth_leaked_password_protection` (la app es passwordless). Cualquier otro lint es rojo.

## Criterio de cierre

A–E en verde en una misma corrida fechada sobre `develop` (con el commit del deploy de C(4) anotado aparte), F registrado y G sin lints nuevos.

## Convenciones (invariantes para migraciones futuras)

1. **Funciones de la app.** Toda función nueva creada por `postgres` que una policy o el cliente llame necesita `grant execute … to authenticated` explícito: desde 0016 ya no hereda EXECUTE de PUBLIC. En `public` el default de `postgres` ya se lo da; en `private` y en cualquier otro schema hay que escribirlo. Las funciones de trigger no lo necesitan. Si se olvida, el pgTAP de la policy falla con `42501`.
2. **Helpers de test.** Toda función helper creada en un test (`pg_temp.*`, `tests.*`) lleva su grant a `public` justo después del `create`:

```sql
grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;
grant execute on function tests.act_as(uuid) to public;
```

Sin él, cualquier llamada hecha con `role` = `authenticated`/`anon` falla con `42501`.

3. **Extensiones.** El default global de 0016 (`revoke execute on functions from public` para `postgres`) también aplica a las funciones de extensiones instaladas después si quedan con owner `postgres` (p. ej. `pg_trgm`/`unaccent` activadas desde el Dashboard). Después de cada `create extension`, para cada función que la app o una policy use:

```sql
select has_function_privilege('authenticated', '<schema>.<funcion>(<args>)', 'EXECUTE');
```

Si da `false`: `grant execute on function <schema>.<funcion>(<args>) to authenticated;` en la misma migración.

## Rollback de 0016 (forward)

Solo si 0016 rompe algo en producción: aplicar como la siguiente migración libre (`<NNNN>_regrant_anon_privileges`) y abrir una rama nueva para reintentar.

```sql
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
grant execute on all functions in schema private to public;
grant execute on function public.set_updated_at() to public, anon;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant execute on functions to anon;
alter default privileges for role postgres grant execute on functions to public;
```

## Corridas

| Fecha | Commit `develop` | Commit del deploy (C4) | A | B | C | D | E | F | G | Quién |
|---|---|---|---|---|---|---|---|---|---|---|
| {{R1 date}} | {{R1 develop SHA}} | {{R1 deploy commit}} | {{R2 result}} | {{R3 result}} | {{R4 result}} | {{R5 result}} | {{R6 result}} | {{R7 result}} | {{R8 result}} | {{R1 operator}} |

### Detalle de la corrida {{R1 date}}

- **A:** {{R2 detail: rows of both queries, informative policy count}}
- **B:** {{R3 detail: union rows, global query value}}
- **C:** {{R4 detail: (1)–(5) outputs incl. chunk list and sb_publishable_ count}}
- **D:** {{R5 detail: both queries, live curl status}}
- **E (pgTAP):** {{R6 detail: R-0012 and R-0013 ok counts}}
- **F:** Free + backups automáticos cifrados (#87). Estado de #87: {{R7 #87 state}}.
- **G:** {{R8 detail: advisor list}}

| Escenario E2E | Resultado |
|---|---|
| E1 | {{E1}} |
| E1-API | {{E1-API}} |
| E2 | {{E2}} |
| E2b | {{E2b}} |
| E3 | {{E3}} |
| E3b | {{E3b}} |
| E3c | {{E3c}} |
| E4 | {{E4}} |
| E5 | {{E5}} |
````

Results are short: `verde` / `rojo` in the run table; one line per bullet in the detail (status codes, counts, the advisor name). Never paste the publishable key or any token.

- [ ] **Step 2: Verify**

Run:
- `grep -c '{{' docs/security/pre-real-data-checklist.md` → `0` (every placeholder replaced).
- `grep -nE 'sb_publishable_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{10,}' docs/security/pre-real-data-checklist.md` → empty (no key pasted; the literal `sb_publishable_` in C(5)'s grep is followed by `'`, so it does not match).
- `grep -c '^## ' docs/security/pre-real-data-checklist.md` → `11` (A, B, C, D, E, F, G, Criterio de cierre, Convenciones, Rollback de 0016, Corridas).
- The run-table row says `verde` in A–G columns (if the bundle says otherwise, stop and report — this PR must not exist with a red run).
- `pnpm exec vitest run` (39/330), `pnpm exec tsc -b`, `pnpm lint` → green.
- `git -C $WT2 diff --stat origin/develop` → exactly 1 file.

- [ ] **Step 3: Commit and report**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/pre-real-data-checklist add docs/security/pre-real-data-checklist.md
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/pre-real-data-checklist commit -m "docs: add the pre-real-data security checklist with its first green run (#6)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

Report the Step 2 outputs and the SHA. Then the orchestrator runs the pre-PR review, opens the PR (`Closes #6`, linking the checklist) and merges; the merge closes #6.

---

## Verification checklist

Implementer (each branch, before reporting): Step 0 baseline recorded; static checks of the task(s) as specified; `pnpm exec vitest run` 39/330, `pnpm exec tsc -b`, `pnpm lint` green; `git diff --stat origin/develop` shows only the listed files; commits end with the session line.

Orchestrator (branch 1): O1 baseline; O2 red = exactly the 10 listed `not ok`; O3 regression green before apply (R-0014/R-0015 red only on rows 17/21); review clean **before** O5; O5 applied as `0016_revoke_anon_privileges`; O6 22/22 `ok` + regression 6/25/21/17/21 `ok`; O7 `42501` / `ran`; O8 only `auth_leaked_password_protection`; residue all zero/null and baseline unchanged after every run; PR evidence complete.

Orchestrator (after branch 1): phase E all rows as expected and cleanup confirmed; phase R green; only then branch 2.

## Spec coverage (self-review)

| Spec § | Requirement | Where |
|---|---|---|
| §1 / §3.2 | Reproducible checklist; closure criterion | Task 3 (document), phase R, Global Constraints (`Closes #6` only after E/R green) |
| §2 Forma del checklist | Versioned Markdown, per-point block, dated run table | Task 3 |
| §2 Alcance / EXECUTE vía PUBLIC / Default privileges | Exact revokes incl. `from public` and the global default | Task 2 Step 2 (migration) |
| §2 Helpers de test | Grants in 0002/0012/0013 | Task 1; O3/O6/O7 |
| §2 Storage fuera | Not in 0016; checked by D | Task 2 (no storage DDL); checklist D |
| §2 Rollback | Forward re-grant | Phase O "Rollback"; checklist section |
| §2 E2E | Orchestrator, Playwright, after 0016 | Phase E |
| §2 Plan Supabase | Free + #87, out of scope | Checklist F; R7 |
| §2 Entrega | Two branches, one task each | Global Constraints |
| §3.1 A–G | Queries, expected results | Checklist A–G; phase R |
| §4.1 | Nothing breaks for authenticated/service_role | A2–A4, B3, D3–D6 (Task 2); O6 regression; phase E |
| §4.2 | Exact SQL, `apply_migration`, advisors | Task 2 Step 2; O5; O8 |
| §4.3 | Conventions (+ extensions rule, review finding) | Checklist "Convenciones" (rules 1–3); Global Constraints; Task 1 |
| §4.4 | Rollback SQL | Phase O "Rollback"; checklist |
| §5.1 | `pg_temp.as_role` + grant | Task 2 Step 1 |
| §5.2 | Fixtures, call order (fixtures call, then assertions call: as_role, probes, zz_results, D3, D6w, plan, union) | Task 2 Step 1 markers; O2/O6 |
| §5.3 | 22 assertions A1–D6 | Task 2 Step 1 |
| §5.4 | Cleanup order, residue, advisors; regression; TDD red list | 0016 cleanup + Residue check; R-0002/0012/0013; O2 |
| §6 | E1–E5, API probes, cleanup order | Phase E |
| §7 | Free vs Pro rationale | Checklist F (decision line); no task needed |
| §8 | Out of scope | Not touched |
| §9 | Risks | Review Focus; Residue check; O7; Rollback |

Deviations from the spec, all justified above:
- Migration name `0016_revoke_anon_privileges` (repo/remote convention) instead of `revoke_anon_privileges`.
- Checklist C(2) regex: the spec's `VITE_[A-Z0-9_]+` also matches `INVITE_ERROR_MESSAGES` (`src/users/UsersPage.tsx:23`) → a false red; fixed with a left boundary (verified output: exactly the two variables).
- Checklist C(4) chunk regex: the spec's `assets/…\.js` misses the lazy chunk, which the entry references as `` `./browser-….js` `` (verified against the live deploy 2026-10-16: the spec form lists only `index-*.js`; the fixed form lists `/assets/browser-BoWduoKG.js`). Also: run under bash (zsh does not split the lists).
- Checklist C(5): positive controls added (`browser-*.js` exists, `sb_publishable_` ≥ 1) and the build uses the real `.env`, otherwise the bundle carries no app code and an empty scan proves nothing (same lesson as the Excel-export plan).
- Regression of 0002/0012/0013 is run through R-calls (TAP capture into a temp table, fixtures + cleanup in the same atomic call) because the canonical files are not directly runnable over MCP; 0002's `reset()` is substituted and a follow-up issue is filed rather than editing it in this branch.
- 0016 cleanup uses `drop … if exists` so it is safe after a rolled-back call 2.

Verified read-only on the remote (2026-10-16): PG 17.6; MCP `session_user = postgres`; `tests` schema absent; no `reset()` function; pgTAP 1.3.3 owned by `supabase_admin`, `plan()` grants its temp objects to PUBLIC; `authenticated` has USAGE on `extensions` and EXECUTE on `is`/`throws_ok`; no global `pg_default_acl` row for `postgres`; red-state counts of the §3.1-B union (`relation` 96, `function` 10, `default_acl` 12) and of A1 (96), B1 (9), B2 (9), C1 (12), C2 (0) without the probe objects (call 2 adds them before asserting: O2 expects A1 104, B1/B2 10); A2–A4 = 0 and B3 = true today; §3.1-A/D queries (0 rows) and the informative policy listing (31 rows); `seasons` columns and BEFORE-UPDATE-only `set_updated_at` trigger; the residue and baseline queries; the TAP ordering expression; `has_table_privilege(…, 'MAINTAIN')`.

Not verified (no DDL allowed while planning): the migration DDL itself, `pg_temp.as_role` and the D-group / C3–C5 rows, R-0002/0012/0013 and O7 as whole calls. The first real execution of the 0016 assertions is O2 (before applying, harmless); the R-calls are first exercised in O3 (before applying). Any syntax problem there is fixed before anything is applied.
