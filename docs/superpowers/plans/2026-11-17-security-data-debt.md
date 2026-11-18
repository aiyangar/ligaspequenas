# Deuda técnica de seguridad y datos (#44, #46, #73) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar tres huecos antes de cargar datos reales: nadie borra jugadores por la API (#44), una subida a `player-files` y una revocación de consentimiento del mismo jugador quedan en fila (#46), y las tres lecturas a nivel tenant traen todas las filas aunque pasen el `max-rows` de PostgREST (#73).

**Architecture:** Dos migraciones independientes sobre la base remota: `0017` quita la policy y el privilegio `DELETE` de `public.players` para `authenticated`; `0018` reemplaza `private.player_file_path_allowed` por una versión `volatile` que toma `FOR SHARE` sobre el jugador antes del chequeo de consentimiento. En el frontend, un helper `fetchAllRows` en `src/lib/` pide bloques de 1000 con `.range()` hasta recibir un bloque vacío, y `fetchPlayers`, `fetchPaymentStatuses` y `fetchOutstandingPayments` lo usan con un orden estable (desempate por columna única).

**Tech Stack:** Postgres en Supabase remoto (`eksbaugyypadtanyjcje`) vía Supabase MCP (`apply_migration`, `execute_sql`, `get_advisors`, `list_migrations`), pgTAP en el schema `extensions`; React 19 / Vite / `@supabase/supabase-js` 2.108 / Vitest 4 / TypeScript (`tsc -b`) / ESLint / pnpm.

**Spec:** `docs/superpowers/specs/2026-11-17-security-data-debt-design.md` (léelo antes de empezar; los números de sección de abajo se refieren a él).

## Global Constraints

