# Player Documents, Photo and Consent Lock (#1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins record each of a player's 6 documents as `pendiente` / `fisico` / `digital`, upload the file when digital, and upload/replace/remove the player's photo; readonly users see statuses and open files; every file lives in a private, tenant-scoped bucket reachable only through 300 s signed URLs; no photo or non-consent digital document can be stored while `image_consent` or `privacy_notice` is `pendiente` — enforced in the client, in Storage RLS and in DB triggers.

**Architecture:** Two migrations add the private `player-files` bucket, two `private` helpers, four `storage.objects` policies (0012), and make `documents` rows system-owned with a CHECK plus two consent triggers on `documents` and `players` (0013). A new `src/documents/` module holds the data layer (`documents.ts`) and the `PlayerDocumentsSection` component; the photo functions live in `src/players/players.ts` and the `PlayerPhoto` component in `src/players/`. `PlayerFormPage` loads the documents once and passes them to both components, reloading after every change.

**Tech Stack:** React 19.2, react-router-dom 7, MUI 9, `@supabase/supabase-js` 2.108 (PostgREST + Storage), Vitest + Testing Library + user-event, TypeScript (`tsc -b`), ESLint, pnpm; Postgres on remote Supabase (`eksbaugyypadtanyjcje`) via the Supabase MCP; pgTAP in schema `extensions`.

**Spec:** `docs/superpowers/specs/2026-10-13-documents-design.md` (read it before starting; section numbers below refer to it).

## Global Constraints

- Three branches, in sequence, each cut from `develop` **after the previous one is merged**: `feature/documents-db-storage` (Tasks 1–2) → `feature/documents-ui` (Tasks 3–5) → `feature/player-photo` (Tasks 6–7). PR bodies: branches 1 and 2 carry `Refs #1`; branch 3 carries `Closes #1`.
- The spec's single migration `0012_player_files.sql` is split in two files for apply granularity: `0012_player_files_storage.sql` (bucket, helpers, Storage policies) and `0013_document_consent_rules.sql` (policy drops, CHECK, triggers). Content is exactly spec §3.
- Worktrees are created **by the orchestrator** before dispatch under `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/<branch-suffix>` (e.g. `…/documents-db-storage`). Implementers skip creation; their first action is `pnpm install --frozen-lockfile` inside their worktree. Tests need no `.env`.
- Git inside a worktree: always `git -C <absolute worktree path> …`, **one git command per shell call**. Never use `CLAUDE_GIT_OVERRIDE`. Never touch `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (the main checkout).
- Implementers never push, open PRs or merge. **Exception for branch 1 only:** its implementer applies migrations 0012/0013 to the remote with `mcp__supabase__apply_migration` and runs the pgTAP assertions with `mcp__supabase__execute_sql` (there is no local stack and the MCP cannot branch — SQL hits the live project). If the Supabase MCP tools are not available or not authenticated, **stop and report to the orchestrator**; do not look for another way to reach the database.
- Remote DB hygiene: every fixture (tenants, `auth.users`, profiles, players, documents, `storage.objects` rows) uses the fixed UUIDs in Task 1/2 and is deleted at the end of the task; row counts return to the baseline recorded in Task 1 Step 1. Run `mcp__supabase__get_advisors` (type `security`) after each migration; resolve any **new** finding.
- Per-branch cycle: implementer → pre-PR reviewer; no Blockers/Majors → PR to `develop`, Minors/Nits filed as GitHub issues; Blockers/Majors → orchestrator plans fixes and the cycle restarts; max 3 cycles, then escalate to the owner. The orchestrator merges into `develop`; `develop → main` only with the owner's confirmation.
- Code, identifiers, comments, commit messages: English. Comments only for a non-obvious *why*, one short line max. UI copy: Spanish, **exactly** as written in this plan.
- Exact DB error prefixes (spec §2): `consent_required:` · `consent_in_use:` · `invalid_file_path:` · `file_path_mismatch:` · `document_identity_immutable:`.
- Exact UI strings:
  - Labels: `CURP` · `Acta de nacimiento` · `Comprobante de domicilio` · `Consentimiento de imagen` · `Aviso de privacidad` · `Constancia médica`
  - Statuses: `Pendiente` · `Físico` · `Digital`
  - Section title: `Documentos`
  - Buttons: `Subir archivo` · `Reemplazar` · `Ver` · `Subir foto` · `Cambiar` · `Quitar` · `Cancelar` · `Eliminar archivo` · `Quitar foto`
  - Lock alert: `Para subir la foto o documentos digitales, primero registra el consentimiento de imagen y el aviso de privacidad.`
  - Photo lock helper: `Requiere consentimiento de imagen y aviso de privacidad`
  - Consent-in-use helper: `Quita primero la foto y los documentos digitales.`
  - Confirm dialogs: title `¿Eliminar el archivo?` body `Se eliminará el archivo subido.` · title `¿Quitar la foto?` body `Se eliminará la foto del jugador.`
  - Toasts: `Documento actualizado` · `Foto actualizada`
  - Errors: `Primero registra el consentimiento de imagen y el aviso de privacidad.` · `No se puede regresar a pendiente: primero quita la foto y los documentos digitales.` · `Ruta de archivo inválida.` · `No tienes permiso para esta acción.` · `No se pudo eliminar el archivo.` · `Formato no permitido: usa PDF, JPG, PNG o WebP.` · `El archivo supera 10 MB.` · `Formato no permitido: usa JPG, PNG o WebP.` · `La foto supera 5 MB.` · `No se pudo abrir el archivo.` · `Tu navegador bloqueó la ventana. Permite ventanas emergentes e intenta de nuevo.` · `No se pudieron cargar los documentos.`
- Limits: documents ≤ `10 * 1024 * 1024` bytes (inclusive), MIME `application/pdf`, `image/jpeg`, `image/png`, `image/webp`; photo ≤ `5 * 1024 * 1024` bytes (inclusive), MIME `image/jpeg`, `image/png`, `image/webp`. Signed URLs: `300` s. Bucket id: `player-files`.
- Lint rules that bite: `react-hooks/set-state-in-effect` — no synchronous `setState` in an effect body; state changes live in `.then`/`.catch` or handlers (same pattern as the existing `PlayerFormPage` effects).
- Mocks: keep the existing `vi.hoisted` + `vi.mock('../lib/supabase')` style. Use persistent `mockResolvedValue`/`mockReturnValue` in `beforeEach`; per-test overrides with `mockResolvedValueOnce` must be consumed by that test.
- Every branch closes with all three green: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`. Baseline on `develop` d8daa39: `Test Files 30 passed (30)`, `Tests 164 passed (164)`.

## Review Focus

- **A file with an empty `type`** (some Android pickers and drag-and-drop of unknown files report `''`) must be rejected with `Formato no permitido…` before any Supabase call, not uploaded as `application/octet-stream` and bounced by the bucket with an opaque error (pinned in Task 3, `validateDocumentFile('')` test; Task 6, `validatePhotoFile('')` test).
- **A file of exactly 10 MB (or 5 MB for the photo)** must be accepted; only strictly larger files are rejected — the bucket limit is inclusive (pinned in Task 3 and Task 6 boundary tests).
- **A blocked popup on "Ver"** (`window.open` returns `null`, e.g. Safari with popups disabled) must show `Tu navegador bloqueó la ventana…` and not throw (pinned in Task 4).
- **A failed documents fetch** must not break the player form: the section shows `No se pudieron cargar los documentos.` with a retry, and the rest of the page (form, team select, save) keeps working (pinned in Task 5).
- **A photo whose signed URL fails** (object missing, expired session) must fall back to the initials avatar, not a broken image or a crash (pinned in Task 7).

---

## Branch `feature/documents-db-storage` (Tasks 1–2)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-db-storage` (created by the orchestrator from `develop`).

- [ ] **Step 0: Install dependencies and confirm the baseline**

Run (inside the worktree): `pnpm install --frozen-lockfile`, then `pnpm exec vitest run`.
Expected: `Test Files 30 passed (30)` · `Tests 164 passed (164)`.

### How to run pgTAP against the remote (applies to Tasks 1–2)

Facts (project memory, verified on migrations 0001–0011):
- pgTAP lives in schema `extensions`: always call `extensions.plan(n)`, `extensions.is(...)`.
- `mcp__supabase__execute_sql` returns only the **last** statement's result and runs the whole call in one implicit transaction that **commits** (fixtures persist). Session-local objects (`pg_temp` functions, `set_config(..., true)`) live only for that call.
- Value assertions: one call = `select extensions.plan(N);` … setup statements … then a **single final** `select extensions.is(...) union all select extensions.is(...) …;`. Pass iff no returned row starts with `not ok`.
- Structural pgTAP (`has_function`, `col_is_unique`, `throws_ok` across calls) is unreliable this way. Check catalog rows with `extensions.is(...)` instead, and capture errors with the `pg_temp.try_sql` helper below.

Paste these two helpers at the top of **every** `execute_sql` call that needs them (they vanish at the end of the call):

```sql
create or replace function pg_temp.try_sql(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || split_part(sqlerrm, ':', 1);
end;
$$;

create or replace function pg_temp.count_sql(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;
```

