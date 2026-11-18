# Deuda técnica de seguridad y datos (#44, #46, #73) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y su spec se mergean a `develop` en un PR de docs **antes** de despachar a cualquier implementer. Cada implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Cerrar tres huecos antes de cargar datos reales: nadie borra jugadores por la API (#44), una subida a `player-files` y una revocación de consentimiento del mismo jugador quedan en fila (#46), y las tres lecturas a nivel tenant traen todas las filas aunque pasen el `max-rows` de PostgREST (#73).

**Architecture:** Dos migraciones independientes sobre la base remota: `0017` quita la policy de borrar y los privilegios `DELETE` y `TRUNCATE` de `public.players` para `authenticated`; `0018` reemplaza `private.player_file_path_allowed` por una versión `volatile` que toma `FOR SHARE` sobre el jugador antes del chequeo de consentimiento. En el frontend, un helper `fetchAllRows` en `src/lib/` pide bloques de 1000 con `.range()` hasta recibir un bloque vacío y descarta filas repetidas por clave; `fetchPlayers`, `fetchPaymentStatuses` y `fetchOutstandingPayments` lo usan con un orden estable (desempate por columna única).

**Tech Stack:** Postgres en Supabase remoto (`eksbaugyypadtanyjcje`) vía Supabase MCP (`apply_migration`, `execute_sql`, `get_advisors`, `list_migrations`), pgTAP en el schema `extensions`; Playwright (orquestador); React 19 / Vite / `@supabase/supabase-js` 2.108 / Vitest 4 / TypeScript (`tsc -b`) / ESLint / pnpm.

**Spec:** `docs/superpowers/specs/2026-11-17-security-data-debt-design.md` (léelo antes de empezar; los números de sección de abajo se refieren a él).

## Global Constraints

