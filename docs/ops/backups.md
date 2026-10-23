# Respaldos nocturnos cifrados (#87) — Runbook

Cómo funciona el respaldo nocturno, cómo se configura la primera vez y cómo se restaura. Diseño y motivos: `docs/superpowers/specs/2026-10-22-nightly-backups-design.md`; plan de implementación: `docs/superpowers/plans/2026-10-23-nightly-backups.md`.

Los comandos se corren con **bash** o **zsh** en el Mac del owner, desde la raíz de un checkout de `develop`, salvo que se indique otra cosa. Las URLs, llaves y contraseñas **nunca** se escriben en la línea de comandos: se leen con `read -rs` (no quedan en el historial) o se copian del gestor de contraseñas al portapapeles.

## Qué hay y qué no

El workflow `.github/workflows/backup.yml` corre cada noche a las 09:17 UTC (03:17 en Monterrey) y sube **un solo artifact** `backup-<YYYY-MM-DD>T<HHMM>Z` con un archivo `backup-<ts>.tar.age`, cifrado con `age` para las dos llaves públicas de `ops/backup/recipients.txt`. GitHub lo borra a los **30 días**.

Dentro del tar cifrado:

| Archivo | Contenido |
|---|---|
| `db/roles.sql` | Roles propios del cluster (`supabase db dump --role-only`). |
| `db/schema.sql` | Schema de la app (`public`, `private`, …), con grants, `ALTER DEFAULT PRIVILEGES` y policies de `public`. **No** incluye los schemas `auth` ni `storage`. |
| `db/data.sql` | Datos de todos los schemas, incluidos `auth` y `storage` (`--data-only --use-copy`, sin `storage.buckets_vectors` ni `storage.vector_indexes`). |
| `db/migrations-schema.sql` | La tabla `supabase_migrations.schema_migrations` (`CREATE … IF NOT EXISTS`), que un proyecto nuevo todavía no tiene. |
| `db/migrations-history.sql` | Las filas de esa tabla: qué migraciones ya están aplicadas. |
| `storage/player-files/<ruta>` | Cada objeto del bucket `player-files`, incluido `.emptyFolderPlaceholder`. |
| `storage-index.json` | `[{ path, size, mimetype }]` de cada objeto; lo usa `storage-restore.ts`. |
| `manifest.json` | Fecha, commit, versión del CLI (2.107.0), `sha256` y tamaño de cada archivo, número de objetos. |
| `SHA256SUMS` | Los mismos hashes en el formato de `shasum -a 256 -c`. |

En el log público de Actions solo salen conteos (`recipients=2`, `objects=<n> bytes=<n>`, `db_objects=<n> storage_objects=<n>`, `files=<n>`) o una línea `error: <código>`. Nunca rutas, nombres, URLs ni contenido.

**No** se respalda (se reconfigura a mano al restaurar):

- La configuración de Auth del Dashboard: Site URL, redirect URLs, plantillas de correo, proveedores.
- Los secrets de la Edge Function `invite-user` (su código ya está en git).
- La configuración de SMTP.
- El schema `vault`, que el dump de datos excluye. Hoy tiene **0 secretos**; si algún día se usa, hay que respaldarlo aparte.

## Configuración inicial (owner, una vez)

El orquestador no ve ni maneja ninguno de estos valores. Mientras `ops/backup/recipients.txt` no tenga las dos llaves públicas, el workflow falla a propósito en el step "Check recipients", antes de tocar la base.

### 1. Llaves `age`

```bash
brew install age libpq
```

Se generan **dos** llaves X25519 (sin `-pq`: el `age` de apt en el runner no las entiende y `check-recipients` las rechaza). Las llaves privadas **nunca** tocan el disco:

```bash
# Principal: la llave privada va al portapapeles; la pública sale en la terminal ("Public key: age1…").
age-keygen | pbcopy
# Pegar el portapapeles en una entrada nueva del gestor de contraseñas ("ligaspequenas backups — principal"). Luego vaciarlo:
pbcopy < /dev/null
```

Para la de **recuperación** hay dos opciones:

- **Impresa:** el mismo flujo (`age-keygen | pbcopy`), pegar en un documento de TextEdit **sin guardar**, imprimir, cerrar sin guardar y `pbcopy < /dev/null`. La impresión pasa por la cola de CUPS en disco: al terminar, `cancel -a -x` borra los trabajos.
- **USB:** generarla en un disco en RAM y copiarla a la USB:

```bash
ram=$(hdiutil attach -nomount ram://16384 | tr -d '[:space:]')
diskutil erasevolume APFS backupsram "$ram"
age-keygen -o /Volumes/backupsram/recuperacion.txt   # imprime "Public key: age1…"
cp /Volumes/backupsram/recuperacion.txt /Volumes/<USB>/
hdiutil detach "$ram"
```