- Tres tareas = tres ramas independientes, cada una cortada de `origin/develop`, en paralelo y sin dependencias entre sí (spec §6): Task 1 `fix/forbid-player-delete` (#44), Task 2 `fix/lock-player-file-write` (#46), Task 3 `fix/paginate-tenant-reads` (#73).
- Worktrees: los crea el orquestador antes de despachar, en `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/<slug>` con slug `forbid-player-delete`, `lock-player-file-write` y `paginate-tenant-reads`. En este plan `$WT` es la ruta absoluta de tu worktree. Tu primera acción es `pnpm install --frozen-lockfile` dentro de él. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. Nunca push, PR ni merge: la tarea termina en commit + reporte al orquestador. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- Números de migración fijos: `0017_forbid_player_delete.sql` (Task 1), `0018_lock_player_on_file_write.sql` (Task 2). El `name` de `apply_migration` es el nombre del archivo sin `.sql`.
- Código, identificadores, SQL, comentarios y mensajes de commit: inglés. Comentarios solo para un *por qué* no obvio, una línea corta. Cada mensaje de commit termina con la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`.
- Cada rama cierra con los tres en verde: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`. Los conteos de tests se expresan como delta sobre el baseline que mides en el Step 0 (`B_files`, `B_tests`).

### Base de datos (Tasks 1 y 2)

- No hay Docker, stack local ni `pg_prove`. Las migraciones se aplican a la base **remota** con `mcp__supabase__apply_migration` y los tests se corren ahí con `mcp__supabase__execute_sql`. El MCP no puede crear branches: todo SQL pega en el proyecto vivo.
- Los pasos marcados **[MCP]** usan esas tools. Si tu sesión no las tiene o no están autenticadas, detente en el primer paso [MCP], haz commit de lo que ya escribiste y repórtalo; el orquestador corre los pasos [MCP]. No busques otra forma de llegar a la base.
- Fixtures: prefijo `ffffffff-` (Task 1) y `cccccccc-` (Task 2, los mismos de 0012). Nunca toques el jugador real ni su objeto en `player-files`. Baseline al 2026-11-17: 1 jugador, 0 pagos, 1 objeto en `player-files`.
- **Harness pgTAP por MCP.** `execute_sql` devuelve solo el resultado de la última sentencia y corre toda la llamada en una transacción (un error revierte todo; éxito confirma todo). Los archivos canónicos `supabase/tests/00XX_*.test.sql` mantienen la forma `begin; plan; …; finish; rollback;`, con sus fixtures arriba y su limpieza abajo. Para correr uno por MCP se copia **todo** el archivo en una sola llamada aplicando estas reglas mecánicas (es el harness `tap` verificado en `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md`, "Regression calls"):
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

- Si un `DELETE` o cualquier llamada por MCP falla con "Invalid or expired requestState": corre la baseline query y la residue query de tu tarea, confirma que nada cambió y reintenta una vez. Si sigue fallando, detente y reporta (hace falta re-autenticar `/mcp`).
- Después de cada `apply_migration`: `mcp__supabase__get_advisors` con `type: "security"`. Esperado: solo `auth_leaked_password_protection` (aceptado). Cualquier otro lint nuevo → detente y reporta.
- Las Tasks 1 y 2 pueden correr a la vez sobre la misma base: por eso `list_migrations` puede mostrar como última entrada `0016_revoke_anon_privileges` o la migración de la otra tarea. Si la baseline query cambia durante tu corrida, corre también la residue query de la otra tarea antes de concluir que dejaste basura.

## Review Focus

- **Un servidor con `max-rows` menor a 1000** (alguien lo baja en el Dashboard): el primer bloque llega incompleto y la lectura tiene que seguir hasta un bloque vacío, avanzando por las filas recibidas, sin perder ni repetir filas — fijado en Task 3, test `a server capped at 500 rows…`.
- **Un bloque intermedio que falla** (red, JWT expirado entre bloques): la lectura tiene que lanzar, nunca devolver una lista parcial que haga ver a un deudor como "Al corriente" — fijado en Task 3, test `an error in a later block throws…`.
- **Empates en la columna de orden** (dos jugadores con el mismo `full_name`, dos pagos con la misma `payment_date`): sin desempate único una fila se salta o se repite entre bloques — fijado en Task 3 con las aserciones de `order('id')` en `players.test.ts` y `payments.test.ts`.
- **Dar de baja sigue funcionando** una vez que el borrado está prohibido: un admin puede poner `status = 'baja'` — fijado en Task 1, aserción 8 de `0017_forbid_player_delete.test.sql`.
- **La migración 0018 no cambia el resultado de ninguna ruta** (consentimiento, otro tenant, jugador inexistente, ruta malformada, uuid inválido que no debe lanzar `22P02`): fijado en Task 2 con los 10 casos de ruta y las 3 subidas de 0012 copiados al test de 0018.

---

## Task 1: Prohibir el borrado de jugadores (#44) — rama `fix/forbid-player-delete`

**Files:**
- Create: `supabase/migrations/0017_forbid_player_delete.sql`
- Create: `supabase/tests/0017_forbid_player_delete.test.sql`
- Modify: `supabase/tests/0016_revoke_anon_privileges.test.sql` (aserción A2, líneas 48–53)

**Interfaces:**
- Consumes: policy `players_delete` (0002, reescrita en 0003 l.42); privilegios de tabla de `authenticated` sobre `public.players`.
- Produces: `public.players` sin policy `DELETE` y sin privilegio `DELETE` para `authenticated`; `service_role` y `postgres` sin cambios. Sin cambios de frontend (la app no tiene ningún `delete` sobre `players`).

- [ ] **Step 0: Preparar y medir el baseline**

En `$WT`: `git -C $WT branch --show-current` → `fix/forbid-player-delete`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. Luego `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests` (todo verde).

**[MCP]** `list_migrations` → la última entrada es `0016_revoke_anon_privileges` o `0018_lock_player_on_file_write` (nunca `0017`). Corre la baseline query y esta **residue query** (esperado: todo `0`); si no es `0`, detente y reporta:

```sql
select (select count(*) from public.tenants where id::text like 'ffffffff-%') as tenants,
       (select count(*) from auth.users where id::text like 'ffffffff-%') as users,
       (select count(*) from public.profiles where id::text like 'ffffffff-%') as profiles,
       (select count(*) from public.players where id::text like 'ffffffff-%' or tenant_id::text like 'ffffffff-%') as players,
       (select count(*) from public.documents where tenant_id::text like 'ffffffff-%') as documents;
```

- [ ] **Step 1: Escribir el test que falla**

Crea `supabase/tests/0017_forbid_player_delete.test.sql` con exactamente este contenido:

```sql
begin;
select extensions.plan(8);

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
grant execute on function pg_temp.as_role(text, text, text) to public;

select extensions.is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'players' and cmd in ('DELETE', 'ALL')),
  0, 'no DELETE policy on players');
select extensions.is(
  (select string_agg(policyname::text, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'players'),
  'players_insert,players_select,players_update', 'players keeps its select/insert/update policies');
select extensions.is(has_table_privilege('authenticated', 'public.players', 'DELETE'), false, 'authenticated has no DELETE on players');
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
  (select count(*)::int from public.players where id = 'ffffffff-2222-0000-0000-000000000001'),
  1, 'the player still exists after the denied DELETE');
select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"ffffffff-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$with w as (update public.players set status = 'baja' where id = 'ffffffff-2222-0000-0000-000000000001' returning 1) select count(*)::text from w$q$),
  '1', 'an admin can still set a player to baja');

delete from public.players where id = 'ffffffff-2222-0000-0000-000000000001';
delete from public.profiles where id = 'ffffffff-1111-0000-0000-000000000001';
delete from auth.users where id = 'ffffffff-1111-0000-0000-000000000001';
delete from public.tenants where id = 'ffffffff-0000-0000-0000-000000000001';

select * from extensions.finish();
rollback;
```

(Los 6 `documents` que siembra el trigger se van con el jugador por `on delete cascade`. La limpieza va antes de `finish()` para que la forma MCP la ejecute; bajo `rollback` es inocua.)

- [ ] **Step 2: [MCP] Correr el test en rojo**

Arma la forma MCP del archivo con las tres reglas del harness y pásala en **una** llamada a `execute_sql`.
Expected: 8 filas; `not ok 1`, `not ok 2`, `not ok 3`, `ok 4`, `ok 5`, `not ok 6`, `not ok 7`, `not ok 8` (hoy el admin sí borra al jugador dentro de la transacción, así que 7 y 8 también fallan). Luego la residue query → todo `0`; la baseline query → igual al Step 0. Si el patrón de `ok`/`not ok` es otro, detente y diagnostica con `superpowers:systematic-debugging` antes de seguir.

- [ ] **Step 3: Ajustar A2 en el test de 0016**

En `supabase/tests/0016_revoke_anon_privileges.test.sql`, la aserción A2 excluye `players` de forma explícita y lo dice en su descripción. Queda así (el resto del archivo no cambia; `plan(22)` sigue igual):

```sql
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'players'
     and not (has_table_privilege('authenticated', c.oid, 'SELECT') and has_table_privilege('authenticated', c.oid, 'INSERT')
              and has_table_privilege('authenticated', c.oid, 'UPDATE') and has_table_privilege('authenticated', c.oid, 'DELETE'))),
  0, 'A2 authenticated keeps SELECT/INSERT/UPDATE/DELETE on every public table except players (0017)')
```

- [ ] **Step 4: Escribir la migración**

Crea `supabase/migrations/0017_forbid_player_delete.sql` con exactamente:

```sql
drop policy players_delete on public.players;
revoke delete on public.players from authenticated;
```

- [ ] **Step 5: [MCP] Aplicar la migración**

`apply_migration` con `name: "0017_forbid_player_delete"` y el contenido del archivo. Luego `list_migrations` → aparece `0017_forbid_player_delete`. Luego `get_advisors` `type: "security"` → solo `auth_leaked_password_protection`.

- [ ] **Step 6: [MCP] Correr el test en verde**

Misma llamada que el Step 2.
Expected: 8 filas, `ok 1` … `ok 8`. Luego residue query → todo `0`; baseline query → igual al Step 0.

- [ ] **Step 7: [MCP] Regresión de 0016 (A1–A4)**

Las aserciones de 0016 que lee el catálogo sin fixtures son A1–A4; son las únicas que 0017 puede mover. Corre en una llamada dos sentencias: `select extensions.plan(4);` y luego el bloque de A1 a A4 copiado tal cual del archivo ya editado (desde el `select extensions.is(` de A1 hasta el cierre `)` de A4), terminado en `;`.
Expected: 4 filas `ok 1` … `ok 4`.

- [ ] **Step 8: Frontend sigue verde**

En `$WT`: `pnpm exec vitest run` → `B_files` / `B_tests`, todo verde; `pnpm exec tsc -b` → sin salida, exit 0; `pnpm lint` → exit 0.

- [ ] **Step 9: Commit**

```bash
git -C $WT add supabase/migrations/0017_forbid_player_delete.sql supabase/tests/0017_forbid_player_delete.test.sql supabase/tests/0016_revoke_anon_privileges.test.sql
git -C $WT commit -m "fix: forbid deleting players through the API (#44)" -m "Deleting a player orphaned its photo and documents in player-files; baja is the only way to remove a player, so authenticated loses the DELETE policy and privilege. 0016's A2 now excludes players explicitly." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada: primero el `add`, luego el `commit`.)

**Reporte al orquestador:** SHA del commit, `B_files`/`B_tests`, salidas del Step 2 (rojo, 8 filas), Step 5 (apply + advisors), Step 6 (verde), Step 7, residue y baseline antes/después, y la línea `0017 applied to remote eksbaugyypadtanyjcje on <fecha>`.

**Si 0017 rompe algo ya aplicada:** no parches hacia adelante. Detente y reporta; el inverso para el orquestador es `create policy players_delete on public.players for delete to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin()); grant delete on public.players to authenticated;`.

---

## Task 2: Candado sobre el jugador al escribir archivos (#46) — rama `fix/lock-player-file-write`

**Files:**
- Create: `supabase/migrations/0018_lock_player_on_file_write.sql`
- Create: `supabase/tests/0018_lock_player_on_file_write.test.sql`

**Interfaces:**
- Consumes: `private.current_tenant_id()` (0003), `private.player_consent_granted(uuid)` (0012), el `select … for no key update` sobre el jugador en `private.enforce_document_rules` (0013), las 4 policies de `storage.objects` (0012, no cambian).
- Produces: `private.player_file_path_allowed(p_name text) returns boolean`, misma firma y mismo resultado para toda ruta, ahora `volatile` y con `for share` sobre la fila del jugador antes del chequeo de consentimiento; sigue `security definer`, `set search_path = ''` y ejecutable por `authenticated` (no por `anon`).

- [ ] **Step 0: Preparar y medir el baseline**

En `$WT`: `git -C $WT branch --show-current` → `fix/lock-player-file-write`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. Luego `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests`.

**[MCP]** `list_migrations` → la última entrada es `0016_revoke_anon_privileges` o `0017_forbid_player_delete` (nunca `0018`). Corre la baseline query y esta **residue query** (esperado: todo `0`):

```sql
select (select count(*) from public.tenants where id::text like 'cccccccc-%') as tenants,
       (select count(*) from auth.users where id::text like 'cccccccc-%') as users,
       (select count(*) from public.profiles where id::text like 'cccccccc-%') as profiles,
       (select count(*) from public.players where id::text like 'cccccccc-%' or tenant_id::text like 'cccccccc-%') as players,
       (select count(*) from public.documents where tenant_id::text like 'cccccccc-%') as documents,
       (select count(*) from storage.objects where bucket_id = 'player-files' and name like 'cccccccc-%') as objects;