`try_sql` returns `'ok'` on success (the statement's effects persist, because the exception block only rolls back on error) or e.g. `'P0001 consent_required'`, `'23514 new row for relation "documents" violates check constraint "documents_file_path_iff_digital"'` (for non-`P0001` errors the full first message segment is returned), `'42501 new row violates row-level security policy for table "objects"'`.

Act as a user inside the same call with:

```sql
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
```

and return to `postgres` with `select set_config('role', 'postgres', true);`. If `pg_temp` functions cannot be executed after switching to `authenticated`, create the two helpers instead in a throwaway schema `tests_tmp` with `grant usage on schema tests_tmp to authenticated` and `grant execute` on both, use `tests_tmp.try_sql`, and `drop schema tests_tmp cascade` during cleanup. Record which variant worked in your report.

**Fixture UUIDs (never reuse real data):**

| What | UUID |
|---|---|
| Tenant X | `cccccccc-0000-0000-0000-000000000001` (slug `test-docs-x`) |
| Tenant Y | `cccccccc-0000-0000-0000-000000000002` (slug `test-docs-y`) |
| Admin X (`admin-x@docs.test`) | `cccccccc-1111-0000-0000-000000000001` |
| Readonly X (`readonly-x@docs.test`) | `cccccccc-1111-0000-0000-000000000002` |
| Admin Y (`admin-y@docs.test`) | `cccccccc-1111-0000-0000-000000000003` |
| Player P (tenant X) | `cccccccc-2222-0000-0000-000000000001` |
| Player Q (tenant X) | `cccccccc-2222-0000-0000-000000000002` |

Fixture setup SQL (run as `postgres`, once per task, before the assertions):

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

If the `profiles` insert fails because of a trigger or a column this snippet does not know about, read `supabase/migrations/0001_schema.sql` / `0006` and adapt the column list — do not change any migration.

Cleanup SQL (run as `postgres` at the end of each task; the delete flag is required by Supabase's guard on `storage.objects`):

```sql
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects
  where bucket_id = 'player-files' and name like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.players where id in ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000002');
delete from public.profiles where id::text like 'cccccccc-1111-%';
delete from auth.users where id::text like 'cccccccc-1111-%';
delete from public.tenants where id::text like 'cccccccc-0000-%';
```

Then re-run the baseline count query from Task 1 Step 1 and confirm every count matches.

### Task 1: Private bucket, path helpers and Storage policies (`0012`)

**Files:**
- Create: `supabase/migrations/0012_player_files_storage.sql`
- Create: `supabase/tests/0012_player_files_storage.test.sql`

**Interfaces:**
- Consumes: `private.current_tenant_id()`, `private.is_admin()` (0003); enums `public.document_type`, `public.document_status` (0001).
- Produces: bucket `player-files`; `private.player_consent_granted(p_player_id uuid) returns boolean`; `private.player_file_path_allowed(p_name text) returns boolean`; policies `player_files_select`, `player_files_insert`, `player_files_update`, `player_files_delete` on `storage.objects`. Task 2 uses `private.player_consent_granted`.

- [ ] **Step 1: Record the remote baseline**

Run with `execute_sql`:

```sql
select version(),
  (select count(*) from public.tenants) as tenants,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users) as users,
  (select count(*) from public.players) as players,
  (select count(*) from public.documents) as documents,
  (select count(*) from storage.buckets where id = 'player-files') as bucket,
  (select count(*) from storage.objects where bucket_id = 'player-files') as objects,
  (select count(*) from public.documents where status <> 'pendiente' or file_path is not null) as non_pending_docs;
```

Write the numbers down for the report. Expected: `bucket = 0`, `objects = 0`, `non_pending_docs = 0` (if `non_pending_docs > 0`, stop and report: the Task 2 CHECK could fail on real data).

- [ ] **Step 2: Write the canonical test file (red)**

Create `supabase/tests/0012_player_files_storage.test.sql` — the standard-form artifact (not run directly; Step 3 runs its assertions through MCP):

```sql
begin;
select extensions.plan(16);

-- fixtures: tenants X/Y, admin X, readonly X, admin Y, players P/Q in X (see plan Task 1 fixture block)

select extensions.is((select public from storage.buckets where id = 'player-files'), false, 'bucket is private');
select extensions.is((select file_size_limit from storage.buckets where id = 'player-files'), 10485760::bigint, 'bucket limit is 10 MB');
select extensions.is(
  (select allowed_mime_types::text from storage.buckets where id = 'player-files'),
  '{application/pdf,image/jpeg,image/png,image/webp}', 'bucket MIME allow-list');

-- consent helper: seeded rows are pendiente → false; both consents fisico → true; one consent row missing → false
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000001'), false, 'pending consents are not granted');
-- (as postgres) update documents set status = 'fisico' where player_id = P and doc_type in ('image_consent','privacy_notice')
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000001'), true, 'both consents fisico are granted');
-- (as postgres) delete from documents where player_id = Q and doc_type = 'privacy_notice'; update Q image_consent to fisico
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000002'), false, 'a missing consent row is not granted');

-- path helper, acting as admin X (P has consent, Q does not)
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'), true, 'document with consent allowed');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo'), true, 'photo with consent allowed');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp'), false, 'document without consent blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/image_consent'), true, 'consent document exempt from the lock');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000002/cccccccc-2222-0000-0000-000000000001/curp'), false, 'other tenant prefix blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/not-a-uuid/curp'), false, 'non-uuid player segment is false, not an error');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001'), false, 'two segments blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp/x'), false, 'four segments blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/passport'), false, 'unknown file name blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000099/curp'), false, 'unknown player blocked');

-- storage.objects policies (see plan Task 1 Step 6 for the MCP form)

select * from extensions.finish();
rollback;
```

- [ ] **Step 3: Run the assertions before the migration (verify red)**

Run the fixture setup SQL (section "How to run pgTAP"), then with `execute_sql`:

```sql
select extensions.plan(1);
select extensions.is((select count(*) from storage.buckets where id = 'player-files')::int, 1, 'bucket exists');
```

Expected: `not ok 1 - bucket exists`. Also confirm `select to_regprocedure('private.player_file_path_allowed(text)')` returns `null`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0012_player_files_storage.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-files', 'player-files', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.player_consent_granted(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) = 2
  from public.documents d
  where d.player_id = p_player_id
    and d.doc_type in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
    and d.status <> 'pendiente'::public.document_status;
$$;

create or replace function private.player_file_path_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_tenant uuid := private.current_tenant_id();
  v_player uuid;
begin
  if v_tenant is null or coalesce(array_length(v_parts, 1), 0) <> 3 then
    return false;
  end if;
  if v_parts[1] <> v_tenant::text then
    return false;
  end if;
  -- compared as text: a uuid cast would raise 22P02 inside the policy instead of returning false
  select p.id into v_player
  from public.players p
  where p.id::text = v_parts[2] and p.tenant_id = v_tenant;
  if v_player is null then
    return false;
  end if;
  if v_parts[3] in ('image_consent', 'privacy_notice') then
    return true;
  end if;
  if v_parts[3] <> 'photo'
     and not (v_parts[3] = any (select unnest(enum_range(null::public.document_type))::text)) then
    return false;
  end if;
  return private.player_consent_granted(v_player);
end;
$$;

grant execute on function private.player_consent_granted(uuid) to authenticated;
grant execute on function private.player_file_path_allowed(text) to authenticated;

create policy player_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'player-files'
         and (storage.foldername(name))[1] = private.current_tenant_id()::text);

create policy player_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-files'
              and private.is_admin()
              and private.player_file_path_allowed(name));

create policy player_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'player-files'
         and private.is_admin()
         and private.player_file_path_allowed(name))
  with check (bucket_id = 'player-files'
              and private.is_admin()
              and private.player_file_path_allowed(name));

create policy player_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'player-files'
         and private.is_admin()
         and (storage.foldername(name))[1] = private.current_tenant_id()::text);
```

- [ ] **Step 5: Apply it to the remote**

`mcp__supabase__apply_migration` with name `0012_player_files_storage` and the file's exact content. Expected: success. If creating policies on `storage.objects` fails with a permission error, stop and report the exact error (do not alter ownership or grants).

- [ ] **Step 6: Run the assertions (verify green)**

Call A (as `postgres`; bucket + consent helper). Run the consent fixture changes, then the assertions:

```sql
select extensions.plan(6);
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type in ('image_consent', 'privacy_notice');
delete from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'privacy_notice';
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'image_consent';
select extensions.is((select public from storage.buckets where id = 'player-files'), false, 'bucket is private')
union all select extensions.is((select file_size_limit from storage.buckets where id = 'player-files'), 10485760::bigint, 'bucket limit is 10 MB')
union all select extensions.is((select allowed_mime_types::text from storage.buckets where id = 'player-files'), '{application/pdf,image/jpeg,image/png,image/webp}', 'bucket MIME allow-list')
union all select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000001'), true, 'both consents fisico are granted')
union all select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000002'), false, 'a missing consent row is not granted')
union all select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000099'), false, 'unknown player is not granted');
```

Call B (act as admin X; the ten `player_file_path_allowed` assertions from Step 2, `extensions.plan(10)`, prefixed with the `set_config` pair for `cccccccc-1111-0000-0000-000000000001`).

Call C (Storage policies; helpers + the following, `extensions.plan(8)`):

```sql
-- as postgres: a pre-existing object for P/curp and P/image_consent
insert into storage.objects (bucket_id, name) values
  ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'),
  ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent');