La USB (o la hoja) se guarda en **otro lugar físico** que el Mac. Anotar las dos líneas `age1…` que se vieron en la terminal.

### 2. Supabase (Dashboard)

1. Si la contraseña de la base tiene símbolos, cambiarla por una **alfanumérica** (Database → Settings → Reset database password; riesgo R1: un carácter escapado en la URL podría salir sin máscara en un error del CLI).
2. Connect → **Session pooler** (puerto 5432, usuario `postgres.<ref>`): copiar el connection string con la contraseña. Es el valor de `SUPABASE_DB_URL`.
3. Settings → API Keys → crear una **secret key** con nombre `backups`. Es el valor de `SUPABASE_BACKUP_SECRET_KEY`. Es distinta de la que usa `invite-user`, así se revoca sola.

### 3. healthchecks.io

Crear un check con **periodo 1 día y gracia 1 día** (aviso a las 48 h sin ping), con aviso por correo al owner. La URL de ping es el valor de `HEALTHCHECK_PING_URL` y no se publica (basta para mandar pings falsos).

### 4. GitHub: Environment `backups`

Crearlo **antes** de la primera corrida. Si un job referencia un Environment que no existe, GitHub lo crea solo y **sin protección**; si ya existe, revisar su regla.

1. Settings → Environments → New environment → `backups`.
2. Deployment branches and tags → **Selected branches and tags** → agregar `develop` y nada más.
3. Secrets y variable del Environment (`gh` pide el valor sin mostrarlo; pegar del gestor de contraseñas):

```bash
gh secret set SUPABASE_DB_URL --env backups
gh secret set SUPABASE_BACKUP_SECRET_KEY --env backups
gh secret set HEALTHCHECK_PING_URL --env backups
gh variable set SUPABASE_URL --env backups --body 'https://eksbaugyypadtanyjcje.supabase.co'
```

### 5. PR con las llaves públicas

Desde una rama nueva, agregar a `ops/backup/recipients.txt` las **dos** líneas `age1…` (una por línea, debajo de los comentarios), abrir el PR a `develop` y, ya mergeado, lanzar una corrida manual: Actions → Nightly backup → Run workflow (o `gh workflow run backup.yml --ref develop`). Debe salir verde y con el ping recibido en healthchecks.io.

## Descargar y descifrar

Solo se restaura desde una corrida **confiable**: la nocturna (`schedule`) o una manual (`workflow_dispatch`) sobre `develop`. Una corrida de un PR puede subir artifacts sin pasar por el Environment `backups`, así que su contenido no prueba nada.

```bash
gh run list --workflow backup.yml --branch develop --event schedule --status success --limit 5
# Para corridas manuales: --event workflow_dispatch
gh run view <run-id> --json headBranch,event,headSha
```

`headBranch` debe ser `develop`, `event` debe ser `schedule` o `workflow_dispatch`, y `headSha` se anota para compararlo con `manifest.json`. Si algo no coincide, ese artifact **no** se usa.

```bash
dir=$(mktemp -d)
gh run download <run-id> -n backup-<ts> -D "$dir"
# Copiar la llave principal del gestor de contraseñas al portapapeles. Así nunca se escribe en el disco.
age -d -i <(pbpaste) "$dir/backup-<ts>.tar.age" | tar -xf - -C "$dir"
pbcopy < /dev/null
(cd "$dir" && shasum -a 256 -c SHA256SUMS)
node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).commit)' "$dir/manifest.json"
```

Verde: todas las líneas en `OK`, y el `commit` que imprime la última línea es igual al `headSha` de `gh run view`. Si difiere, se descarta el artifact. Con la llave de recuperación es igual: teclear o copiar su línea `AGE-SECRET-KEY-…` al portapapeles y usar el mismo `<(pbpaste)`.

`$dir` tiene datos de menores en claro: se borra con `rm -rf "$dir"` en cuanto termine la restauración o el simulacro.

## Restaurar la base

Siempre en un **proyecto nuevo** de Supabase (Free permite dos activos), con contraseña alfanumérica. El `psql` de `libpq` no queda en el `PATH` por defecto:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
read -rs NEW_DB_URL && export NEW_DB_URL   # Session pooler del proyecto nuevo
```

1. Cargar el respaldo en una sola transacción:

```bash
cd "$dir/db"
psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f roles.sql -f schema.sql -f migrations-schema.sql \
  -c 'SET session_replication_role = replica' -f data.sql -f migrations-history.sql