```

- [ ] **Step 1: Escribir el test que falla**

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
-- P has both consents; Q is missing privacy_notice
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
  (select position('for share;' in d) > 0 and position('for share;' in d) < position('player_consent_granted' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'path helper locks the player FOR SHARE before the consent check');
select extensions.is(has_function_privilege('authenticated', 'private.player_file_path_allowed(text)', 'EXECUTE'), true, 'authenticated executes the path helper');
select extensions.is(has_function_privilege('anon', 'private.player_file_path_allowed(text)', 'EXECUTE'), false, 'anon cannot execute the path helper');

-- act as admin X
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

- [ ] **Step 2: [MCP] Correr el test en rojo**

Forma MCP del archivo (reglas del harness), una llamada a `execute_sql`.
Expected: 19 filas; `not ok 1` (hoy es `s`) y `not ok 4` (no hay `for share`), todas las demás `ok`. Luego residue query → todo `0`; baseline query → igual al Step 0 (sigue habiendo exactamente 1 objeto real en `player-files`). Si el patrón es otro, detente y diagnostica.

- [ ] **Step 3: Escribir la migración**

Crea `supabase/migrations/0018_lock_player_on_file_write.sql`. Es el `create or replace function private.player_file_path_allowed(p_name text)` de `0012_player_files_storage.sql` (líneas 20–54) **con el mismo cuerpo**, salvo tres cambios (spec §4.2):

1. `stable` → `volatile`.
2. El `select p.id into v_player …` termina en `for share;` y lleva, sobre él y debajo del comentario existente, la línea `-- the share lock queues this write behind a consent revocation's no key update lock (0013)` (el comentario **no** debe contener el texto `for share`, porque la aserción 4 lo busca en la definición).
3. Al final del archivo, `grant execute on function private.player_file_path_allowed(text) to authenticated;` (igual que 0012). No hay ningún `grant` a `public` ni a `anon`, y las policies de `storage.objects` no se tocan.