```

then, switching roles between statements:

| # | Act as | Statement | Expected |
|---|---|---|---|
| 1 | readonly X | `select count(*) from storage.objects where bucket_id = 'player-files'` (via `extensions.is(...)::int`) | `2` |
| 2 | admin Y | same count | `0` |
| 3 | admin X | `try_sql($$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo')$$)` | `ok` |
| 4 | admin X | `try_sql(… '…/cccccccc-2222-0000-0000-000000000002/curp' …)` (Q has no consent) | starts with `42501` |
| 5 | admin X | `try_sql(… '…/cccccccc-2222-0000-0000-000000000002/image_consent' …)` | `ok` |
| 6 | readonly X | `try_sql(… '…/cccccccc-2222-0000-0000-000000000001/birth_certificate' …)` | starts with `42501` |
| 7 | readonly X | `set_config('storage.allow_delete_query','true',true)` then `count_sql($$delete from storage.objects where bucket_id = 'player-files'$$)` | `0` |
| 8 | admin Y | `try_sql(… 'cccccccc-0000-0000-0000-000000000001/…/proof_of_address' …)` | starts with `42501` |

Use `extensions.is(left(pg_temp.try_sql(...), 5), '42501', '…')` for the "starts with" rows. Collect each result into a variable-free form by running statements in order and putting all eight `extensions.is(...)` in the final `union all` select — if a row needs a different role than the final statement, evaluate it earlier into a temp table: `create temp table r (n int, v text)` / `insert into r values (1, …)` while acting as the right role (grant `insert, select` on `r` is not needed: temp tables are owned by the session user; if switching to `authenticated` blocks access, use `tests_tmp.r` as in the fallback above), then finish with `select extensions.is(v, '<expected>', 'policy row ' || n) from r order by n;` as `postgres`.

Expected: every row `ok`. Then fill in the canonical test file's policy section with the same eight cases in standard `extensions.is(...)` form.

- [ ] **Step 7: Advisors**

`mcp__supabase__get_advisors` with type `security`. Expected: no new finding mentioning `player_consent_granted`, `player_file_path_allowed` or `player-files`. Resolve any new one in the migration (re-apply as a new migration only if the orchestrator agrees — report first).

- [ ] **Step 8: Cleanup**

Run the cleanup SQL and the baseline count query; every count equals Step 1 except `bucket = 1`.

- [ ] **Step 9: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-db-storage add supabase/migrations/0012_player_files_storage.sql supabase/tests/0012_player_files_storage.test.sql
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-db-storage commit -m "feat: add private player-files bucket with tenant and consent-aware Storage policies (#1)"
```

### Task 2: System-owned documents and consent triggers (`0013`)

**Files:**
- Create: `supabase/migrations/0013_document_consent_rules.sql`
- Create: `supabase/tests/0013_document_consent_rules.test.sql`

**Interfaces:**
- Consumes: `private.player_consent_granted(uuid)` (Task 1).
- Produces: constraint `documents_file_path_iff_digital`; functions `private.enforce_document_rules()`, `private.enforce_player_photo_rules()`; triggers `trg_documents_enforce_rules`, `trg_players_enforce_photo`; policies `documents_insert` and `documents_delete` **dropped**. Branches 2–3 rely on the error prefixes listed in Global Constraints.

- [ ] **Step 1: Write the canonical test file (red)**

Create `supabase/tests/0013_document_consent_rules.test.sql` in the same standard form as Task 1 (`begin; select extensions.plan(19); … select * from extensions.finish(); rollback;`) containing, as `extensions.is(...)` lines, every case in the table of Step 4.

- [ ] **Step 2: Verify red**

Fixture setup, then:

```sql
select extensions.plan(1);
select extensions.is(
  (select count(*) from pg_constraint where conname = 'documents_file_path_iff_digital')::int, 1, 'check exists');
```

Expected: `not ok 1`.

- [ ] **Step 3: Write and apply the migration**

Create `supabase/migrations/0013_document_consent_rules.sql`:

```sql
drop policy documents_insert on public.documents;
drop policy documents_delete on public.documents;

alter table public.documents
  add constraint documents_file_path_iff_digital
  check ((status = 'digital') = (file_path is not null));

create or replace function private.enforce_document_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo text;
begin
  if tg_op = 'UPDATE'
     and (new.tenant_id <> old.tenant_id or new.player_id <> old.player_id or new.doc_type <> old.doc_type) then
    raise exception 'document_identity_immutable: tenant_id, player_id and doc_type cannot change';
  end if;

  -- serializes consent revocation against concurrent uploads for the same player
  select p.photo_path into v_photo
  from public.players p
  where p.id = new.player_id
  for no key update;

  if new.file_path is not null
     and new.file_path <> new.tenant_id::text || '/' || new.player_id::text || '/' || new.doc_type::text then
    raise exception 'file_path_mismatch: file_path must be %/%/%', new.tenant_id, new.player_id, new.doc_type;
  end if;

  if new.status = 'digital'::public.document_status
     and new.doc_type not in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
     and not private.player_consent_granted(new.player_id) then
    raise exception 'consent_required: image_consent and privacy_notice must be signed first';
  end if;

  if tg_op = 'UPDATE'
     and new.doc_type in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
     and new.status = 'pendiente'::public.document_status
     and old.status <> 'pendiente'::public.document_status
     and (
       v_photo is not null
       or exists (
         select 1 from public.documents d
         where d.player_id = new.player_id
           and d.doc_type not in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
           and d.status = 'digital'::public.document_status)
       or exists (
         select 1 from storage.objects o
         where o.bucket_id = 'player-files'
           and o.name like new.tenant_id::text || '/' || new.player_id::text || '/%'
           and split_part(o.name, '/', 3) not in ('image_consent', 'privacy_notice'))
     ) then
    raise exception 'consent_in_use: remove the photo and digital documents first';
  end if;

  return new;
end;
$$;

create trigger trg_documents_enforce_rules
  before insert or update on public.documents
  for each row execute function private.enforce_document_rules();

create or replace function private.enforce_player_photo_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_path is null then
    return new;
  end if;
  if new.photo_path <> new.tenant_id::text || '/' || new.id::text || '/photo' then
    raise exception 'invalid_file_path: photo_path must be %/%/photo', new.tenant_id, new.id;
  end if;
  if not private.player_consent_granted(new.id) then
    raise exception 'consent_required: image_consent and privacy_notice must be signed first';
  end if;
  return new;
end;
$$;

create trigger trg_players_enforce_photo
  before insert or update of photo_path on public.players
  for each row execute function private.enforce_player_photo_rules();
```

Apply with `mcp__supabase__apply_migration` (name `0013_document_consent_rules`). If the CHECK fails on existing rows, stop and report (Task 1 Step 1 should have caught it).

- [ ] **Step 4: Run the assertions (verify green)**

Fixture setup first (players P and Q get their 6 seeded rows — assertion 1 confirms the seed still works under the new trigger). Abbreviations: `X = cccccccc-0000-0000-0000-000000000001`, `P = cccccccc-2222-0000-0000-000000000001`, `Q = cccccccc-2222-0000-0000-000000000002`, `pathP(t) = 'X/P/' || t` written out in full. Act as admin X unless the row says otherwise; collect results into a temp table as in Task 1 Step 6 when roles differ.

| # | Setup (before the statement) | Statement | Expected |
|---|---|---|---|
| 1 | — | `select count(*) from documents where player_id = P` | `6` |
| 2 | — | `try_sql(update documents set status='digital', file_path='X/P/curp' where player_id=P and doc_type='curp')` | `P0001 consent_required` |
| 3 | — | `try_sql(update … status='digital', file_path='X/P/image_consent' where … doc_type='image_consent')` | `ok` |
| 4 | — | `try_sql(update … status='fisico', file_path=null where … doc_type='privacy_notice')` | `ok` |
| 5 | (consent now granted for P) | `try_sql(update … status='digital', file_path='X/P/curp' where … doc_type='curp')` | `ok` |
| 6 | — | `try_sql(update … status='pendiente' where … doc_type='privacy_notice')` | `P0001 consent_in_use` |
| 7 | — | `try_sql(update … status='digital', file_path='X/Q/birth_certificate' where player_id=P and doc_type='birth_certificate')` | `P0001 file_path_mismatch` |
| 8 | — | `left(try_sql(update … status='digital', file_path=null where … doc_type='medical_clearance'), 5)` | `23514` |
| 9 | — | `left(try_sql(update … status='fisico', file_path='X/P/proof_of_address' where … doc_type='proof_of_address'), 5)` | `23514` |
| 10 | — | `try_sql(update … doc_type='medical_clearance' where player_id=P and doc_type='proof_of_address')` | `P0001 document_identity_immutable` |
| 11 | — | `try_sql(update … player_id=Q where player_id=P and doc_type='proof_of_address')` | `P0001 document_identity_immutable` |
| 12 | — | `count_sql(delete from documents where player_id = P)` | `0` (no delete policy → RLS hides every row) |
| 13 | — | `left(try_sql(insert into documents (tenant_id, player_id, doc_type) values (X, P, 'curp')), 5)` | `42501` |
| 14 | — | `try_sql(update players set photo_path='X/P/photo' where id=Q)` (another player's path) | `P0001 invalid_file_path` |
| 15 | — | `try_sql(update players set photo_path='X/Q/photo' where id=Q)` (Q's own path; Q has no consent) | `P0001 consent_required` |
| 16 | — | `try_sql(update players set photo_path='X/P/photo' where id=P)` (P has consent) | `ok` |
| 17 | — | `try_sql(update documents set status='pendiente', file_path=null where player_id=P and doc_type='image_consent')` (photo set, curp digital) | `P0001 consent_in_use` |
| 18 | as postgres: `update players set photo_path=null where id=P`; `update documents set status='fisico', file_path=null where player_id=P and doc_type='curp'`; `insert into storage.objects (bucket_id, name) values ('player-files', 'X/P/medical_clearance')` (an orphan with no digital row) | `try_sql(update documents set status='pendiente', file_path=null where player_id=P and doc_type='image_consent')` | `P0001 consent_in_use` |
| 19 | as postgres: `set_config('storage.allow_delete_query','true',true)`; `delete from storage.objects where name = 'X/P/medical_clearance'` | `try_sql(update documents set status='pendiente', file_path=null where player_id=P and doc_type='image_consent')` | `ok` |

Write every UUID out in full in the actual SQL.

Note: the trigger raises `invalid_file_path` / `consent_required` with `P0001`; `try_sql` returns `sqlstate || ' ' || split_part(sqlerrm, ':', 1)`, so the expected values above are exact.

Expected: all 19 `ok`. Then make the canonical test file match.

- [ ] **Step 5: Advisors, cleanup, existing suite**

`get_advisors` (security) → no new finding. Cleanup SQL + baseline counts (only `bucket = 1` differs). `pnpm exec vitest run` → still `164 passed` (no frontend change), `pnpm exec tsc -b` and `pnpm lint` → 0.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-db-storage add supabase/migrations/0013_document_consent_rules.sql supabase/tests/0013_document_consent_rules.test.sql
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-db-storage commit -m "feat: enforce the consent lock and system-owned document rows in the database (#1)"
```

**Report** (branch 1): baseline counts before/after, which `try_sql` variant worked (`pg_temp` or `tests_tmp`), the Postgres version, every assertion result, advisors output, and the two commit SHAs.

---

## Branch `feature/documents-ui` (Tasks 3–5)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-ui` (cut from `develop` after branch 1 is merged). Step 0 as before; expected baseline `164 passed`.

### Task 3: Documents data layer (`src/documents/documents.ts`)

**Files:**
- Create: `src/documents/documents.ts`
- Test: `src/documents/documents.test.ts`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase` (`from('documents')`, `storage.from('player-files')`).
- Produces (exact):

```ts
export type DocumentType = 'curp' | 'birth_certificate' | 'proof_of_address' | 'image_consent' | 'privacy_notice' | 'medical_clearance'
export type DocumentStatus = 'pendiente' | 'fisico' | 'digital'
export interface DocumentRow { id: string; tenant_id: string; player_id: string; doc_type: DocumentType; status: DocumentStatus; file_path: string | null; updated_at: string }
export interface FileResult { ok: boolean; error?: string }
export const PLAYER_FILES_BUCKET = 'player-files'
export const SIGNED_URL_TTL_SECONDS = 300
export const DOCUMENT_TYPES: readonly DocumentType[]
export const DOCUMENT_LABELS: Record<DocumentType, string>
export const STATUS_LABELS: Record<DocumentStatus, string>
export const CONSENT_REQUIRED_MESSAGE: string
export function isConsentType(t: DocumentType): boolean
export function consentGranted(docs: Pick<DocumentRow, 'doc_type' | 'status'>[]): boolean
export function filesInUse(docs: Pick<DocumentRow, 'doc_type' | 'status'>[], hasPhoto: boolean): boolean
export function playerFilePath(tenantId: string, playerId: string, name: DocumentType | 'photo'): string
export function documentErrorMessage(message: string, opts?: { consentGranted?: boolean }): string
export function validateDocumentFile(file: File): string | null
export async function fetchPlayerDocuments(playerId: string): Promise<DocumentRow[]>
export async function removeFile(path: string): Promise<FileResult>
export async function setDocumentStatus(doc: DocumentRow, status: 'pendiente' | 'fisico'): Promise<FileResult>
export async function uploadDocument(doc: DocumentRow, file: File, consentGranted: boolean): Promise<FileResult>
export async function getSignedFileUrl(path: string): Promise<string>
```

- [ ] **Step 1: Write the failing tests**

Create `src/documents/documents.test.ts`:

```ts
import { beforeEach, expect, vi } from 'vitest'
import {
  DOCUMENT_TYPES, consentGranted, filesInUse, playerFilePath, documentErrorMessage,
  validateDocumentFile, fetchPlayerDocuments, removeFile, setDocumentStatus, uploadDocument,
  getSignedFileUrl, CONSENT_REQUIRED_MESSAGE,
} from './documents'
import type { DocumentRow } from './documents'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), selectEq: vi.fn(), update: vi.fn(), updateEq: vi.fn(),
  storageFrom: vi.fn(), upload: vi.fn(), remove: vi.fn(), list: vi.fn(), createSignedUrl: vi.fn(),
  calls: [] as string[],
}))
vi.mock('../lib/supabase', () => ({
  supabase: { from: mocks.from, storage: { from: mocks.storageFrom } },
}))

function doc(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'd1', tenant_id: 't1', player_id: 'p1', doc_type: 'curp', status: 'pendiente',
    file_path: null, updated_at: '', ...over,
  }
}

