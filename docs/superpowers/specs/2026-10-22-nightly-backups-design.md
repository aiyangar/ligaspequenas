# Respaldos nocturnos cifrados en el plan Free (#87) — Diseño

**Fecha:** 2026-10-22
**Estado:** Borrador revisado (decisiones del owner y revisión adversarial del 2026-10-22 aplicadas; pendiente la decisión del owner sobre el aviso de cron caído, §2)
**Issue:** [#87](https://github.com/aiyangar/ligaspequenas/issues/87) — decidida en #6 (`2026-10-16-pre-real-data-checklist-design.md` §2, §7)

## 1. Contexto y objetivo

En #6 el owner eligió quedarse en Supabase **Free** (liga en arranque, ~40 jugadores esta temporada) y automatizar los respaldos en vez de pagar Pro. Free no da backups diarios descargables ni PITR, y hoy no existe ningún respaldo de la base ni de los archivos de `player-files`.

Estado del proyecto `eksbaugyypadtanyjcje` (verificado por MCP el 2026-10-22): Postgres 17.6. `player-files` tiene un solo objeto (`.emptyFolderPlaceholder`, 0 bytes), así que todavía no hay archivos reales. Por eso hay que dejar los respaldos funcionando **antes** de la primera carga de datos reales.

Objetivo:

1. Un workflow de GitHub Actions que corre **cada noche** y produce **un archivo cifrado** con la base de datos (roles, schema y datos, incluidos `auth` y `storage`) y todos los objetos del bucket `player-files`.
2. Que **nada legible** salga del runner: el repo es público, los logs de Actions son públicos y cualquier usuario de GitHub puede descargar los artifacts.
3. Un **procedimiento de restauración documentado y probado** de punta a punta, con un registro fechado de simulacros.

Fuera de alcance: PITR, réplicas, respaldar las Edge Functions (su código ya está en git) y la configuración de Auth del Dashboard (redirect URLs, plantillas de correo). El runbook (§6) lista esta configuración como pasos manuales de la restauración.

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Destino | **Artifacts de GitHub Actions**, decidido por el owner el 2026-10-22. No requiere cuentas nuevas y no cuesta. Como el repo es público, cualquier usuario de GitHub con sesión puede descargar el artifact. Esto se acepta **solo** porque el contenido va cifrado con `age` (fila siguiente). Descartados: un repo privado (crece sin límite y necesita un PAT con escritura) y R2/B2 (una cuenta y unas llaves más que mantener). |
| Retención | **30 días**, decidido por el owner el 2026-10-22. Se fija con `retention-days: 30` en `actions/upload-artifact`; GitHub borra cada artifact a los 30 días de subirlo, sin lógica de rotación propia. Así se puede restaurar después de un borrado o una corrupción que se descubra semanas después, y las copias de datos de menores no existen por tiempo indefinido. |
| Cifrado | **`age`** con destinatarios de **llave pública** (`age -R recipients.txt`). Las llaves públicas no son secretas y van versionadas en `ops/backup/recipients.txt`. Habrá **dos destinatarios**: la llave principal del owner y una de recuperación que se guarda offline (impresa o en una USB en un lugar distinto). Con cualquiera de las dos se descifra, así que perder una sola no deja los respaldos inservibles. Las llaves privadas **nunca** llegan a GitHub ni al repo, y CI no puede descifrar. Descartados: `gpg` (más complejo y con más formas de configurarlo mal) y el cifrado simétrico con passphrase en un secret (la llave tendría que vivir en CI). |
| Dump de la base | `supabase db dump` con las tres pasadas que recomienda Supabase (*Backup and Restore using the CLI*): `--role-only`, schema (default) y `--data-only --use-copy`, excluyendo `storage.buckets_vectors` y `storage.vector_indexes`. El CLI corre `pg_dump` en un contenedor de la imagen de Supabase Postgres (los runners `ubuntu-latest` traen Docker) y filtra los internos de Supabase, así que no hace falta un cliente Postgres 17 en el runner. **Los schemas `auth` y `storage` no entran en el dump de schema, pero sí en el de datos.** Las policies de `storage.objects` y la fila del bucket vienen de la migración 0012, que se vuelve a aplicar al restaurar (§6). |
| Conexión a la base | **Session pooler** (Supavisor, puerto 5432) con el usuario `postgres.<ref>`. La conexión directa de Free es solo IPv6 y los runners de GitHub no tienen IPv6. La URL completa va en el secret `SUPABASE_DB_URL`. Descartado por ahora: un rol de solo lectura para el respaldo. `pg_dump` de `auth`/`storage` con un rol propio necesita grants sobre schemas que administra Supabase y que se pueden perder en upgrades. Lo que se acepta: el secret tiene poder de `postgres` (§7, R1). |
| Archivos de Storage | Un **script de Node sin dependencias** (`ops/backup/storage-dump.mjs`, con `fetch` nativo) que lista `player-files` de forma recursiva con la API REST de Storage (`POST /storage/v1/object/list/player-files`, con paginación por `offset`) y descarga cada objeto (`GET /storage/v1/object/player-files/<ruta>`). Usa una **secret API key dedicada** (`sb_secret_…`, con nombre `backups`, creada en Dashboard → API Keys) en el secret `SUPABASE_BACKUP_SECRET_KEY`, de modo que se puede revocar sin tocar la key que usa la Edge Function `invite-user`. Descartados: `@supabase/supabase-js` (instalar dependencias en un job con secrets amplía la superficie de cadena de suministro) y el protocolo S3 de Storage (otras credenciales más). Si un listado o una descarga falla, el script termina con error: **un respaldo parcial es un respaldo fallido**. |
| Contenido del archivo | `backup-<YYYY-MM-DD>T<HHMM>Z.tar.age`, que contiene `db/roles.sql`, `db/schema.sql`, `db/data.sql`, `db/migrations-history.sql` (`--data-only --schema supabase_migrations`, que el dump de datos excluye y sin el cual un proyecto restaurado no sabe qué migraciones ya tiene), `storage/player-files/<ruta>…`, `manifest.json` (fecha, commit, versión del CLI, `sha256` y tamaño de cada archivo, número de objetos) y `SHA256SUMS` (el mismo hash en el formato que lee `shasum -c`). El manifest va **dentro** del tar cifrado: en el log público solo salen conteos (objetos descargados, tamaño total) y nunca rutas, nombres ni contenido. |
| Higiene del job | `defaults: run: shell: bash` a nivel de workflow, para que cada step corra con `-eo pipefail`. Sin esto, un `tar` que muere a la mitad de `tar \| age` deja un archivo cifrado válido pero truncado, y el job sale verde. `permissions: contents: read`. Los disparadores son solo `schedule` y `workflow_dispatch`, nunca `pull_request`. Todas las actions de terceros van **fijadas por SHA** (`actions/checkout`, `actions/upload-artifact`, `supabase/setup-cli`). `age` se instala con `apt`. Nada de `set -x`. Los secrets se pasan solo como `env` del step que los usa. Los archivos en claro viven en `$RUNNER_TEMP` y se borran en un step `if: always()` antes de terminar, aunque el runner sea efímero. `upload-artifact` lleva `if-no-files-found: error` y `compression-level: 0` (el contenido ya está cifrado). |
| Secrets en un Environment | Los dos secrets viven en el Environment **`backups`** de GitHub, con regla de rama = `develop` (la rama default, que es donde corre `schedule`). Así ningún workflow de otra rama puede leerlos aunque alguien lo agregue. |
| Horario | `cron: '17 9 * * *'` (09:17 UTC = 03:17 en Monterrey). Se evita el minuto 0, porque las corridas en la hora exacta se atrasan y se pierden más seguido. |
| Aviso de fallo | GitHub manda un correo cuando falla un workflow programado, y lo recibe quien editó el cron por última vez (el owner). |
| Aviso de cron caído | **Pendiente: decisión del owner.** GitHub **desactiva** los `schedule` de un repo público después de 60 días sin actividad en el repo. Un cron desactivado **no falla**, así que no llega correo de fallo, y a los 30 días ya expiraron todos los artifacts: no queda ningún respaldo. El chequeo de 48 h del checklist (punto F) solo se ve cuando alguien abre el checklist. Recomendado: un *dead-man's switch* externo (por ejemplo healthchecks.io, plan gratuito). El job hace un ping al final de cada corrida verde, y si pasan 48 h sin ping el servicio manda un correo. La URL del ping va como secret del Environment. Alternativa sin cuenta nueva: quedarse solo con el chequeo manual de 48 h y aceptar el riesgo (§7, R5). No se agrega un "keepalive" que haga commits automáticos. |
| Simulacro de restauración | Lo corre el **owner en su Mac**, asistido por el orquestador, contra un **proyecto Supabase temporal** (Free permite dos proyectos activos), que se borra al terminar. En el Mac solo hacen falta `age` y `psql` (`brew install age libpq`) y Node, que ya existe para el proyecto. **No necesita Docker**, porque restaurar es `psql`, no `supabase db dump`. Descartado: restaurar en CI, porque la llave privada tendría que estar en CI. Frecuencia: uno antes de la primera carga de datos reales y luego **cada trimestre**, además de después de cualquier cambio a este workflow. |
| Entrega | Rama `update/backups-spec` (este spec). Luego `feature/nightly-backups` (workflow, script con tests, `recipients.txt` y runbook) y después `update/backups-first-drill` (primera corrida verde y primer simulacro registrados en el runbook, y punto F del checklist actualizado). Una tarea, una rama. |

## 3. Workflow (`.github/workflows/backup.yml`)

Un solo job en `ubuntu-latest`, `environment: backups` y `timeout-minutes: 30`:

1. `actions/checkout` (para `ops/backup/`).
2. `supabase/setup-cli` con una **versión fijada** del CLI.
3. `sudo apt-get update && sudo apt-get install -y age`.
4. **Verificar destinatarios**: `node ops/backup/check-recipients.mjs ops/backup/recipients.txt` exige exactamente 2 líneas `age1…` distintas. Corre **antes** de tocar la base, así un `recipients.txt` roto no deja datos en claro en el runner.
5. **Dump** (env: `SUPABASE_DB_URL`): las tres pasadas de §2 más `migrations-history.sql`, hacia `$RUNNER_TEMP/backup/db/`. Falla si algún archivo queda vacío o si `data.sql` no contiene la línea `^COPY "public"."players"`. El CLI corre `pg_dump` con `--quote-all-identifier`, así que la forma sin comillas nunca aparece. Esto solo prueba que el dump incluye las tablas de la app, porque pg_dump escribe el `COPY` aunque la tabla esté vacía.
6. **Storage** (env: `SUPABASE_URL`, `SUPABASE_BACKUP_SECRET_KEY`): `node ops/backup/storage-dump.mjs "$RUNNER_TEMP/backup/storage"`. El script imprime solo `objects=<n> bytes=<n>`.
7. **Cotejo base ↔ Storage**: `node ops/backup/crosscheck.mjs "$RUNNER_TEMP/backup"` cuenta las filas del bloque `COPY "storage"."objects"` de `data.sql` con `bucket_id = player-files` y las compara con los objetos descargados. Falla si la diferencia es mayor que 2, que es la tolerancia para R6. Sin este cotejo, un listado incompleto pasaría sin que nadie lo note, porque el manifest se arma con el mismo listado. Imprime solo los dos conteos.
8. **Manifest**: `node ops/backup/manifest.mjs "$RUNNER_TEMP/backup"` (genera `manifest.json` y `SHA256SUMS`).
9. **Cifrar**: `tar -C "$RUNNER_TEMP/backup" -cf - . | age -R ops/backup/recipients.txt -o "$RUNNER_TEMP/out/backup-<ts>.tar.age"` (con `pipefail`, §2). Después se verifica que la salida empiece con `age-encryption.org/v1`.
10. `actions/upload-artifact` del `.tar.age`, con `retention-days: 30`.
11. Ping al *dead-man's switch*, si el owner lo aprueba (§2).
12. `if: always()`: `rm -rf "$RUNNER_TEMP/backup"`.

`SUPABASE_URL` no es secreto: es la misma URL pública del frontend y va como variable del Environment.

## 4. Script de Storage (`ops/backup/storage-dump.mjs`)

- `listAll(prefix)`: hace `POST /storage/v1/object/list/player-files` con `{ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }` y sigue pidiendo mientras la página venga llena. Las entradas con `id === null` son carpetas y se recorren de forma recursiva.
- `download(path)`: guarda el cuerpo en `<out>/<path>` y comprueba que los bytes escritos coincidan con `metadata.size` del listado.
- Header: **solo `apikey`** con la secret key. Las keys `sb_secret_` no son JWT, y Supabase indica mandarlas en `apikey`, no en `Authorization: Bearer` (https://supabase.com/docs/guides/api/api-keys).
- Cualquier respuesta distinta de 2xx o cualquier discrepancia de tamaño termina el proceso con `exit 1` y un mensaje sin la ruta (por ejemplo `download failed: status=403 index=12`). Todo el script corre dentro de **un solo `try/catch` de nivel superior** que imprime solo `err.code` (o el status) y el índice del objeto. Así un error de `fs` (`ENOENT`/`EACCES` sobre `<out>/<ruta>`) o de `fetch` no puede imprimir la ruta, que contiene el UUID del tenant, el del jugador y el tipo de documento. Lo mismo aplica a `crosscheck.mjs` y `manifest.mjs`.
- La lógica pura (paginación, recursión, armado de rutas, verificación de tamaño) se exporta y se prueba con **vitest** usando un `fetch` simulado, igual que el resto del repo. El script, el manifest y el script de restauración de §6 se quedan en `ops/backup/` y fuera de `src/`, para que no entren al bundle de Vite.

## 5. Configuración que hace el owner (una sola vez)

1. `brew install age libpq`. Con `age-keygen -o principal.txt` y `age-keygen -o recuperacion.txt` se generan las dos llaves. Las **dos líneas públicas** (`# public key: age1…`) se pegan en `ops/backup/recipients.txt` (el PR de la rama `feature/nightly-backups` las incluye). La llave **principal** se guarda en el gestor de contraseñas del owner. La de **recuperación** se imprime o se copia a una USB y se guarda en otro lugar físico. Después se borran los dos archivos del disco.
2. En el Dashboard de Supabase: crear la secret key `backups` y copiar el connection string del **Session pooler**, con la contraseña de la base.
3. En GitHub: crear el Environment `backups` con regla de rama `develop`, los secrets `SUPABASE_DB_URL` y `SUPABASE_BACKUP_SECRET_KEY` y la variable `SUPABASE_URL`.

El orquestador no ve ni maneja ninguno de estos valores. Los pasos quedan escritos en el runbook.

## 6. Runbook de restauración (`docs/ops/backups.md`)

Contenido del documento:

- **Qué hay en cada respaldo** y qué no (configuración de Auth del Dashboard, secrets de la Edge Function, SMTP y el schema `vault`, que el dump de datos excluye y hoy tiene 0 secretos).
- **Descargar y descifrar**: el artifact se baja de la pestaña Actions (o con `gh run download`). Luego `age -d -i <(pbpaste) backup-….tar.age | tar -xf - -C <dir>`, con la llave privada copiada del gestor de contraseñas, para que **nunca se escriba en el disco del Mac**. Después `shasum -a 256 -c SHA256SUMS`.
- **Restaurar la base** en un proyecto nuevo:
  1. `psql --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql -f data.sql -f migrations-history.sql`. `data.sql` ya abre con `SET session_replication_role = replica`. El dump de schema conserva los `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres"` y los `GRANT`/`REVOKE` de producción, 0016 incluido. Por eso no se agrega ningún revoke previo, que además quitaría a `authenticated` un default que la convención 1 del checklist da por hecho.
  2. Volver a aplicar `0012_player_files_storage.sql` (bucket y policies de Storage, que el dump de schema no incluye). **Regla:** cualquier migración futura que toque los schemas `auth` o `storage` se agrega a esta lista de re-aplicación.
  3. Verificar privilegios: el bloque B del checklist en verde, **y** que `authenticated` tenga en el proyecto restaurado los mismos grants de tablas y funciones que en producción (una query de diff que el plan escribe).
  4. Correr el checklist A–D completo.
  5. Revisar `supabase_migrations.schema_migrations`: debe listar las mismas migraciones que producción. Si falta, se corre `supabase migration repair --status applied <versiones>`, para que un `db push` posterior no intente re-aplicar 0001.
- **Restaurar Storage**: `ops/backup/storage-restore.mjs <dir> <url>` (la secret key se lee de una variable de entorno, nunca de un argumento) sube cada archivo con `x-upsert: true`. `data.sql` ya trae las filas de `storage.objects` y el upsert reemplaza el binario; es el mismo orden que usa el script de migración de Storage de Supabase. El upsert deja `owner` en `null`, lo que la app no usa. El simulacro lo confirma.
- **Restaurar en el proyecto original** (corrupción o borrado): el mismo procedimiento sobre un proyecto nuevo, y luego apuntar Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) y la Edge Function al proyecto nuevo. **No** se restaura encima del proyecto vivo.
- **Simulacro**: tabla fechada con commit, artifact usado, conteos comparados (filas por tabla de `public`, `auth.users`, objetos y `sha256` contra el manifest), resultado y quién lo corrió. Al terminar se borran el proyecto temporal y los archivos descifrados del Mac.
- **Salud**: dónde ver la última corrida, qué hacer si GitHub desactivó el cron (reactivarlo en la pestaña Actions) y cómo rotar cada secret o llave.

## 7. Riesgos aceptados

- **R1. El secret `SUPABASE_DB_URL` tiene poder de `postgres`.** Mitigaciones: vive en un Environment restringido a `develop`, solo lo ven los steps que lo usan y las actions van fijadas por SHA. Se rota cambiando la contraseña de la base (runbook). La contraseña tiene que ser **alfanumérica**. GitHub enmascara solo el texto exacto del secret, y una contraseña con caracteres escapados en la URL podría aparecer ya decodificada, y sin máscara, en un error del CLI.
- **R1b. Imagen de Postgres sin fijar.** `supabase db dump` descarga la imagen `supabase/postgres` que corresponde a la versión del CLI y le pasa `PGPASSWORD`. Fijar la versión del CLI acota el riesgo, pero la imagen no se fija por digest. Se acepta.
- **R2. Metadatos públicos.** Cualquiera ve que existe un respaldo diario, su tamaño cifrado y los conteos `objects`/`bytes`. No revela datos de menores.
- **R3. Cifrado con `age`.** Si se rompiera X25519/ChaCha20-Poly1305, los artifacts de los últimos 30 días quedarían expuestos. Esto se acepta y la retención corta lo acota.
- **R4. Pérdida de las dos llaves privadas** → los respaldos son irrecuperables. Por eso hay dos llaves en dos lugares físicos distintos.
- **R5. Cron desactivado por inactividad** (§2). Con el *dead-man's switch* llega un correo a las 48 h. Sin él, solo se detecta con el chequeo manual de 48 h, y si nadie lo corre en 30 días, ya no queda ningún respaldo.
- **R6. Inconsistencia entre la base y Storage.** El dump y la descarga no son atómicos entre sí: un archivo subido entre los dos pasos puede aparecer en Storage sin su fila en `documents`, o al revés. A las 03:00 y con un solo admin activo es improbable, y el efecto es un archivo de más o de menos en ese respaldo, no una corrupción.

## 8. Pruebas y criterio de cierre de #87

- **vitest**: la paginación (página llena → pide la siguiente), la recursión de carpetas, una respuesta no 2xx → error sin ruta en el mensaje, un error de `fs` → mensaje sin ruta, una discrepancia de tamaño → error, el cotejo (diferencia ≤ 2 pasa, > 2 falla, con el `COPY "storage"."objects"` entre comillas), `check-recipients` (0, 1 o 3 líneas, línea que no es `age1…` o duplicada → falla) y el manifest y `SHA256SUMS` con el `sha256` correcto.
- **Prueba del workflow**: `workflow_dispatch` en `develop`. El log no tiene rutas ni contenido; el artifact descargado **no** se puede abrir con `tar` y sí se descifra con la llave principal **y** con la de recuperación (las dos se prueban).
- **Prueba negativa**: la cubre vitest con `check-recipients`. Una rama de prueba no sirve para esto, porque el Environment `backups` rechaza el job antes de que corra cualquier step.
- **Cierre**: (a) tres corridas nocturnas verdes seguidas; (b) un simulacro de restauración completo registrado en el runbook, con conteos idénticos al manifest y el checklist A–D en verde sobre el proyecto temporal; (c) el punto F del checklist previo a datos reales actualizado a "Free + respaldos nocturnos cifrados (#87), última corrida verde < 48 h, último simulacro < 90 días".