El chequeo de consentimiento (`return private.player_consent_granted(v_player);`) queda como sentencia aparte **después** del `select … for share` — ya lo está en 0012; no lo muevas.

- [ ] **Step 4: [MCP] Aplicar la migración**

`apply_migration` con `name: "0018_lock_player_on_file_write"`. Luego `list_migrations` → aparece `0018_lock_player_on_file_write`. Luego `get_advisors` `type: "security"` → solo `auth_leaked_password_protection`.

- [ ] **Step 5: [MCP] Correr el test en verde**

Misma llamada que el Step 2.
Expected: 19 filas, `ok 1` … `ok 19`. Luego residue query → todo `0`; baseline query → igual al Step 0.

- [ ] **Step 6: Frontend sigue verde**

En `$WT`: `pnpm exec vitest run` → `B_files` / `B_tests`, todo verde; `pnpm exec tsc -b` → exit 0; `pnpm lint` → exit 0.

- [ ] **Step 7: Commit**

```bash
git -C $WT add supabase/migrations/0018_lock_player_on_file_write.sql supabase/tests/0018_lock_player_on_file_write.test.sql
git -C $WT commit -m "fix: lock the player while checking a file write against consent (#46)" -m "An upload and a consent revocation for the same player could both pass their checks; the path helper now takes FOR SHARE on the player, which conflicts with the revocation's FOR NO KEY UPDATE, so the two run in order." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

**Reporte al orquestador:** SHA, `B_files`/`B_tests`, salidas del Step 2 (rojo, 19 filas), Step 4 (apply + advisors), Step 5 (verde), residue y baseline antes/después, la línea `0018 applied to remote eksbaugyypadtanyjcje on <fecha>`, y que la concurrencia no se probó (spec §4.2, riesgo aceptado del método de prueba).

**Si 0018 rompe algo ya aplicada:** no parches hacia adelante. Detente y reporta; el inverso es volver a aplicar el `create or replace function` de 0012 tal cual (líneas 20–54) más su `grant execute … to authenticated`.

---

## Task 3: Lecturas por bloques a nivel tenant (#73) — rama `fix/paginate-tenant-reads`

**Files:**
- Create: `src/lib/fetchAllRows.ts`
- Create: `src/lib/fetchAllRows.test.ts`
- Modify: `src/players/players.ts` (`fetchPlayers`, l.48–55)
- Modify: `src/players/players.test.ts` (mocks + `beforeEach` l.5–21 y l.39–53; tests de `fetchPlayers` l.68–80 y l.174–177)
- Modify: `src/payments/payments.ts` (`fetchPaymentStatuses` l.222–228, `fetchOutstandingPayments` l.230–238)
- Modify: `src/payments/payments.test.ts` (`mocks`, `query()`, `beforeEach` l.10–55; tests l.223–242)

**Interfaces:**
- Consumes: el query builder de `supabase-js` (es `PromiseLike<{ data, error }>`, verificado con `tsc --strict` contra 2.108 para las tres cadenas de abajo).
- Produces (en `src/lib/fetchAllRows.ts`):
  - `export const PAGE_SIZE = 1000`
  - `export interface PageResult<T> { data: T[] | null; error: { message: string } | null }`
  - `export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]>`
- Las firmas y tipos de retorno de `fetchPlayers`, `fetchPaymentStatuses` y `fetchOutstandingPayments` no cambian; `DebtorsPage`, `PlayersPage`, el export a Excel y `routes.test.tsx` no se tocan.

- [ ] **Step 0: Preparar y medir el baseline**

En `$WT`: `git -C $WT branch --show-current` → `fix/paginate-tenant-reads`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. Luego `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests`.

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

test('blocks are 1000 rows, the PostgREST max-rows default', () => {
  expect(PAGE_SIZE).toBe(1000)
})

test('an empty table takes one request', async () => {
  const page = pages(ok([]))
  expect(await fetchAllRows(page)).toEqual([])
  expect(page.mock.calls).toEqual([[0, 999]])
})

test('a short block is not the end: it reads until an empty block', async () => {
  const page = pages(ok(seq(0, 3)), ok([]))
  expect(await fetchAllRows(page)).toEqual([0, 1, 2])
  expect(page.mock.calls).toEqual([[0, 999], [3, 1002]])
})

test('1001 rows take three requests and keep their order', async () => {
  const page = pages(ok(seq(0, 1000)), ok([1000]), ok([]))
  expect(await fetchAllRows(page)).toEqual(seq(0, 1001))
  expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [1001, 2000]])
})

test('a server capped at 500 rows still reads everything, advancing by the rows received', async () => {
  const page = pages(ok(seq(0, 500)), ok(seq(500, 500)), ok(seq(1000, 200)), ok([]))
  expect(await fetchAllRows(page)).toEqual(seq(0, 1200))
  expect(page.mock.calls).toEqual([[0, 999], [500, 1499], [1000, 1999], [1200, 2199]])
})

test('an error in a later block throws instead of returning a partial list', async () => {
  const page = pages(ok(seq(0, 1000)), { data: null, error: { message: 'boom' } })
  await expect(fetchAllRows(page)).rejects.toThrow('boom')
  expect(page).toHaveBeenCalledTimes(2)
})

test('null data without an error ends the read', async () => {
  const page = pages(ok(seq(0, 3)), { data: null, error: null })
  expect(await fetchAllRows(page)).toEqual([0, 1, 2])
  expect(page).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm exec vitest run src/lib/fetchAllRows.test.ts`
