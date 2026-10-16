# Checklist previo a datos reales y evaluación de Supabase Pro (#6) — Diseño

**Fecha:** 2026-10-16
**Estado:** Borrador (pendiente de revisión)
**Issue:** [#6](https://github.com/aiyangar/ligaspequenas/issues/6) — master spec §7 (`2026-06-22-liga-mty-registro-jugadores-design.md`)

## 1. Contexto y objetivo

Antes de cargar datos reales de menores (CURP, actas, fotos) hay que demostrar, con evidencia reproducible, que la base está cerrada. La issue #6 lista seis puntos; el owner aprobó el alcance de este diseño el 2026-10-16.

La auditoría read-only del orquestador (2026-10-16, proyecto `eksbaugyypadtanyjcje`) da casi todo en verde, con un hallazgo: **`anon` tiene SELECT/INSERT/UPDATE/DELETE sobre todas las tablas y vistas de `public`** (grants por defecto de Supabase) y **EXECUTE sobre todas las funciones de `private` y sobre `public.set_updated_at`**. Hoy no hay fuga, porque ninguna policy apunta a `anon` y `anon` no tiene USAGE sobre `private`. Pero eso deja la seguridad en una sola capa (RLS): si una policy futura olvida `to authenticated`, `anon` la hereda. La re-verificación de este diseño encontró además que el EXECUTE de `anon` sobre `private.*` **no es un grant directo: viene de `PUBLIC`** (`proacl = {=X/postgres,…}` o `NULL`, que es el default de Postgres). Por eso un `revoke … from anon` no basta (§4.2).

Objetivo:

1. Un documento de checklist **reproducible** (`docs/security/pre-real-data-checklist.md`) que se vuelve a correr antes de cada carga de datos reales.
2. Defensa en profundidad: `anon` sin privilegios sobre objetos de la app, hoy y para los objetos futuros.
3. Lock de consentimiento verificado de punta a punta en navegador.
4. Una decisión del owner sobre Supabase Pro, informada y registrada.

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Forma del checklist | **Markdown versionado** en `docs/security/pre-real-data-checklist.md`, con un bloque por punto: *qué se exige*, *cómo se verifica* (SQL o shell exacto, copiable), *resultado esperado* y una tabla de corridas fechadas (fecha, commit de `develop`, resultado, quién). Descartado: script automatizado. Mitad de los puntos necesitan MCP o navegador, y un script a medias da falsa confianza. |
| Alcance de los revokes | `anon` pierde **todo** sobre tablas, vistas y secuencias de `public`, y EXECUTE sobre `private.*` y `public.set_updated_at`. `authenticated` y `service_role` **no cambian**. Se conserva USAGE de `anon` sobre el schema `public`: PostgREST lo necesita para responder con un 401/42501 limpio en vez de un error de schema, y sin privilegios sobre objetos ese USAGE no expone nada. |
| EXECUTE vía `PUBLIC` | **`revoke execute … from public`** (además de `anon`) en `private.*` y `public.set_updated_at`. Los cuatro helpers que usan las policies (`current_tenant_id`, `is_admin`, `player_consent_granted`, `player_file_path_allowed`) ya tienen grant explícito a `authenticated` (0003, 0012), así que no se tocan. Las funciones de trigger no necesitan EXECUTE: Postgres lo comprueba al hacer `CREATE TRIGGER`, no cuando el trigger se dispara. El pgTAP lo fija con comportamiento (§5, grupo D). |
| Default privileges | Solo para el rol **`postgres`**, que es el owner de todos los objetos de la app (verificado: tablas, vistas, funciones y el schema `private`). (a) `alter default privileges for role postgres in schema public revoke all on tables / sequences / functions from anon;` (b) `alter default privileges for role postgres revoke execute on functions from public;` en forma **global**: el EXECUTE a PUBLIC es un default global de Postgres, y un `in schema` solo puede añadir privilegios sobre el global, no quitarlos. Con (b), las funciones futuras de `public` siguen ejecutables por `authenticated` y `service_role`, porque el default de `postgres` en `public` ya se los da. Las de `private` quedan solo para el owner y requieren `grant` explícito, que ya es la convención del repo. Descartado: `supabase_admin`. `postgres` no puede alterar sus defaults (no es miembro) y no crea objetos de la app. El check §3.1-B detecta cualquier grant a `anon` sea cual sea el owner. |
| Schema `storage` | **Fuera** de esta migración. `storage.objects` es de Supabase; el control real son el bucket privado y las policies `to authenticated` de 0012. El checklist verifica ambos (§3.1-D). |
| Rollback | Migración **forward** de re-grant (§4.4), no `git revert` a secas. Revertir el commit no deshace un DDL ya aplicado al proyecto remoto. El SQL de re-grant queda escrito en este spec para aplicarlo sin pensar. |
| E2E | Lo corre el **orquestador** con Playwright (Chromium persistente vía CDP, magic link asistido por el owner), después de aplicar 0016. Así prueba a la vez el lock y que `authenticated` no cambió. Descartado: agente tester. |
| Supabase Pro | Este diseño **no decide**: entrega la comparación (§7) y el owner registra su decisión en el checklist. Es criterio de cierre de #6. |
| Entrega | Rama `update/pre-real-data-spec` (este spec). Luego `fix/revoke-anon-privileges` (0016 + pgTAP) y una rama aparte para el documento de checklist con la primera corrida (`update/pre-real-data-checklist`). Una tarea, una rama. |

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
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as priv
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
  and has_table_privilege('anon', c.oid, priv)
union all
select 'function', n.nspname || '.' || p.proname, 'EXECUTE'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'private' or (n.nspname = 'public' and p.proname = 'set_updated_at'))
  and has_function_privilege('anon', p.oid, 'EXECUTE')
