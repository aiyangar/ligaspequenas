# Lote A — Tests SQL autocontenidos y helpers de archivos (#47, #48, #69, #91, #111) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y su spec se mergean a `develop` en un PR de docs **antes** de despachar al implementer. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

> **Depende del lote K:** esta rama edita `docs/ops/backups.md` ("Restaurar la base", paso 2), que también edita el lote K (`fix/backups-review-minors`). El orquestador despacha este plan **solo después de que el PR de K esté mergeado** en `develop`, y el implementer lo comprueba en su Step 0 (gate) antes de tocar nada; si su rama se cortó antes, la rebasea sobre `origin/develop`.

**Goal:** Cerrar la deuda de base de datos del lote A del barrido: quitar el `EXECUTE` sobrante de `private.player_consent_granted` (#48.1), buscar al jugador por PK en `private.player_file_path_allowed` sin perder nada de 0018 (#48.2), dejar autocontenidos los tests SQL canónicos que dependían de un plan, de un `reset()` inexistente o de un schema `tests` que no existe (#48.3, #69, #91), sumar los casos de Storage y de exención que faltaban (#47) y corregir los dos nits de los tests de 0017/0018 (#111).

**Architecture:** Una migración nueva, `0019_harden_player_file_helpers.sql`: `revoke execute … from authenticated` sobre el helper de consentimiento y un `create or replace` del helper de rutas idéntico a 0018 salvo dos líneas (guard de uuid canónico en minúsculas + `p.id = v_parts[2]::uuid`). Un test nuevo `0019_*.test.sql` que es rojo hoy y verde después de aplicar. El resto son ediciones de tests canónicos (`0002`, `0012`, `0013`, `0014`, `0015`, `0016`, `0017`, `0018`) para que cada uno corra tal cual con el harness `tap` por MCP, más el spec de documentos. Sin cambios de frontend.

**Tech Stack:** Postgres 17 en Supabase remoto (`eksbaugyypadtanyjcje`) vía Supabase MCP (`apply_migration`, `execute_sql`, `get_advisors`, `list_migrations`), pgTAP en el schema `extensions`; Playwright (orquestador); Vitest / TypeScript (`tsc -b`) / ESLint / pnpm (sin cambios, deben seguir en verde).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§3 decide #48.1, #48.2 y #48.3/#69/#91; §4 fija rama y archivos; §5 el orden de base de datos). Cada issue tiene su detalle en `gh issue view <n> --repo aiyangar/ligaspequenas`.

## Global Constraints

- **Una rama:** `fix/db-tests-selfcontained`, cortada de `origin/develop` (con este plan ya mergeado). Worktree creado por el orquestador antes de despachar: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/db-tests-selfcontained`. En este plan `$WT` es esa ruta absoluta (no es una variable de tu shell: escríbela literal o empieza cada llamada con `WT=/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/db-tests-selfcontained;`). La primera acción del implementer es `pnpm install --frozen-lockfile` dentro de él. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`, nunca `git stash`. El implementer nunca hace push, PR ni merge: su parte termina en commit + reporte al orquestador. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- Número de migración fijo: `0019_harden_player_file_helpers.sql`. El `name` de `apply_migration` es el nombre del archivo sin `.sql`.
- Código, identificadores, SQL, comentarios y mensajes de commit: inglés. Comentarios solo para un *por qué* no obvio, una línea corta (los comentarios existentes de los tests se conservan salvo donde este plan los cambia). Cada mensaje de commit termina con la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`.
- La rama cierra con los tres en verde: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`. No hay cambios de frontend: los conteos finales son iguales al baseline que mide el implementer en su Step 0 (`B_files`, `B_tests`).
- PR body: `Closes #47`, `Closes #48`, `Closes #69`, `Closes #91`, `Closes #111` (una línea por issue).

### Base de datos

- **Quién corre qué.** El implementer **nunca** usa el Supabase MCP ni llega a la base de otra forma: escribe la migración, los tests y el spec, corre `vitest`/`tsc -b`/`lint` y las verificaciones estáticas, hace commit y reporta. **Todo** paso marcado **Orquestador [MCP]** lo corre el orquestador, en serie, con el owner presente para confirmar las escrituras.
- **Orden (spec §5):** commit del implementer → orquestador: baseline + chequeo previo de invocadores + corridas en **rojo** (0019 **sin** aplicar) → revisión de código pre-PR → **solo si la revisión sale limpia**: `apply_migration` → advisors → corridas en **verde** → regresiones (R-0012, R-0013, el test de 0018, R-0002) → E2E de Storage → PR y merge. **Nada se aplica a la base viva antes de una revisión limpia.** Si la revisión pide cambios, el implementer los hace en la misma rama y el orquestador repite el rojo antes de aplicar.
- No hay Docker, stack local ni `pg_prove`. El MCP no puede crear branches: todo SQL pega en el proyecto vivo.
- **Fixtures con prefijo propio, nunca el jugador real ni su objeto:** `abcdabcd-` (test de 0019, nuevo), `cccccccc-` (0012, 0013, 0018), `aaaaaaaa-`/`bbbbbbbb-`/`11111111-`/`22222222-`/`33333333-`/`99999999-` (0002). Los archivos que comparten `cccccccc-` corren **en serie**, nunca intercalados. Línea base al 2026-11-18: 1 tenant, 3 profiles, 3 users, 1 jugador, 6 documentos, 0 pagos, 1 objeto en `player-files`.
- **Harness `tap` por MCP.** `execute_sql` devuelve solo el resultado de la última sentencia y corre toda la llamada en una transacción (un error revierte todo; éxito confirma todo). Después de esta rama **todos** los archivos que corre este plan (`0002`, `0012`, `0013`, `0018`, `0019`) tienen sus fixtures arriba y su limpieza antes de `finish()`, así que la forma MCP sale del archivo del worktree **completo**, en una sola llamada, con estas reglas mecánicas y nada más:
  1. `begin;` → `create temp table tap (line text); grant all on tap to public;`
  2. Cada línea que empieza con `select extensions.is(`, `select extensions.throws_ok(` o `select extensions.lives_ok(` → se le antepone `insert into tap ` (queda `insert into tap select extensions.…(`).
  3. `select * from extensions.finish();` y `rollback;` → `select line from tap order by substring(line from '^(?:not )?ok (\d+)')::int;`

  Pasa si devuelve N filas (N = el `plan(N)` del archivo) y ninguna empieza con `not ok`. Una corrida exitosa no deja fixtures (la limpieza corre dentro de la misma llamada); una que falla se revierte entera.
- Los chequeos estructurales se hacen con `extensions.is()` sobre SELECTs de catálogo (`pg_proc`, `pg_policies`, `has_function_privilege`, `pg_get_functiondef`); no se agregan helpers de pgTAP que llaman `ok()` internamente.
- **Baseline query** (antes y después de cada corrida):

```sql
select (select count(*) from public.tenants) as tenants, (select count(*) from public.profiles) as profiles,
       (select count(*) from auth.users) as users, (select count(*) from public.players) as players,
       (select count(*) from public.documents) as documents, (select count(*) from public.payments) as payments,
       (select count(*) from storage.objects where bucket_id = 'player-files') as objects;
```

- **Residue query** (después de cada corrida; esperado: todo `0`):

```sql
select
  (select count(*) from public.tenants where id::text like any (array['abcdabcd-%', 'cccccccc-%', 'aaaaaaaa-%', 'bbbbbbbb-%'])) as tenants,
  (select count(*) from auth.users where id::text like any (array['abcdabcd-%', 'cccccccc-%', '11111111-%', '22222222-%', '33333333-%'])) as users,
  (select count(*) from public.profiles where id::text like any (array['abcdabcd-%', 'cccccccc-%', '11111111-%', '22222222-%', '33333333-%'])) as profiles,
  (select count(*) from public.players where id::text like any (array['abcdabcd-%', 'cccccccc-%', '99999999-%'])
     or tenant_id::text like any (array['abcdabcd-%', 'cccccccc-%', 'aaaaaaaa-%', 'bbbbbbbb-%'])) as players,
  (select count(*) from public.documents where tenant_id::text like any (array['abcdabcd-%', 'cccccccc-%', 'aaaaaaaa-%', 'bbbbbbbb-%'])) as documents,
  (select count(*) from storage.objects where bucket_id = 'player-files' and name like any (array['abcdabcd-%', 'cccccccc-%'])) as objects;
```

- Si un `DELETE` o cualquier llamada por MCP falla con "Invalid or expired requestState": correr la baseline query y la residue query, confirmar que nada cambió y reintentar una vez. Si sigue fallando, detenerse (hace falta re-autenticar `/mcp`).
- Después de `apply_migration`: `mcp__supabase__get_advisors` con `type: "security"`. Esperado: solo `auth_leaked_password_protection` (aceptado). Cualquier otro lint nuevo → detenerse y escalar al owner.

## Review Focus

- **El revoke no rompe a ningún invocador:** las tres funciones que llaman a `player_consent_granted` (`player_file_path_allowed`, `enforce_document_rules`, `enforce_player_photo_rules`) son `security definer` y su owner conserva `EXECUTE`; ninguna policy lo llama — fijado en las aserciones 12–15 de `0019_*.test.sql` (contra el catálogo vivo), en sus aserciones 28–32 (subida, trigger de documentos y trigger de foto como `authenticated` después del revoke), en R-0013 y en la E2E de O7.
- **El regex de uuid no cambia el resultado de ninguna ruta:** solo acepta la forma minúscula con guiones que produce `uuid::text`, así que todo lo que antes era `false` por texto sigue `false` y nada lanza `22P02` — fijado en las aserciones 17–27 de `0019_*.test.sql` (mayúsculas, sin guiones, con sufijo, no-uuid, jugador inexistente, jugador de otro tenant) y en los 10 casos de ruta de 0012/0018.
- **0019 conserva todo lo que agregó 0018:** `volatile`, `for share` antes del chequeo de consentimiento, `security definer`, `search_path = ''`, grant a `authenticated` y nada a `anon` — fijado en las aserciones 1–3 y 7–9 de `0019_*.test.sql` y en el test de 0018 (con la aserción 4 ajustada).
- **Los tests reescritos prueban lo mismo que antes:** cada archivo conserva sus aserciones originales en el mismo orden y con la misma descripción; solo se agregan fixtures, limpieza y las aserciones nuevas de #47. El orquestador corre los archivos reescritos **antes** de aplicar 0019 (O2b): si algo ahí sale `not ok`, el error está en la reescritura, no en 0019.
- **La aserción nueva de mover un archivo (0012) falla por la policy y no por otra cosa:** compara el mensaje completo de RLS, no solo el `42501`.

---

## Task 1 — rama `fix/db-tests-selfcontained`

**Files:**
- Create: `supabase/migrations/0019_harden_player_file_helpers.sql`
- Create: `supabase/tests/0019_harden_player_file_helpers.test.sql`
- Modify: `supabase/tests/0002_rls.test.sql` (reescritura completa, #91)
- Modify: `supabase/tests/0012_player_files_storage.test.sql` (reescritura completa, #48.3 + #47 a/b)
- Modify: `supabase/tests/0013_document_consent_rules.test.sql` (reescritura completa, #48.3 + #47 c)
- Modify: `supabase/tests/0014_player_payment_status_view.test.sql` (línea 4, #69)
- Modify: `supabase/tests/0015_players_view_status_columns.test.sql` (línea 4, mismo nit que #69)
- Modify: `supabase/tests/0016_revoke_anon_privileges.test.sql` (línea 72, B3, consecuencia de #48.1)
- Modify: `supabase/tests/0017_forbid_player_delete.test.sql` (línea 79, #111.1)
- Modify: `supabase/tests/0018_lock_player_on_file_write.test.sql` (líneas 44–48, aserción 4, #111.2 + #48.2)
- Modify: `docs/superpowers/specs/2026-10-13-documents-design.md` (§3.2, #48.1 y #48.2)
- Modify: `docs/ops/backups.md` ("Restaurar la base" paso 2 y "Restaurar producción" punto 1: reaplicar 0018 y 0019 después de 0012)

**Interfaces:**
- Consumes: `private.current_tenant_id()` (0003); `private.player_consent_granted(uuid)` (0012); `private.player_file_path_allowed(text)` tal como la dejó 0018; triggers `private.enforce_document_rules` y `private.enforce_player_photo_rules` (0013); policies de `storage.objects` (0012, no cambian).
- Produces: `private.player_consent_granted(uuid)` sin `EXECUTE` para `authenticated` (ni `anon` ni `PUBLIC`, como ya estaba); `private.player_file_path_allowed(p_name text) returns boolean` con la misma firma y el mismo resultado para toda ruta, ahora con guard de uuid y búsqueda por PK. Sin cambios de frontend (`src/` no llama a ninguno de los dos helpers: `grep -rn "player_consent_granted\|player_file_path_allowed" src supabase/functions` → vacío).

### Implementer

- [x] **Step 0: Preparar y medir el baseline**

**Gate (lote K mergeado):**

1. `gh pr list --repo aiyangar/ligaspequenas --state merged --head fix/backups-review-minors --json number,mergeCommit` → exactamente 1 PR; anota su `mergeCommit.oid` como `K_SHA`. Si devuelve `[]`, **detente** y avisa al orquestador: el lote K todavía no está en `develop`.
2. `git -C $WT fetch origin`
3. `git -C $WT merge-base --is-ancestor <K_SHA> origin/develop` → exit 0.
4. `git -C $WT merge-base --is-ancestor <K_SHA> HEAD` → si da exit 1 (la rama se cortó antes del merge de K y aún no tiene commits propios), `git -C $WT rebase origin/develop` y repite este punto hasta exit 0.
5. `grep -c 'if \[ -e /Volumes/backupsdata \]' docs/ops/backups.md` (en `$WT`) → `1` (el runbook ya trae los cambios de K).

Después: `git -C $WT branch --show-current` → `fix/db-tests-selfcontained`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. Luego, en `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests` (todo verde).

- [x] **Step 1: Escribir el test de 0019 (el rojo)**

Crea `supabase/tests/0019_harden_player_file_helpers.test.sql` con exactamente este contenido:

```sql
begin;
select extensions.plan(32);

insert into public.tenants (id, name, slug) values
  ('abcdabcd-0000-0000-0000-000000000001', 'ZZ Path X', 'zz-path-x'),
  ('abcdabcd-0000-0000-0000-000000000002', 'ZZ Path Y', 'zz-path-y');
insert into auth.users (id, email) values
  ('abcdabcd-1111-0000-0000-000000000001', 'admin-x@zz-path.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('abcdabcd-1111-0000-0000-000000000001', 'abcdabcd-0000-0000-0000-000000000001', 'ZZ Admin X', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('abcdabcd-2222-0000-0000-000000000001', 'abcdabcd-0000-0000-0000-000000000001', 'ZZ Path P', '2015-06-10', 'Tutor', '111'),
  ('abcdabcd-2222-0000-0000-000000000002', 'abcdabcd-0000-0000-0000-000000000001', 'ZZ Path Q', '2015-06-10', 'Tutor', '111'),
  ('abcdabcd-2222-0000-0000-000000000003', 'abcdabcd-0000-0000-0000-000000000002', 'ZZ Path R', '2015-06-10', 'Tutor', '111');
update public.documents set status = 'fisico'
  where player_id in ('abcdabcd-2222-0000-0000-000000000001', 'abcdabcd-2222-0000-0000-000000000003')
    and doc_type in ('image_consent', 'privacy_notice');

create or replace function pg_temp.try_sql(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || split_part(sqlerrm, ':', 1);
end;
$$;
grant execute on function pg_temp.try_sql(text) to public;

select extensions.is(
  (select provolatile::text from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  'v', 'path helper is still volatile');
select extensions.is(
  (select prosecdef from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  true, 'path helper is still security definer');
select extensions.is(
  (select 'search_path=""' = any (proconfig) from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  true, 'path helper still pins an empty search_path');
select extensions.is(
  (select d ~ 'from public\.players p\s+where\s+p\.id\s*=\s*v_parts\[2\]::uuid\s+and\s+p\.tenant_id\s*=\s*v_tenant\s+for share;'
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'path helper looks the player up by uuid under FOR SHARE');
select extensions.is(
  (select position('p.id::text' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  0, 'path helper no longer compares the player id as text');
select extensions.is(
  (select position('!~' in d) between 1 and position('v_parts[2]::uuid' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'a uuid shape check runs before the cast');
select extensions.is(
  (select position('for share;' in d) between 1 and position('player_consent_granted' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'the FOR SHARE lock still comes before the consent check');
select extensions.is(has_function_privilege('authenticated', 'private.player_file_path_allowed(text)', 'EXECUTE'), true, 'authenticated executes the path helper');
select extensions.is(has_function_privilege('anon', 'private.player_file_path_allowed(text)', 'EXECUTE'), false, 'anon cannot execute the path helper');
select extensions.is(has_function_privilege('authenticated', 'private.player_consent_granted(uuid)', 'EXECUTE'), false, 'authenticated cannot execute the consent helper');
select extensions.is(has_function_privilege('anon', 'private.player_consent_granted(uuid)', 'EXECUTE'), false, 'anon cannot execute the consent helper');
select extensions.is(
  (select count(*)::int from pg_policies
   where coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%player_consent_granted%'),
  0, 'no policy calls the consent helper');
select extensions.is(
  (select string_agg(p.proname::text, ',' order by p.proname) from pg_proc p
   where p.prosrc like '%player_consent_granted%'
     and p.oid <> 'private.player_consent_granted(uuid)'::regprocedure
     and p.pronamespace::regnamespace::text not like 'pg_temp%'),
  'enforce_document_rules,enforce_player_photo_rules,player_file_path_allowed', 'the consent helper has exactly three callers');
select extensions.is(
  (select bool_and(p.prosecdef) from pg_proc p
   where p.prosrc like '%player_consent_granted%'
     and p.oid <> 'private.player_consent_granted(uuid)'::regprocedure
     and p.pronamespace::regnamespace::text not like 'pg_temp%'),
  true, 'every caller of the consent helper is security definer');
select extensions.is(
  (select bool_and(has_function_privilege(p.proowner, 'private.player_consent_granted(uuid)'::regprocedure, 'EXECUTE')) from pg_proc p
   where p.prosrc like '%player_consent_granted%'
     and p.oid <> 'private.player_consent_granted(uuid)'::regprocedure
     and p.pronamespace::regnamespace::text not like 'pg_temp%'),
  true, 'every caller''s owner still executes the consent helper');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"abcdabcd-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(
  pg_temp.try_sql($q$select private.player_consent_granted('abcdabcd-2222-0000-0000-000000000001')$q$),
  '42501 permission denied for function player_consent_granted', 'an admin cannot call the consent helper directly');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/curp'), true, 'document with consent allowed');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/photo'), true, 'photo with consent allowed');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/curp'), false, 'document without consent blocked');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/privacy_notice'), true, 'consent document exempt from the lock');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000003/curp'), false, 'a player of another tenant is blocked');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000002/abcdabcd-2222-0000-0000-000000000001/curp'), false, 'other tenant prefix blocked');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/not-a-uuid/curp'), false, 'non-uuid player segment is false, not an error');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/ABCDABCD-2222-0000-0000-000000000001/curp'), false, 'an uppercase player uuid is false, as with the text comparison');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd222200000000000000000001/curp'), false, 'a player uuid without hyphens is false');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001x/curp'), false, 'a player uuid with a suffix is false');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000099/curp'), false, 'unknown player blocked');
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/photo')$q$),
  'ok', 'admin X uploads a photo for a consented player');
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/curp')$q$), 5),
  '42501', 'admin X cannot upload a document for a player without consent');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/curp' where player_id = 'abcdabcd-2222-0000-0000-000000000001' and doc_type = 'curp'$q$),
  'ok', 'the document trigger still grants a consented player after the revoke');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/curp' where player_id = 'abcdabcd-2222-0000-0000-000000000002' and doc_type = 'curp'$q$),
  'P0001 consent_required', 'the document trigger still blocks a player without consent');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/photo' where id = 'abcdabcd-2222-0000-0000-000000000001'$q$),
  'ok', 'the photo trigger still grants a consented player after the revoke');

-- cleanup runs before finish() so the MCP form executes it
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'player-files' and name like 'abcdabcd-%';
delete from public.players where tenant_id::text like 'abcdabcd-%';
delete from public.profiles where id::text like 'abcdabcd-%';
delete from auth.users where id::text like 'abcdabcd-%';
delete from public.tenants where id::text like 'abcdabcd-%';

select * from extensions.finish();
rollback;
```

Rojo esperado (lo corre el orquestador en O2, 0019 sin aplicar): `not ok 4`, `not ok 5`, `not ok 6` (hoy la búsqueda es `p.id::text = v_parts[2]`, sin guard), `not ok 10` (hoy `authenticated` sí ejecuta el helper de consentimiento) y `not ok 16` (la llamada directa devuelve `ok`); las otras 27 `ok`.

- [x] **Step 2: Ajustar B3 en el test de 0016**

En `supabase/tests/0016_revoke_anon_privileges.test.sql`, la línea 72 queda así (el resto del archivo no cambia; `plan(22)` sigue igual):

```sql
union all select extensions.is(has_function_privilege('authenticated', 'private.player_consent_granted(uuid)', 'EXECUTE'), false, 'B3 authenticated no longer executes player_consent_granted (0019)')
```

- [x] **Step 3: Ajustar la aserción 4 del test de 0018 (#111.2)**

En `supabase/tests/0018_lock_player_on_file_write.test.sql`, la aserción 4 (líneas 44–48) queda así. El regex tolera espacios alrededor de `=`/`and` y acepta **solo** las dos formas que compilan: `p.id::text = v_parts[2]` (0018) y `p.id = v_parts[2]::uuid` (0019), no mezclas como `p.id::text = v_parts[2]::uuid`: el test de 0018 vigila el candado, no la forma de la comparación (esa la fija el test de 0019). Resto del archivo sin cambios, `plan(19)` igual:

```sql
select extensions.is(
  (select d ~ 'from public\.players p\s+where\s+(p\.id::text\s*=\s*v_parts\[2\]|p\.id\s*=\s*v_parts\[2\]::uuid)\s+and\s+p\.tenant_id\s*=\s*v_tenant\s+for share;'
          and position('for share;' in d) < position('player_consent_granted' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'path helper locks the players row FOR SHARE before the consent check');
```

- [x] **Step 4: Reescribir `0002_rls.test.sql` autocontenido (#91)**

Reemplaza **todo** el contenido de `supabase/tests/0002_rls.test.sql` por esto. Cambios respecto al original: `tests.act_as` → `pg_temp.act_as` (el remoto no tiene schema `tests`), `select reset();` → reset explícito a `postgres` y a claims vacíos (no existe `reset()`), pgTAP y tablas calificados por schema, la consulta de la aserción 6 pasa de `where relname = 'players'` a `where oid = 'public.players'::regclass` (mismo resultado, sin depender de que no exista otra tabla `players` en otro schema), y limpieza antes de `finish()`. Las 6 aserciones, su orden y sus descripciones no cambian:

```sql
begin;
select extensions.plan(6);

-- two tenants, three users: admin+readonly in tenant A, admin in tenant B
insert into public.tenants (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'readonly-a@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin-b@test.com');

insert into public.profiles (id, tenant_id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin A', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Readonly A', 'readonly'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin B', 'admin');

-- a player in tenant A
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Player A', '2015-06-10', 'Tutor', '111');

-- pg_temp keeps the file self-contained: the remote has no tests schema
create or replace function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.act_as(uuid) to public;

-- 1: admin A can read their player
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select count(*) from public.players)::int, 1, 'admin A sees tenant A player');

-- 2: readonly A can read
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select count(*) from public.players)::int, 1, 'readonly A sees tenant A player');

-- 3: admin B (other tenant) sees nothing
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select count(*) from public.players)::int, 0, 'admin B does not see tenant A player');

-- 4: readonly A cannot insert
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select extensions.throws_ok(
  $$insert into public.players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nope', '2016-01-01', 'T', '1')$$,
  '42501', null, 'readonly cannot insert players'
);

-- 5: admin A can insert
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select extensions.lives_ok(
  $$insert into public.players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Yes', '2016-01-01', 'T', '1')$$,
  'admin can insert players'
);

-- 6: RLS is enabled on players
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select extensions.is(
  (select relrowsecurity from pg_class where oid = 'public.players'::regclass),
  true,
  'RLS enabled on players'
);

-- cleanup runs before finish() so the MCP form executes it
delete from public.players where tenant_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
delete from public.tenants where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select * from extensions.finish();
rollback;
```

- [x] **Step 5: Reescribir `0012_player_files_storage.test.sql` autocontenido + casos de #47 (a) y (b)**

Reemplaza **todo** el contenido de `supabase/tests/0012_player_files_storage.test.sql` por esto. Cambios respecto al original: los fixtures del plan de documentos van en línea arriba; los dos comentarios `-- (as postgres) …` se vuelven las sentencias reales; el bloque de rutas fija el rol `authenticated` como admin X y vuelve a `postgres` antes de crear los helpers (como hacía R-0012); `plan(25)` → `plan(28)` con 3 aserciones nuevas (admin Y no borra un objeto de X; admin X no puede mover un archivo a una ruta bloqueada por el candado, con el mensaje completo de RLS; admin X sí mueve a una ruta permitida); limpieza antes de `finish()`. Las 25 aserciones originales conservan orden y descripción:

```sql
begin;
select extensions.plan(28);

-- tenants X/Y, admin X, readonly X, admin Y, players P/Q in X
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

select extensions.is((select public from storage.buckets where id = 'player-files'), false, 'bucket is private');
select extensions.is((select file_size_limit from storage.buckets where id = 'player-files'), 10485760::bigint, 'bucket limit is 10 MB');
select extensions.is(
  (select allowed_mime_types::text from storage.buckets where id = 'player-files'),
  '{application/pdf,image/jpeg,image/png,image/webp}', 'bucket MIME allow-list');

-- consent helper: seeded rows are pendiente → false; both consents fisico → true; one consent row missing → false
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000099'), false, 'unknown player is not granted');
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type in ('image_consent', 'privacy_notice');
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000001'), true, 'both consents fisico are granted');
delete from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'privacy_notice';
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'image_consent';
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000002'), false, 'a missing consent row is not granted');

-- path helper, acting as admin X (P has consent, Q does not)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
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
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);

-- storage.objects policies
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
grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;

select set_config('role', 'postgres', true);
insert into storage.objects (bucket_id, name) values
  ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'),
  ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000002","role":"authenticated"}', true);
select extensions.is((select count(*) from storage.objects where bucket_id = 'player-files')::int, 2, 'readonly X sees own tenant objects');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is((select count(*) from storage.objects where bucket_id = 'player-files')::int, 0, 'admin Y sees no tenant X objects');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo')$q$),
  'ok', 'admin X uploads a photo for a consented player');
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp')$q$), 5),
  '42501', 'admin X cannot upload a document for a player without consent');
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/image_consent')$q$),
  'ok', 'admin X uploads a consent document without prior consent');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000002","role":"authenticated"}', true);
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/birth_certificate')$q$), 5),
  '42501', 'readonly X cannot upload');
select set_config('storage.allow_delete_query', 'true', true);
select extensions.is(
  pg_temp.count_sql($q$delete from storage.objects where bucket_id = 'player-files'$q$),
  0, 'readonly X cannot delete');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/proof_of_address')$q$), 5),
  '42501', 'admin Y cannot upload into tenant X');
select extensions.is(
  pg_temp.count_sql($q$delete from storage.objects where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'$q$),
  0, 'admin Y cannot delete a tenant X object');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(
  pg_temp.try_sql($q$update storage.objects set name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp' where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent'$q$),
  '42501 new row violates row-level security policy for table "objects"', 'admin X cannot move a file onto a path the consent lock blocks');
select extensions.is(
  pg_temp.count_sql($q$update storage.objects set name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/medical_clearance' where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent'$q$),
  1, 'admin X moves a file to an allowed path');
select extensions.is(
  pg_temp.count_sql($q$delete from storage.objects where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'$q$),
  1, 'admin X deletes a file in own tenant');
select set_config('role', 'postgres', true);

-- cleanup runs before finish() so the MCP form executes it
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'player-files' and name like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.players where id in ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000002');
delete from public.profiles where id::text like 'cccccccc-1111-%';
delete from auth.users where id::text like 'cccccccc-1111-%';
delete from public.tenants where id::text like 'cccccccc-0000-%';

select * from extensions.finish();
rollback;
```

- [x] **Step 6: Reescribir `0013_document_consent_rules.test.sql` autocontenido + caso de #47 (c)**

Reemplaza **todo** el contenido de `supabase/tests/0013_document_consent_rules.test.sql` por esto. Cambios respecto al original: fixtures en línea arriba (los mismos de 0012, sin cambios de documentos), `plan(21)` → `plan(22)` con una aserción nueva justo después de la de `image_consent` (Q, sin ningún consentimiento, pone `privacy_notice` en `digital` → `ok`), y limpieza antes de `finish()`. Las 21 originales conservan orden y descripción:

```sql
begin;
select extensions.plan(22);

-- tenants X/Y, admin X, readonly X, admin Y, players P/Q in X; the seed trigger gives each player 6 pendiente documents
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
grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;

-- act as admin X
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);

select extensions.is((select count(*) from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000001')::int, 6, 'seed still creates 6 rows');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'curp'$q$),
  'P0001 consent_required', 'digital document without consent is blocked');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'ok', 'digital image_consent is exempt from the lock');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/privacy_notice' where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'privacy_notice'$q$),
  'ok', 'digital privacy_notice is exempt from the lock');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'fisico', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'privacy_notice'$q$),
  'ok', 'privacy_notice to fisico');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'curp'$q$),
  'ok', 'digital document with consent is allowed');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'privacy_notice'$q$),
  'P0001 consent_in_use', 'revoking consent with a digital document is blocked');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/birth_certificate' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'birth_certificate'$q$),
  'P0001 file_path_mismatch', 'file_path of another player is rejected');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'birth_certificate'$q$),
  'P0001 file_path_mismatch', 'file_path of another doc_type is rejected');
select extensions.is(
  left(pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'medical_clearance'$q$), 5),
  '23514', 'digital without file_path violates the check');
select extensions.is(
  left(pg_temp.try_sql($q$update public.documents set status = 'fisico', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/proof_of_address' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$), 5),
  '23514', 'fisico with file_path violates the check');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set doc_type = 'medical_clearance' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$),
  'P0001 document_identity_immutable', 'doc_type cannot change');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set player_id = 'cccccccc-2222-0000-0000-000000000002' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$),
  'P0001 document_identity_immutable', 'player_id cannot change');

select set_config('role', 'postgres', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set tenant_id = 'cccccccc-0000-0000-0000-000000000002' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$),
  'P0001 document_identity_immutable', 'tenant_id cannot change');
select set_config('role', 'authenticated', true);

select extensions.is(
  pg_temp.count_sql($q$delete from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000001'$q$),
  0, 'admin cannot delete document rows');
select extensions.is(
  left(pg_temp.try_sql($q$insert into public.documents (tenant_id, player_id, doc_type) values ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000001', 'curp')$q$), 5),
  '42501', 'admin cannot insert document rows');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo' where id = 'cccccccc-2222-0000-0000-000000000002'$q$),
  'P0001 invalid_file_path', 'photo_path of another player is rejected');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/photo' where id = 'cccccccc-2222-0000-0000-000000000002'$q$),
  'P0001 consent_required', 'photo without consent is blocked');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo' where id = 'cccccccc-2222-0000-0000-000000000001'$q$),
  'ok', 'photo with consent is allowed');

select set_config('role', 'postgres', true);
update public.documents set status = 'fisico', file_path = null
  where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'curp';
select set_config('role', 'authenticated', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'P0001 consent_in_use', 'revoking consent with a photo is blocked');

select set_config('role', 'postgres', true);
update public.players set photo_path = null where id = 'cccccccc-2222-0000-0000-000000000001';
insert into storage.objects (bucket_id, name)
  values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/medical_clearance');
select set_config('role', 'authenticated', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'P0001 consent_in_use', 'revoking consent with an orphan object is blocked');

select set_config('role', 'postgres', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects
  where name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/medical_clearance';
select set_config('role', 'authenticated', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'ok', 'revoking consent with no files in use is allowed');
select set_config('role', 'postgres', true);

-- cleanup runs before finish() so the MCP form executes it
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'player-files' and name like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.players where id in ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000002');
delete from public.profiles where id::text like 'cccccccc-1111-%';
delete from auth.users where id::text like 'cccccccc-1111-%';
delete from public.tenants where id::text like 'cccccccc-0000-%';

select * from extensions.finish();
rollback;
```

- [x] **Step 7: Comentarios de 0014, 0015 y 0017 (#69, #111.1)**

1. `supabase/tests/0014_player_payment_status_view.test.sql` línea 4 queda: `-- tenants A/B, admin A, readonly A, admin B, players P1–P6, payments 1–6`
2. `supabase/tests/0015_players_view_status_columns.test.sql` línea 4 queda: `-- tenants A/B, admin A, readonly A, admin B, players S1–S5, payments 1–6`
3. `supabase/tests/0017_forbid_player_delete.test.sql` línea 79 queda: `-- cleanup runs before finish() so the MCP form executes it`

(El segundo punto de #69, cambiar a un helper `tests.act_as` compartido "si algún día existe", no aplica: después del Step 4 ningún test usa un schema `tests`, así que el `set_config` en línea de 0014 se queda.)

- [x] **Step 8: Escribir la migración 0019**

Crea `supabase/migrations/0019_harden_player_file_helpers.sql` con exactamente este contenido. La función es el cuerpo de `0018_lock_player_on_file_write.sql` (líneas 1–37) con dos cambios: el guard de uuid antes del `select` y `p.id = v_parts[2]::uuid` en lugar de `p.id::text = v_parts[2]` (el comentario de 0012 sobre el 22P02 se reemplaza por el del guard):

```sql
-- only security definer code calls this helper (the path helper and the 0013 triggers), and they run as its owner
revoke execute on function private.player_consent_granted(uuid) from authenticated;

create or replace function private.player_file_path_allowed(p_name text)
returns boolean
language plpgsql
volatile
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
  -- only the lowercase form uuid::text produces could match before, and the guard keeps a bad cast from raising 22P02
  if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  -- the share lock queues this write behind a consent revocation's no key update lock (0013)
  select p.id into v_player
  from public.players p
  where p.id = v_parts[2]::uuid and p.tenant_id = v_tenant
  for share;
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

grant execute on function private.player_file_path_allowed(text) to authenticated;
```

- [x] **Step 9: Actualizar el spec de documentos**

En `docs/superpowers/specs/2026-10-13-documents-design.md`:

1. El encabezado de la línea 48 queda (se quita `, grant execute … to authenticated`):

```text
### 3.2 Helpers (`private`, `security definer`, `set search_path = ''`)
```
2. Justo debajo del párrafo "Toda referencia dentro de los helpers…" (línea 50) agrega este párrafo:

```markdown
`player_file_path_allowed` lleva `grant execute … to authenticated`, porque la llaman las policies de Storage. `player_consent_granted` **no** lo lleva desde 0019 (#48): solo la llaman funciones `security definer` (`player_file_path_allowed` y los triggers de §3.4 y §3.5), que corren como su owner, y el helper responde por cualquier `player_id` sin filtrar por tenant.
```

3. El paso 3 de `player_file_path_allowed` (línea 56) queda:

```markdown
  3. el segmento 2 tiene la forma de un uuid en minúsculas con guiones (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) y existe `public.players p` con `p.id = segmento 2::uuid` y `p.tenant_id = private.current_tenant_id()`, tomado `for share` (0018). El regex va **antes** del cast: un segmento que no es uuid devuelve `false` en vez de lanzar 22P02 dentro de la política. Como solo acepta la forma que produce `uuid::text`, el resultado es el mismo que la comparación como texto de 0012, pero la búsqueda usa la PK (0019, #48);
```

(Verificado al escribir este plan: §3.4 es "Integridad en `documents`" y §3.5 "Integridad en `players`", las dos secciones de los triggers de 0013.)

- [x] **Step 9b: Runbook de restauración (consecuencia de #48)**

Hoy el paso 2 de "Restaurar la base" en `docs/ops/backups.md` reaplica `0012` después de cargar el dump. Desde 0018 eso deja el cuerpo de 0012 en `player_file_path_allowed` (sin el `for share`), y desde 0019 además le devuelve a `authenticated` el `EXECUTE` sobre `player_consent_granted`. La "Regla" del propio runbook pide agregar toda migración que redefina una función de 0012 o revoque privilegios. Ubica los textos por contenido (el lote K cambió los números de línea de arriba):

1. El bloque `bash` del paso 2 queda:

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0012_player_files_storage.sql
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0018_lock_player_on_file_write.sql
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0019_harden_player_file_helpers.sql
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0016_revoke_anon_privileges.sql
```

2. Entre la viñeta de `0012` y la de `0016` agrega estas dos (mismo sangrado de 3 espacios):

```markdown
   - `0018`: 0012 deja `private.player_file_path_allowed` con su cuerpo original; 0018 le vuelve a poner el `for share` sobre el jugador.
   - `0019`: 0012 le vuelve a dar a `authenticated` el `EXECUTE` sobre `private.player_consent_granted`; 0019 lo quita y deja `player_file_path_allowed` con la búsqueda por uuid. Va después de 0018 porque redefine la misma función.
```

3. En "Restaurar producción", punto 1, `(base, 0012 y 0016, privilegios, checklist A–D, Storage)` → `(base, 0012, 0018, 0019 y 0016, privilegios, checklist A–D, Storage)`.

- [x] **Step 10: Verificación estática y frontend**

Corre en `$WT` y anota cada salida para el reporte:

- `grep -cE '^select extensions\.(is|throws_ok|lives_ok)\(' supabase/tests/0019_harden_player_file_helpers.test.sql` → `32` (= `plan(32)`).
- Mismo `grep -cE` sobre `0002_rls.test.sql` → `6`; `0012_player_files_storage.test.sql` → `28`; `0013_document_consent_rules.test.sql` → `22`; `0018_lock_player_on_file_write.test.sql` → `19`.
- `grep -n 'reset()\|tests\.' supabase/tests/0002_rls.test.sql` → vacío.
- `grep -rn 'see plan' supabase/tests` → vacío.
- `grep -n 'under rollback' supabase/tests/0017_forbid_player_delete.test.sql` → vacío.
- `grep -c 'p.id::text' supabase/migrations/0019_harden_player_file_helpers.sql` → `0`; `grep -cx 'volatile' …` → `1`, `grep -cx 'security definer' …` → `1`, `grep -cx '  for share;' …` → `1` (mismo archivo); `grep -c 'stable' supabase/migrations/0019_harden_player_file_helpers.sql` → `0`.
- `grep -n "player_consent_granted(uuid)', 'EXECUTE'), false" supabase/tests/0016_revoke_anon_privileges.test.sql` → 1 línea (la 72).
- `grep -rn 'player_consent_granted\|player_file_path_allowed' src supabase/functions` → vacío (ningún cliente llama a los helpers).
- `grep -c 'migrations/0019_harden_player_file_helpers.sql' docs/ops/backups.md` → `1`; `grep -c 'migrations/0018_lock_player_on_file_write.sql' docs/ops/backups.md` → `1`; `grep -c '0012, 0018, 0019 y 0016' docs/ops/backups.md` → `1`.
- `pnpm exec vitest run` → `B_files` / `B_tests`, todo verde; `pnpm exec tsc -b` → exit 0; `pnpm lint` → exit 0.

- [x] **Step 11: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-a-db-tests.md docs/superpowers/specs/2026-10-13-documents-design.md docs/ops/backups.md supabase/migrations/0019_harden_player_file_helpers.sql supabase/tests/0019_harden_player_file_helpers.test.sql supabase/tests/0002_rls.test.sql supabase/tests/0012_player_files_storage.test.sql supabase/tests/0013_document_consent_rules.test.sql supabase/tests/0014_player_payment_status_view.test.sql supabase/tests/0015_players_view_status_columns.test.sql supabase/tests/0016_revoke_anon_privileges.test.sql supabase/tests/0017_forbid_player_delete.test.sql supabase/tests/0018_lock_player_on_file_write.test.sql
git -C $WT commit -m "fix: drop the consent helper grant, look players up by uuid and make the SQL tests self-contained (#47 #48 #69 #91 #111)" -m "Only security definer code calls player_consent_granted, so authenticated loses EXECUTE on it. The path helper checks the uuid shape before casting, so the players lookup uses the primary key without raising 22P02, and keeps everything 0018 added. The canonical pgTAP files now carry their own fixtures and cleanup, so each runs as-is through the MCP harness; 0012/0013 gain the missing Storage move/delete and privacy_notice exemption cases. The restore runbook reapplies 0018 and 0019 after 0012 so a restored project keeps both." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada: primero el `add`, luego el `commit`.)

**Reporte del implementer:** SHA del commit, `B_files`/`B_tests`, salidas del Step 10. No corras SQL.

### Orquestador [MCP]

Todas las corridas de tests usan la forma MCP del archivo **del worktree** (reglas del harness de Global Constraints), una llamada cada una, en serie. Después de **cada** corrida: residue query → todo `0`; baseline query → igual a O1.

- [ ] **Step O1: Baseline y chequeo previo de invocadores (solo lectura)**

`list_migrations` → la última entrada es `0018_lock_player_on_file_write` (nunca `0019`). Corre la baseline query (esperado: tenants 1, profiles 3, users 3, players 1, documents 6, payments 0, objects 1) y la residue query (todo `0`; si no, limpiar antes de seguir). Luego, la verificación que pide spec §3 para #48.1, contra el catálogo vivo:

```sql
select p.oid::regprocedure::text as fn, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
       has_function_privilege(p.proowner, 'private.player_consent_granted(uuid)'::regprocedure, 'EXECUTE') as owner_can_execute,
       (select count(*) from pg_policies
        where coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%player_consent_granted%') as policies_calling_it
from pg_proc p
where p.prosrc like '%player_consent_granted%'
  and p.oid <> 'private.player_consent_granted(uuid)'::regprocedure
order by 1;
```

Esperado: 3 filas (`private.enforce_document_rules()`, `private.enforce_player_photo_rules()`, `private.player_file_path_allowed(text)`), las tres con `prosecdef = true`, `owner = postgres`, `owner_can_execute = true` y `policies_calling_it = 0`. Si aparece otra fila o algún `false`, **detenerse**: el revoke rompería a ese invocador; escalar al owner.

Y, para saber de antemano qué triggers de Storage corren en un `UPDATE` (las aserciones de mover de 0012):

```sql
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'storage.objects'::regclass and not tgisinternal order by 1;
```

Anota la salida en el PR.

Y quién depende del helper en el catálogo (un objeto que lo use en una vista, un default o un check seguiría llamándolo con los privilegios del invocador):

```sql
select classid::regclass, objid, deptype from pg_depend
where refobjid = 'private.player_consent_granted(uuid)'::regprocedure;
```

Esperado: ninguna fila con `classid` en `pg_rewrite`, `pg_attrdef` o `pg_constraint` (las de `pg_proc`/ACL u otras de sistema son aceptables; anótalas). Si aparece alguna de esas tres, **detenerse** y escalar al owner.

- [ ] **Step O1b: El worktree trae exactamente el SQL del plan**

Antes de cualquier corrida, compara los archivos del worktree del implementer con los bloques de este plan (sobre la copia del plan en `develop`, no la del implementer):

```bash
python3 - <<'EOF'
import re, sys
plan = open('/Users/arturoortiz/Proyectos/Personales/ligaspequenas/docs/superpowers/plans/2026-11-18-techdebt-a-db-tests.md').read()
wt = '/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/db-tests-selfcontained/'
blocks = re.findall(r"```sql\n(.*?)```", plan, re.S)
full = {
  'supabase/tests/0019_harden_player_file_helpers.test.sql': [b for b in blocks if b.startswith('begin;\nselect extensions.plan(32);')],
  'supabase/tests/0002_rls.test.sql': [b for b in blocks if b.startswith('begin;\nselect extensions.plan(6);')],
  'supabase/tests/0012_player_files_storage.test.sql': [b for b in blocks if b.startswith('begin;\nselect extensions.plan(28);')],
  'supabase/tests/0013_document_consent_rules.test.sql': [b for b in blocks if b.startswith('begin;\nselect extensions.plan(22);')],
  'supabase/migrations/0019_harden_player_file_helpers.sql': [b for b in blocks if b.startswith('-- only security definer code')],
}
bad = 0
for path, found in full.items():
    assert len(found) == 1, path
    if open(wt + path).read() != found[0]:
        bad += 1; print('DIFF', path)
partial = {
  'supabase/tests/0016_revoke_anon_privileges.test.sql': [b for b in blocks if 'B3 authenticated no longer executes' in b][0].strip(),
  'supabase/tests/0018_lock_player_on_file_write.test.sql': [b for b in blocks if 'p\\.id::text\\s*=' in b][0].strip(),
}
for path, text in partial.items():
    if text not in open(wt + path).read():
        bad += 1; print('MISSING', path)
print('OK' if bad == 0 else f'{bad} problem(s)')
EOF
```

(Primero `git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas pull --ff-only` en el checkout principal, sobre `develop`, para leer el plan mergeado.) Esperado: `OK`. Cualquier `DIFF`/`MISSING` → detenerse: o el implementer se desvió del plan o el plan cambió; se resuelve antes de O2, nunca se corre un SQL distinto al revisado.

- [ ] **Step O2: Rojo de 0019 (sin aplicar)**

1. **Test de 0019:** forma MCP de `supabase/tests/0019_harden_player_file_helpers.test.sql`. Expected: 32 filas; `not ok 4`, `not ok 5`, `not ok 6`, `not ok 10`, `not ok 16`; todas las demás `ok`.
2. **B1–B4 de 0016** (catálogo, sin fixtures): una llamada con dos sentencias, `select extensions.plan(7);` y el bloque de las líneas 62–74 del archivo editado copiado tal cual, quitando el `union all ` inicial de la línea 62 y terminando la línea 74 con `;`. Expected: 7 filas; `ok 1` … `ok 4`, `not ok 5` (B3 de `player_consent_granted`), `ok 6`, `ok 7`.

Si el patrón es otro, detenerse y diagnosticar con `superpowers:systematic-debugging`.

- [ ] **Step O2b: Los tests reescritos, antes de aplicar**

Prueba que las reescrituras son correctas por sí mismas (0019 no cambia ninguno de sus resultados). En serie (0012, 0013 y 0018 comparten `cccccccc-`):

1. `0002_rls.test.sql` → 6 filas, todas `ok`.
2. `0012_player_files_storage.test.sql` → 28 filas, todas `ok`.
3. `0013_document_consent_rules.test.sql` → 22 filas, todas `ok`.
4. `0018_lock_player_on_file_write.test.sql` → 19 filas, todas `ok` (la aserción 4 acepta la forma de 0018).

Si la fila 26 de 0012 (`admin X cannot move a file onto a path the consent lock blocks`) sale `not ok` con otro mensaje, o la 27 hace fallar la llamada, el `UPDATE` choca con algún trigger de Storage de los listados en O1 y no con la policy: detenerse, diagnosticar y mandar la corrección al implementer (no relajar la aserción a solo `42501`). Cualquier otro `not ok` es un error de la reescritura: el implementer lo corrige en la rama y se repite O2b.

- [ ] **Step O3: Revisión pre-PR**

Revisión de código de la rama. **Si no sale limpia, no se aplica nada**: el implementer corrige en la rama y se repiten O2 y O2b.

- [ ] **Step O4: Aplicar**

`apply_migration` con `name: "0019_harden_player_file_helpers"` y el contenido del archivo. `list_migrations` → aparece `0019_harden_player_file_helpers`. `get_advisors` `type: "security"` → solo `auth_leaked_password_protection`.

- [ ] **Step O5: Verde**

1. Test de 0019 (misma llamada que O2.1). Expected: 32 filas, `ok 1` … `ok 32`.
2. B1–B4 de 0016 (misma llamada que O2.2). Expected: `ok 1` … `ok 7`.

- [ ] **Step O6: Regresiones**

En serie, forma MCP de cada archivo del worktree:

1. **R-0012:** `0012_player_files_storage.test.sql` → 28 filas, todas `ok`.
2. **R-0013:** `0013_document_consent_rules.test.sql` → 22 filas, todas `ok` (los triggers llaman a `player_consent_granted` como `authenticated` después del revoke).
3. **Test de 0018:** `0018_lock_player_on_file_write.test.sql` → 19 filas, todas `ok` (la aserción 4 ahora casa con la forma de 0019).
4. **R-0002:** `0002_rls.test.sql` → 6 filas, todas `ok`.

(Ya no hacen falta los bloques de fixtures/limpieza de `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` l.501–581: los archivos los traen.)

- [ ] **Step O7: E2E contra la API real de Storage (Playwright)**

Igual que Step O7 del plan `docs/superpowers/plans/2026-11-17-security-data-debt.md` (l.429–441), con el jugador `E2E Path 0019`. Entorno como en el Step E0 del plan del 2026-10-16 (l.778–782): worktree detached en `origin/develop` **con 0019 ya aplicada** (la rama todavía no está mergeada; el frontend no cambia, así que `origin/develop` sirve), `.env`, `pnpm dev --port 5173 --strictPort`, Chromium persistente por CDP con el admin ya logueado; nunca `browser.close()`. Archivos de prueba en el scratchpad: un PDF mínimo y un JPG pequeño.

1. **Fixture:** como admin en la UI, crea el jugador `E2E Path 0019`. Con `execute_sql`: `select p.id, p.tenant_id from public.players p where p.full_name = 'E2E Path 0019';` → 1 fila; guarda `tenant`, `player` y el `id` de su fila `privacy_notice` en `documents`. Pon Consentimiento de imagen y Aviso de privacidad en `Físico` en la UI.
2. **Foto con `upsert: true`:** `Subir foto` con el JPG → la foto se ve. `Cambiar` con el mismo JPG (segunda subida al mismo path, ejercita el UPDATE de la policy) → se ve. SQL: `select count(*) from storage.objects where name = '<tenant>/<player>/photo'` → `1`.
3. **CURP:** CURP → `Digital`, sube el PDF → chip `Digital`. SQL: el objeto `<tenant>/<player>/curp` existe.
4. **Revocación con archivo:** PATCH directo a la fila `privacy_notice` (`/rest/v1/documents?id=eq.<doc>`, cuerpo `{"status":"pendiente"}`, con el token de la sesión admin dentro de `page.evaluate`) → 4xx con `consent_in_use`.
5. **Solo el objeto bloquea:** CURP → `Físico` (confirma `Eliminar archivo`) y `Quitar` la foto (confirma `Quitar foto`). Por la API de Storage con la sesión admin (`POST /storage/v1/object/player-files/<tenant>/<player>/birth_certificate` con `x-upsert: true` y el PDF) → `200`. Repite el PATCH del punto 4 → 4xx con `consent_in_use`.
6. **Después de revocar:** borra ese objeto por la API de Storage (`supabase.storage.from('player-files').remove([...])` en `page.evaluate`), repite el PATCH → `200` y la fila queda `pendiente`. Repite la subida del punto 5 → 4xx con `new row violates row-level security policy`.
7. **Ruta con uuid en mayúsculas (nuevo, #48.2), con control positivo primero:**
   1. Recarga la página del jugador y pon Aviso de privacidad en `Físico` en la UI. SQL: `select status from public.documents where player_id = '<player>' and doc_type = 'privacy_notice'` → `fisico` (y `image_consent` sigue `fisico`). Si no, no seguir: el control no vale.
   2. **Control positivo:** `POST /storage/v1/object/player-files/<tenant>/<player>/birth_certificate` (uuid en minúsculas, tal cual) con la sesión admin, `x-upsert: true` y el PDF → `200`. Así el rechazo del punto 4 no puede deberse a falta de consentimiento.
   3. Borra ese objeto por la API de Storage (`remove([...])` en `page.evaluate`). SQL: `select count(*) from storage.objects where name like '<tenant>/<player>/%'` → `0`.
   4. **Caso:** el mismo `POST` con el segmento del jugador en MAYÚSCULAS (`<tenant>/<PLAYER EN MAYÚSCULAS>/birth_certificate`) → 4xx con `new row violates row-level security policy` (no 500, no `22P02`). SQL: `select count(*) from storage.objects where lower(name) like '<tenant>/<player>/%'` → `0`.
8. **Limpieza (siempre, también si falló cualquier punto anterior, y antes de diagnosticar):** objetos solo por la API de Storage con la sesión admin (nunca por SQL). `select count(*) from storage.objects where name like '<tenant>/<player>/%'` → `0`. Luego, como `postgres` por MCP, `delete from public.players where id = '<player>' and full_name = 'E2E Path 0019';` → `select count(*) from public.players where full_name = 'E2E Path 0019'` → `0`. Baseline → igual a O1.

Cualquier fallo en 2–7 es bloqueante: correr la limpieza del punto 8, no mergear y diagnosticar con `superpowers:systematic-debugging` (si lo causa 0019, ver el inverso abajo).

Después: PR a `develop` con `Closes #47`, `Closes #48`, `Closes #69`, `Closes #91`, `Closes #111`, las salidas de O1 (invocadores y triggers), O2, O2b, O4, O5, O6, O7 y la línea `0019 applied to remote eksbaugyypadtanyjcje on <fecha> before merge`; merge.

**Si 0019 rompe algo ya aplicada:** no parchar hacia adelante; escalar al owner. El inverso es volver a aplicar el `create or replace function` de `0018_lock_player_on_file_write.sql` tal cual (líneas 1–39, con su `grant`) más `grant execute on function private.player_consent_granted(uuid) to authenticated;`, como la siguiente migración libre.

---

## Discrepancias con el spec y los issues

- **#47 no tiene rojo.** Sus tres casos prueban comportamiento que ya existe desde 0012/0013 (policies de Storage y exención de consentimiento), así que pasan antes y después de 0019. Su evidencia es O2b y O6, no un ciclo rojo→verde. El caso (a) fija el mensaje completo de RLS para que un `42501` por otra causa (por ejemplo, un trigger de Storage) no lo haga pasar.
- **0016 B3 cambia.** El spec no lo menciona, pero `0016_revoke_anon_privileges.test.sql` l.72 afirma que `authenticated` ejecuta `player_consent_granted`: con #48.1 esa aserción se invierte (Step 2). Las B3 de los otros tres helpers no cambian.
- **La aserción 4 de 0018 acepta las dos formas.** El spec pide ajustarla "en el mismo cambio"; aquí se ajusta para que tolere espacios (#111.2) y acepte solo `p.id::text = v_parts[2]` o `p.id = v_parts[2]::uuid` (alternativa explícita, no dos grupos opcionales independientes). Así el test de 0018 sigue vigilando el candado y no se vuelve rojo antes de aplicar; la forma nueva la fija el test de 0019 (aserciones 4–6).
- **Mismo nit que #69 en 0015.** `0015_players_view_status_columns.test.sql` l.4 tiene el mismo comentario "see plan Task 1 fixture block"; se corrige junto con 0014 (Step 7).
- **#69 punto 2 no requiere cambio.** El issue dice que se cambie a `tests.act_as` solo si algún día hay un schema `tests` compartido; este lote hace lo contrario (0002 deja de usarlo), así que el `set_config` en línea de 0014 se queda.
- **R-0002/R-0012/R-0013 cambian de forma.** El plan del 2026-10-16 armaba esas regresiones con bloques de fixtures externos. Después de esta rama se corren con la forma MCP del archivo canónico, y sus conteos pasan a 6, 28 y 22. La nota de "obsoleto" en ese plan la agrega el lote B (dueño del archivo), no este lote.
- **El runbook de restauración no reaplicaba 0018** (hueco previo a este lote, encontrado en la revisión adversarial): el Step 9b lo corrige junto con 0019. Por eso este lote depende del merge de K, que también edita `docs/ops/backups.md`.
- **0014 y 0015 no reciben limpieza en línea.** El spec pide fixtures en línea (ya los tienen) y nada de `reset()`/`tests`; sus formas R-0014/R-0015 con limpieza siguen en el plan del 2026-10-16. Este lote no los corre porque solo cambia un comentario.
- Los números de línea que citan los issues (#48 `0012…sql:56`, `:38-40`) coinciden con el código actual; la comparación por texto vive hoy en `0018_lock_player_on_file_write.sql` l.23, no en 0012, y es la que reemplaza 0019.