- Tres tareas = tres ramas independientes, cada una cortada de `origin/develop` (con este plan ya mergeado), sin dependencias de código entre sí (spec §6): Task 1 `fix/forbid-player-delete` (#44), Task 2 `fix/lock-player-file-write` (#46), Task 3 `fix/paginate-tenant-reads` (#73). Los implementers pueden trabajar en paralelo; los pasos de base de datos del orquestador van **en serie** (una tarea a la vez).
- Worktrees: los crea el orquestador antes de despachar, en `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/<slug>` con slug `forbid-player-delete`, `lock-player-file-write` y `paginate-tenant-reads`. En este plan `$WT` es la ruta absoluta del worktree. La primera acción del implementer es `pnpm install --frozen-lockfile` dentro de él. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge: su parte termina en commit + reporte al orquestador. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- Números de migración fijos: `0017_forbid_player_delete.sql` (Task 1), `0018_lock_player_on_file_write.sql` (Task 2). El `name` de `apply_migration` es el nombre del archivo sin `.sql`.
- Código, identificadores, SQL, comentarios y mensajes de commit: inglés. Comentarios solo para un *por qué* no obvio, una línea corta. Cada mensaje de commit termina con la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`.
- Cada rama cierra con los tres en verde: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`. Los conteos de tests se expresan como delta sobre el baseline que mide el implementer en su Step 0 (`B_files`, `B_tests`).

### Base de datos (Tasks 1 y 2)

- **Quién corre qué.** Los implementers **nunca** usan el Supabase MCP ni llegan a la base de otra forma: escriben la migración, el test (y en Task 1 el ajuste de A2), corren `vitest`/`tsc -b`/`lint`, hacen commit y reportan. **Todo** paso marcado **Orquestador [MCP]** (baseline, rojo, `apply_migration`, advisors, verde, regresiones) lo corre el orquestador, en serie entre tareas.
- **Orden por migración (spec §6):** commit del implementer → orquestador: baseline + corrida en **rojo** (migración **sin** aplicar) → revisión de código pre-PR → **solo si la revisión sale limpia**: `apply_migration` → advisors → corrida en **verde** → regresiones → PR y merge. **Nada se aplica a la base viva antes de que la revisión salga limpia.** Si la revisión pide cambios, el implementer los hace en la misma rama y el orquestador repite el rojo antes de aplicar.
- No hay Docker, stack local ni `pg_prove`. El MCP no puede crear branches: todo SQL pega en el proyecto vivo.
- Fixtures: prefijo `ffffffff-` (Task 1) y `cccccccc-` (Task 2, los mismos de 0012). Nunca tocar el jugador real ni su objeto en `player-files`. Baseline al 2026-11-17: 1 jugador, 0 pagos, 1 objeto en `player-files`.
- **Harness pgTAP por MCP.** `execute_sql` devuelve solo el resultado de la última sentencia y corre toda la llamada en una transacción (un error revierte todo; éxito confirma todo). Los archivos canónicos `supabase/tests/00XX_*.test.sql` mantienen la forma `begin; plan; …; finish; rollback;`, con sus fixtures arriba y su limpieza abajo. Para correr uno por MCP se copia **todo** el archivo en una sola llamada aplicando estas reglas mecánicas (harness `tap` de `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md`, sección "Regression calls", l.421–432):
  1. `begin;` → `create temp table tap (line text); grant all on tap to public;`
  2. Cada línea que empieza con `select extensions.is(` → `insert into tap select extensions.is(`
  3. `select * from extensions.finish();` y `rollback;` → `select line from tap order by substring(line from '^(?:not )?ok (\d+)')::int;`

  Pasa si devuelve N filas y ninguna empieza con `not ok`. La limpieza del archivo corre dentro de la misma llamada, así que una corrida exitosa no deja fixtures; una que falla se revierte entera.
- Los chequeos estructurales con helpers de pgTAP que llaman `ok()` internamente (`col_is_unique`, `fk_ok`, `policies_are`, …) no se usan: todo es `extensions.is()` sobre SELECTs de catálogo (`pg_policies`, `pg_proc`, `has_table_privilege`, `has_function_privilege`, `pg_get_functiondef`).
- **Baseline query** (antes y después de cada corrida):

```sql
select (select count(*) from public.tenants) as tenants, (select count(*) from public.profiles) as profiles,
       (select count(*) from auth.users) as users, (select count(*) from public.players) as players,
       (select count(*) from public.documents) as documents, (select count(*) from public.payments) as payments,
       (select count(*) from storage.objects where bucket_id = 'player-files') as objects;
```

- Si un `DELETE` o cualquier llamada por MCP falla con "Invalid or expired requestState": correr la baseline query y la residue query de la tarea, confirmar que nada cambió y reintentar una vez. Si sigue fallando, detenerse (hace falta re-autenticar `/mcp`).
- Después de cada `apply_migration`: `mcp__supabase__get_advisors` con `type: "security"`. Esperado: solo `auth_leaked_password_protection` (aceptado). Cualquier otro lint nuevo → detenerse y escalar al owner.
- `list_migrations` puede mostrar como última entrada `0016_revoke_anon_privileges` o la migración de la otra tarea, según cuál se aplicó antes.

## Review Focus

- **Un servidor con `max-rows` menor a 1000** (alguien lo baja en el Dashboard): el primer bloque llega incompleto y la lectura tiene que seguir hasta un bloque vacío, avanzando por las filas recibidas, sin perder filas — fijado en Task 3, test `a server capped at 500 rows…`.
- **Un bloque intermedio que falla** (red, JWT expirado entre bloques): la lectura tiene que lanzar, nunca devolver una lista parcial que haga ver a un deudor como "Al corriente" — fijado en Task 3, test `an error in a later block throws…`.
- **Una fila repetida entre bloques** (alguien inserta un jugador antes de la fila 1000 mientras se lee): tiene que aparecer una sola vez, y el offset tiene que seguir avanzando por las filas recibidas — fijado en Task 3 con los tests de dedupe del helper y los de cada lectura (clave `id` / `player_id`). La fila **saltada** es riesgo aceptado (spec §5).
- **Dar de baja sigue funcionando** una vez que el borrado está prohibido: un admin puede poner `status = 'baja'` — fijado en Task 1, aserción 10 de `0017_forbid_player_delete.test.sql`.
- **La migración 0018 no cambia el resultado de ninguna ruta** (consentimiento, otro tenant, jugador inexistente, ruta malformada, uuid inválido que no debe lanzar `22P02`) ni el flujo real de Storage con `upsert: true`: fijado en Task 2 con los 10 casos de ruta y las 3 subidas de 0012 copiados al test de 0018, R-0012/R-0013 y el E2E de Storage.

---

## Task 1: Prohibir el borrado de jugadores (#44) — rama `fix/forbid-player-delete`

**Files:**
- Create: `supabase/migrations/0017_forbid_player_delete.sql`
- Create: `supabase/tests/0017_forbid_player_delete.test.sql`
- Modify: `supabase/tests/0016_revoke_anon_privileges.test.sql` (aserción A2, líneas 48–53)

**Interfaces:**
- Consumes: policy `players_delete` (0002 l.58, reescrita en 0003 l.42); privilegios de tabla de `authenticated` sobre `public.players`.
- Produces: `public.players` sin policy `DELETE` y sin privilegios `DELETE` ni `TRUNCATE` para `authenticated`; `service_role` y `postgres` sin cambios. Sin cambios de frontend (la app no tiene ningún `delete` sobre `players`).

### Implementer

- [ ] **Step 0: Preparar y medir el baseline**

`git -C $WT branch --show-current` → `fix/forbid-player-delete`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. Luego, en `$WT`, `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests` (todo verde).

- [ ] **Step 1: Escribir el test**

Crea `supabase/tests/0017_forbid_player_delete.test.sql` con exactamente este contenido:

```sql
begin;
select extensions.plan(10);

insert into public.tenants (id, name, slug) values
  ('ffffffff-0000-0000-0000-000000000001', 'ZZ No Delete X', 'zz-no-delete-x');
insert into auth.users (id, email) values
  ('ffffffff-1111-0000-0000-000000000001', 'admin-x@zz-no-delete.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('ffffffff-1111-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'ZZ Admin X', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('ffffffff-2222-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'ZZ Player P', '2015-06-10', 'Tutor', '111');

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

-- the forced error rolls the statement back even if it succeeds, so a TRUNCATE can never reach the live table
create or replace function pg_temp.as_role_undo(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('role', p_role, true);
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  begin
    execute p_sql;
    raise exception 'zz_undo';
  exception when others then
    r := case when sqlerrm = 'zz_undo' then 'ok' else sqlstate || ' ' || split_part(sqlerrm, ':', 1) end;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;
grant execute on function pg_temp.as_role(text, text, text), pg_temp.as_role_undo(text, text, text) to public;

select extensions.is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'players' and cmd in ('DELETE', 'ALL')),
  0, 'no DELETE policy on players');
select extensions.is(
  (select string_agg(policyname::text, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'players'),
  'players_insert,players_select,players_update', 'players keeps its select/insert/update policies');
select extensions.is(has_table_privilege('authenticated', 'public.players', 'DELETE'), false, 'authenticated has no DELETE on players');
select extensions.is(has_table_privilege('authenticated', 'public.players', 'TRUNCATE'), false, 'authenticated has no TRUNCATE on players');
select extensions.is(
  has_table_privilege('authenticated', 'public.players', 'SELECT') and has_table_privilege('authenticated', 'public.players', 'INSERT')
    and has_table_privilege('authenticated', 'public.players', 'UPDATE'),
  true, 'authenticated keeps SELECT/INSERT/UPDATE on players');
select extensions.is(has_table_privilege('service_role', 'public.players', 'DELETE'), true, 'service_role keeps DELETE on players');
select extensions.is(
  left(pg_temp.as_role('authenticated', '{"sub":"ffffffff-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$with w as (delete from public.players where id = 'ffffffff-2222-0000-0000-000000000001' returning 1) select count(*)::text from w$q$), 5),
  '42501', 'an admin DELETE through the API is denied');
select extensions.is(
  left(pg_temp.as_role_undo('authenticated', '{"sub":"ffffffff-1111-0000-0000-000000000001","role":"authenticated"}',
    'truncate public.players'), 5),
  '42501', 'an admin TRUNCATE is denied');
select extensions.is(
  (select count(*)::int from public.players where id = 'ffffffff-2222-0000-0000-000000000001'),
  1, 'the player still exists after the denied DELETE');
select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"ffffffff-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$with w as (update public.players set status = 'baja' where id = 'ffffffff-2222-0000-0000-000000000001' returning 1) select count(*)::text from w$q$),
  '1', 'an admin can still set a player to baja');

-- cleanup runs before finish() so the MCP form executes it; under rollback it is a no-op
delete from public.players where id = 'ffffffff-2222-0000-0000-000000000001';
delete from public.profiles where id = 'ffffffff-1111-0000-0000-000000000001';
delete from auth.users where id = 'ffffffff-1111-0000-0000-000000000001';
delete from public.tenants where id = 'ffffffff-0000-0000-0000-000000000001';

select * from extensions.finish();
rollback;
```

- [ ] **Step 2: Ajustar A2 en el test de 0016**

En `supabase/tests/0016_revoke_anon_privileges.test.sql`, la aserción A2 excluye `players` de forma explícita y lo dice en su descripción. Queda así (el resto del archivo no cambia; `plan(22)` sigue igual):

```sql
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'players'
     and not (has_table_privilege('authenticated', c.oid, 'SELECT') and has_table_privilege('authenticated', c.oid, 'INSERT')
              and has_table_privilege('authenticated', c.oid, 'UPDATE') and has_table_privilege('authenticated', c.oid, 'DELETE'))),
  0, 'A2 authenticated keeps SELECT/INSERT/UPDATE/DELETE on every public table except players (0017)')
```

- [ ] **Step 3: Escribir la migración**

Crea `supabase/migrations/0017_forbid_player_delete.sql` con exactamente:

```sql
drop policy players_delete on public.players;
revoke delete, truncate on public.players from authenticated;
```

- [ ] **Step 4: Verificación estática y frontend**

- `grep -c '^select extensions.is(' supabase/tests/0017_forbid_player_delete.test.sql` → `10` (igual a `plan(10)`).
- `grep -n "relname <> 'players'" supabase/tests/0016_revoke_anon_privileges.test.sql` → 1 línea.
- En `$WT`: `pnpm exec vitest run` → `B_files` / `B_tests`, todo verde; `pnpm exec tsc -b` → exit 0; `pnpm lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git -C $WT add supabase/migrations/0017_forbid_player_delete.sql supabase/tests/0017_forbid_player_delete.test.sql supabase/tests/0016_revoke_anon_privileges.test.sql
git -C $WT commit -m "fix: forbid deleting players through the API (#44)" -m "Deleting a player orphaned its photo and documents in player-files; baja is the only way to remove a player, so authenticated loses the DELETE policy and the DELETE and TRUNCATE privileges. 0016's A2 now excludes players explicitly." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada: primero el `add`, luego el `commit`.)

**Reporte del implementer:** SHA del commit, `B_files`/`B_tests`, salidas del Step 4. No corras SQL.

### Orquestador [MCP]

- [ ] **Step O1: Baseline**

`list_migrations` → la última entrada es `0016_revoke_anon_privileges` o `0018_lock_player_on_file_write` (nunca `0017`). Corre la baseline query y esta **residue query** (esperado: todo `0`; si no, limpiar antes de seguir):

```sql
select (select count(*) from public.tenants where id::text like 'ffffffff-%') as tenants,
       (select count(*) from auth.users where id::text like 'ffffffff-%') as users,
       (select count(*) from public.profiles where id::text like 'ffffffff-%') as profiles,
       (select count(*) from public.players where id::text like 'ffffffff-%' or tenant_id::text like 'ffffffff-%') as players,
       (select count(*) from public.documents where tenant_id::text like 'ffffffff-%') as documents;
```

- [ ] **Step O2: Rojo (0017 sin aplicar)**

Forma MCP del archivo del worktree (reglas del harness), una llamada a `execute_sql`.
Expected: 10 filas; `not ok 1`, `not ok 2`, `not ok 3`, `not ok 4`, `ok 5`, `ok 6`, `not ok 7`, `not ok 8`, `not ok 9`, `not ok 10`. (Hoy el admin sí borra al jugador fixture dentro de la transacción, así que 9 y 10 también fallan; el `TRUNCATE` de la fila 8 falla con `0A000` por las FK y, aunque no fallara, `as_role_undo` lo revierte.) Luego residue query → todo `0`; baseline query → igual a O1. Si el patrón es otro, detenerse y diagnosticar con `superpowers:systematic-debugging`.

- [ ] **Step O3: Revisión pre-PR**

Revisión de código de la rama. **Si no sale limpia, no se aplica nada**: el implementer corrige en la rama y se repite O2.

- [ ] **Step O4: Aplicar**

`apply_migration` con `name: "0017_forbid_player_delete"` y el contenido del archivo. `list_migrations` → aparece `0017_forbid_player_delete`. `get_advisors` `type: "security"` → solo `auth_leaked_password_protection`.

- [ ] **Step O5: Verde**

Misma llamada que O2. Expected: 10 filas, `ok 1` … `ok 10`. Residue → todo `0`; baseline → igual a O1.

- [ ] **Step O6: Regresiones**

1. **A1–A4 de 0016** (catálogo, sin fixtures): una llamada con dos sentencias, `select extensions.plan(4);` y el bloque de A1 a A4 copiado tal cual del archivo editado (desde el `select extensions.is(` de A1 hasta el cierre `)` de A4), terminado en `;`. Expected: `ok 1` … `ok 4`.
2. **R-0002**, exactamente como está en `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` l.434–499 (una llamada). Expected: 6 filas `ok 1` … `ok 6`. Luego la residue query de ese plan (l.305–320) → todo `0`/`null`, y la baseline query → igual a O1.

Después: PR a `develop` con las salidas de O2, O4, O5 y O6 y la línea `0017 applied to remote eksbaugyypadtanyjcje on <fecha> before merge`; merge.

**Si 0017 rompe algo ya aplicada:** no parchar hacia adelante; escalar al owner. El inverso es `create policy players_delete on public.players for delete to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin()); grant delete, truncate on public.players to authenticated;`.

---

## Task 2: Candado sobre el jugador al escribir archivos (#46) — rama `fix/lock-player-file-write`

**Files:**
- Create: `supabase/migrations/0018_lock_player_on_file_write.sql`
- Create: `supabase/tests/0018_lock_player_on_file_write.test.sql`

**Interfaces:**
- Consumes: `private.current_tenant_id()` (0003), `private.player_consent_granted(uuid)` (0012), el `select … for no key update` sobre el jugador en `private.enforce_document_rules` (0013), las 4 policies de `storage.objects` (0012, no cambian).
- Produces: `private.player_file_path_allowed(p_name text) returns boolean`, misma firma y mismo resultado para toda ruta, ahora `volatile` y con `for share` sobre la fila del jugador antes del chequeo de consentimiento; sigue `security definer`, `set search_path = ''` y ejecutable por `authenticated` (no por `anon`).

### Implementer

- [ ] **Step 0: Preparar y medir el baseline**

`git -C $WT branch --show-current` → `fix/lock-player-file-write`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests`.

