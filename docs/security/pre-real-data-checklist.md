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
| 2026-10-18 (2026-10-19 UTC) | `0f17400` | `44bc392` (`main`) | verde | verde | verde | verde | verde | verde | verde | orquestador (Claude) + owner |

### Detalle de la corrida 2026-10-18 (2026-10-19 UTC)

- **A:** tablas sin RLS o sin policies → 0 filas; vistas sin `security_invoker` → 0 filas. Informativo: 31 policies en `public`, todas con roles `{authenticated}`.
- **B:** unión → 0 filas (`relation` 0, `function` 0, `default_acl` 0); query global → `1`. Última migración en remoto: `20261016233000 0016_revoke_anon_privileges` (aplicada 2026-10-16).
- **C:** (1) vacío (solo `.env.example`, excluido); (2) exactamente `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_URL`; (3) vacío; (4) producción (`44bc392`, deploy de Vercel 2026-10-16T15:46:10Z): lista `/assets/index-aX0m6XPV.js` y `/assets/browser-BoWduoKG.js` (control positivo presente), matches vacío — corrido en zsh con los mismos comandos guardados en archivos, porque un control de seguridad del entorno bloqueó `bash -c`; (5) build de `0f17400` con `.env` real: `browser-BoWduoKG.js` presente, conteo de `sb_publishable_` = 1, matches vacío.
- **D:** buckets públicos → 0 filas; policies de `storage.objects` fuera de `{authenticated}`/`player_files_*` → 0 filas. `curl` sin sesión a `…/object/public/player-files/00000000-0000-0000-0000-000000000001/.emptyFolderPlaceholder` → 400; en E5, ruta real de una CURP → 400.
- **E (pgTAP):** tras 0016: R-0012 25/25 `ok`, R-0013 21/21 `ok` (además R-0002 6/6, R-0014 17/17, R-0015 21/21, 0016 22/22). La corrida roja de R-0015 antes de 0016 no se obtuvo (la sesión del MCP de Supabase expiraba: "Invalid or expired requestState" repetido).
- **F:** Free + backups automáticos cifrados (#87). Estado de #87: abierto (OPEN).
- **G:** solo `auth_leaked_password_protection` (aceptado: app passwordless).

Residuo tras todas las corridas: todo 0/null; baseline sin cambios (tenants 1, profiles 3, users 3, players 1, documents 6, seasons 1, objects 1). Follow-ups: #90, #91.

| Escenario E2E | Resultado |
|---|---|
| E1 | verde — alerta visible; "Subir archivo" deshabilitado en CURP/Acta/Comprobante/Constancia y habilitado en ambos consentimientos; "Subir foto" deshabilitado con leyenda |
| E1-API | verde — upload 400 (RLS 403); PATCH 400 `P0001 consent_required`; SQL: 0 objetos, CURP `pendiente` |
| E2 | verde — consentimientos → Físico; alerta desaparece; uploads y "Subir foto" habilitados |
| E2b | verde — CURP Digital; "Ver" abre `/storage/v1/object/sign/player-files/…?token=`; la foto se muestra |
| E3 | verde — Aviso → opción Pendiente deshabilitada con "Quita primero la foto y los documentos digitales."; PATCH directo 400 `P0001 consent_in_use` |
| E3b | verde — CURP → Físico, quitar foto, Aviso → Pendiente aceptado; alerta de vuelta; uploads no-consentimiento deshabilitados; upload por API 400 RLS |
| E3c | verde — Aviso → Físico; CURP resubida, chip Digital |
| E4 | verde (readonly) — sin selects de Estatus ni inputs de upload ni alerta; "Ver" → URL firmada; upload 400 RLS; PATCH 200 `[]`; SQL sin cambios |
| E5 | verde (sin sesión) — REST `/players` → 401 `42501`; URL pública de storage → 400 |
