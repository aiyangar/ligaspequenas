# Checklist previo a datos reales y evaluación de Supabase Pro (#6) — Diseño

**Fecha:** 2026-10-16
**Estado:** Borrador revisado (revisión adversarial y decisiones del owner del 2026-10-16 aplicadas)
**Issue:** [#6](https://github.com/aiyangar/ligaspequenas/issues/6) — master spec §7 (`2026-06-22-liga-mty-registro-jugadores-design.md`)

## 1. Contexto y objetivo

Antes de cargar datos reales de menores (CURP, actas, fotos) hay que demostrar, con evidencia reproducible, que la base está cerrada. La issue #6 lista seis puntos; el owner aprobó el alcance de este diseño el 2026-10-16.

La auditoría read-only del orquestador (2026-10-16, proyecto `eksbaugyypadtanyjcje`) da casi todo en verde, con un hallazgo: **`anon` tiene SELECT/INSERT/UPDATE/DELETE sobre todas las tablas y vistas de `public`** (grants por defecto de Supabase) y **EXECUTE sobre todas las funciones de `private` y sobre `public.set_updated_at`**. Hoy no hay fuga, porque ninguna policy apunta a `anon` y `anon` no tiene USAGE sobre `private`. Pero eso deja la seguridad en una sola capa (RLS): si una policy futura olvida `to authenticated`, `anon` la hereda. La re-verificación de este diseño encontró además que el EXECUTE de `anon` sobre `private.*` **no es un grant directo: viene de `PUBLIC`** (`proacl = {=X/postgres,…}` o `NULL`, que es el default de Postgres). Por eso un `revoke … from anon` no basta (§4.2).

Objetivo:

1. Un documento de checklist **reproducible** (`docs/security/pre-real-data-checklist.md`) que se vuelve a correr antes de cada carga de datos reales.
2. Defensa en profundidad: `anon` sin privilegios sobre objetos de la app, hoy y para los objetos futuros.
3. Lock de consentimiento verificado de punta a punta en navegador.
4. La decisión del owner sobre el plan de Supabase, registrada. Decidido el 2026-10-16: **Free**, con backups automáticos cifrados en la issue aparte [#87](https://github.com/aiyangar/ligaspequenas/issues/87) (§2, §7).

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Forma del checklist | **Markdown versionado** en `docs/security/pre-real-data-checklist.md`, con un bloque por punto: *qué se exige*, *cómo se verifica* (SQL o shell exacto, copiable), *resultado esperado* y una tabla de corridas fechadas (fecha, commit de `develop`, resultado, quién). Descartado: script automatizado. Mitad de los puntos necesitan MCP o navegador, y un script a medias da falsa confianza. |
| Alcance de los revokes | `anon` pierde **todo** sobre tablas, vistas y secuencias de `public`, y EXECUTE sobre `private.*` y `public.set_updated_at`. `authenticated` y `service_role` **no cambian**. El USAGE sobre el schema `public` no se toca: revocarlo a `anon` no cambiaría nada, porque `PUBLIC` ya tiene USAGE (`=U/pg_database_owner` en `nspacl`), y sin privilegios sobre objetos ese USAGE no expone nada. |
| EXECUTE vía `PUBLIC` | **`revoke execute … from public`** (además de `anon`) en `private.*` y `public.set_updated_at`. Las policies usan solo **tres** helpers (`current_tenant_id`, `is_admin`, `player_file_path_allowed`). `player_consent_granted` solo la llaman triggers y funciones SECURITY DEFINER. Las cuatro ya tienen grant explícito a `authenticated` (0003, 0012; verificado en `proacl`), así que no se tocan. Las funciones de trigger no necesitan EXECUTE: Postgres lo comprueba al hacer `CREATE TRIGGER`, no cuando el trigger se dispara. El pgTAP lo fija con comportamiento (§5, grupo D). |
| Default privileges | Solo para el rol **`postgres`**, que es el owner de todos los objetos de la app (verificado: tablas, vistas, funciones y el schema `private`). (a) `alter default privileges for role postgres in schema public revoke all on tables / sequences / functions from anon;` (b) `alter default privileges for role postgres revoke execute on functions from public;` en forma **global**, **aprobado por el owner el 2026-10-16**: el EXECUTE a PUBLIC es un default global de Postgres, y un `in schema` solo puede añadir privilegios sobre el global, no quitarlos. Consecuencia aceptada: **toda función nueva que cree `postgres` en cualquier schema, incluidos `pg_temp` y `tests`, nace sin EXECUTE para PUBLIC y necesita un grant explícito** si la llama otro rol (§4.3; helpers de test, fila siguiente). Con (b), las funciones futuras de `public` siguen ejecutables por `authenticated` y `service_role`, porque el default de `postgres` en `public` ya se los da. Las de `private` quedan solo para el owner y requieren `grant` explícito, que ya es la convención del repo. Descartado: `supabase_admin`. `postgres` no puede alterar sus defaults (no es miembro) y no crea objetos de la app. El check §3.1-B detecta cualquier grant a `anon` sea cual sea el owner. |
| Helpers de test | Regla nueva: **toda función helper de un test se otorga explícitamente a `public`** justo después de crearla. Motivo: 0002 llama `tests.act_as(uuid)` cuando ya es `authenticated`, y 0012/0013 llaman `pg_temp.try_sql(text)`/`pg_temp.count_sql(text)` después de `set_config('role','authenticated',true)`. Hoy funcionan solo por el EXECUTE implícito de PUBLIC; con el global de (b) fallarían con `42501`. Los tres archivos se editan en la rama `fix/revoke-anon-privileges` (§5.4). En la misma rama se cambian también 0014/0015, cuya última aserción espera que `anon` vea 0 filas en las vistas de estado: con 0016 el `SELECT` como `anon` da `42501` (no son helpers; ver §5.4). |
| Schema `storage` | **Fuera** de esta migración. `storage.objects` es de Supabase; el control real son el bucket privado y las policies `to authenticated` de 0012. El checklist verifica ambos (§3.1-D). |
| Rollback | Migración **forward** de re-grant (§4.4), no `git revert` a secas. Revertir el commit no deshace un DDL ya aplicado al proyecto remoto. El SQL de re-grant queda escrito en este spec para aplicarlo sin pensar. |
| E2E | Lo corre el **orquestador** con Playwright (Chromium persistente vía CDP, magic link asistido por el owner), después de aplicar 0016. Así prueba a la vez el lock y que `authenticated` no cambió. Descartado: agente tester. |
| Plan de Supabase | **Free**, decidido por el owner el 2026-10-16. Los backups serán automáticos (tipo cron) y cifrados, y se rastrean en la issue aparte **#87** "Automated encrypted nightly backups (database + Storage) on the Free plan". El repo es **público**, así que los artifacts de Actions tienen que ir cifrados, y los objetos de Storage no están en un `db dump`. #87 queda **fuera de alcance** de #6. El punto F del checklist queda en verde con "Free + backups automáticos (#87)". La comparación de §7 queda como respaldo de la decisión. |
| Entrega | Rama `update/pre-real-data-spec` (este spec). Luego `fix/revoke-anon-privileges` (0016, pgTAP de 0016, los grants de helpers en los tests 0002/0012/0013 y la aserción de `anon` en 0014/0015) y una rama aparte para el documento de checklist con la primera corrida (`update/pre-real-data-checklist`). Una tarea, una rama. |

## 3. Documento de checklist (`docs/security/pre-real-data-checklist.md`)

### 3.1 Puntos y verificación

Todo el SQL es read-only y corre con `mcp__supabase__execute_sql` (como `postgres`). Cada query devuelve **filas solo si hay un problema**: un resultado vacío es verde. Así el resultado es binario y no depende de leer listas.

**A. RLS activo y al menos una policy explícita en cada tabla de `public`.**

```sql
select c.relname, c.relrowsecurity, count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind in ('r', 'p')
group by c.relname, c.relrowsecurity
having not c.relrowsecurity or count(p.polname) = 0;
```

Verde: 0 filas. Hay un informativo aparte (no falla el check) que lista `relname, polname, polcmd, roles` para anexar al resultado. Las vistas (`players_with_category`, `teams_with_meta`, `player_payment_status`) no tienen RLS propio; se verifica que sean `security_invoker`:

```sql
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and not coalesce('security_invoker=true' = any(c.reloptions), false);
```

**B. `anon` sin privilegios sobre objetos de la app** (verde solo después de aplicar 0016; hoy es rojo).

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

Verde: 0 filas. `grantee = 0` es `PUBLIC`. El cast `defaclobjtype::text` es necesario: sin él, `text || "char"` falla con `42725 operator is not unique`. `MAINTAIN` es el privilegio de PG17 (`m` en el ACL), y hoy `anon` también lo tiene. Rojo esperado hoy (2026-10-16, re-verificado): `relation` = 96 (84 sin MAINTAIN), `function` = 10, `default_acl` = 12. Como el EXECUTE a PUBLIC es implícito cuando no hay fila global, se exige además que esta query devuelva `1`:

```sql
select count(*) from pg_default_acl d
where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
  and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0);
```

Nota: `has_function_privilege` sobre `private.*` da `true` aunque `anon` no tenga USAGE del schema; por eso se verifica el privilegio y no la llamabilidad.

**C. Ningún secreto en variables públicas ni archivos `.env` en git.** (1)–(3) y (5) desde la raíz del repo en `develop`; (4) contra el deploy de producción de Vercel.

```sh
# (1)-(3): develop
git ls-files | grep -E '(^|/)\.env' | grep -v '^\.env\.example$'
grep -rnoE 'VITE_[A-Z0-9_]+' src | sed 's/.*://' | sort -u
grep -rnE 'sb_secret_|service_role|SERVICE_ROLE' src .env.example

# (4): deployed bundle — entry scripts from index.html plus the lazy chunks they reference
PAT='sb_secret_[A-Za-z0-9_-]+|service_role|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
base=https://ligaspequenas.vercel.app
entries=$(curl -s "$base/" | grep -oE '/assets/[^"]+\.js' | sort -u)
chunks=$(for a in $entries; do curl -s "$base$a" | grep -oE 'assets/[A-Za-z0-9_.-]+\.js'; done | sed 's|^|/|' | sort -u)
all=$(printf '%s\n' $entries $chunks | sort -u)
printf '%s\n' $all
for a in $all; do curl -s "$base$a"; done | grep -oE "$PAT" | sort -u

# (5): develop bundle, built locally
pnpm build && cat dist/assets/*.js | grep -oE "$PAT" | sort -u
```

(4) escanea **lo que esté desplegado** en `ligaspequenas.vercel.app` (producción, normalmente `main`), no `develop`. En la corrida se anota el commit de ese deploy (Vercel Dashboard → Deployments, o `vercel inspect ligaspequenas.vercel.app`). El escaneo incluye los chunks lazy: hoy hay un único import dinámico (`src/players/exportPlayers.ts:5`, `import('write-excel-file/browser')`), y la lista que imprime `printf` tiene que contener ese chunk; si no, la detección falló y el punto es rojo. Un nivel basta mientras no haya imports dinámicos anidados; si aparecen, se repite hasta que la lista no crezca. (5) cubre `develop` aunque todavía no esté desplegado.

Verde: (1) vacío; (2) exactamente `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_URL`; (3) vacío; (4) y (5) vacíos (el bundle solo lleva el `sb_publishable_…`, que no matchea). Si (4) o (5) encuentran un JWT, se decodifica el payload (`echo <payload> | base64 -d`) y debe ser `"role":"anon"`; cualquier otro rol es rojo. `SUPABASE_SERVICE_ROLE_KEY` solo puede aparecer en `supabase/functions/` vía `Deno.env.get`.

**D. Storage privado, acceso solo con URL firmada.**

```sql
select id from storage.buckets where public;
select policyname, roles::text from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (roles <> '{authenticated}' or policyname not like 'player_files_%');
```

Verde: ambos vacíos. Prueba en vivo con una ruta real (sin sesión):

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://eksbaugyypadtanyjcje.supabase.co/storage/v1/object/public/player-files/<tenant>/<player>/<doc>"
```

Verde: distinto de 200 (bucket privado → 400). Desde la app, "Ver" abre una URL `…/storage/v1/object/sign/player-files/…?token=…` con TTL de 300 s (`SIGNED_URL_TTL_SECONDS`). Lo cubre el E2E §6.

**E. Lock de consentimiento de punta a punta.** El pgTAP de 0012/0013 sigue verde y el E2E §6 pasa completo (cada escenario con fecha y resultado en la tabla de corridas).

**F. Plan de Supabase y respaldos.** El checklist registra la decisión del owner: *"2026-10-16 — Free + backups automáticos cifrados (#87). Motivo: liga en arranque, ≤ ~40 jugadores esta temporada; Free alcanza (§7)."* Verde con esa línea. El estado de #87 se anota como dato informativo en cada corrida; #87 no bloquea el cierre de #6.

**G. (informativo) Advisors de seguridad.** `get_advisors(security)`: solo se acepta `auth_leaked_password_protection` (la app es passwordless; ver §8). Cualquier otro lint es rojo.

### 3.2 Criterio de cierre de #6

A–E en verde en una misma corrida fechada sobre `develop` (con el commit del deploy escaneado en C(4) anotado aparte), F registrado y G sin lints nuevos. La issue se cierra con el link al checklist.

## 4. Migración `0016_revoke_anon_privileges.sql`

### 4.1 Por qué no rompe nada

| Flujo | Rol en Postgres | Por qué no se afecta |
|---|---|---|
| Login magic link / `/auth/callback` | ninguno | `signInWithOtp` y el intercambio de sesión van a GoTrue (`/auth/v1`), que usa `supabase_auth_admin` y no PostgREST. `TenantProvider` consulta `profiles` solo cuando ya hay `session`, así que esa consulta corre como `authenticated`. |
| App autenticada (tablas, vistas, Storage) | `authenticated` | Sus grants no cambian. Las policies solo llaman a tres helpers, todos con grant explícito (verificado en `pg_policies`: `current_tenant_id`, `is_admin`, `player_file_path_allowed`). `player_consent_granted` también tiene grant explícito. Los triggers no exigen EXECUTE. |
| `invite-user` | `service_role` | Grants intactos; bypassa RLS. Inserta en `profiles`, que no tiene triggers de `private`. |
| Cliente sin sesión contra `/rest/v1` | `anon` | Antes: 200 con `[]` (RLS filtra todo). Después: 401 `42501 permission denied`. Es el comportamiento buscado; la app nunca hace esa llamada. |

### 4.2 SQL exacto

```sql
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

revoke execute on all functions in schema private from public, anon;
revoke execute on function public.set_updated_at() from public, anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
```

- `all tables` incluye las vistas.
- La última línea (global, aprobada por el owner) también alcanza a las funciones de `pg_temp` y `tests` que crean los tests como `postgres`; por eso existe la regla de helpers de test (§2, §4.3, §5.4).
- No hay secuencias hoy (PKs `uuid`); la línea existe para que el estado sea correcto si se añade una.
- **No** se re-otorga nada a `authenticated`: los grants explícitos de 0003/0012 sobreviven al `revoke … from public`.
- Se aplica con `mcp__supabase__apply_migration` (nombre `revoke_anon_privileges`) y después se corre `get_advisors(security)`.

### 4.3 Invariante para migraciones futuras

Dos reglas, que quedan como nota fija en el checklist (sección "Convenciones"), porque el repo no tiene `CLAUDE.md`:

1. **Funciones de la app.** Toda función nueva que cree `postgres` y que una policy o el cliente llame necesita un `grant execute … to authenticated` explícito, porque ya no lo hereda de PUBLIC. En `public` el default de `postgres` ya se lo da; en `private` y en cualquier otro schema hay que escribirlo. Las de trigger no lo necesitan. Si se olvida, el pgTAP de la policy que usa el helper falla con `42501`.
2. **Helpers de test.** Toda función helper creada en un test (`pg_temp.*`, `tests.*`) lleva su grant explícito a `public` justo después del `create`:

```sql
grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;
grant execute on function tests.act_as(uuid) to public;
```

Sin él, cualquier llamada hecha con `role` = `authenticated`/`anon` falla con `42501`.

### 4.4 Rollback (forward)

Migración `<siguiente número libre>_regrant_anon_privileges.sql`, que se aplica solo si 0016 rompe algo en producción. Después se abre una rama nueva para reintentar:

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

`grant all` incluye `MAINTAIN` (PG17), que `anon` tenía en el estado auditado, y también aplica a las vistas. Esto deja exactamente el estado auditado el 2026-10-16. Los grants explícitos de `authenticated` nunca se tocaron. Los grants de helpers en los tests (§4.3) no hace falta revertirlos: con el EXECUTE de PUBLIC restaurado son redundantes y no dañan.

## 5. pgTAP `supabase/tests/0016_revoke_anon_privileges.test.sql`

Forma canónica del repo (`begin; select extensions.plan(N); … select * from extensions.finish(); rollback;`). Al correrlo por MCP se usa el truco de dos sentencias: las **dos últimas** sentencias de la llamada son `select extensions.plan(N);` y un único `select extensions.is(…) union all …`, precedidas por la preparación de §5.2 en la misma llamada. Los fixtures persistentes se insertan en una llamada anterior y se borran después (§5.4). Solo hay aserciones `is()`; nada estructural (`has_*`, `fk_ok`).

### 5.1 Helper `pg_temp.as_role` (grupo D)

En un único `select … union all …`, una lectura directa usa el snapshot de la sentencia externa y no ve lo que otra rama escribió vía SQL dinámico. Además, el orden de evaluación de las ramas no está garantizado, y los permisos de la sentencia externa se comprueban como `postgres`. Por eso **todas** las aserciones del grupo D pasan por un helper que cambia de rol, corre SQL dinámico (snapshot nuevo, permisos del rol cambiado) y restaura `postgres` antes de volver. **Ninguna rama del `union all` final escribe**: las escrituras de las que depende otra aserción (insertar P, tocar la season) van en sentencias **previas** de la misma llamada, y su resultado queda en una tabla temporal.

```sql
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
```

- `p_sql` siempre es un `select` que devuelve **un** valor `text`. Una escritura se envuelve en un CTE que devuelve las filas afectadas: `with w as (insert … returning 1) select count(*)::text from w`. Así, `'1'` = escrita, `'0'` = filtrada por RLS, y `'<sqlstate> <mensaje>'` = error.
- Volver a `postgres` desde dentro funciona porque `SET ROLE` se valida contra el `session_user` (`postgres` en MCP), no contra el rol actual.
- El grant a `public` cumple la regla de helpers de test (§4.3). Lo llama `postgres`, pero la regla no tiene excepciones.
- `claims X` = `'{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}'`.

### 5.2 Fixtures

Todos con prefijo `eeeeeeee-`. Los persistentes se insertan como `postgres` en una llamada MCP **anterior**:

| Objeto | Id / nombre | Notas |
|---|---|---|
| `public.tenants` X | `eeeeeeee-0000-0000-0000-000000000001` | `name 'ZZ ACL X'`, `slug 'zz-acl-x'` |
| `auth.users` admin X | `eeeeeeee-1111-0000-0000-000000000001` | `email 'admin-x@zz-acl.test'` |
| `public.profiles` admin X | mismo id | `tenant_id` X, `full_name 'ZZ Admin X'`, `role 'admin'` |
| `public.seasons` S | `eeeeeeee-3333-0000-0000-000000000001` | `tenant_id` X, `name 'ZZ Season'`, `cutoff_date '2026-01-01'`, `is_active false`, `updated_at '2000-01-01'` |
| `public.players` P | `eeeeeeee-2222-0000-0000-000000000001` | **No** es fixture previo: lo inserta admin X en D3. Sus 6 `documents` los crea el trigger de seed y caen por `on delete cascade` |
| `public.zz_acl_probe` (tabla) | — | La crea `postgres` en la llamada de aserciones, **fuera del historial de migraciones**, con `alter table public.zz_acl_probe enable row level security` inmediato para no disparar el advisor `rls_disabled_in_public` mientras exista (RLS no cambia `has_table_privilege`) |
| `private.zz_acl_probe()` (función) | — | `returns int language sql as 'select 1'`, creada por `postgres` en la misma llamada; fuera del historial de migraciones |
| `pg_temp.as_role`, `pg_temp.zz_results` | — | Temporales de sesión; desaparecen al cerrar la conexión |

La llamada de aserciones (una sola `execute_sql`, porque `pg_temp` vive en la sesión) contiene, en orden:

1. `create … pg_temp.as_role` + su `grant` (§5.1).
2. `create table public.zz_acl_probe (id int); alter table … enable row level security; create function private.zz_acl_probe() …`.
3. `create temp table zz_results (k text primary key, v text);`
4. `insert into zz_results values ('D3', pg_temp.as_role('authenticated', <claims X>, $q$with w as (insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values ('eeeeeeee-2222-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ZZ Player P', '2015-06-10', 'Tutor', '111') returning 1) select count(*)::text from w$q$));`
5. `insert into zz_results values ('D6w', pg_temp.as_role('authenticated', <claims X>, $q$with w as (update public.seasons set name = name where id = 'eeeeeeee-3333-0000-0000-000000000001' returning 1) select count(*)::text from w$q$));`
6. `select extensions.plan(22);`
7. El `select extensions.is(…) union all …` con las 22 aserciones.

En la forma canónica del archivo es la misma secuencia dentro de `begin … rollback`.

### 5.3 Aserciones

| # | Aserción (`is(got, expected, desc)`) | Esperado |
|---|---|---|
| A1 | count de `(relación de public, privilegio)` con `has_table_privilege('anon', …)`, misma query que la parte relation de §3.1-B (incluye `MAINTAIN`) | `0` |
| A2 | count de tablas base de `public` donde `authenticated` **no** tiene alguno de SELECT/INSERT/UPDATE/DELETE | `0` |
| A3 | count de vistas de `public` donde `authenticated` no tiene SELECT | `0` |
| A4 | count de relaciones de `public` donde `service_role` no tiene SELECT | `0` |
| B1 | count de funciones de `private` ejecutables por `anon` | `0` |
| B2 | count de funciones de `private` cuyo `proacl` explota con `grantee = 0` (PUBLIC) **o** tiene `proacl is null` | `0` |
| B3 | `has_function_privilege('authenticated', 'private.current_tenant_id()', 'EXECUTE')` y lo mismo para `is_admin()`, `player_consent_granted(uuid)` y `player_file_path_allowed(text)` (4 aserciones: los 3 helpers de policies + el de triggers con grant explícito) | `true` |
| B4 | `has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')` | `false` |
| C1 | count de entradas en `pg_default_acl` de `postgres` en `public` con `grantee = anon` | `0` |
| C2 | count de filas de `pg_default_acl` global de `postgres` (`defaclnamespace = 0`, `defaclobjtype = 'f'`) cuyo `aclexplode(defaclacl)` **no** contiene `grantee = 0`. Sin fila, el EXECUTE a PUBLIC es implícito, así que se exige que la fila exista | `1` |
| C3 | `has_table_privilege('anon', 'public.zz_acl_probe', 'SELECT')` | `false` |
| C4 | `has_table_privilege('authenticated', 'public.zz_acl_probe', 'SELECT')` | `true` |
| C5 | `has_function_privilege('anon', 'private.zz_acl_probe()', 'EXECUTE')` | `false` |
| D1 | `left(pg_temp.as_role('anon', null, 'select count(*)::text from public.players'), 5)` | `'42501'` |
| D2 | `left(pg_temp.as_role('anon', null, 'select count(*)::text from public.player_payment_status'), 5)` | `'42501'` |
| D3 | `(select v from zz_results where k = 'D3')`: el insert de P como admin X | `'1'` |
| D4 | `pg_temp.as_role('authenticated', <claims X>, 'select count(*)::text from public.documents where player_id = ''eeeeeeee-2222-…-000000000001''')`: el trigger de seed sigue disparando | `'6'` |
| D5 | `pg_temp.as_role('authenticated', <claims X>, $q$with w as (update public.documents set status = 'digital', file_path = '<X>/<P>/curp' where player_id = '<P>' and doc_type = 'curp' returning 1) select count(*)::text from w$q$)`, sin consentimiento: el trigger de reglas sigue disparando (falla sin efecto) | `'P0001 consent_required'` |
| D6 | `pg_temp.as_role('authenticated', <claims X>, $q$select (updated_at > '2000-01-01')::text from public.seasons where id = '<S>'$q$)`: la escritura del paso 5 (`D6w`) disparó `set_updated_at`. Si RLS la hubiera filtrado, `updated_at` seguiría en 2000 | `'true'` |

N = 22.

### 5.4 Limpieza, regresión y TDD

Limpieza (como `postgres`, en una llamada aparte, en este orden): `delete from public.players where id = '<P>'` (sus `documents` caen en cascada) → `delete from public.seasons where id = '<S>'` → `delete from public.profiles where id = '<admin X>'` → `delete from auth.users where id = '<admin X>'` → `delete from public.tenants where id = '<X>'` → `drop table public.zz_acl_probe; drop function private.zz_acl_probe();`. Después se confirma con SQL que no queda ninguna fila con id `eeeeeeee-%` en `tenants`, `auth.users`, `profiles`, `seasons`, `players` ni `documents`, y que los conteos de players/tenants vuelven a la línea base. Por último se corre `get_advisors(security)`, que no debe mostrar `rls_disabled_in_public` ni lints nuevos. En forma canónica, el `rollback` hace la limpieza.

Regresión: en la misma rama `fix/revoke-anon-privileges`, **antes** de aplicar 0016, se editan los tests que crean helpers llamados con un rol distinto de `postgres` (inventario: `grep -rnE 'create (or replace )?function' supabase/tests`, que hoy da exactamente estos tres):

| Archivo | Helper(s) | Línea a añadir tras el `create` |
|---|---|---|
| `supabase/tests/0002_rls.test.sql` | `tests.act_as(uid uuid)` (se llama ya como `authenticated` desde la 2.ª llamada) | `grant execute on function tests.act_as(uuid) to public;` |
| `supabase/tests/0012_player_files_storage.test.sql` | `pg_temp.try_sql(text)`, `pg_temp.count_sql(text)` | `grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;` |
| `supabase/tests/0013_document_consent_rules.test.sql` | ídem | ídem |

Con esas líneas, 0002/0012/0013 se re-corren por MCP **después** de aplicar 0016 y deben seguir verdes. Sin ellas fallarían con `42501` (el global de §4.2 quita el EXECUTE implícito también en `pg_temp` y `tests`). Si el runner crea el schema `tests`, el USAGE que necesite `authenticated` sobre él no cambia con 0016. El nuevo archivo 0016 ya nace con su grant (§5.1).

Además se editan los tests que afirman el comportamiento de `anon` sobre objetos de `public` (inventario: `grep -rn anon supabase/tests`, que fuera de 0016 da exactamente estos dos). No son helpers: su aserción "`anon` ve 0 filas" pasa a "`anon` es rechazado", porque con 0016 el `SELECT` lanza `42501` y abortaría el archivo entero.

| Archivo | Aserción antes | Aserción después |
|---|---|---|
| `supabase/tests/0014_player_payment_status_view.test.sql` | `is((select count(*) from public.player_payment_status)::int, 0, 'anon sees no rows')` | `throws_ok($$select count(*) from public.player_payment_status$$, '42501', null, 'anon is denied on player_payment_status')` |
| `supabase/tests/0015_players_view_status_columns.test.sql` | `is((select count(*) from public.players_with_category)::int, 0, 'anon sees no rows')` | `throws_ok($$select count(*) from public.players_with_category$$, '42501', null, 'anon is denied on players_with_category')` |

`plan(N)` no cambia (17 y 21). 0014/0015 también se re-corren por MCP antes y después de aplicar 0016: antes, esas dos aserciones salen `not ok` (`anon` recibe 0 filas sin error); después, todo `ok`.

TDD: el test se corre **antes** de aplicar 0016 y debe fallar en A1, B1, B2, B4, C1, C2 (hoy no hay fila global), C3, C5, D1 y D2 (rojo documentado en el plan). Después se aplica 0016 y pasa completo.

## 6. E2E del lock de consentimiento (orquestador, Playwright)

Se ejecuta contra `pnpm dev` (`http://localhost:5173`, mismo proyecto remoto) **después** de aplicar 0016. Usuarios: **admin** = `ing.gustavo.cardenas@gmail.com`; **readonly** = `ing.gustavo.cardenas+lp-test1@gmail.com` (perfil "LP Test d"), del mismo tenant. Las dos sesiones entran por magic link asistido por el owner; la readonly va en un contexto de navegador aparte, para no perder la sesión admin. Fixture: un player nuevo creado desde la UI como admin, `full_name = 'E2E Consent Lock'`. Archivo de prueba: un PDF mínimo (< 10 MB).

Limpieza, en este orden:
1. **Objetos de Storage primero, por la Storage API** (como admin): CURP → Físico (confirmar "Eliminar archivo") y "Quitar foto" desde la UI, o `supabase.storage.from('player-files').remove([...])` desde `page.evaluate` con la sesión admin. No se pueden borrar con SQL: `storage.objects` tiene el trigger `protect_objects_delete` (`storage.protect_delete()`). Borrar el player tampoco borra sus archivos (#44).
2. Confirmar con SQL: `select count(*) from storage.objects where name like '<tenant>/<player>/%'` → `0`.
3. Recién entonces borrar el player (SQL como `postgres`; sus `documents` caen en cascada) y confirmar que ya no existe.

Cada escenario verifica la **UI** y además el **servidor** directamente. Desde `page.evaluate`, con el access token de la sesión (localStorage `sb-eksbaugyypadtanyjcje-auth-token`) y el publishable key, se llama `POST /storage/v1/object/player-files/<tenant>/<player>/<doc>` y `PATCH /rest/v1/documents?id=eq.<id>`. Así el lock no depende solo de que el botón esté deshabilitado.

| # | Rol / estado | Pasos | Resultado esperado |
|---|---|---|---|
| E1 | admin; ambos consentimientos `Pendiente` | Abrir la ficha del player | Alert info "Para subir la foto o documentos digitales, primero registra…". "Subir archivo" **deshabilitado** en CURP, Acta, Comprobante y Constancia médica; **habilitado** en Consentimiento de imagen y Aviso de privacidad. Subir foto deshabilitado con caption "Requiere consentimiento…". |
| E1-API | ídem | POST de Storage a `…/curp` | 4xx con error de RLS (`new row violates row-level security policy`); `storage.objects` sin el objeto. PATCH `documents` (curp → `digital`, `file_path` correcto) → error `consent_required`. |
| E2 | admin | Consentimiento de imagen → Físico; Aviso de privacidad → Físico | La alert desaparece y se habilitan los botones de subida y de foto. |
| E2b | admin; con consentimiento | Subir el PDF en CURP; subir una foto | Chip CURP = "Digital"; "Ver" abre una pestaña con URL `/storage/v1/object/sign/player-files/…token=`; la foto se muestra. |
| E3 | admin; CURP digital y foto presentes | Intentar Aviso de privacidad → Pendiente | La opción "Pendiente" está deshabilitada con el helper "Quita primero la foto y los documentos digitales." PATCH directo → `consent_in_use`. |
| E3b | admin | CURP → Físico (confirmar "Eliminar archivo"); quitar la foto; Aviso de privacidad → Pendiente | La revocación se acepta, la alert info vuelve y los botones de subida no-consentimiento se deshabilitan otra vez. POST de Storage a `…/curp` → 4xx RLS. |
| E3c | admin (preparación de E4) | Aviso de privacidad → Físico de nuevo; subir el PDF en CURP | Chip CURP = "Digital". Así existe un archivo digital para probar "Ver" como readonly. |
| E4 | readonly `ing.gustavo.cardenas+lp-test1@gmail.com` ("LP Test d") | Abrir la ficha del player (CURP digital de E3c) | Sin selects "Estatus", sin botones de subida, sin alert info. "Ver" en CURP abre una pestaña con URL `/storage/v1/object/sign/player-files/…token=`. POST de Storage → 4xx RLS (`is_admin()` falso). PATCH `documents` → sin filas afectadas o error de RLS; el estado no cambia (re-lectura). |
| E5 | sin sesión | `GET /rest/v1/players?select=id` solo con el publishable key; URL pública del objeto (§3.1-D) | REST → 401 con `42501` (antes de 0016 era 200 `[]`); Storage público → no-200. |

Después de E5 se hace la limpieza descrita arriba (paso 1 como admin: CURP → Físico). Cada escenario queda en la tabla de corridas del checklist con fecha y resultado. Un fallo en E1–E4 bloquea la carga de datos y se trata con `systematic-debugging` en su propia rama. Si el fallo lo causó 0016, se aplica §4.4 primero.

## 7. Supabase Free vs Pro (respaldo de la decisión del owner)

Fuentes consultadas el **2026-10-16**: [Pricing](https://supabase.com/pricing.md), [Backups](https://supabase.com/docs/guides/platform/backups), [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Compute](https://supabase.com/docs/guides/platform/compute-and-disk).

| Aspecto | Free | Pro |
|---|---|---|
| Precio | $0 | Desde $25 USD/mes por organización; incluye $10/mes de crédito de cómputo (cubre una instancia Micro) |
| Backups automáticos | **No incluidos**; la doc recomienda exportar con `supabase db dump` y guardar fuera | Diarios, se conservan 7 días |
| PITR | No disponible | Add-on: ~$100/mes (7 días), ~$200 (14), ~$400 (28); **exige cómputo Small o mayor** (~$15/mes, o sea ~$5 sobre el crédito) |
| Pausa por inactividad | Se pausa con baja actividad en 7 días; restaurable desde Studio | Nunca se pausa |
| Base de datos | 500 MB | 8 GB de disco, luego $0.125/GB |
| Storage de archivos | 1 GB | 100 GB, luego $0.0213/GB |
| Egress | 5 GB (+5 GB cacheado) | 250 GB (+250 GB cacheado), luego $0.09/GB ($0.03 cacheado) |
| MAU | 50,000 | 100,000 |
| Retención de logs | 1 día | 7 días |
| Spend cap | — | Activo por defecto |

Lectura para este proyecto: es una liga en arranque, con **≤ ~40 jugadores esta temporada** (dato del owner, 2026-10-16). A ~6 MB por jugador (5 documentos digitales + foto de ~1 MB) son ~240 MB, alrededor del **25 %** del 1 GB de Storage de Free; la base y el egress quedan muy por debajo. El volumen no justifica Pro. Lo que sí pesaba era (1) **no hay backups automáticos en Free**: perder la base implica rehacer la captura de documentos de menores; y (2) **la pausa por inactividad** en temporada baja. Opciones evaluadas: **Free + backups propios** ($0); **Pro** ($25/mes; backups diarios de 7 días, sin pausa; tampoco cubre los objetos de Storage); **Pro + PITR 7 días** (~$130/mes; desproporcionado).

**Decisión del owner (2026-10-16): Free.** Los backups serán automáticos (tipo cron), nocturnos y cifrados, de la base **y** de Storage, en la issue aparte **#87**. El repo es público, así que los artifacts de Actions tienen que ir cifrados. #87 está fuera de alcance de #6.

**Verificado:** los backups de Supabase **no incluyen los objetos de Storage**. La doc oficial de [Backups](https://supabase.com/docs/guides/platform/backups) dice: *"Database backups do not include objects you store via the Storage API"*. Por eso #87 tiene que respaldar Storage por separado; un `db dump` solo no basta.

**No verificado / a confirmar:**
- La ventana de restauración de un proyecto Free pausado: la página oficial dice "hasta 1 año" y resúmenes de búsqueda decían 90 días. Prevalece la doc oficial, pero hay que reconfirmar en el Dashboard.
- Un blog de terceros (2026) menciona un cambio para proyectos Free "a partir del 30 de octubre de 2026"; la doc oficial no tiene fechas. No verificado.
- Si el job nocturno de #87 cuenta como actividad que evita la pausa de Free. Se resuelve en #87.
- Los precios están en USD, sin impuestos; el precio de Pro es "desde" (por organización, con el cómputo aparte del crédito).

## 8. Fuera de alcance

- **Leaked-password protection** (`auth_leaked_password_protection` WARN): la app es passwordless (magic link), no hay contraseñas que comprobar.
- **Advisors de performance** (4 lints: FKs sin índice, `profiles_select` con `auth_rls_initplan`, `players_tenant_idx` sin uso, estrategia de conexiones de auth): van a una issue de tech-debt aparte.
- **#87** backups automáticos cifrados (base + Storage) en Free.
- **#44** archivos huérfanos en Storage; **#46** carrera upload/consentimiento; **#7** SMTP propio.
- Grants del schema `storage` y de `graphql`/`graphql_public`, que son de Supabase (§2).
- Automatizar el checklist en CI.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Una función de `private` que alguna policy llama sin grant explícito pierde EXECUTE al quitar PUBLIC | Verificado hoy: las policies solo usan tres helpers (`current_tenant_id`, `is_admin`, `player_file_path_allowed`), todos con grant explícito; `player_consent_granted` (triggers) también lo tiene. B3 fija los cuatro y la regresión de 0002/0012/0013 lo confirma. |
| El global `revoke execute on functions from public` (aprobado por el owner) sorprende a una función futura en otro schema | Solo aplica a funciones creadas por `postgres`. En `public`, `authenticated`/`service_role` siguen en el default; en cualquier otro schema hace falta un grant explícito (§4.3, regla 1). |
| Ese mismo global rompe helpers de test (`pg_temp.*`, `tests.*`) llamados como `authenticated`/`anon` | Regla de helpers de test (§4.3, regla 2). 0002/0012/0013 se editan en la misma rama y se re-corren después de 0016 (§5.4). Un test futuro que la olvide falla con `42501` en su primera corrida, no en silencio. |
| Un JWT expirado hace que una request caiga a `anon` y cambie de "lista vacía" a 401 | supabase-js refresca el token antes; si llega a pasar, la UI muestra error en vez de datos vacíos, que es más honesto. El E2E corre con sesiones reales. |
| Supabase re-aplica grants por defecto a `anon` en un upgrade de plataforma | El check §3.1-B se re-corre antes de cada carga y lo detecta. |
| Fixtures persistentes del pgTAP por MCP (no hay rollback entre llamadas) | Prefijo `eeeeeeee-…`, lista completa y orden de borrado (§5.2, §5.4), conteo contra la línea base y `get_advisors` después del `drop` de los objetos `zz_acl_probe`. |
| El E2E deja datos o archivos de prueba | Los objetos se quitan por la Storage API **antes** de borrar el player (el SQL sobre `storage.objects` está bloqueado por trigger) y se confirma con SQL (§6). |