- [ ] **Step 1: Escribir el test**

Crea `supabase/tests/0018_lock_player_on_file_write.test.sql` con exactamente este contenido. Las 10 aserciones de ruta y las 3 de subida son copia literal de `0012_player_files_storage.test.sql` (regresión, spec §4.2):

```sql
begin;
select extensions.plan(19);

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
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type in ('image_consent', 'privacy_notice');
delete from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'privacy_notice';
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'image_consent';

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
  'v', 'path helper is volatile');
select extensions.is(
  (select prosecdef from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  true, 'path helper is security definer');
select extensions.is(
  (select 'search_path=""' = any (proconfig) from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  true, 'path helper pins an empty search_path');
select extensions.is(
  (select d ~ 'from public\.players p\s+where p\.id::text = v_parts\[2\] and p\.tenant_id = v_tenant\s+for share;'
          and position('for share;' in d) < position('player_consent_granted' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'path helper locks the players row FOR SHARE before the consent check');
select extensions.is(has_function_privilege('authenticated', 'private.player_file_path_allowed(text)', 'EXECUTE'), true, 'authenticated executes the path helper');
select extensions.is(has_function_privilege('anon', 'private.player_file_path_allowed(text)', 'EXECUTE'), false, 'anon cannot execute the path helper');

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
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo')$q$),
  'ok', 'admin X uploads a photo for a consented player');
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp')$q$), 5),
  '42501', 'admin X cannot upload a document for a player without consent');
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/image_consent')$q$),
  'ok', 'admin X uploads a consent document without prior consent');

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

- [ ] **Step 2: Escribir la migración**

Crea `supabase/migrations/0018_lock_player_on_file_write.sql`. Es el `create or replace function private.player_file_path_allowed(p_name text)` de `0012_player_files_storage.sql` (líneas 20–54) **con el mismo cuerpo**, salvo estos cambios (spec §4.2):

1. `stable` → `volatile`.
2. El `select` del jugador queda exactamente así (la aserción 4 lo busca con esa forma; conserva el comentario existente encima):

```sql
  -- compared as text: a uuid cast would raise 22P02 inside the policy instead of returning false
  -- the share lock queues this write behind a consent revocation's no key update lock (0013)
  select p.id into v_player
  from public.players p
  where p.id::text = v_parts[2] and p.tenant_id = v_tenant
  for share;