Expected: FAIL, no se puede resolver `./fetchAllRows`.

- [ ] **Step 3: Implementar `fetchAllRows` en `src/lib/fetchAllRows.ts`**

Exporta `PAGE_SIZE`, `PageResult<T>` y `fetchAllRows<T>` con las firmas del bloque Interfaces. Algoritmo (spec §4.3, §7): acumula en un arreglo; en cada vuelta pide `page(rows.length, rows.length + PAGE_SIZE - 1)`; si viene `error`, `throw new Error(error.message)`; si `data` es `null` o vacío, devuelve lo acumulado; si no, agrega `data` y repite. Nunca corta por "bloque incompleto". Una línea de comentario sobre el corte, por ejemplo `// stop only on an empty block: a short one may just mean max-rows < PAGE_SIZE`.

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm exec vitest run src/lib/fetchAllRows.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Actualizar los tests de `fetchPlayers` (rojo)**

En `src/players/players.test.ts`:

1. Agrega `range: vi.fn(),` a `mocks` (después de `order`).
2. En `beforeEach`, reemplaza la línea `mocks.order.mockResolvedValue({ data: [row()], error: null })` y su comentario por:

```ts
  // read chain: from().select().order().order().range()  and  from().select().eq().maybeSingle()
  mocks.order.mockReturnValue({ order: mocks.order, range: mocks.range })
  mocks.range.mockImplementation(async (from: number) => ({ data: from === 0 ? [row()] : [], error: null }))
```