function file(type: string, size: number): File {
  const f = new File(['x'], 'doc', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  mocks.selectEq.mockResolvedValue({ data: [], error: null })
  mocks.select.mockReturnValue({ eq: mocks.selectEq })
  mocks.updateEq.mockImplementation(async () => {
    mocks.calls.push('update')
    return { error: null }
  })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
  mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
  mocks.upload.mockImplementation(async () => {
    mocks.calls.push('upload')
    return { data: { path: 't1/p1/curp' }, error: null }
  })
  mocks.remove.mockImplementation(async (paths: string[]) => {
    mocks.calls.push('remove')
    return { data: paths.map((name) => ({ name })), error: null }
  })
  mocks.list.mockResolvedValue({ data: [], error: null })
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/url' }, error: null })
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload, remove: mocks.remove, list: mocks.list, createSignedUrl: mocks.createSignedUrl,
  })
})

test('consentGranted needs both consents out of pendiente', () => {
  const base = DOCUMENT_TYPES.map((t) => ({ doc_type: t, status: 'pendiente' as const }))
  expect(consentGranted(base)).toBe(false)
  const one = base.map((d) => (d.doc_type === 'image_consent' ? { ...d, status: 'fisico' as const } : d))
  expect(consentGranted(one)).toBe(false)
  const both = one.map((d) => (d.doc_type === 'privacy_notice' ? { ...d, status: 'digital' as const } : d))
  expect(consentGranted(both)).toBe(true)
  expect(consentGranted(both.filter((d) => d.doc_type !== 'privacy_notice'))).toBe(false)
})

test('filesInUse is true with a photo or a non-consent digital document', () => {
  const docs = DOCUMENT_TYPES.map((t) => ({ doc_type: t, status: 'pendiente' as const }))
  expect(filesInUse(docs, false)).toBe(false)
  expect(filesInUse(docs, true)).toBe(true)
  expect(filesInUse(docs.map((d) => (d.doc_type === 'image_consent' ? { ...d, status: 'digital' as const } : d)), false)).toBe(false)
  expect(filesInUse(docs.map((d) => (d.doc_type === 'curp' ? { ...d, status: 'digital' as const } : d)), false)).toBe(true)
})

test('playerFilePath builds tenant/player/name', () => {
  expect(playerFilePath('t1', 'p1', 'curp')).toBe('t1/p1/curp')
  expect(playerFilePath('t1', 'p1', 'photo')).toBe('t1/p1/photo')
})

test('documentErrorMessage translates by prefix', () => {
  expect(documentErrorMessage('consent_required: x')).toBe(CONSENT_REQUIRED_MESSAGE)
  expect(documentErrorMessage('consent_in_use: x')).toBe('No se puede regresar a pendiente: primero quita la foto y los documentos digitales.')
  expect(documentErrorMessage('file_path_mismatch: x')).toBe('Ruta de archivo inválida.')
  expect(documentErrorMessage('invalid_file_path: x')).toBe('Ruta de archivo inválida.')
  expect(documentErrorMessage('document_identity_immutable: x')).toBe('Ruta de archivo inválida.')
  expect(documentErrorMessage('new row violates row-level security policy')).toBe('No tienes permiso para esta acción.')
  expect(documentErrorMessage('new row violates row-level security policy', { consentGranted: false })).toBe(CONSENT_REQUIRED_MESSAGE)
  expect(documentErrorMessage('network down')).toBe('network down')
})

test('validateDocumentFile accepts the 4 MIME types up to exactly 10 MB', () => {
  expect(validateDocumentFile(file('application/pdf', 10 * 1024 * 1024))).toBeNull()
  expect(validateDocumentFile(file('image/webp', 1))).toBeNull()
  expect(validateDocumentFile(file('application/pdf', 10 * 1024 * 1024 + 1))).toBe('El archivo supera 10 MB.')
  expect(validateDocumentFile(file('image/heic', 1))).toBe('Formato no permitido: usa PDF, JPG, PNG o WebP.')
  expect(validateDocumentFile(file('', 1))).toBe('Formato no permitido: usa PDF, JPG, PNG o WebP.')
})

test('fetchPlayerDocuments filters by player and returns the fixed order', async () => {
  mocks.selectEq.mockResolvedValueOnce({
    data: [doc({ id: 'b', doc_type: 'medical_clearance' }), doc({ id: 'a', doc_type: 'curp' }), doc({ id: 'c', doc_type: 'image_consent' })],
    error: null,
  })
  const rows = await fetchPlayerDocuments('p1')
  expect(mocks.from).toHaveBeenCalledWith('documents')
  expect(mocks.selectEq).toHaveBeenCalledWith('player_id', 'p1')
  expect(rows.map((r) => r.doc_type)).toEqual(['curp', 'image_consent', 'medical_clearance'])
})

test('fetchPlayerDocuments throws on error', async () => {
  mocks.selectEq.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  await expect(fetchPlayerDocuments('p1')).rejects.toThrow('boom')
})

test('removeFile succeeds when the path is in the result', async () => {
  expect(await removeFile('t1/p1/curp')).toEqual({ ok: true })
  expect(mocks.storageFrom).toHaveBeenCalledWith('player-files')
  expect(mocks.list).not.toHaveBeenCalled()
})

test('removeFile with an empty result treats a missing object as gone', async () => {
  mocks.remove.mockResolvedValueOnce({ data: [], error: null })
  mocks.list.mockResolvedValueOnce({ data: [], error: null })
  expect(await removeFile('t1/p1/curp')).toEqual({ ok: true })
  expect(mocks.list).toHaveBeenCalledWith('t1/p1', { search: 'curp' })
})

test('removeFile with an empty result fails when the object still exists', async () => {
  mocks.remove.mockResolvedValueOnce({ data: [], error: null })
  mocks.list.mockResolvedValueOnce({ data: [{ name: 'curp' }], error: null })
  expect(await removeFile('t1/p1/curp')).toEqual({ ok: false, error: 'No se pudo eliminar el archivo.' })
})

test('setDocumentStatus on a non-digital row only updates', async () => {
  expect(await setDocumentStatus(doc(), 'fisico')).toEqual({ ok: true })
  expect(mocks.update).toHaveBeenCalledWith({ status: 'fisico', file_path: null })
  expect(mocks.updateEq).toHaveBeenCalledWith('id', 'd1')
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('setDocumentStatus on a digital non-consent row removes first, then updates', async () => {
  const res = await setDocumentStatus(doc({ status: 'digital', file_path: 't1/p1/curp' }), 'pendiente')
  expect(res).toEqual({ ok: true })
  expect(mocks.calls).toEqual(['remove', 'update'])
})

test('setDocumentStatus does not update when the remove fails', async () => {
  mocks.remove.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  const res = await setDocumentStatus(doc({ status: 'digital', file_path: 't1/p1/curp' }), 'fisico')
  expect(res.ok).toBe(false)
  expect(mocks.update).not.toHaveBeenCalled()
})

test('setDocumentStatus on a digital consent row updates first, then removes', async () => {
  const consent = doc({ doc_type: 'image_consent', status: 'digital', file_path: 't1/p1/image_consent' })
  expect(await setDocumentStatus(consent, 'fisico')).toEqual({ ok: true })
  expect(mocks.calls).toEqual(['update', 'remove'])
})

test('a rejected consent revocation keeps the file', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'consent_in_use: x' } })
  const consent = doc({ doc_type: 'privacy_notice', status: 'digital', file_path: 't1/p1/privacy_notice' })
  const res = await setDocumentStatus(consent, 'pendiente')
  expect(res).toEqual({ ok: false, error: 'No se puede regresar a pendiente: primero quita la foto y los documentos digitales.' })
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('uploadDocument validates before calling Supabase', async () => {
  const res = await uploadDocument(doc(), file('image/heic', 1), true)
  expect(res).toEqual({ ok: false, error: 'Formato no permitido: usa PDF, JPG, PNG o WebP.' })
  expect(mocks.upload).not.toHaveBeenCalled()
})

test('uploadDocument upserts to the fixed path, then marks the row digital', async () => {
  const f = file('application/pdf', 100)
  expect(await uploadDocument(doc(), f, true)).toEqual({ ok: true })
  expect(mocks.upload).toHaveBeenCalledWith('t1/p1/curp', f, { upsert: true, contentType: 'application/pdf' })
  expect(mocks.update).toHaveBeenCalledWith({ status: 'digital', file_path: 't1/p1/curp' })
  expect(mocks.calls).toEqual(['upload', 'update'])
})

test('uploadDocument rolls back the object when the update fails on a new upload', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'consent_required: x' } })
  const res = await uploadDocument(doc(), file('application/pdf', 100), true)
  expect(res).toEqual({ ok: false, error: CONSENT_REQUIRED_MESSAGE })
  expect(mocks.remove).toHaveBeenCalledWith(['t1/p1/curp'])
})

test('uploadDocument does not roll back a replacement', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'boom' } })
  const res = await uploadDocument(doc({ status: 'digital', file_path: 't1/p1/curp' }), file('application/pdf', 100), true)
  expect(res.ok).toBe(false)
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('uploadDocument maps a Storage RLS rejection to the consent message when consent is missing', async () => {
  mocks.upload.mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy' } })
  const res = await uploadDocument(doc(), file('application/pdf', 100), false)
  expect(res).toEqual({ ok: false, error: CONSENT_REQUIRED_MESSAGE })
  expect(mocks.update).not.toHaveBeenCalled()
})

test('getSignedFileUrl signs for 300 seconds', async () => {
  expect(await getSignedFileUrl('t1/p1/curp')).toBe('https://signed/url')
  expect(mocks.createSignedUrl).toHaveBeenCalledWith('t1/p1/curp', 300)
})

test('getSignedFileUrl throws on error', async () => {
  mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
  await expect(getSignedFileUrl('t1/p1/curp')).rejects.toThrow('Object not found')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/documents/documents.test.ts`
Expected: FAIL — `Failed to resolve import "./documents"`.

- [ ] **Step 3: Implement**

Create `src/documents/documents.ts`:

```ts
import { supabase } from '../lib/supabase'

export type DocumentType =
  | 'curp'
  | 'birth_certificate'
  | 'proof_of_address'
  | 'image_consent'
  | 'privacy_notice'
  | 'medical_clearance'
export type DocumentStatus = 'pendiente' | 'fisico' | 'digital'

export interface DocumentRow {
  id: string
  tenant_id: string
  player_id: string
  doc_type: DocumentType
  status: DocumentStatus
  file_path: string | null
  updated_at: string
}

export interface FileResult {
  ok: boolean
  error?: string
}

export const PLAYER_FILES_BUCKET = 'player-files'
export const SIGNED_URL_TTL_SECONDS = 300
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'curp',
  'birth_certificate',
  'proof_of_address',
  'image_consent',
  'privacy_notice',
  'medical_clearance',
]

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  curp: 'CURP',
  birth_certificate: 'Acta de nacimiento',
  proof_of_address: 'Comprobante de domicilio',
  image_consent: 'Consentimiento de imagen',
  privacy_notice: 'Aviso de privacidad',
  medical_clearance: 'Constancia médica',
}

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  pendiente: 'Pendiente',
  fisico: 'Físico',
  digital: 'Digital',
}

export const CONSENT_REQUIRED_MESSAGE =
  'Primero registra el consentimiento de imagen y el aviso de privacidad.'

const CONSENT_TYPES: readonly DocumentType[] = ['image_consent', 'privacy_notice']

export function isConsentType(t: DocumentType): boolean {
  return CONSENT_TYPES.includes(t)
}