```

3. Al final del archivo, `grant execute on function private.player_file_path_allowed(text) to authenticated;` (igual que 0012). Ningún `grant` a `public` ni a `anon`; las policies de `storage.objects` no se tocan.

El chequeo de consentimiento (`return private.player_consent_granted(v_player);`) queda como sentencia aparte **después** del `select … for share`, como ya está en 0012.

- [ ] **Step 3: Verificación estática y frontend**

- `grep -c '^select extensions.is(' supabase/tests/0018_lock_player_on_file_write.test.sql` → `19`.
- `grep -n 'for share' supabase/migrations/0018_lock_player_on_file_write.sql` → 1 línea (`  for share;`); `grep -n 'volatile' …` → 1 línea; `grep -c 'stable' …` → `0`.
- En `$WT`: `pnpm exec vitest run` → `B_files` / `B_tests`, todo verde; `pnpm exec tsc -b` → exit 0; `pnpm lint` → exit 0.

- [ ] **Step 4: Commit**

```bash
git -C $WT add supabase/migrations/0018_lock_player_on_file_write.sql supabase/tests/0018_lock_player_on_file_write.test.sql
git -C $WT commit -m "fix: lock the player while checking a file write against consent (#46)" -m "An upload and a consent revocation for the same player could both pass their checks; the path helper now takes FOR SHARE on the player, which conflicts with the revocation's FOR NO KEY UPDATE, so the two run in order." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