3. Reemplaza el test `fetchPlayers reads the category view ordered by name` por:

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
```

4. En `fetchPlayers returns [] when the view yields null data` cambia `mocks.order.mockResolvedValue(...)` por `mocks.range.mockResolvedValue({ data: null, error: null })`.
5. En `fetchPlayers throws when Supabase returns an error` cambia `mocks.order.mockResolvedValue(...)` por `mocks.range.mockResolvedValue({ data: null, error: { message: 'boom' } })`.

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: FAIL en `fetchPlayers reads the category view by name…` y `fetchPlayers throws when Supabase returns an error`; el resto pasa.

- [ ] **Step 6: Implementar `fetchPlayers` con el helper**

En `src/players/players.ts`, importa `fetchAllRows` de `'../lib/fetchAllRows'` y haz que `fetchPlayers(): Promise<PlayerRow[]>` devuelva `fetchAllRows<PlayerRow>((from, to) => supabase.from('players_with_category').select('*').order('full_name', { ascending: true }).order('id', { ascending: true }).range(from, to))`. La query se arma dentro de la función de página (un builder de `supabase-js` no se reutiliza entre peticiones).

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: todo PASS.

- [ ] **Step 7: Actualizar los tests de pagos (rojo)**

En `src/payments/payments.test.ts`:

1. En `mocks` agrega `pages: [] as Array<{ data: unknown; error: { message: string } | null }>,`.
2. En `query()`, agrega `'range'` a la lista de métodos encadenables y resuelve la cola antes del resultado fijo, para que un test no pueda dejar al helper leyendo para siempre:

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
```