export function consentGranted(docs: Pick<DocumentRow, 'doc_type' | 'status'>[]): boolean {
  return CONSENT_TYPES.every((t) => docs.some((d) => d.doc_type === t && d.status !== 'pendiente'))
}

export function filesInUse(docs: Pick<DocumentRow, 'doc_type' | 'status'>[], hasPhoto: boolean): boolean {
  return hasPhoto || docs.some((d) => !isConsentType(d.doc_type) && d.status === 'digital')
}

export function playerFilePath(tenantId: string, playerId: string, name: DocumentType | 'photo'): string {
  return `${tenantId}/${playerId}/${name}`
}

export function documentErrorMessage(message: string, opts: { consentGranted?: boolean } = {}): string {
  if (message.startsWith('consent_required')) return CONSENT_REQUIRED_MESSAGE
  if (message.startsWith('consent_in_use')) {
    return 'No se puede regresar a pendiente: primero quita la foto y los documentos digitales.'
  }
  if (/^(invalid_file_path|file_path_mismatch|document_identity_immutable)/.test(message)) {
    return 'Ruta de archivo inválida.'
  }
  if (/row-level security|unauthorized|403/i.test(message)) {
    return opts.consentGranted === false ? CONSENT_REQUIRED_MESSAGE : 'No tienes permiso para esta acción.'
  }
  return message
}

export function validateDocumentFile(file: File): string | null {
  if (!DOCUMENT_MIME_TYPES.includes(file.type)) return 'Formato no permitido: usa PDF, JPG, PNG o WebP.'
  if (file.size > MAX_DOCUMENT_BYTES) return 'El archivo supera 10 MB.'
  return null
}

export async function fetchPlayerDocuments(playerId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, tenant_id, player_id, doc_type, status, file_path, updated_at')
    .eq('player_id', playerId)
  if (error) throw new Error(error.message)
  const rows = (data as DocumentRow[] | null) ?? []
  return [...rows].sort((a, b) => DOCUMENT_TYPES.indexOf(a.doc_type) - DOCUMENT_TYPES.indexOf(b.doc_type))
}

function bucket() {
  return supabase.storage.from(PLAYER_FILES_BUCKET)
}

export async function removeFile(path: string): Promise<FileResult> {
  const { data, error } = await bucket().remove([path])
  if (error) return { ok: false, error: documentErrorMessage(error.message) }
  if (data?.some((o) => o.name === path)) return { ok: true }
  // remove() reports success with an empty list when nothing was deleted
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const listed = await bucket().list(path.slice(0, slash), { search: name })
  if (listed.error) return { ok: false, error: documentErrorMessage(listed.error.message) }
  if (listed.data?.some((o) => o.name === name)) return { ok: false, error: 'No se pudo eliminar el archivo.' }
  return { ok: true }
}

async function updateDocument(id: string, values: { status: DocumentStatus; file_path: string | null }) {
  return supabase.from('documents').update(values).eq('id', id)
}

export async function setDocumentStatus(
  doc: DocumentRow,
  status: 'pendiente' | 'fisico',
): Promise<FileResult> {
  const values = { status, file_path: null }
  if (doc.status !== 'digital' || !doc.file_path) {
    const { error } = await updateDocument(doc.id, values)
    return error ? { ok: false, error: documentErrorMessage(error.message) } : { ok: true }
  }
  if (isConsentType(doc.doc_type)) {
    // the server may reject a revocation, so the signed consent is only deleted after it accepts
    const { error } = await updateDocument(doc.id, values)
    if (error) return { ok: false, error: documentErrorMessage(error.message) }
    return removeFile(doc.file_path)
  }
  const removed = await removeFile(doc.file_path)
  if (!removed.ok) return removed
  const { error } = await updateDocument(doc.id, values)
  return error ? { ok: false, error: documentErrorMessage(error.message) } : { ok: true }
}

export async function uploadDocument(
  doc: DocumentRow,
  file: File,
  consentGranted: boolean,
): Promise<FileResult> {
  const invalid = validateDocumentFile(file)
  if (invalid) return { ok: false, error: invalid }
  const path = playerFilePath(doc.tenant_id, doc.player_id, doc.doc_type)
  const uploaded = await bucket().upload(path, file, { upsert: true, contentType: file.type })
  if (uploaded.error) return { ok: false, error: documentErrorMessage(uploaded.error.message, { consentGranted }) }
  const { error } = await updateDocument(doc.id, { status: 'digital', file_path: path })
  if (error) {
    if (doc.status !== 'digital') await removeFile(path)
    return { ok: false, error: documentErrorMessage(error.message, { consentGranted }) }
  }
  return { ok: true }
}