**Reporte del implementer:** SHA, `B_files`/`B_tests`, salidas del Step 3. No corras SQL.

### Orquestador [MCP]

- [ ] **Step O1: Baseline**

`list_migrations` → la última entrada es `0016_revoke_anon_privileges` o `0017_forbid_player_delete` (nunca `0018`). Baseline query y **residue query** (esperado: todo `0`):

```sql
select (select count(*) from public.tenants where id::text like 'cccccccc-%') as tenants,
       (select count(*) from auth.users where id::text like 'cccccccc-%') as users,
       (select count(*) from public.profiles where id::text like 'cccccccc-%') as profiles,
       (select count(*) from public.players where id::text like 'cccccccc-%' or tenant_id::text like 'cccccccc-%') as players,
       (select count(*) from public.documents where tenant_id::text like 'cccccccc-%') as documents,
       (select count(*) from storage.objects where bucket_id = 'player-files' and name like 'cccccccc-%') as objects;
```

- [ ] **Step O2: Rojo (0018 sin aplicar)**

Forma MCP del archivo, una llamada. Expected: 19 filas; `not ok 1` (hoy es `s`) y `not ok 4` (no hay `for share`), todas las demás `ok`. Residue → todo `0`; baseline → igual a O1 (sigue habiendo exactamente 1 objeto real en `player-files`). Si el patrón es otro, detenerse y diagnosticar.

- [ ] **Step O3: Revisión pre-PR**

Revisión de código de la rama. **Si no sale limpia, no se aplica nada**: el implementer corrige y se repite O2.

- [ ] **Step O4: Aplicar**

`apply_migration` con `name: "0018_lock_player_on_file_write"`. `list_migrations` → aparece. `get_advisors` `type: "security"` → solo `auth_leaked_password_protection`.

- [ ] **Step O5: Verde**

Misma llamada que O2. Expected: 19 filas, `ok 1` … `ok 19`. Residue → todo `0`; baseline → igual a O1.

- [ ] **Step O6: Regresiones R-0012 y R-0013**

Tal como están en `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md`: reglas l.421–432, bloque compartido de fixtures/limpieza l.501–532, **R-0012** l.534–577 (Expected: 25 filas, todas `ok`) y **R-0013** l.579–581 (Expected: 21 filas, todas `ok`). Una llamada cada una, en serie (comparten los UUID `cccccccc-` con el test de 0018). Después de cada una: residue query de O1 → todo `0`; baseline → igual a O1.

- [ ] **Step O7: E2E de #46 contra la API real de Storage (Playwright)**

Entorno como en el Step E0 del plan del 2026-10-16 (l.778–782): worktree detached en `origin/develop` con `.env`, `pnpm dev --port 5173 --strictPort`, Chromium persistente por CDP con el admin ya logueado; nunca `browser.close()`. Archivos de prueba en el scratchpad: un PDF mínimo y un JPG pequeño.

1. **Fixture:** como admin en la UI, crea el jugador `E2E Lock 0018`. Con `execute_sql`: `select p.id, p.tenant_id from public.players p where p.full_name = 'E2E Lock 0018';` → 1 fila; guarda `tenant`, `player` y el `id` de su fila `privacy_notice` en `documents`. Pon Consentimiento de imagen y Aviso de privacidad en `Físico` en la UI.
2. **Foto con `upsert: true`:** `Subir foto` con el JPG → la foto se ve. `Cambiar` con el mismo JPG (segunda subida al mismo path, ejercita el UPDATE de la policy) → se ve. SQL: `select count(*) from storage.objects where name = '<tenant>/<player>/photo'` → `1`.
3. **CURP:** CURP → `Digital`, sube el PDF → chip `Digital`. SQL: el objeto `<tenant>/<player>/curp` existe.
4. **Revocación con archivo:** PATCH directo a la fila `privacy_notice` (`/rest/v1/documents?id=eq.<doc>`, cuerpo `{"status":"pendiente"}`, con el token de la sesión admin dentro de `page.evaluate`, como el probe de l.796–813 de ese plan) → 4xx con `consent_in_use`.
5. **Solo el objeto bloquea:** CURP → `Físico` (confirma `Eliminar archivo`) y `Quitar` la foto (confirma `Quitar foto`). Por la API de Storage con la sesión admin (`POST /storage/v1/object/player-files/<tenant>/<player>/birth_certificate` con `x-upsert: true` y el PDF) → `200`; la fila `birth_certificate` sigue `pendiente`, `photo_path` es `null`. Repite el PATCH del punto 4 → 4xx con `consent_in_use` (lo único que lo bloquea es el objeto en `storage.objects`).
6. **Después de revocar:** borra ese objeto por la API de Storage (`supabase.storage.from('player-files').remove([...])` en `page.evaluate`), repite el PATCH → `200` y la fila queda `pendiente`. Repite la subida del punto 5 → 4xx con `new row violates row-level security policy`.
7. **Limpieza:** objetos solo por la API de Storage (nunca por SQL). `select count(*) from storage.objects where name like '<tenant>/<player>/%'` → `0`. Luego, como `postgres` por MCP (0017 no le quita nada a `postgres`), `delete from public.players where id = '<player>';` → `select count(*) from public.players where full_name = 'E2E Lock 0018'` → `0`. Baseline → igual a O1.