cd -
```

   El `-c` desactiva triggers y llaves foráneas mientras se cargan los datos, como indica la guía de Supabase.

2. Volver a aplicar, en este orden, las migraciones que el dump no reproduce:

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0012_player_files_storage.sql
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0016_revoke_anon_privileges.sql
```

   - `0012`: la fila del bucket (idempotente) y las policies de `storage.objects`, porque el dump de schema no incluye `storage`.
   - `0016`: pg_dump escribe los permisos relativos a los defaults de Postgres, y un proyecto nuevo de Supabase da ALL a `anon` sobre lo que se crea en `public`. Sin 0016, el proyecto restaurado le devuelve privilegios a `anon` (checklist B en rojo). Son solo revokes, así que correrla dos veces es seguro.

   **Regla:** toda migración que toque `auth`/`storage` **o que revoque privilegios** se agrega a esta lista. Si una migración posterior redefine una función de 0012, aplicar de 0012 solo las policies.

3. Verificar privilegios. El bloque B del checklist (`docs/security/pre-real-data-checklist.md`) debe dar verde sobre el proyecto nuevo, **y** `authenticated` debe tener los mismos grants en los dos proyectos. Se corre esta query en producción (por MCP o `psql`) y en el restaurado, y se comparan:

```bash
cat > "$dir/privs.sql" <<'SQL'
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
order by 1, 2, 3;
select p.oid::regprocedure::text as fn
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'EXECUTE')
order by 1;
SQL
read -rs PROD_DB_URL && export PROD_DB_URL
psql "$PROD_DB_URL" -At -f "$dir/privs.sql" > "$dir/privs-prod.txt"
psql "$NEW_DB_URL" -At -f "$dir/privs.sql" > "$dir/privs-new.txt"
diff "$dir/privs-prod.txt" "$dir/privs-new.txt" && echo iguales
unset PROD_DB_URL
```

   Verde: `iguales`.

4. Correr el checklist A–D completo sobre el proyecto nuevo (A, B y D con `psql "$NEW_DB_URL"` en vez de MCP; en D, el `curl` con el ref nuevo).

5. Revisar el historial de migraciones:

```bash
psql "$NEW_DB_URL" -At -c 'select version, name from supabase_migrations.schema_migrations order by version'
```

   Debe listar las mismas migraciones que producción. Si falta alguna: `supabase migration repair --status applied <versiones> --db-url "$NEW_DB_URL"`, para que un `db push` posterior no intente re-aplicar 0001.

## Restaurar Storage

Con la base ya restaurada (`data.sql` trae las filas de `storage.objects` y la del bucket). En el proyecto nuevo, crear una secret key temporal (Settings → API Keys) y, desde la raíz del repo:

```bash
read -rs SUPABASE_RESTORE_SECRET_KEY && export SUPABASE_RESTORE_SECRET_KEY
node ops/backup/storage-restore.ts "$dir" 'https://<ref-nuevo>.supabase.co'
unset SUPABASE_RESTORE_SECRET_KEY
```

Imprime solo `restored=<n>`, que debe coincidir con `objects` de `manifest.json`. La llave se lee de la variable de entorno, nunca de un argumento. Cada archivo se sube con `x-upsert: true`, que reemplaza el binario de la fila que ya existe; el upsert deja `owner` en `null`, que la app no usa. Antes de subir, el script comprueba que cada ruta sea segura y que el tamaño coincida con `storage-index.json`; si algo falla imprime `error: <código> index=<n>` y sale con 1. Al terminar, borrar la secret key temporal.

## Restaurar producción

Ante corrupción o borrado, **nunca** se restaura encima del proyecto vivo. Siempre:

1. Proyecto nuevo, y las secciones anteriores completas (base, 0012 y 0016, privilegios, checklist A–D, Storage).
2. Reconfigurar a mano lo que no va en el respaldo: Auth (Site URL, redirect URLs, plantillas de correo), SMTP y los secrets de la Edge Function.
3. Desplegar la Edge Function: `supabase functions deploy invite-user --project-ref <ref-nuevo>`.
4. En Vercel, cambiar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` al proyecto nuevo y redesplegar. Las sesiones viejas dejan de valer: los usuarios vuelven a entrar con su enlace.
5. En el Environment `backups`, actualizar `SUPABASE_URL`, `SUPABASE_DB_URL` y `SUPABASE_BACKUP_SECRET_KEY` al proyecto nuevo, y lanzar una corrida manual.
6. Actualizar el ref del proyecto en `docs/security/pre-real-data-checklist.md` y correr el checklist completo.

## Simulacro

Lo corre el owner en su Mac, asistido por el orquestador, contra un proyecto Supabase **temporal**. Uno antes de la primera carga de datos reales, luego **cada trimestre** y después de cualquier cambio a `backup.yml` o a `ops/backup/`.

1. Elegir la última corrida verde con `gh run list --workflow backup.yml --branch develop --event schedule --status success --limit 5` (o `--event workflow_dispatch`), confirmar con `gh run view <run-id> --json headBranch,event,headSha` que es `develop` y `schedule`/`workflow_dispatch`, y anotar su `headSha` y el nombre del artifact. Después de descifrar, el `commit` de `manifest.json` debe ser igual a ese `headSha`; si no, se descarta.
2. Crear el proyecto temporal (contraseña alfanumérica).
3. Descargar y descifrar con la llave **principal**; `shasum -a 256 -c SHA256SUMS` en verde. Descifrar también con la de **recuperación** (en el primer simulacro siempre; después, al menos una vez al año).
4. Restaurar la base (pasos 1–5) y Storage.
5. Comparar conteos entre producción y el restaurado:

```sql
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int as filas
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1;
select count(*) as auth_users from auth.users;
select count(*) as objetos from storage.objects where bucket_id = 'player-files';
```

   Los objetos deben coincidir además con `objects` de `manifest.json` y con `restored=<n>`.
6. Checklist A–D en verde sobre el proyecto temporal.
7. Confirmar en healthchecks.io que el check sigue activo y recibió el último ping (riesgo R5).
8. Anotar la fila en la tabla de abajo.
9. Borrar el proyecto temporal y `rm -rf "$dir"`.

| Fecha | Commit | Artifact | Filas `public` (prod vs restaurado) | `auth.users` | Objetos | `sha256` | Checklist A–D | healthchecks activo | Resultado | Quién |
|---|---|---|---|---|---|---|---|---|---|---|

## Salud y rotación

**Dónde ver:** Actions → Nightly backup (la última corrida y su artifact), `gh run list --workflow backup.yml --limit 5`, y el panel de healthchecks.io. Un fallo de un workflow programado llega por correo a quien editó el cron por última vez; un cron caído llega por healthchecks.io a las 48 h sin ping.

**Cron desactivado:** GitHub desactiva los `schedule` de un repo público tras 60 días sin actividad. Se reactiva en Actions → Nightly backup → **Enable workflow** (o `gh workflow enable backup.yml`) y se lanza una corrida manual para no esperar a la noche.

**Rotar cada valor** (después de cada rotación, una corrida manual verde):

- **Contraseña de la base:** Dashboard → Database → Reset database password (alfanumérica). Actualizar `gh secret set SUPABASE_DB_URL --env backups` con el connection string nuevo del Session pooler.
- **Secret key `backups`:** crear una nueva en Settings → API Keys, `gh secret set SUPABASE_BACKUP_SECRET_KEY --env backups`, corrida manual verde y **después** borrar la vieja.
- **URL de ping:** crear un check nuevo en healthchecks.io con los mismos periodos, `gh secret set HEALTHCHECK_PING_URL --env backups`, corrida manual con ping recibido y borrar el check viejo.
- **Llaves `age`:** generar la llave nueva (sección 1 de la configuración) y abrir un PR que reemplace su línea en `ops/backup/recipients.txt` (siguen siendo exactamente dos). Los artifacts anteriores al merge solo se abren con la llave vieja: guardarla **30 días** más, hasta que expire el último artifact cifrado con ella, y luego destruirla.

## Archivos

- `.github/workflows/backup.yml`: el workflow nocturno (`schedule` + `workflow_dispatch`, Environment `backups`, actions fijadas por SHA).
- `ops/backup/recipients.txt`: las dos llaves públicas `age` (exactamente dos líneas `age1…`).
- `ops/backup/check-recipients.ts`: exige las dos llaves antes de tocar la base; imprime `recipients=2`.
- `ops/backup/storage-dump.ts`: lista y descarga `player-files`; imprime `objects=<n> bytes=<n>`.
- `ops/backup/crosscheck.ts`: compara las filas de `storage.objects` en `data.sql` con los objetos descargados (tolerancia 2); imprime `db_objects=<n> storage_objects=<n>`.
- `ops/backup/manifest.ts`: escribe `manifest.json` y `SHA256SUMS`; imprime `files=<n>`.
- `ops/backup/storage-restore.ts`: sube los objetos al proyecto restaurado; imprime `restored=<n>`.
- `ops/backup/lib/*.ts`: la lógica pura (paginación, rutas seguras, conteo del `COPY`, manifest, formato de errores sin rutas), con sus pruebas en `ops/backup/*.test.ts`.
- `tsconfig.ops.json`: el proyecto TypeScript de `ops/backup/` (lo revisa `tsc -b`).

Desviación del spec: el spec nombra los scripts `*.mjs`. Se escribieron como **`.ts` que Node 24 corre directo** (type stripping, `node ops/backup/<x>.ts`), sin paso de build y sin dependencias npm en tiempo de ejecución, para que `tsc -b` y ESLint también los cubran. Además del spec, el respaldo incluye `db/migrations-schema.sql`, porque un proyecto nuevo no tiene la tabla `supabase_migrations.schema_migrations` donde cargar `migrations-history.sql`.