Los tests `… throws on error` no cambian (con la cola vacía, `respond(null, { message: 'boom' })` hace fallar el primer bloque).

Run: `pnpm exec vitest run src/payments/payments.test.ts`
Expected: FAIL en los dos tests reemplazados (no hay llamadas a `range`); el resto pasa.

- [ ] **Step 8: Implementar las dos lecturas de pagos con el helper**

En `src/payments/payments.ts`, importa `fetchAllRows` de `'../lib/fetchAllRows'`:
- `fetchPaymentStatuses(): Promise<PaymentStatusRow[]>` → `fetchAllRows<PaymentStatusRow>` sobre `from('player_payment_status').select('player_id, tenant_id, payment_state').order('player_id', { ascending: true }).range(from, to)` (`player_id` es único en la vista: `group by p.id`).
- `fetchOutstandingPayments(): Promise<PaymentRow[]>` → `fetchAllRows<PaymentRow>` sobre `from('payments').select(PAYMENT_COLUMNS).in('status', ['pendiente', 'parcial']).order('payment_date', { ascending: true }).order('id', { ascending: true }).range(from, to)`, y después `.map(normalizeRow)` sobre el resultado completo.

El comentario existente `// Con adeudo follows the open rows, not the view: the two reads are not atomic` se queda donde está.