Cualquier fallo en 2–6 es bloqueante: detenerse, no mergear y diagnosticar con `superpowers:systematic-debugging` (si lo causa 0018, ver el inverso abajo).

Después: PR a `develop` con O2, O4, O5, O6, O7 y la línea `0018 applied to remote eksbaugyypadtanyjcje on <fecha> before merge`, más la nota de que la concurrencia no se probó (spec §4.2, riesgos aceptados); merge.

**Si 0018 rompe algo ya aplicada:** no parchar hacia adelante; escalar al owner. El inverso es volver a aplicar el `create or replace function` de 0012 tal cual (líneas 20–54) más su `grant execute … to authenticated`.

---

## Task 3: Lecturas por bloques a nivel tenant (#73) — rama `fix/paginate-tenant-reads`

**Files:**
- Create: `src/lib/fetchAllRows.ts`
- Create: `src/lib/fetchAllRows.test.ts`
- Modify: `src/players/players.ts` (`fetchPlayers`, l.49–56)
- Modify: `src/players/players.test.ts` (mocks + `beforeEach` l.5–21 y l.39–53; tests de `fetchPlayers` l.68–80 y l.174–177)
- Modify: `src/payments/payments.ts` (`fetchPaymentStatuses` l.222–228, `fetchOutstandingPayments` l.230–238)
- Modify: `src/payments/payments.test.ts` (`mocks`, `query()`, `beforeEach` l.10–55; tests l.223–242)

**Interfaces:**
- Consumes: el query builder de `supabase-js` (es `PromiseLike<{ data, error }>`, verificado con `tsc --strict` contra 2.108 para las tres cadenas de abajo).
- Produces (en `src/lib/fetchAllRows.ts`):
  - `export const PAGE_SIZE = 1000`
  - `export interface PageResult<T> { data: T[] | null; error: { message: string } | null }`
  - `export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>, key: (row: T) => string): Promise<T[]>`
- El dedupe vive en el helper (decisión de este plan): cada lectura le pasa su clave. Las firmas y tipos de retorno de `fetchPlayers`, `fetchPaymentStatuses` y `fetchOutstandingPayments` no cambian; `DebtorsPage`, `PlayersPage`, el export a Excel y `routes.test.tsx` no se tocan.

- [ ] **Step 0: Preparar y medir el baseline**

`git -C $WT branch --show-current` → `fix/paginate-tenant-reads`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests`.

- [ ] **Step 1: Escribir los tests del helper**

Crea `src/lib/fetchAllRows.test.ts`:

```ts
import { expect, vi } from 'vitest'
import { PAGE_SIZE, fetchAllRows } from './fetchAllRows'
import type { PageResult } from './fetchAllRows'

function seq(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i)
}

function ok(data: number[]): PageResult<number> {
  return { data, error: null }
}

function pages(...results: PageResult<number>[]) {
  const page = vi.fn<(from: number, to: number) => Promise<PageResult<number>>>()
  for (const result of results) page.mockResolvedValueOnce(result)
  page.mockResolvedValue(ok([]))
  return page
}

const byValue = (n: number) => String(n)

test('blocks are 1000 rows, the PostgREST max-rows default', () => {
  expect(PAGE_SIZE).toBe(1000)
})

test('an empty table takes one request', async () => {
  const page = pages(ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([])
  expect(page.mock.calls).toEqual([[0, 999]])
})

test('a short block is not the end: it reads until an empty block', async () => {
  const page = pages(ok(seq(0, 3)), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1, 2])
  expect(page.mock.calls).toEqual([[0, 999], [3, 1002]])
})

test('1001 rows take three requests and keep their order', async () => {
  const page = pages(ok(seq(0, 1000)), ok([1000]), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual(seq(0, 1001))
  expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [1001, 2000]])
})

test('a server capped at 500 rows still reads everything, advancing by the rows received', async () => {
  const page = pages(ok(seq(0, 500)), ok(seq(500, 500)), ok(seq(1000, 200)), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual(seq(0, 1200))
  expect(page.mock.calls).toEqual([[0, 999], [500, 1499], [1000, 1999], [1200, 2199]])
})

test('an error in a later block throws instead of returning a partial list', async () => {
  const page = pages(ok(seq(0, 1000)), { data: null, error: { message: 'boom' } })
  await expect(fetchAllRows(page, byValue)).rejects.toThrow('boom')
  expect(page).toHaveBeenCalledTimes(2)
})

test('null data without an error ends the read', async () => {
  const page = pages(ok(seq(0, 3)), { data: null, error: null })
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1, 2])
  expect(page).toHaveBeenCalledTimes(2)
})

test('a row repeated across blocks appears once and the offset still advances by the rows received', async () => {
  const page = pages(ok([0, 1, 2]), ok([2, 3]), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1, 2, 3])
  expect(page.mock.calls).toEqual([[0, 999], [3, 1002], [5, 1004]])
})