union all
select 'default_acl', coalesce(ns.nspname, '<global>') || ':' || d.defaclobjtype, a.privilege_type
from pg_default_acl d
left join pg_namespace ns on ns.oid = d.defaclnamespace
cross join aclexplode(d.defaclacl) a
where d.defaclrole = 'postgres'::regrole
  and (ns.nspname in ('public', 'private') or d.defaclnamespace = 0)
  and a.grantee in ('anon'::regrole, 0);
```

Verde: 0 filas. `grantee = 0` es `PUBLIC`. Como el EXECUTE a PUBLIC es implícito cuando no hay fila global, se exige además que esta query devuelva `1`:

```sql
select count(*) from pg_default_acl d
where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
  and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0);
```

 Nota: `has_function_privilege` sobre `private.*` da `true` aunque `anon` no tenga USAGE del schema; por eso se verifica el privilegio y no la llamabilidad.

**C. Ningún secreto en variables públicas ni archivos `.env` en git.** Desde la raíz del repo en `develop`:

```sh
git ls-files | grep -E '(^|/)\.env' | grep -v '^\.env\.example$'
grep -rnoE 'VITE_[A-Z0-9_]+' src | sed 's/.*://' | sort -u
grep -rnE 'sb_secret_|service_role|SERVICE_ROLE' src .env.example
curl -s https://ligaspequenas.vercel.app/ | grep -oE '/assets/[^"]+\.js' | sort -u \
  | while read -r a; do curl -s "https://ligaspequenas.vercel.app$a"; done \
  | grep -oE 'sb_secret_[A-Za-z0-9_-]+|service_role|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' | sort -u