Run: `pnpm exec vitest run src/payments/payments.test.ts`
Expected: todo PASS.

- [ ] **Step 9: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files + 1` archivos, `B_tests + 7` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 10: Commit**

```bash
git -C $WT add src/lib/fetchAllRows.ts src/lib/fetchAllRows.test.ts src/players/players.ts src/players/players.test.ts src/payments/payments.ts src/payments/payments.test.ts
git -C $WT commit -m "fix: read tenant-wide lists in blocks past the PostgREST row cap (#73)" -m "fetchPlayers, fetchPaymentStatuses and fetchOutstandingPayments were silently truncated at max-rows, which could show a debtor as Al corriente. They now page with range() until an empty block, ordered by a unique tiebreaker." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

**Reporte al orquestador:** SHA, `B_files`/`B_tests` y conteos finales, salidas de los pasos rojo (5, 7) y verde (4, 6, 8, 9).

**Verificación en navegador (orquestador, después del commit, spec §6):** con el dev server y la sesión de Playwright, abrir la lista de jugadores (`/`) y Quién debe; ambas cargan como antes. En la pestaña de red, cada lectura hace dos peticiones: `offset=0&limit=1000` y `offset=1&limit=1000` (con el único jugador real); la segunda tiene que responder `200` con `[]`, no `416`/`PGRST103`. Si responde `416`, el corte en bloque vacío no sirve tal cual: detente y escala (ver Preguntas abiertas).

---

## Discrepancias con el spec

- **Los tests existentes se rompen, no solo se mockean "como hoy" (spec §4.3).** El mock de `payments.test.ts` devuelve el mismo resultado a toda petición: con el corte en bloque vacío, `respond([fila])` dejaría al helper leyendo para siempre. El de `players.test.ts` resuelve en `order()` y no tiene `range`. Task 3 cambia los dos mocks (cola de bloques en pagos, `range` por offset en jugadores) y reescribe los 5 tests de las tres funciones. Son ajustes de mock, no cambios del diseño.
- **Harness pgTAP:** en lugar de la forma "dos sentencias, `plan` + un solo `union all`", los tests de 0017/0018 corren por MCP con el harness `tap` (fixtures, aserciones y limpieza en una sola llamada transaccional), ya verificado en el plan del 2026-10-16. Así un fallo no deja fixtures en la base viva. La forma de dos sentencias se usa solo para la regresión A1–A4 de 0016 (Task 1 Step 7), que no tiene fixtures.
- Nada más: lo demás del spec coincide con el código (policy `players_delete` en 0002 l.58 / 0003 l.42; A2 en 0016 l.48–53; cuerpo de `player_file_path_allowed` en 0012 l.20–54, `stable`, sin candado, consentimiento en sentencia aparte; `for no key update` en 0013; las tres lecturas sin paginar; ningún `delete` sobre `players` en `src/` ni en `supabase/functions/`; `player_id` único en `player_payment_status`).

## Preguntas abiertas

1. **¿Quién corre los pasos [MCP]?** El plan del 2026-10-16 los dejó al orquestador; el de documentos, al implementer. Aquí los corre el implementer si tiene las tools y, si no, se detiene y los pasa al orquestador.
2. **`TRUNCATE` sobre `players`:** Supabase da `ALL` a `authenticated`, lo que incluye `TRUNCATE` (no pasa por RLS). PostgREST no lo expone, así que no es un hueco por la API, y el spec solo pide quitar `DELETE`. ¿Lo revocamos también en 0017 para que "no se borra" sea literal?
3. **Offset más allá del final:** PostgREST devuelve `416 / PGRST103` cuando el offset pasa del total **y** se pidió `count`. Estas lecturas no piden `count`, así que el último bloque debería llegar vacío con `200`. La verificación en navegador de Task 3 lo confirma; si no se cumple, hay que volver al spec (por ejemplo, cortar ante `PGRST103`).