test('the first occurrence of a repeated key wins', async () => {
  const page = vi.fn<(from: number, to: number) => Promise<PageResult<{ id: string; v: number }>>>()
  page.mockResolvedValueOnce({ data: [{ id: 'a', v: 1 }], error: null })
  page.mockResolvedValueOnce({ data: [{ id: 'a', v: 2 }, { id: 'b', v: 3 }], error: null })
  page.mockResolvedValue({ data: [], error: null })
  expect(await fetchAllRows(page, (r) => r.id)).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 3 }])
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm exec vitest run src/lib/fetchAllRows.test.ts`
Expected: FAIL, no se puede resolver `./fetchAllRows`.

- [ ] **Step 3: Implementar `fetchAllRows` en `src/lib/fetchAllRows.ts`**

Exporta `PAGE_SIZE`, `PageResult<T>` y `fetchAllRows<T>` con las firmas del bloque Interfaces. Algoritmo (spec §4.3): lleva un `offset` (filas **recibidas**, con duplicados), un `Set` de claves vistas y el arreglo de salida; en cada vuelta pide `page(offset, offset + PAGE_SIZE - 1)`; si viene `error`, `throw new Error(error.message)`; si `data` es `null` o vacío, devuelve la salida; si no, suma `data.length` al `offset` y agrega a la salida solo las filas cuya `key(row)` no estaba en el `Set`. Nunca corta por "bloque incompleto". Una línea de comentario sobre el corte, por ejemplo `// stop only on an empty block: a short one may just mean max-rows < PAGE_SIZE`.

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm exec vitest run src/lib/fetchAllRows.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Actualizar los tests de `fetchPlayers` (rojo)**

En `src/players/players.test.ts`:

1. Agrega `range: vi.fn(),` a `mocks` (después de `order`).
2. En `beforeEach`, reemplaza la línea `mocks.order.mockResolvedValue({ data: [row()], error: null })` y su comentario por:

```ts
  // read chain: from().select().order().order().range()  and  from().select().eq().maybeSingle()
  mocks.order.mockReturnValue({ order: mocks.order, range: mocks.range })
  mocks.range.mockImplementation(async (from: number) => ({ data: from === 0 ? [row()] : [], error: null }))
```

3. Reemplaza el test `fetchPlayers reads the category view ordered by name` por estos dos:

```ts
test('fetchPlayers reads the category view by name with an id tiebreak, block by block', async () => {
  const rows = await fetchPlayers()
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.select).toHaveBeenCalledWith('*')
  expect(mocks.order.mock.calls).toEqual([
    ['full_name', { ascending: true }], ['id', { ascending: true }],
    ['full_name', { ascending: true }], ['id', { ascending: true }],
  ])
  expect(mocks.range.mock.calls).toEqual([[0, 999], [1, 1000]])
  expect(rows).toHaveLength(1)
  expect(rows[0].category_name).toBe('Infantil Mayor')
})

test('fetchPlayers keeps the first copy of a player repeated across blocks', async () => {
  mocks.range.mockImplementation(async (from: number) => ({
    data: from === 0 ? [row()] : from === 1 ? [row({ full_name: 'Ana Ruiz (copia)' })] : [],
    error: null,
  }))
  const rows = await fetchPlayers()
  expect(rows.map((r) => r.full_name)).toEqual(['Ana Ruiz'])
  expect(mocks.range.mock.calls).toEqual([[0, 999], [1, 1000], [2, 1001]])
})
```

4. En `fetchPlayers returns [] when the view yields null data` cambia `mocks.order.mockResolvedValue(...)` por `mocks.range.mockResolvedValue({ data: null, error: null })`.
5. En `fetchPlayers throws when Supabase returns an error` cambia `mocks.order.mockResolvedValue(...)` por `mocks.range.mockResolvedValue({ data: null, error: { message: 'boom' } })`.

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: FAIL en `…id tiebreak, block by block`, `…repeated across blocks` y `fetchPlayers throws when Supabase returns an error`; el resto pasa.

- [ ] **Step 6: Implementar `fetchPlayers` con el helper**

En `src/players/players.ts`, importa `fetchAllRows` de `'../lib/fetchAllRows'` y haz que `fetchPlayers(): Promise<PlayerRow[]>` devuelva `fetchAllRows<PlayerRow>((from, to) => supabase.from('players_with_category').select('*').order('full_name', { ascending: true }).order('id', { ascending: true }).range(from, to), (row) => row.id)`. La query se arma dentro de la función de página (un builder de `supabase-js` no se reutiliza entre peticiones).

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: todo PASS.

- [ ] **Step 7: Actualizar los tests de pagos (rojo)**

En `src/payments/payments.test.ts`:

1. En `mocks` agrega `pages: [] as Array<{ data: unknown; error: { message: string } | null }>,`.
2. En `query()`, agrega `'range'` a la lista de métodos encadenables y resuelve la cola antes del resultado fijo, para que un test no deje al helper leyendo para siempre:

```ts
  q.then = (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
    Promise.resolve(mocks.pages.shift() ?? mocks.result).then(onOk, onErr)
```

3. Junto a `respond`, agrega:

```ts
function respondPages(...pages: unknown[][]) {
  mocks.pages = pages.map((data) => ({ data, error: null }))
}
```

4. En `beforeEach`, agrega `mocks.pages = []`.
5. Reemplaza los tests `fetchPaymentStatuses reads the view` y `fetchOutstandingPayments reads pendiente and parcial rows by date` por:

```ts
test('fetchPaymentStatuses reads the view by player_id, block by block', async () => {
  respondPages([state('p1', 'sin_pagos')], [])
  expect(await fetchPaymentStatuses()).toEqual([state('p1', 'sin_pagos')])
  expect(mocks.from).toHaveBeenCalledWith('player_payment_status')
  expect(called('select')).toEqual([['player_id, tenant_id, payment_state'], ['player_id, tenant_id, payment_state']])
  expect(called('order')).toEqual([['player_id', { ascending: true }], ['player_id', { ascending: true }]])
  expect(called('range')).toEqual([[0, 999], [1, 1000]])
})

test('fetchPaymentStatuses keeps the first row per player_id across blocks', async () => {
  respondPages([state('p1', 'sin_pagos')], [state('p1', 'al_corriente')], [])
  expect(await fetchPaymentStatuses()).toEqual([state('p1', 'sin_pagos')])
})

test('fetchOutstandingPayments reads pendiente and parcial rows by date with an id tiebreak, block by block', async () => {
  respondPages([row({ status: 'parcial', amount: '200.00' as unknown as number })], [])
  const rows = await fetchOutstandingPayments()
  expect(mocks.from).toHaveBeenCalledWith('payments')
  expect(called('in')).toEqual([['status', ['pendiente', 'parcial']], ['status', ['pendiente', 'parcial']]])
  expect(called('order')).toEqual([
    ['payment_date', { ascending: true }], ['id', { ascending: true }],
    ['payment_date', { ascending: true }], ['id', { ascending: true }],
  ])
  expect(called('range')).toEqual([[0, 999], [1, 1000]])
  expect(rows).toHaveLength(1)
  expect(rows[0].amount).toBe(200)
})

test('fetchOutstandingPayments keeps the first copy of a payment repeated across blocks', async () => {
  respondPages([row({ id: 'pay1', status: 'pendiente' })], [row({ id: 'pay1', amount: 999 }), row({ id: 'pay2', status: 'parcial' })], [])
  const rows = await fetchOutstandingPayments()
  expect(rows.map((r) => [r.id, r.amount])).toEqual([['pay1', 500], ['pay2', 500]])
})
```

Los tests `… throws on error` no cambian (con la cola vacía, `respond(null, { message: 'boom' })` hace fallar el primer bloque).

Run: `pnpm exec vitest run src/payments/payments.test.ts`
Expected: FAIL en los cuatro tests nuevos/reemplazados (no hay `range` ni dedupe); el resto pasa.

- [ ] **Step 8: Implementar las dos lecturas de pagos con el helper**

En `src/payments/payments.ts`, importa `fetchAllRows` de `'../lib/fetchAllRows'`:
- `fetchPaymentStatuses(): Promise<PaymentStatusRow[]>` → `fetchAllRows<PaymentStatusRow>` sobre `from('player_payment_status').select('player_id, tenant_id, payment_state').order('player_id', { ascending: true }).range(from, to)`, clave `(row) => row.player_id` (`player_id` es único en la vista: `group by p.id`).
- `fetchOutstandingPayments(): Promise<PaymentRow[]>` → `fetchAllRows<PaymentRow>` sobre `from('payments').select(PAYMENT_COLUMNS).in('status', ['pendiente', 'parcial']).order('payment_date', { ascending: true }).order('id', { ascending: true }).range(from, to)`, clave `(row) => row.id`, y después `.map(normalizeRow)` sobre el resultado completo.

El comentario existente `// Con adeudo follows the open rows, not the view: the two reads are not atomic` se queda donde está.

Run: `pnpm exec vitest run src/payments/payments.test.ts`
Expected: todo PASS.

- [ ] **Step 9: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files + 1` archivos, `B_tests + 12` tests (9 del helper + 1 de jugadores + 2 de pagos), todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 10: Commit**

```bash
git -C $WT add src/lib/fetchAllRows.ts src/lib/fetchAllRows.test.ts src/players/players.ts src/players/players.test.ts src/payments/payments.ts src/payments/payments.test.ts
git -C $WT commit -m "fix: read tenant-wide lists in blocks past the PostgREST row cap (#73)" -m "fetchPlayers, fetchPaymentStatuses and fetchOutstandingPayments were silently truncated at max-rows, which could show a debtor as Al corriente. They now page with range() until an empty block, ordered by a unique tiebreaker, and drop rows repeated across blocks by key." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

**Reporte al orquestador:** SHA, `B_files`/`B_tests` y conteos finales, salidas de los pasos rojo (5, 7) y verde (4, 6, 8, 9).

**Verificación en navegador (orquestador, después del commit y la revisión, spec §6).** Con los datos de hoy (1 jugador, 0 pagos), dev server y la sesión admin de Playwright, mirando las peticiones a `/rest/v1/` (supabase-js manda `.range(from, to)` como `offset=from&limit=to-from+1`). `main.tsx` usa `StrictMode`, así que en dev cada carga puede aparecer duplicada completa; cuenta por carga:
- **Jugadores (`/`):** 2 GET a `players_with_category`: `offset=0&limit=1000` → 1 fila; `offset=1&limit=1000` → `[]`. La lista muestra al jugador.
- **Quién debe (`/quien-debe`):** 5 GET: `players_with_category` `offset=0` (1 fila) y `offset=1` (`[]`); `player_payment_status` `offset=0` (1 fila) y `offset=1` (`[]`); `payments` con `status=in.(pendiente,parcial)` solo `offset=0` (`[]`). La página carga sin error y muestra al jugador en su grupo como antes.

---

## Discrepancias con el spec

- **Los tests existentes se rompen, no solo se mockean "como hoy".** El mock de `payments.test.ts` devuelve el mismo resultado a toda petición: con el corte en bloque vacío, `respond([fila])` dejaría al helper leyendo para siempre. El de `players.test.ts` resuelve en `order()` y no tiene `range`. Task 3 cambia los dos mocks (cola de bloques en pagos, `range` por offset en jugadores) y reescribe 5 tests existentes. El spec ya lo menciona (§4.3, revisión del 2026-11-18).
- **Harness pgTAP:** en lugar de la forma "dos sentencias, `plan` + un solo `union all`", los tests de 0017/0018 corren por MCP con el harness `tap` (fixtures, aserciones y limpieza en una sola llamada transaccional), ya verificado en el plan del 2026-10-16. Así un fallo no deja fixtures en la base viva. La forma de dos sentencias se usa solo para la regresión A1–A4 de 0016, que no tiene fixtures.
- El spec §3 decía "hasta recibir un bloque incompleto" para #73 A, en contra de §4.3; quedó corregido a "bloque vacío".