```

Verde: (1) vacío; (2) exactamente `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_URL`; (3) vacío; (4) vacío (el bundle solo lleva el `sb_publishable_…`, que no matchea). Si (4) encuentra un JWT, se decodifica el payload (`echo <payload> | base64 -d`) y debe ser `"role":"anon"`; cualquier otro rol es rojo. `SUPABASE_SERVICE_ROLE_KEY` solo puede aparecer en `supabase/functions/` vía `Deno.env.get`.

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

**F. Decisión sobre Supabase Pro.** Una línea fechada con la decisión del owner (Free / Pro / Pro + PITR) y el motivo. Si es Free: el procedimiento de respaldo manual (`pnpm exec supabase db dump --project-ref …` antes de cada carga) y quién lo corre.

**G. (informativo) Advisors de seguridad.** `get_advisors(security)`: solo se acepta `auth_leaked_password_protection` (la app es passwordless; ver §8). Cualquier otro lint es rojo.

### 3.2 Criterio de cierre de #6

A–E en verde en una misma corrida fechada sobre `develop`, F registrado y G sin lints nuevos. La issue se cierra con el link al checklist.

## 4. Migración `0016_revoke_anon_privileges.sql`

### 4.1 Por qué no rompe nada

| Flujo | Rol en Postgres | Por qué no se afecta |
|---|---|---|
| Login magic link / `/auth/callback` | ninguno | `signInWithOtp` y el intercambio de sesión van a GoTrue (`/auth/v1`), que usa `supabase_auth_admin` y no PostgREST. `TenantProvider` consulta `profiles` solo cuando ya hay `session`, así que esa consulta corre como `authenticated`. |
| App autenticada (tablas, vistas, Storage) | `authenticated` | Sus grants no cambian. Las policies solo llaman a los cuatro helpers con grant explícito (verificado en `pg_policies`: `current_tenant_id`, `is_admin`, `player_file_path_allowed`). Los triggers no exigen EXECUTE. |
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
- No hay secuencias hoy (PKs `uuid`); la línea existe para que el estado sea correcto si se añade una.
- **No** se re-otorga nada a `authenticated`: los grants explícitos de 0003/0012 sobreviven al `revoke … from public`.
- Se aplica con `mcp__supabase__apply_migration` (nombre `revoke_anon_privileges`) y después se corre `get_advisors(security)`.

### 4.3 Invariante para migraciones futuras

Toda función nueva en `private` que una policy o el cliente llame necesita `grant execute … to authenticated` explícito, porque ya no lo hereda de PUBLIC. Las de trigger no. El repo no tiene `CLAUDE.md`, así que la regla queda como nota fija en el checklist (sección "Convenciones"). Si se olvida, el pgTAP de la policy que usa el helper falla con `42501`.

### 4.4 Rollback (forward)

Migración `<siguiente número libre>_regrant_anon_privileges.sql`, que se aplica solo si 0016 rompe algo en producción. Después se abre una rama nueva para reintentar:

```sql
grant select, insert, update, delete, truncate, references, trigger on all tables in schema public to anon;
grant usage, select, update on all sequences in schema public to anon;
grant execute on all functions in schema private to public;
grant execute on function public.set_updated_at() to public, anon;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant execute on functions to anon;
alter default privileges for role postgres grant execute on functions to public;
```

Esto deja exactamente el estado auditado el 2026-10-16. Los grants explícitos de `authenticated` nunca se tocaron.

## 5. pgTAP `supabase/tests/0016_revoke_anon_privileges.test.sql`

Forma canónica del repo (`begin; select extensions.plan(N); … select * from extensions.finish(); rollback;`) con helpers `pg_temp.try_sql`/`count_sql` como en 0013. Al correrlo por MCP se usa el truco de dos sentencias: `select extensions.plan(N);` y luego un único `select extensions.is(…) union all …`, con fixtures persistentes que se insertan antes y se borran después. Solo hay aserciones `is()`; nada estructural (`has_*`, `fk_ok`). Prefijo de fixtures `eeeeeeee-…` (tenant X, admin X, player P).

| # | Aserción (`is(got, expected, desc)`) | Esperado |
|---|---|---|
| A1 | count de `(relación de public, privilegio)` con `has_table_privilege('anon', …)` — misma query que §3.1-B, parte relation | `0` |
| A2 | count de tablas base de `public` donde `authenticated` **no** tiene alguno de SELECT/INSERT/UPDATE/DELETE | `0` |
| A3 | count de vistas de `public` donde `authenticated` no tiene SELECT | `0` |
| A4 | count de relaciones de `public` donde `service_role` no tiene SELECT | `0` |
| B1 | count de funciones de `private` ejecutables por `anon` | `0` |
| B2 | count de funciones de `private` cuyo `proacl` explota con `grantee = 0` (PUBLIC) **o** tiene `proacl is null` | `0` |
| B3 | `has_function_privilege('authenticated', 'private.current_tenant_id()', 'EXECUTE')` y lo mismo para `is_admin()`, `player_consent_granted(uuid)` y `player_file_path_allowed(text)` (4 aserciones) | `true` |
| B4 | `has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')` | `false` |
| C1 | count de entradas en `pg_default_acl` de `postgres` en `public` con `grantee = anon` | `0` |
| C2 | count de filas de `pg_default_acl` global de `postgres` (`defaclnamespace = 0`, `defaclobjtype = 'f'`) cuyo `aclexplode(defaclacl)` **no** contiene `grantee = 0`. Sin fila, el EXECUTE a PUBLIC es implícito, así que se exige que la fila exista | `1` |
| C3 | con `create table public.zz_acl_probe (id int)` creada como `postgres` en el fixture: `has_table_privilege('anon', 'public.zz_acl_probe', 'SELECT')` | `false` |
| C4 | ídem: `has_table_privilege('authenticated', 'public.zz_acl_probe', 'SELECT')` | `true` |
| C5 | con `create function private.zz_acl_probe() returns int language sql as 'select 1'`: `has_function_privilege('anon', 'private.zz_acl_probe()', 'EXECUTE')` | `false` |
| D1 | como `anon` (`set_config('role','anon',true)`): `left(try_sql('select 1 from public.players limit 1'), 5)` | `'42501'` |
| D2 | como `anon`: `left(try_sql('select 1 from public.player_payment_status limit 1'), 5)` | `'42501'` |
| D3 | como admin X (`authenticated` + claims): insertar el player P vía `try_sql` | `'ok'` |
| D4 | como admin X: `count(*)` de `public.documents` de P (el trigger de seed sigue disparando) | `6` |
| D5 | como admin X: `try_sql` de un `update public.documents set status = 'digital' … doc_type = 'curp'` sin consentimiento (el trigger de reglas sigue disparando) | `'P0001 consent_required'` |
| D6 | como admin X: `update public.seasons set name = name` sobre la season fixture, insertada con `updated_at = '2000-01-01'` porque `now()` es constante dentro de la transacción; luego `updated_at > '2000-01-01'` (dispara `set_updated_at`) | `true` |