export async function getSignedFileUrl(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo firmar la URL')
  return data.signedUrl
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/documents/documents.test.ts` → all pass. Then `pnpm exec tsc -b` and `pnpm lint` → 0. If `tsc` complains about the `remove`/`list` result types, adapt the narrowing only (no `any`).

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-ui add src/documents/documents.ts src/documents/documents.test.ts
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-ui commit -m "feat: add the documents data layer with consent-aware upload and remove ordering (#1)"
```

### Task 4: `PlayerDocumentsSection` component

**Files:**
- Create: `src/documents/PlayerDocumentsSection.tsx`
- Test: `src/documents/PlayerDocumentsSection.test.tsx`

**Interfaces:**
- Consumes: everything from Task 3 (`DOCUMENT_LABELS`, `STATUS_LABELS`, `isConsentType`, `consentGranted`, `filesInUse`, `setDocumentStatus`, `uploadDocument`, `getSignedFileUrl`, `DocumentRow`).
- Produces:

```ts
export interface PlayerDocumentsSectionProps {
  documents: DocumentRow[]
  canEdit: boolean
  hasPhoto: boolean
  onChanged: (flash: string) => void
}
export function PlayerDocumentsSection(props: PlayerDocumentsSectionProps): JSX.Element
```

`onChanged('Documento actualizado')` is called after every successful status change or upload; the parent reloads `documents`. The section never refetches by itself.

- [ ] **Step 1: Write the failing tests**

Create `src/documents/PlayerDocumentsSection.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { PlayerDocumentsSection } from './PlayerDocumentsSection'
import { DOCUMENT_TYPES } from './documents'
import type { DocumentRow, DocumentType, DocumentStatus } from './documents'

const mocks = vi.hoisted(() => ({
  setDocumentStatus: vi.fn(),
  uploadDocument: vi.fn(),
  getSignedFileUrl: vi.fn(),
}))
vi.mock('./documents', async (importActual) => {
  const actual = await importActual<typeof import('./documents')>()
  return {
    ...actual,
    setDocumentStatus: mocks.setDocumentStatus,
    uploadDocument: mocks.uploadDocument,
    getSignedFileUrl: mocks.getSignedFileUrl,
  }
})

function docs(over: Partial<Record<DocumentType, DocumentStatus>> = {}): DocumentRow[] {
  return DOCUMENT_TYPES.map((t, i) => {
    const status = over[t] ?? 'pendiente'
    return {
      id: `d${i}`, tenant_id: 't1', player_id: 'p1', doc_type: t, status,
      file_path: status === 'digital' ? `t1/p1/${t}` : null, updated_at: '',
    }
  })
}

const granted = { image_consent: 'fisico', privacy_notice: 'fisico' } as const

function row(label: string) {
  return screen.getByRole('listitem', { name: label })
}

function renderSection(props: Partial<Parameters<typeof PlayerDocumentsSection>[0]> = {}) {
  const onChanged = vi.fn()
  render(
    <PlayerDocumentsSection documents={docs()} canEdit hasPhoto={false} onChanged={onChanged} {...props} />,
  )
  return { onChanged }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setDocumentStatus.mockResolvedValue({ ok: true })
  mocks.uploadDocument.mockResolvedValue({ ok: true })
  mocks.getSignedFileUrl.mockResolvedValue('https://signed/url')
})

test('lists the 6 documents with their status', () => {
  renderSection({ documents: docs({ curp: 'fisico', image_consent: 'digital' }) })
  expect(screen.getByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(within(row('CURP')).getByText('Físico')).toBeInTheDocument()
  expect(within(row('Consentimiento de imagen')).getByText('Digital')).toBeInTheDocument()
  expect(within(row('Constancia médica')).getByText('Pendiente')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(6)
})

test('readonly sees statuses and Ver only', () => {
  renderSection({ canEdit: false, documents: docs({ ...granted, curp: 'digital' }) })
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByText('Subir archivo')).not.toBeInTheDocument()
  expect(within(row('CURP')).getByRole('button', { name: 'Ver' })).toBeInTheDocument()
})

test('without consent the lock alert shows and non-consent uploads are disabled', () => {
  renderSection()
  expect(screen.getByText(/Para subir la foto o documentos digitales/)).toBeInTheDocument()
  expect(within(row('CURP')).getByLabelText('Subir archivo')).toBeDisabled()
  expect(within(row('Consentimiento de imagen')).getByLabelText('Subir archivo')).toBeEnabled()
  expect(within(row('Aviso de privacidad')).getByLabelText('Subir archivo')).toBeEnabled()
})

test('with consent there is no lock alert and every upload is enabled', () => {
  renderSection({ documents: docs(granted) })
  expect(screen.queryByText(/Para subir la foto o documentos digitales/)).not.toBeInTheDocument()
  expect(within(row('CURP')).getByLabelText('Subir archivo')).toBeEnabled()
})

test('changing a non-digital status calls setDocumentStatus directly', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderSection()
  await user.selectOptions(within(row('CURP')).getByRole('combobox'), 'fisico')
  await waitFor(() => expect(mocks.setDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ doc_type: 'curp' }), 'fisico'))
  expect(onChanged).toHaveBeenCalledWith('Documento actualizado')
})

test('leaving digital asks for confirmation; Cancelar does nothing', async () => {
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.selectOptions(within(row('CURP')).getByRole('combobox'), 'fisico')
  const dialog = await screen.findByRole('dialog', { name: '¿Eliminar el archivo?' })
  expect(within(dialog).getByText('Se eliminará el archivo subido.')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(mocks.setDocumentStatus).not.toHaveBeenCalled()
})

test('leaving digital and confirming calls setDocumentStatus', async () => {
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.selectOptions(within(row('CURP')).getByRole('combobox'), 'pendiente')
  await user.click(await screen.findByRole('button', { name: 'Eliminar archivo' }))
  await waitFor(() => expect(mocks.setDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ doc_type: 'curp' }), 'pendiente'))
})

test('Pendiente is disabled on consents while files are in use', () => {
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  const select = within(row('Aviso de privacidad')).getByRole('combobox')
  expect(within(select).getByRole('option', { name: 'Pendiente' })).toBeDisabled()
  expect(within(row('Aviso de privacidad')).getByText('Quita primero la foto y los documentos digitales.')).toBeInTheDocument()
})

test('Pendiente on consents is also disabled when only the photo exists', () => {
  renderSection({ documents: docs(granted), hasPhoto: true })
  const select = within(row('Consentimiento de imagen')).getByRole('combobox')
  expect(within(select).getByRole('option', { name: 'Pendiente' })).toBeDisabled()
})

test('uploading a file calls uploadDocument and reports success', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderSection({ documents: docs(granted) })
  const f = new File(['x'], 'curp.pdf', { type: 'application/pdf' })
  await user.upload(within(row('CURP')).getByLabelText('Subir archivo'), f)
  await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({ doc_type: 'curp' }), f, true))
  expect(onChanged).toHaveBeenCalledWith('Documento actualizado')
})

test('a failed upload shows the translated error and does not report success', async () => {
  mocks.uploadDocument.mockResolvedValueOnce({ ok: false, error: 'El archivo supera 10 MB.' })
  const user = userEvent.setup()
  const { onChanged } = renderSection({ documents: docs(granted) })
  await user.upload(within(row('CURP')).getByLabelText('Subir archivo'), new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El archivo supera 10 MB.')
  expect(onChanged).not.toHaveBeenCalled()
})

test('a digital row offers Reemplazar instead of Subir archivo', () => {
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  expect(within(row('CURP')).getByLabelText('Reemplazar')).toBeEnabled()
  expect(within(row('CURP')).queryByLabelText('Subir archivo')).not.toBeInTheDocument()
})

test('a second upload while one is in flight is ignored', async () => {
  let resolve!: (v: { ok: boolean }) => void
  mocks.uploadDocument.mockReturnValueOnce(new Promise((r) => { resolve = r }))
  const user = userEvent.setup()
  renderSection({ documents: docs(granted) })
  const input = within(row('CURP')).getByLabelText('Subir archivo')
  const f = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  await user.upload(input, f)
  await user.upload(input, f)
  expect(mocks.uploadDocument).toHaveBeenCalledTimes(1)
  resolve({ ok: true })
})

test('Ver opens the tab synchronously, drops the opener and assigns the signed URL', async () => {
  const fakeWin = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.click(within(row('CURP')).getByRole('button', { name: 'Ver' }))
  expect(open).toHaveBeenCalledWith('', '_blank')
  await waitFor(() => expect(fakeWin.location.href).toBe('https://signed/url'))
  expect(fakeWin.opener).toBeNull()
  expect(mocks.getSignedFileUrl).toHaveBeenCalledWith('t1/p1/curp')
  open.mockRestore()
})

test('Ver closes the tab and shows an error when signing fails', async () => {
  const fakeWin = { opener: null, location: { href: '' }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
  mocks.getSignedFileUrl.mockRejectedValueOnce(new Error('Object not found'))
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.click(within(row('CURP')).getByRole('button', { name: 'Ver' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el archivo.')
  expect(fakeWin.close).toHaveBeenCalled()
  open.mockRestore()
})

test('Ver with a blocked popup shows a hint and does not sign', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.click(within(row('CURP')).getByRole('button', { name: 'Ver' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tu navegador bloqueó la ventana. Permite ventanas emergentes e intenta de nuevo.')
  expect(mocks.getSignedFileUrl).not.toHaveBeenCalled()
  open.mockRestore()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx`
Expected: FAIL — cannot resolve `./PlayerDocumentsSection`.

- [ ] **Step 3: Implement**

Create `src/documents/PlayerDocumentsSection.tsx`:

```tsx
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  DOCUMENT_LABELS,
  STATUS_LABELS,
  consentGranted,
  filesInUse,
  getSignedFileUrl,
  isConsentType,
  setDocumentStatus,
  uploadDocument,
} from './documents'
import type { DocumentRow, DocumentStatus } from './documents'

export interface PlayerDocumentsSectionProps {
  documents: DocumentRow[]
  canEdit: boolean
  hasPhoto: boolean
  onChanged: (flash: string) => void
}

const CHIP_COLOR: Record<DocumentStatus, 'default' | 'info' | 'success'> = {
  pendiente: 'default',
  fisico: 'info',
  digital: 'success',
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

export function PlayerDocumentsSection({ documents, canEdit, hasPhoto, onChanged }: PlayerDocumentsSectionProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ doc: DocumentRow; next: 'pendiente' | 'fisico' } | null>(null)
  // synchronous guard: busyId only disables controls after a re-render
  const inFlight = useRef(false)

  const granted = consentGranted(documents)
  const inUse = filesInUse(documents, hasPhoto)

  async function run(doc: DocumentRow, action: () => Promise<{ ok: boolean; error?: string }>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusyId(doc.id)
    setError(null)
    try {
      const res = await action()
      if (res.ok) onChanged('Documento actualizado')
      else setError(res.error ?? 'No se pudo actualizar el documento.')
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  function handleStatus(doc: DocumentRow, next: string) {
    if (next !== 'pendiente' && next !== 'fisico') return
    if (doc.status === 'digital') {
      setConfirm({ doc, next })
      return
    }
    void run(doc, () => setDocumentStatus(doc, next))
  }

  function handleConfirm() {
    if (!confirm) return
    const { doc, next } = confirm
    setConfirm(null)
    void run(doc, () => setDocumentStatus(doc, next))
  }

  function handleFile(doc: DocumentRow, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void run(doc, () => uploadDocument(doc, file, granted))
  }

  async function handleView(doc: DocumentRow) {
    if (!doc.file_path) return
    setError(null)
    // opened synchronously in the click: Safari blocks window.open after an await
    const w = window.open('', '_blank')
    if (!w) {
      setError('Tu navegador bloqueó la ventana. Permite ventanas emergentes e intenta de nuevo.')
      return
    }
    w.opener = null
    try {
      w.location.href = await getSignedFileUrl(doc.file_path)
    } catch {
      w.close()
      setError('No se pudo abrir el archivo.')
    }
  }

  return (
    <Box component="section" aria-labelledby="documents-heading">
      <Typography id="documents-heading" variant="h6" component="h2" gutterBottom>
        Documentos
      </Typography>
      {canEdit && !granted && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Para subir la foto o documentos digitales, primero registra el consentimiento de imagen y el aviso de privacidad.
        </Alert>
      )}
      {error && (
        <Alert role="alert" severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <List disablePadding>
        {documents.map((doc) => {
          const label = DOCUMENT_LABELS[doc.doc_type]
          const consent = isConsentType(doc.doc_type)
          const busy = busyId === doc.id
          const uploadLocked = !consent && !granted
          const pendingLocked = consent && inUse
          const uploadLabel = doc.status === 'digital' ? 'Reemplazar' : 'Subir archivo'
          return (
            <ListItem key={doc.id} aria-label={label} divider disableGutters sx={{ display: 'block', py: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography sx={{ flexGrow: 1, minWidth: 160 }}>{label}</Typography>
                <Chip size="small" label={STATUS_LABELS[doc.status]} color={CHIP_COLOR[doc.status]} />
                {busy && <CircularProgress size={20} aria-label="Guardando" />}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }}>
                {canEdit && (
                  <TextField
                    select
                    size="small"
                    label="Estatus"
                    value={doc.status}
                    onChange={(e) => handleStatus(doc, e.target.value)}
                    disabled={busy}
                    helperText={pendingLocked ? 'Quita primero la foto y los documentos digitales.' : undefined}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                    sx={{ minWidth: 140 }}
                  >
                    <option value="pendiente" disabled={pendingLocked}>
                      Pendiente
                    </option>
                    <option value="fisico">Físico</option>
                    {doc.status === 'digital' && (
                      <option value="digital" disabled>
                        Digital
                      </option>
                    )}
                  </TextField>
                )}
                {canEdit && (
                  <Button component="label" variant="outlined" size="small" disabled={busy || uploadLocked}>
                    {uploadLabel}
                    <input
                      hidden
                      type="file"
                      accept={ACCEPT}
                      aria-label={uploadLabel}
                      disabled={busy || uploadLocked}
                      onChange={(e) => handleFile(doc, e)}
                    />
                  </Button>
                )}
                {doc.status === 'digital' && doc.file_path && (
                  <Button size="small" onClick={() => void handleView(doc)}>
                    Ver
                  </Button>
                )}
              </Stack>
            </ListItem>
          )
        })}
      </List>
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} aria-labelledby="delete-file-title">
        <DialogTitle id="delete-file-title">¿Eliminar el archivo?</DialogTitle>
        <DialogContent>
          <DialogContentText>Se eliminará el archivo subido.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button color="error" onClick={handleConfirm}>
            Eliminar archivo
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
```

Notes for the implementer:
- `run` uses `try/finally` around the awaited action so a rejected promise still releases the guard; the data-layer functions return `{ ok, error }` and are not expected to throw.
- If a test cannot find the file input by its label because MUI's `Button component="label"` renders the text twice for accessibility, query the input with `getByLabelText(uploadLabel, { selector: 'input' })` and update the test accordingly — do not drop the assertion.
- If `user.upload` on a disabled input still fires `change`, keep the `disabled` attribute and add an early `if (uploadLocked) return` in `handleFile`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx` → all pass; `pnpm exec tsc -b`, `pnpm lint` → 0.

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-ui add src/documents/PlayerDocumentsSection.tsx src/documents/PlayerDocumentsSection.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-ui commit -m "feat: add the player documents section with the visible consent lock (#1)"
```

### Task 5: Wire the documents into `PlayerFormPage`

**Files:**
- Modify: `src/players/PlayerFormPage.tsx` (new effect + state after the teams effect; render the section after the team select, before the error `Alert`; new success `Snackbar`)
- Test: `src/players/PlayerFormPage.test.tsx` (mock `../documents/documents`; append tests)

**Interfaces:**
- Consumes: `fetchPlayerDocuments(playerId): Promise<DocumentRow[]>` (Task 3), `PlayerDocumentsSection` (Task 4).
- Produces (for Task 7): inside `PlayerFormContent`, state `documents: DocumentRow[]`, function `reloadDocuments()` and function `showToast(text: string)`.

- [ ] **Step 1: Write the failing tests**

In `src/players/PlayerFormPage.test.tsx`, add `fetchPlayerDocuments: vi.fn()` to `mocks`, add the mock and default:

```tsx
vi.mock('../documents/documents', async (importActual) => {
  const actual = await importActual<typeof import('../documents/documents')>()
  return { ...actual, fetchPlayerDocuments: mocks.fetchPlayerDocuments }
})
```

In `beforeEach`: `mocks.fetchPlayerDocuments.mockResolvedValue(seededDocs())`, with this helper above `beforeEach`:

```tsx
import { DOCUMENT_TYPES } from '../documents/documents'
import type { DocumentRow } from '../documents/documents'

function seededDocs(): DocumentRow[] {
  return DOCUMENT_TYPES.map((t, i) => ({
    id: `d${i}`, tenant_id: 'tenant-1', player_id: 'p1', doc_type: t, status: 'pendiente',
    file_path: null, updated_at: '',
  }))
}
```

Append:

```tsx
test('edit mode loads and shows the documents section', async () => {
  renderAt('/jugadores/p1')
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(mocks.fetchPlayerDocuments).toHaveBeenCalledWith('p1')
  expect(screen.getAllByRole('listitem')).toHaveLength(6)
})

test('create mode has no documents section', async () => {
  renderAt('/jugadores/nuevo')
  expect(await screen.findByRole('heading', { name: 'Nuevo jugador' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Documentos' })).not.toBeInTheDocument()
  expect(mocks.fetchPlayerDocuments).not.toHaveBeenCalled()
})

test('a failed documents fetch shows a retry and keeps the form usable', async () => {
  mocks.fetchPlayerDocuments.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  expect(await screen.findByText('No se pudieron cargar los documentos.')).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('Ana Ruiz')
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: /Reintentar/ }))
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2)
})

test('a document change reloads the documents and shows a toast', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  mocks.fetchPlayerDocuments.mockResolvedValueOnce(
    seededDocs().map((d) => (d.doc_type === 'curp' ? { ...d, status: 'fisico' as const } : d)),
  )
  await user.selectOptions(within(curp).getByRole('combobox'), 'fisico')
  expect(await screen.findByText('Documento actualizado')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2))
})
```

The last test needs `setDocumentStatus` mocked too: add `setDocumentStatus: vi.fn()` to `mocks`, include it in the `../documents/documents` mock, and `mocks.setDocumentStatus.mockResolvedValue({ ok: true })` in `beforeEach`. Import `within` from `@testing-library/react`. Check `LoadError`'s retry button label in `src/app/LoadError.tsx` and use its exact text in the `Reintentar` query.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: the 4 new tests FAIL (no `Documentos` heading); existing tests still pass.

- [ ] **Step 3: Implement**

In `src/players/PlayerFormPage.tsx`:

Imports:

```tsx
import { fetchPlayerDocuments } from '../documents/documents'
import type { DocumentRow } from '../documents/documents'
import { PlayerDocumentsSection } from '../documents/PlayerDocumentsSection'
```

State + effect, after the teams effect:

```tsx
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [docsLoadError, setDocsLoadError] = useState(false)
  const [docsReloadKey, setDocsReloadKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    void fetchPlayerDocuments(id)
      .then((ds) => {
        if (!active) return
        setDocsLoadError(false)
        setDocuments(ds)
      })
      .catch(() => {
        if (active) setDocsLoadError(true)
      })
    return () => {
      active = false
    }
  }, [id, docsReloadKey])

  function reloadDocuments() {
    setDocsReloadKey((k) => k + 1)
  }

  function showToast(text: string) {
    setToast(text)
  }
```

Render, right after the team select block (`))}` closing the `editing && row && (teamsLoadError ? … )` expression) and before `{message && (`:

```tsx
        {editing && row && (docsLoadError ? (
          <LoadError message="No se pudieron cargar los documentos." onRetry={reloadDocuments} />
        ) : (
          <PlayerDocumentsSection
            documents={documents}
            canEdit={canEdit}
            hasPhoto={row.photo_path !== null}
            onChanged={(text) => {
              showToast(text)
              reloadDocuments()
            }}
          />
        ))}
```

Note: the section is inside the `<Box component="form">`; its buttons must not submit the form. MUI `Button` defaults to `type="button"`, and the file input is not a submit control — verify the existing "Guardar" tests still pass and that no new test triggers `updatePlayer`.

A second `Snackbar` after the existing one:

```tsx
      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run` → all pass (164 + Task 3 + Task 4 + 4 new); `pnpm exec tsc -b`, `pnpm lint` → 0.

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-ui add src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-ui commit -m "feat: show and reload the documents section on the player page (#1)"
```

---

## Branch `feature/player-photo` (Tasks 6–7)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-photo` (cut from `develop` after branch 2 is merged). Step 0 as before; expected baseline = branch 2's final count.

### Task 6: Photo data functions (`src/players/players.ts`)

**Files:**
- Modify: `src/players/players.ts` (append)
- Test: `src/players/players.test.ts` (extend the supabase mock with `storage`; append tests)

**Interfaces:**
- Consumes: `PLAYER_FILES_BUCKET`, `playerFilePath`, `removeFile`, `documentErrorMessage` from `../documents/documents` (Task 3).
- Produces:

```ts
export function validatePhotoFile(file: File): string | null
export async function uploadPlayerPhoto(
  player: Pick<PlayerRow, 'id' | 'tenant_id' | 'photo_path'>, file: File, consentGranted: boolean,
): Promise<UpdatePlayerResult>
export async function removePlayerPhoto(player: Pick<PlayerRow, 'id' | 'photo_path'>): Promise<UpdatePlayerResult>
```

- [ ] **Step 1: Write the failing tests**

In `src/players/players.test.ts`: add `storageFrom: vi.fn(), upload: vi.fn(), remove: vi.fn(), list: vi.fn(), calls: [] as string[]` to `mocks`; change the mock to

```ts
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from, storage: { from: mocks.storageFrom } } }))
```

and in `beforeEach` add:

```ts
  mocks.calls.length = 0
  mocks.upload.mockImplementation(async () => {
    mocks.calls.push('upload')
    return { data: { path: 't1/p1/photo' }, error: null }
  })
  mocks.remove.mockImplementation(async (paths: string[]) => {
    mocks.calls.push('remove')
    return { data: paths.map((name) => ({ name })), error: null }
  })
  mocks.list.mockResolvedValue({ data: [], error: null })
  mocks.storageFrom.mockReturnValue({ upload: mocks.upload, remove: mocks.remove, list: mocks.list })
```

Keep the existing `updateEq` default, but wrap it to record the call order: `mocks.updateEq.mockImplementation(async () => { mocks.calls.push('update'); return { error: null } })` — if an existing test sets `updateEq` differently, leave that test's override as is.

Append (with a `photo(type, size)` helper identical to `file()` in Task 3's test):

```ts
function photo(type: string, size: number): File {
  const f = new File(['x'], 'p', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

test('validatePhotoFile accepts images up to exactly 5 MB', () => {
  expect(validatePhotoFile(photo('image/jpeg', 5 * 1024 * 1024))).toBeNull()
  expect(validatePhotoFile(photo('image/png', 5 * 1024 * 1024 + 1))).toBe('La foto supera 5 MB.')
  expect(validatePhotoFile(photo('application/pdf', 1))).toBe('Formato no permitido: usa JPG, PNG o WebP.')
  expect(validatePhotoFile(photo('', 1))).toBe('Formato no permitido: usa JPG, PNG o WebP.')
})

test('uploadPlayerPhoto upserts to tenant/player/photo, then sets photo_path', async () => {
  const f = photo('image/jpeg', 100)
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, f, true)
  expect(res).toEqual({ ok: true })
  expect(mocks.storageFrom).toHaveBeenCalledWith('player-files')
  expect(mocks.upload).toHaveBeenCalledWith('t1/p1/photo', f, { upsert: true, contentType: 'image/jpeg' })
  expect(mocks.from).toHaveBeenCalledWith('players')
  expect(mocks.update).toHaveBeenCalledWith({ photo_path: 't1/p1/photo' })
  expect(mocks.calls).toEqual(['upload', 'update'])
})

test('uploadPlayerPhoto validates before calling Supabase', async () => {
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, photo('application/pdf', 1), true)
  expect(res).toEqual({ ok: false, error: 'Formato no permitido: usa JPG, PNG o WebP.' })
  expect(mocks.upload).not.toHaveBeenCalled()
})

test('uploadPlayerPhoto rolls back a new photo when the update fails', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'consent_required: x' } })
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, photo('image/jpeg', 1), true)
  expect(res).toEqual({ ok: false, error: 'Primero registra el consentimiento de imagen y el aviso de privacidad.' })
  expect(mocks.remove).toHaveBeenCalledWith(['t1/p1/photo'])
})

test('uploadPlayerPhoto does not roll back a replacement', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'boom' } })
  await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: 't1/p1/photo' }, photo('image/jpeg', 1), true)
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('removePlayerPhoto removes the object first, then clears photo_path', async () => {
  const res = await removePlayerPhoto({ id: 'p1', photo_path: 't1/p1/photo' })
  expect(res).toEqual({ ok: true })
  expect(mocks.update).toHaveBeenCalledWith({ photo_path: null })
  expect(mocks.calls).toEqual(['remove', 'update'])
})

test('removePlayerPhoto keeps photo_path when the remove fails', async () => {
  mocks.remove.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  const res = await removePlayerPhoto({ id: 'p1', photo_path: 't1/p1/photo' })
  expect(res.ok).toBe(false)
  expect(mocks.update).not.toHaveBeenCalled()
})
```

Add `validatePhotoFile, uploadPlayerPhoto, removePlayerPhoto` to the import from `./players`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: FAIL — `validatePhotoFile` is not exported.

- [ ] **Step 3: Implement**

Append to `src/players/players.ts` (and add the import at the top):

```ts
import { PLAYER_FILES_BUCKET, documentErrorMessage, playerFilePath, removeFile } from '../documents/documents'
```

```ts
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validatePhotoFile(file: File): string | null {
  if (!PHOTO_MIME_TYPES.includes(file.type)) return 'Formato no permitido: usa JPG, PNG o WebP.'
  if (file.size > MAX_PHOTO_BYTES) return 'La foto supera 5 MB.'
  return null
}

export async function uploadPlayerPhoto(
  player: Pick<PlayerRow, 'id' | 'tenant_id' | 'photo_path'>,
  file: File,
  consentGranted: boolean,
): Promise<UpdatePlayerResult> {
  const invalid = validatePhotoFile(file)
  if (invalid) return { ok: false, error: invalid }
  const path = playerFilePath(player.tenant_id, player.id, 'photo')
  const uploaded = await supabase.storage
    .from(PLAYER_FILES_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploaded.error) return { ok: false, error: documentErrorMessage(uploaded.error.message, { consentGranted }) }
  const { error } = await supabase.from('players').update({ photo_path: path }).eq('id', player.id)
  if (error) {
    if (player.photo_path === null) await removeFile(path)
    return { ok: false, error: documentErrorMessage(error.message, { consentGranted }) }
  }
  return { ok: true }
}

export async function removePlayerPhoto(
  player: Pick<PlayerRow, 'id' | 'photo_path'>,
): Promise<UpdatePlayerResult> {
  if (player.photo_path) {
    const removed = await removeFile(player.photo_path)
    if (!removed.ok) return removed
  }
  const { error } = await supabase.from('players').update({ photo_path: null }).eq('id', player.id)
  if (error) return { ok: false, error: documentErrorMessage(error.message) }
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/players/players.test.ts` → all pass (existing + 7 new); `pnpm exec tsc -b`, `pnpm lint` → 0.

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-photo add src/players/players.ts src/players/players.test.ts
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-photo commit -m "feat: add player photo upload and removal with rollback (#1)"
```

### Task 7: `PlayerPhoto` component and wiring

**Files:**
- Create: `src/players/PlayerPhoto.tsx`
- Test: `src/players/PlayerPhoto.test.tsx`
- Modify: `src/players/PlayerFormPage.tsx` (render `PlayerPhoto` under the `h1` in edit mode; refetch the player after a photo change)
- Test: `src/players/PlayerFormPage.test.tsx` (append 1 test)

**Interfaces:**
- Consumes: `uploadPlayerPhoto`, `removePlayerPhoto` (Task 6); `getSignedFileUrl` (Task 3); `consentGranted(documents)` (Task 3); from Task 5: `documents`, `showToast` in `PlayerFormContent`.
- Produces:

```ts
export interface PlayerPhotoProps {
  player: Pick<PlayerRow, 'id' | 'tenant_id' | 'full_name' | 'photo_path' | 'updated_at'>
  canEdit: boolean
  consentGranted: boolean
  onChanged: (flash: string) => void
}
export function PlayerPhoto(props: PlayerPhotoProps): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

Create `src/players/PlayerPhoto.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { PlayerPhoto } from './PlayerPhoto'

const mocks = vi.hoisted(() => ({
  uploadPlayerPhoto: vi.fn(),
  removePlayerPhoto: vi.fn(),
  getSignedFileUrl: vi.fn(),
}))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, uploadPlayerPhoto: mocks.uploadPlayerPhoto, removePlayerPhoto: mocks.removePlayerPhoto }
})
vi.mock('../documents/documents', async (importActual) => {
  const actual = await importActual<typeof import('../documents/documents')>()
  return { ...actual, getSignedFileUrl: mocks.getSignedFileUrl }
})

const base = { id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', photo_path: null as string | null, updated_at: 'u1' }

function renderPhoto(over: Partial<Parameters<typeof PlayerPhoto>[0]> = {}) {
  const onChanged = vi.fn()
  render(<PlayerPhoto player={base} canEdit consentGranted onChanged={onChanged} {...over} />)
  return { onChanged }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.uploadPlayerPhoto.mockResolvedValue({ ok: true })
  mocks.removePlayerPhoto.mockResolvedValue({ ok: true })
  mocks.getSignedFileUrl.mockResolvedValue('https://signed/photo')
})

test('without a photo shows initials and Subir foto', () => {
  renderPhoto()
  expect(screen.getByText('AR')).toBeInTheDocument()
  expect(screen.getByLabelText('Subir foto', { selector: 'input' })).toBeEnabled()
  expect(mocks.getSignedFileUrl).not.toHaveBeenCalled()
})

test('with a photo shows the signed image, Cambiar and Quitar', async () => {
  renderPhoto({ player: { ...base, photo_path: 't1/p1/photo' } })
  const img = await screen.findByRole('img', { name: 'Foto de Ana Ruiz' })
  expect(img).toHaveAttribute('src', 'https://signed/photo')
  expect(screen.getByLabelText('Cambiar', { selector: 'input' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Quitar' })).toBeEnabled()
})

test('a failed signed URL falls back to the initials', async () => {
  mocks.getSignedFileUrl.mockRejectedValueOnce(new Error('Object not found'))
  renderPhoto({ player: { ...base, photo_path: 't1/p1/photo' } })
  await waitFor(() => expect(mocks.getSignedFileUrl).toHaveBeenCalled())
  expect(await screen.findByText('AR')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'Foto de Ana Ruiz' })).not.toBeInTheDocument()
})

test('without consent the upload is disabled with the lock hint', () => {
  renderPhoto({ consentGranted: false })
  expect(screen.getByLabelText('Subir foto', { selector: 'input' })).toBeDisabled()
  expect(screen.getByText('Requiere consentimiento de imagen y aviso de privacidad')).toBeInTheDocument()
})

test('readonly sees only the avatar', () => {
  renderPhoto({ canEdit: false, player: { ...base, photo_path: 't1/p1/photo' } })
  expect(screen.queryByLabelText('Cambiar', { selector: 'input' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
})

test('uploading calls uploadPlayerPhoto and reports success', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderPhoto()
  const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  await user.upload(screen.getByLabelText('Subir foto', { selector: 'input' }), f)
  await waitFor(() => expect(mocks.uploadPlayerPhoto).toHaveBeenCalledWith(base, f, true))
  expect(onChanged).toHaveBeenCalledWith('Foto actualizada')
})

test('a failed upload shows the error', async () => {
  mocks.uploadPlayerPhoto.mockResolvedValueOnce({ ok: false, error: 'La foto supera 5 MB.' })
  const user = userEvent.setup()
  const { onChanged } = renderPhoto()
  await user.upload(screen.getByLabelText('Subir foto', { selector: 'input' }), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('La foto supera 5 MB.')
  expect(onChanged).not.toHaveBeenCalled()
})

test('Quitar asks for confirmation and removes on confirm', async () => {
  const user = userEvent.setup()
  const player = { ...base, photo_path: 't1/p1/photo' }
  const { onChanged } = renderPhoto({ player })
  await user.click(screen.getByRole('button', { name: 'Quitar' }))
  expect(await screen.findByRole('dialog', { name: '¿Quitar la foto?' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
  await waitFor(() => expect(mocks.removePlayerPhoto).toHaveBeenCalledWith(player))
  expect(onChanged).toHaveBeenCalledWith('Foto actualizada')
})
```

In `src/players/PlayerFormPage.test.tsx` add `uploadPlayerPhoto: vi.fn()` to `mocks`, include it in the `./players` mock, default `mocks.uploadPlayerPhoto.mockResolvedValue({ ok: true })`, and append:

```tsx
test('a photo upload refetches the player and shows a toast', async () => {
  mocks.fetchPlayerDocuments.mockResolvedValue(
    seededDocs().map((d) => (d.doc_type === 'image_consent' || d.doc_type === 'privacy_notice' ? { ...d, status: 'fisico' as const } : d)),
  )
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const input = await screen.findByLabelText('Subir foto', { selector: 'input' })
  await user.upload(input, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByText('Foto actualizada')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx src/players/PlayerFormPage.test.tsx`
Expected: FAIL — cannot resolve `./PlayerPhoto`; the new page test fails.

- [ ] **Step 3: Implement**

Create `src/players/PlayerPhoto.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getSignedFileUrl } from '../documents/documents'
import { removePlayerPhoto, uploadPlayerPhoto } from './players'
import type { PlayerRow } from './players'

export interface PlayerPhotoProps {
  player: Pick<PlayerRow, 'id' | 'tenant_id' | 'full_name' | 'photo_path' | 'updated_at'>
  canEdit: boolean
  consentGranted: boolean
  onChanged: (flash: string) => void
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

export function PlayerPhoto({ player, canEdit, consentGranted, onChanged }: PlayerPhotoProps) {
  const [url, setUrl] = useState<{ key: string; src: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const inFlight = useRef(false)

  // keyed by path + updated_at so a replaced photo (same path) is re-signed
  const urlKey = player.photo_path ? `${player.photo_path}@${player.updated_at}` : null

  useEffect(() => {
    if (!player.photo_path || !urlKey) return
    let active = true
    void getSignedFileUrl(player.photo_path)
      .then((src) => {
        if (active) setUrl({ key: urlKey, src })
      })
      .catch(() => {
        if (active) setUrl(null)
      })
    return () => {
      active = false
    }
  }, [player.photo_path, urlKey])

  const src = url && url.key === urlKey ? url.src : undefined

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const res = await action()
      if (res.ok) onChanged('Foto actualizada')
      else setError(res.error ?? 'No se pudo actualizar la foto.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !consentGranted) return
    void run(() => uploadPlayerPhoto(player, file, consentGranted))
  }

  function handleRemove() {
    setConfirmOpen(false)
    void run(() => removePlayerPhoto(player))
  }

  const uploadLabel = player.photo_path ? 'Cambiar' : 'Subir foto'

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
      <Avatar src={src} alt={src ? `Foto de ${player.full_name}` : undefined} sx={{ width: 72, height: 72 }}>
        {initials(player.full_name)}
      </Avatar>
      {canEdit && (
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1}>
            <Button component="label" variant="outlined" size="small" disabled={busy || !consentGranted}>
              {uploadLabel}
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={uploadLabel}
                disabled={busy || !consentGranted}
                onChange={handleFile}
              />
            </Button>
            {player.photo_path && (
              <Button size="small" color="error" disabled={busy} onClick={() => setConfirmOpen(true)}>
                Quitar
              </Button>
            )}
          </Stack>
          {!consentGranted && (
            <Typography variant="caption" color="text.secondary">
              Requiere consentimiento de imagen y aviso de privacidad
            </Typography>
          )}
        </Stack>
      )}
      {error && (
        <Alert role="alert" severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      )}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="remove-photo-title">
        <DialogTitle id="remove-photo-title">¿Quitar la foto?</DialogTitle>
        <DialogContent>
          <DialogContentText>Se eliminará la foto del jugador.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancelar</Button>
          <Button color="error" onClick={handleRemove}>
            Quitar foto
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
```

Notes for the implementer:
- MUI `Avatar` with a `src` renders an `<img alt=…>`; when the image fails to load it falls back to its children (initials) by itself. In jsdom images never "load", but the `<img>` is still rendered, so the "signed image" test passes on `src`/`alt`.
- If `react-hooks/set-state-in-effect` flags the effect, it is because a `setState` became synchronous — keep both calls inside `.then`/`.catch` as written.

In `src/players/PlayerFormPage.tsx`:

```tsx
import { PlayerPhoto } from './PlayerPhoto'
import { consentGranted } from '../documents/documents'
```

Add a handler next to `handleTeamChange`:

```tsx
  async function handlePhotoChanged(text: string) {
    showToast(text)
    if (!row) return
    try {
      const refreshed = await fetchPlayer(row.id)
      if (refreshed) setRow(refreshed)
    } catch {
      setMessage('Error: no se pudo actualizar la vista. Recarga la página.')
    }
  }
```

Render, right after the `<Typography variant="h4" component="h1">…</Typography>`:

```tsx
        {editing && row && (
          <PlayerPhoto
            player={row}
            canEdit={canEdit}
            consentGranted={consentGranted(documents)}
            onChanged={(text) => void handlePhotoChanged(text)}
          />
        )}
```

`setRow` only (never `setValues`): the form keeps any unsaved edits.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run` → all pass; `pnpm exec tsc -b`, `pnpm lint` → 0.

- [ ] **Step 5: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-photo add src/players/PlayerPhoto.tsx src/players/PlayerPhoto.test.tsx src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-photo commit -m "feat: show, upload and remove the player photo behind the consent lock (#1)"
```

---

## Orchestrator / owner steps (after branch 3 is merged — spec §6)

1. Orchestrator starts the dev server from the main checkout on `develop`; a tester agent drives Playwright; the owner pastes the magic link (admin account).
2. On a test player (created for the run, deleted afterwards — the documents cascade; run the Storage cleanup for its prefix as in Task 1):
   - Without consents: the lock alert shows, `Subir archivo` is disabled on CURP, `Subir foto` disabled.
   - Mark `Consentimiento de imagen` Físico and upload `Aviso de privacidad` as a PDF → lock alert disappears.
   - Upload a PDF for CURP and a JPG photo; `Ver` opens the PDF in a new tab; the avatar shows the photo.
   - `Aviso de privacidad` → `Pendiente` is disabled with the hint.
   - Direct public URL `https://eksbaugyypadtanyjcje.supabase.co/storage/v1/object/public/player-files/<tenant>/<player>/curp` → 400/404.
   - From the browser console with the session: `supabase.storage.from('player-files').upload('<tenant>/<other player without consent>/curp', blob)` → error; with a readonly session, `remove([...])` → `data: []` and the object still listed (confirms m1 live; if `remove` returns entries with a different `name` shape than the full path, open a fix branch for `removeFile`).
   - Mobile viewport (iPhone size): the section stacks and `Subir archivo` opens the picker.
3. Mark master spec §7 checklist items "Buckets de Storage en privado…" and "Candado de consentimiento verificado" as verified in the spec (dispatched doc change) and close #1 (auto via `Closes #1` on branch 3's PR).