N = 22. Limpieza al final (como `postgres`): borrar los fixtures `eeeeeeee-…` y `drop table public.zz_acl_probe; drop function private.zz_acl_probe();`, y confirmar que el conteo de players/tenants vuelve a la línea base. En forma canónica el `rollback` ya lo hace. Como regresión, en la misma rama se re-corren los pgTAP de 0002 (RLS), 0012 y 0013 por MCP; deben seguir verdes.

TDD: el test se corre **antes** de aplicar 0016 y debe fallar en A1, B1, B2, B4, C1, C2 (hoy no hay fila global), C3, C5, D1 y D2 (rojo documentado en el plan). Después se aplica 0016 y pasa completo.

## 6. E2E del lock de consentimiento (orquestador, Playwright)

Se ejecuta contra `pnpm dev` (`http://localhost:5173`, mismo proyecto remoto) **después** de aplicar 0016. Fixture: un player nuevo creado desde la UI como admin, `full_name = 'E2E Consent Lock'`, que se borra al final junto con sus objetos de Storage (el orquestador limpia y confirma con SQL: `select count(*) from storage.objects where name like '<tenant>/<player>/%'` → 0). Archivo de prueba: un PDF mínimo (< 10 MB).

Cada escenario verifica la **UI** y además el **servidor** directamente. Desde `page.evaluate`, con el access token de la sesión (localStorage `sb-eksbaugyypadtanyjcje-auth-token`) y el publishable key, se llama `POST /storage/v1/object/player-files/<tenant>/<player>/<doc>` y `PATCH /rest/v1/documents?id=eq.<id>`. Así el lock no depende solo de que el botón esté deshabilitado.

| # | Rol / estado | Pasos | Resultado esperado |
|---|---|---|---|
| E1 | admin; ambos consentimientos `Pendiente` | Abrir la ficha del player | Alert info "Para subir la foto o documentos digitales, primero registra…". "Subir archivo" **deshabilitado** en CURP, Acta, Comprobante y Constancia médica; **habilitado** en Consentimiento de imagen y Aviso de privacidad. Subir foto deshabilitado con caption "Requiere consentimiento…". |
| E1-API | ídem | POST de Storage a `…/curp` | 4xx con error de RLS (`new row violates row-level security policy`); `storage.objects` sin el objeto. PATCH `documents` (curp → `digital`, `file_path` correcto) → error `consent_required`. |
| E2 | admin | Consentimiento de imagen → Físico; Aviso de privacidad → Físico | La alert desaparece y se habilitan los botones de subida y de foto. |
| E2b | admin; con consentimiento | Subir el PDF en CURP; subir una foto | Chip CURP = "Digital"; "Ver" abre una pestaña con URL `/storage/v1/object/sign/player-files/…token=`; la foto se muestra. |
| E3 | admin; CURP digital y foto presentes | Intentar Aviso de privacidad → Pendiente | La opción "Pendiente" está deshabilitada con el helper "Quita primero la foto y los documentos digitales." PATCH directo → `consent_in_use`. |
| E3b | admin | CURP → Físico (confirmar "Eliminar archivo"); quitar la foto; Aviso de privacidad → Pendiente | La revocación se acepta, la alert info vuelve y los botones de subida no-consentimiento se deshabilitan otra vez. POST de Storage a `…/curp` → 4xx RLS. |
| E4 | readonly del mismo tenant (magic link asistido) | Abrir la ficha (con un documento digital previo de E2b re-subido, o CURP en Físico) | Sin selects "Estatus", sin botones de subida, sin alert info; "Ver" disponible si hay un digital. POST de Storage → 4xx RLS (`is_admin()` falso). PATCH `documents` → sin filas afectadas o error de RLS; el estado no cambia (re-lectura). |
| E5 | sin sesión | `GET /rest/v1/players?select=id` solo con el publishable key; URL pública del objeto (§3.1-D) | REST → 401 con `42501` (antes de 0016 era 200 `[]`); Storage público → no-200. |

Cada escenario queda en la tabla de corridas del checklist con fecha y resultado. Un fallo en E1–E4 bloquea la carga de datos y se trata con `systematic-debugging` en su propia rama. Si el fallo lo causó 0016, se aplica §4.4 primero.

## 7. Supabase Free vs Pro (para la decisión del owner)

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

Lectura para este proyecto (una liga, decenas a cientos de jugadores). El volumen no presiona ningún límite: 1 GB de Storage alcanza para unos 150–170 jugadores si cada uno tiene 5 documentos digitales + foto de ~1 MB (~6 MB por jugador). Es el primer límite que se alcanzaría, y se puede manejar subiendo solo los documentos indispensables. Lo que sí pesa es (1) **no hay backups automáticos en Free**: perder la base implica rehacer la captura de documentos de menores; y (2) **la pausa por inactividad** en temporada baja. Opciones: **Free + `db dump` manual antes y después de cada carga** ($0; disciplina manual; no respalda los archivos de Storage); **Pro** ($25/mes; backups diarios de 7 días, sin pausa; tampoco cubre los objetos de Storage, que solo dependen de la durabilidad del servicio); **Pro + PITR 7 días** (~$130/mes; desproporcionado para este volumen).

**No verificado / a confirmar:**
- La ventana de restauración de un proyecto Free pausado: la página oficial dice "hasta 1 año" y resúmenes de búsqueda decían 90 días. Prevalece la doc oficial, pero hay que reconfirmar en el Dashboard.
- Un blog de terceros (2026) menciona un cambio para proyectos Free "a partir del 30 de octubre de 2026"; la doc oficial no tiene fechas. No verificado.
- Si los backups diarios de Pro incluyen los objetos de Storage: la doc de backups habla de la base de datos. Asumido **no** hasta confirmarlo.
- Los precios están en USD, sin impuestos; el precio de Pro es "desde" (por organización, con el cómputo aparte del crédito).

## 8. Fuera de alcance

- **Leaked-password protection** (`auth_leaked_password_protection` WARN): la app es passwordless (magic link), no hay contraseñas que comprobar.
- **Advisors de performance** (4 lints: FKs sin índice, `profiles_select` con `auth_rls_initplan`, `players_tenant_idx` sin uso, estrategia de conexiones de auth): van a una issue de tech-debt aparte.
- **#44** archivos huérfanos en Storage; **#46** carrera upload/consentimiento; **#7** SMTP propio.
- Grants del schema `storage` y de `graphql`/`graphql_public`, que son de Supabase (§2).
- Automatizar el checklist en CI.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Una función de `private` que alguna policy llama sin grant explícito pierde EXECUTE al quitar PUBLIC | Verificado hoy: las policies solo usan los cuatro helpers con grant explícito. B3 los fija y la regresión de 0002/0012/0013 lo confirma. |
| El global `revoke execute on functions from public` sorprende a una función futura en otro schema | Solo aplica a funciones creadas por `postgres`. En `public`, `authenticated`/`service_role` siguen en el default; en `private`, el grant explícito ya es la convención (§4.3). |
| Un JWT expirado hace que una request caiga a `anon` y cambie de "lista vacía" a 401 | supabase-js refresca el token antes; si llega a pasar, la UI muestra error en vez de datos vacíos, que es más honesto. El E2E corre con sesiones reales. |
| Supabase re-aplica grants por defecto a `anon` en un upgrade de plataforma | El check §3.1-B se re-corre antes de cada carga y lo detecta. |
| Fixtures persistentes del pgTAP por MCP (no hay rollback entre llamadas) | Prefijo `eeeeeeee-…`, limpieza explícita y conteo contra la línea base (memoria del proyecto). |
| El E2E deja datos o archivos de prueba | El orquestador borra el player y los objetos y confirma con SQL (§6). |
