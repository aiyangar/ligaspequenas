# Encrypted Nightly Backups (#87) Implementation Plan

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax. Execute the tasks in order, commit after each task, and stop and report if a step's expected result doesn't hold.

**Goal:** A nightly GitHub Actions workflow produces one `age`-encrypted `.tar.age` artifact (30-day retention) containing the Supabase database dump (roles, schema, data, migration history) and every object of the `player-files` bucket. Nothing readable reaches the public logs or artifacts, and a restore runbook documents and tests the way back.

**Architecture:** Four small Node 24 TypeScript scripts in `ops/backup/`, run with Node's native type stripping (`node ops/backup/<x>.ts`, no build step, **no npm dependencies at runtime**): `check-recipients.ts`, `storage-dump.ts`, `crosscheck.ts` and `manifest.ts`, plus `storage-restore.ts` for the runbook. Pure logic lives in `ops/backup/lib/*.ts` and is unit-tested with Vitest. `.github/workflows/backup.yml` chains: check recipients → `supabase db dump` ×4 → storage dump → crosscheck → manifest → `tar | age` → upload artifact → healthchecks.io ping → cleanup.

**Tech stack:** Node 24 (`actions/setup-node`, local `~/Library/pnpm/bin/node` v24.22.1), TypeScript 6 (`tsc -b`, erasable syntax only), Vitest 4, ESLint 10, Supabase CLI **2.107.0** (same as the `supabase` devDependency in `pnpm-lock.yaml`), `age` from apt, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-22-nightly-backups-design.md`. Read it before starting; § numbers below refer to it.

## Deviation from the spec (decided by the orchestrator)

The spec names the scripts `*.mjs`. This plan writes them as **`.ts` run directly by Node 24** (type stripping is on by default in Node ≥ 22.18). Same zero-dependency runtime, but `tsc -b` and ESLint now cover them. File names change accordingly (`storage-dump.ts` instead of `storage-dump.mjs`, etc.). Record this in the runbook's "Archivos" section. Nothing else in the spec changes.

## Global constraints

- **Branch:** `feature/nightly-backups`, already created from `develop` at `3d4bbcb`, plus the commit of this plan, in the main checkout `/Users/gustavoarturocardenasortiz/Documents/Personales/ligaspequenas`. Work there. Never switch branches. Never push, open PRs or merge (the orchestrator does that). Never `git stash`.
- **Tooling PATH:** prefix shell commands with `export PATH="$HOME/Library/pnpm/bin:/opt/homebrew/bin:$PATH"`. `gh` is at `/opt/homebrew/bin/gh` and needs `dangerouslyDisableSandbox: true` to reach its keyring. Use it **only for read-only `gh api` calls** to resolve action SHAs (Task 5).
- **No secrets, no live calls.** The implementer never sees or asks for the owner's keys, DB URL, Storage secret key or ping URL. It never calls the Supabase project (no MCP, no curl to `*.supabase.co`), never runs the workflow and never creates GitHub Environments or secrets. Those steps belong to the owner (spec §5) and to the later `update/backups-first-drill` branch.
- **`ops/backup/recipients.txt`** ships as a **comment-only template** (no `age1…` lines). That makes `check-recipients` fail closed until the owner adds the two real public keys. Do not invent keys.
- **Language:** code, identifiers, comments and commit messages in English. Comments only for a non-obvious *why*, one short line. The runbook `docs/ops/backups.md` is in **Spanish**, in the same register as `docs/security/pre-real-data-checklist.md`.
- **Log hygiene (spec §4), enforced by tests:** no script ever prints an object path, a file name under `storage/`, a URL containing a path, a header or an env value. The allowed stdout lines are listed for each script. Every entry point wraps `main()` in one top-level `try/catch` that prints `error: <code>` (`err.code` if it is a string, else `status=<n>` for HTTP errors, else `unknown`) and `index=<n>` when known, then `process.exit(1)`. Never print `err.message`, because Node's fs and fetch messages include paths.
- **Commits:** English, conventional style like the repo (`feat:`, `test:`, `docs:`, `ci:`), ending with ` (#87)`. One commit per task at minimum.
- **Closing gates (all green):** `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`, `VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=dummy pnpm build`. Baseline on `develop` (2026-10-23): **39 test files, 330 tests**. Report the deltas.

## File map

| File | Purpose |
|---|---|
| `tsconfig.ops.json` | New TS project for `ops/backup/**/*.ts` (Node types, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`, `strict`). Add it to the root `tsconfig.json` `references`. |
| `ops/backup/lib/safe-error.ts` | `class HttpError` (fields `status`, `index`), plus `errorLine(err): string` for the single allowed error format. Must use **no TS parameter properties** (erasable syntax only). |
| `ops/backup/lib/recipients.ts` | `parseRecipients(text): string[]`, which throws `RecipientsError` unless there are exactly 2 distinct `age1…` lines after ignoring blank and `#` lines. |
| `ops/backup/lib/storage.ts` | `listAll(api, prefix)` (pagination + recursion), `dumpAll(api, outDir, fsLike)` and `restoreAll(api, inDir, index)`, where `api` wraps an injected `fetch`. |
| `ops/backup/lib/copy-block.ts` | `countCopyRows(sql, table, column, value)` for the `COPY "storage"."objects" (…) FROM stdin;` block. |
| `ops/backup/lib/manifest.ts` | `buildManifest(root, meta)` → `{ manifest, sha256sums }`. |
| `ops/backup/check-recipients.ts`, `storage-dump.ts`, `crosscheck.ts`, `manifest.ts`, `storage-restore.ts` | Thin entry points: they read env and argv, call `lib`, and print only the allowed lines. |
| `ops/backup/recipients.txt` | Comment-only template. |
| `ops/backup/*.test.ts` | Vitest, each file starting with `// @vitest-environment node`. |
| `.github/workflows/backup.yml` | The workflow (spec §3). |
| `docs/ops/backups.md` | Runbook (spec §5, §6), in Spanish. |

Vitest's default include already matches `ops/backup/**/*.test.ts`; check that in Task 1. If it doesn't match, add an explicit `include` to `vite.config.ts` that keeps the current `src/**` and `supabase/functions/**` tests running.

---

## Task 1: TS project and error helper

- [ ] Create `tsconfig.ops.json`, modeled on `tsconfig.node.json`: `target`/`lib` ES2023, `module: nodenext`, `moduleResolution: nodenext`, `types: ["node", "vitest/globals"]`, `strict: true`, `noEmit: true`, `allowImportingTsExtensions: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`, `noUnusedLocals`/`noUnusedParameters`, `include: ["ops/backup/**/*.ts"]`. Add `{ "path": "./tsconfig.ops.json" }` to the root `tsconfig.json`.
- [ ] Imports between files use the explicit `.ts` extension (Node type stripping requires it).
- [ ] ESLint: the existing `**/*.{ts,tsx}` block applies `globals.browser` and the React plugins. Add a block for `ops/**/*.ts` with `globals.node`. Keep the React rules out of it if they complain; otherwise leave them.
- [ ] Write `lib/safe-error.ts` and `safe-error.test.ts`. Cases: `errorLine` of an fs-like error `{ code: 'ENOENT', message: "ENOENT: no such file, open '/tmp/x/t1/p1/curp'" }` → `error: ENOENT` (the path never appears); an `HttpError(403, 12)` → `error: status=403 index=12`; a plain `Error('boom /secret/path')` → `error: unknown`; a non-Error throw → `error: unknown`.
- [ ] Gates: `tsc -b`, `lint`, `vitest run` green. Commit `feat: add the ops TypeScript project and path-free error formatting for backups (#87)`.

## Task 2: Recipients check

- [ ] `lib/recipients.ts` and `check-recipients.ts <file>`. On success it prints `recipients=2`. On failure it prints `error: recipients` and exits 1. It never prints the keys (they are public, but the rule is simple: no file content in logs).
- [ ] Tests: two valid distinct lines with comments and blank lines → ok. 0 lines (the template), 1 line or 3 lines → throw. A duplicated line → throw. A line `age1` plus garbage containing a space, or a line starting `AGE-SECRET-KEY-` → throw. A pasted private key must be rejected and **must not appear** in the error. Use syntactically plausible fake keys built in the test (`'age1' + 'q'.repeat(58)`); do not hardcode real-looking keys.
- [ ] `recipients.txt` template content (Spanish comments are fine here since it is owner-facing):

```
# Destinatarios age de los respaldos (#87). Una llave pública por línea.
# Exactamente dos: la principal del owner y la de recuperación offline.
# Mientras este archivo no tenga dos líneas age1…, el respaldo falla a propósito.
```

- [ ] Commit `feat: validate the two age recipients before any backup work (#87)`.

## Task 3: Storage dump and restore

API, against `${SUPABASE_URL}/storage/v1`, with only the `apikey: <secret>` header (spec §4):
- List: `POST /object/list/player-files`, JSON `{ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }`. Entries with `id === null` are folders; recurse with `prefix + name + '/'`. Keep paging while `page.length === limit`. Files carry `metadata.size` and `metadata.mimetype`.
- Download: `GET /object/player-files/<path>`, with each path segment `encodeURIComponent`-ed.
- Upload (restore): `POST /object/player-files/<path>` with `x-upsert: true` and `content-type: <mimetype>`, body = file bytes.

- [ ] `lib/storage.ts`, with `fetch` and fs injected so tests need no network or disk. `dumpAll` writes each object to `<out>/<path>`, checks `bytes.length === metadata.size` (otherwise `HttpError`-like `SizeError` with `index`), and writes `<out>/../storage-index.json` = `[{ path, size, mimetype }]`. That index lives inside the backup root, which gets encrypted, so it is never logged. It returns `{ objects, bytes }`.
- [ ] Path safety: reject (throw, no path in the error) any listed name that is `''`, `.`, `..` or contains `/`, `\` or a NUL. A hostile or corrupted listing must not write outside `<out>`.
- [ ] `storage-dump.ts <outDir>` reads `SUPABASE_URL` and `SUPABASE_BACKUP_SECRET_KEY` (missing → `error: env`), creates `<outDir>`, and prints exactly `objects=<n> bytes=<n>`.
- [ ] `storage-restore.ts <backupRoot> <targetUrl>` reads `SUPABASE_RESTORE_SECRET_KEY` from env (never from argv; spec §6), uploads every entry of `storage-index.json` and prints `restored=<n>`.
- [ ] Tests, with a fake `fetch` and an in-memory fs:
  - pagination: a full page of 1000 → a second request with `offset: 1000`; a partial page stops.
  - recursion: `t1/` → `t1/p1/` → files; the paths are built correctly and the `.emptyFolderPlaceholder` at the root is kept (it is a real object).
  - the request has the `apikey` header and **no `authorization` header**.
  - list 500 → throws `HttpError` with status 500. Download 403 at index 3 → `errorLine` gives `error: status=403 index=3`, and the fake path `t1/p1/curp` is absent from it.
  - a size mismatch → throws.
  - a hostile name `..` → throws, and nothing is written.
  - restore: it sends `x-upsert: true`, the right content-type and the encoded path, and uses no `authorization` header.
  - entry-point log hygiene: spawn `node ops/backup/storage-dump.ts` with `SUPABASE_URL=http://127.0.0.1:9` (closed port) and a dummy key. stdout+stderr match `/^error: \S+( index=\d+)?\n?$/` and contain neither `127.0.0.1` nor the key. Use `child_process.spawnSync(process.execPath, …)`.
- [ ] Commit `feat: dump and restore the player-files bucket without logging paths (#87)`.

## Task 4: Crosscheck and manifest

- [ ] `lib/copy-block.ts`: find the line `COPY "storage"."objects" (<cols>) FROM stdin;`, take the index of `"bucket_id"` in `<cols>` (quoted, comma-separated), and count lines up to the terminator `\.` whose tab-separated field at that index equals `player-files`. A missing block → count 0 and a flag `found: false`.
- [ ] `crosscheck.ts <backupRoot>`: reads `db/data.sql` and `storage-index.json`, prints `db_objects=<n> storage_objects=<n>`, and exits 1 (`error: crosscheck`) if `found` is false or `|a - b| > 2` (spec §3 step 7).
- [ ] `lib/manifest.ts` + `manifest.ts <backupRoot>`: walk every file under the root (sorted, POSIX relative paths) except `manifest.json`/`SHA256SUMS`, write `manifest.json` `{ created_at, commit: GITHUB_SHA ?? null, supabase_cli: '2.107.0', files: [{ path, size, sha256 }], objects: <storage-index length> }`, and write `SHA256SUMS` lines `<hex>  <path>` (two spaces, `shasum -a 256 -c` format). Print `files=<n>`.
- [ ] Tests: copy-block with a realistic two-table excerpt (a `COPY "public"."players"` block before it, `\N` nulls, another bucket's row excluded); a missing block; crosscheck diff 2 passes and 3 fails; manifest hashes match `crypto.createHash('sha256')`; `SHA256SUMS` format is exact; the manifest excludes itself.
- [ ] Commit `feat: cross-check database and Storage object counts and write the backup manifest (#87)`.

## Task 5: Workflow

- [ ] Resolve and **pin by full commit SHA** (with a `# vX.Y.Z` comment), using read-only `gh api`: `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `supabase/setup-cli`. For each, take the latest release tag, then `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`. If the ref is an annotated tag object, dereference it with `gh api repos/<owner>/<repo>/git/tags/<sha>` to get the commit SHA.
- [ ] `.github/workflows/backup.yml`, following spec §3 and with these exact properties:
  - `on: schedule: - cron: '17 9 * * *'` and `workflow_dispatch:` (no inputs). Nothing else.
  - `permissions: contents: read` at the top level. `concurrency: { group: backup, cancel-in-progress: false }`.
  - `defaults: run: shell: bash`.
  - Job `backup`: `runs-on: ubuntu-latest`, `environment: backups`, `timeout-minutes: 30`.
  - Steps in spec order. Each secret appears **only** in the `env:` of the step that needs it: `SUPABASE_DB_URL` (dump), `SUPABASE_BACKUP_SECRET_KEY` (storage), `HEALTHCHECK_PING_URL` (ping). `SUPABASE_URL` comes from `vars.SUPABASE_URL`.
  - `actions/checkout` with `persist-credentials: false`. `setup-node` with `node-version: 24`. `supabase/setup-cli` with `version: 2.107.0`.
  - Install `age`: `sudo apt-get update -qq && sudo apt-get install -y -qq age`.
  - Dump: `mkdir -p "$RUNNER_TEMP/backup/db"`, then the four `supabase db dump --db-url "$SUPABASE_DB_URL"` calls (roles `--role-only`; schema; data `--data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes`; history `--data-only --use-copy --schema supabase_migrations` → `migrations-history.sql`). Then `for f in …; do test -s "$f"; done` and `grep -q '^COPY "public"."players"' data.sql`. Do not echo filenames.
  - Storage, crosscheck and manifest via `node ops/backup/<x>.ts`.
  - Encrypt: `ts=$(date -u +%Y-%m-%dT%H%MZ)`, `mkdir -p "$RUNNER_TEMP/out"`, `tar -C "$RUNNER_TEMP/backup" -cf - . | age -R ops/backup/recipients.txt -o "$RUNNER_TEMP/out/backup-$ts.tar.age"`, `test "$(head -c 21 "$RUNNER_TEMP/out/backup-$ts.tar.age")" = 'age-encryption.org/v1'`, and `echo "ts=$ts" >> "$GITHUB_OUTPUT"`. **Delete** `$RUNNER_TEMP/backup` in this same step right after encrypting (the `if: always()` step stays as a safety net).
  - Upload: `name: backup-${{ steps.encrypt.outputs.ts }}`, `path: ${{ runner.temp }}/out/*.tar.age`, `retention-days: 30`, `if-no-files-found: error`, `compression-level: 0`.
  - Ping: `continue-on-error: true`, `curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_PING_URL"`. Runs only on success (the default).
  - Cleanup: `if: always()`, `rm -rf "$RUNNER_TEMP/backup" "$RUNNER_TEMP/out"`. It must come **after** upload.
  - No `set -x`, no `echo` of env, no `env:` at job or workflow level holding a secret.
- [ ] Static checks (no live run): if `actionlint` is installable via `brew install actionlint`, run it and fix any findings. Otherwise parse the YAML with `node -e "…"` via `pnpm dlx yaml@2 …` or Python `yaml`, and say which you used. Then run these greps and paste the outputs in your report:
  - `grep -n 'secrets\.' .github/workflows/backup.yml`: each hit sits under a step-level `env:`.
  - `grep -nE 'uses: [^ ]+@' .github/workflows/backup.yml`: every ref is a 40-hex SHA.
  - `grep -nE 'set -x|pull_request|echo .*\$\{?SUPABASE' .github/workflows/backup.yml` → empty.
- [ ] Local dry run of the post-dump half, **with synthetic data only**: build a temp dir with a fake `db/data.sql` (a players COPY block and a `storage.objects` block with 2 `player-files` rows), a fake `storage-index.json` with 2 entries and the 2 files. Run `crosscheck.ts` and `manifest.ts`. If `age` is installable (`brew install age`), generate a **throwaway** key pair in the temp dir, run the tar | age pipeline, verify the header, decrypt and run `shasum -a 256 -c SHA256SUMS`, then delete the temp dir. Report the output.
- [ ] Commit `ci: add the encrypted nightly backup workflow (#87)`.

## Task 6: Runbook `docs/ops/backups.md` (Spanish)

Sections, following spec §5 and §6, adapted to the `.ts` file names:
- [ ] **Qué hay y qué no**: the list of files in the archive, and what's excluded (Auth config from the Dashboard, Edge Function secrets, SMTP, `vault` with 0 secrets today).
- [ ] **Configuración inicial (owner, una vez)**: spec §5 steps 1–4, plus:
  - Create the `backups` Environment **before** the first run. GitHub auto-creates an unprotected environment if a job references a missing one, so if it already exists, check its rule: deployment branches = `develop` only.
  - Use an alphanumeric DB password (R1).
  - The private keys never touch disk: `age-keygen | pbcopy`-style flow, then paste into the password manager and print the recovery one, or generate the files in a RAM-only spot and delete them right after. Write the exact commands.
  - Open the PR that fills `ops/backup/recipients.txt` with the two public keys.
- [ ] **Descargar y descifrar**: `gh run download <run-id> -n backup-<ts>`, `age -d -i <(pbpaste) …`, `shasum -a 256 -c SHA256SUMS`.
- [ ] **Restaurar la base**: spec §6 steps 1–5. Include the privilege-diff query, to be run on both production and the restored project and compared:

```sql
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
order by 1, 2, 3;
select p.oid::regprocedure::text as fn
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'EXECUTE')
order by 1;
```

  Also include the rule about re-applying `auth`/`storage` migrations (today only `0012`).
- [ ] **Restaurar Storage**: `SUPABASE_RESTORE_SECRET_KEY=… node ops/backup/storage-restore.ts <dir> <url>`.
- [ ] **Restaurar producción**: always into a new project, then repoint Vercel and the Edge Function. Never restore over the live project.
- [ ] **Simulacro**: the steps, then an empty run table with columns: Fecha · Commit · Artifact · Filas `public` (prod vs restaurado) · `auth.users` · Objetos · `sha256` · Checklist A–D · healthchecks activo · Resultado · Quién.
- [ ] **Salud y rotación**: where to look; how to re-enable a disabled cron; how to rotate the DB password, the `backups` secret key, the ping URL and the age keys (rotating a key requires a new `recipients.txt` PR; old artifacts stay readable with the old key until they expire).
- [ ] **Archivos**: one line per file in `ops/backup/`, plus the `.mjs` → `.ts` deviation note.
- [ ] Link the runbook from `docs/security/pre-real-data-checklist.md` section F with one line only (`Runbook: docs/ops/backups.md`). Do **not** change F's verdict text; that belongs to the first-drill branch.
- [ ] Commit `docs: add the backup and restore runbook (#87)`.

## Verification checklist (report each item)

1. The four closing gates are green, with test-file and test deltas versus 39/330.
2. `git diff --stat develop...HEAD` touches only: this plan, `tsconfig.json`, `tsconfig.ops.json`, `eslint.config.js`, possibly `vite.config.ts`, `ops/backup/**`, `.github/workflows/backup.yml`, `docs/ops/backups.md` and one line of `docs/security/pre-real-data-checklist.md`. `package.json` and `pnpm-lock.yaml` are **unchanged**.
3. `grep -rnE "console\.(log|error)" ops/backup --include=*.ts | grep -v test`: every print matches one of the allowed formats (`recipients=`, `objects=`, `restored=`, `db_objects=`, `files=`, `error: `).
4. The workflow greps from Task 5.
5. The output of the synthetic dry run from Task 5.
6. `ops/backup/recipients.txt` contains no `age1` line.

## Review focus

- A path, URL, key or env value reaching stdout/stderr through any code path, including uncaught rejections. Check that every entry point uses `main().catch(...)` or a top-level `try/catch` around an awaited `main`.
- A partial backup that still exits 0: pipefail, a page-size bug, a skipped folder, a swallowed download error, or the crosscheck tolerance applied in the wrong direction.
- Plaintext left anywhere other than `$RUNNER_TEMP/backup` (for example the repo checkout or `/tmp`).
- Path traversal from listed names on dump and from `storage-index.json` on restore. Apply the same validation to both.
- Secrets in workflow-level or job-level `env`, unpinned actions, or extra triggers.

---

# Cycle 2: review fixes (review of 2026-10-23, verdict FAIL)

The orchestrator checked every item below against the code before writing this section. Same branch, same global constraints, same gates. Baseline for deltas: **44 files, 402 tests**. One commit per task, ending with ` (#87)`.

## Task 7 (Important I1): the restored project must not hand privileges back to `anon`

pg_dump writes object ACLs relative to Postgres's built-in defaults, and a per-schema `ALTER DEFAULT PRIVILEGES` can only add privileges. A fresh Supabase project grants ALL to `anon` by default on new objects in `public`, so a restored project ends up with checklist B red.
- [ ] `docs/ops/backups.md` restore step 1: delete the sentence claiming the dump keeps 0016's revokes ("El dump de schema conserva … no se agrega ningún revoke previo").
- [ ] Restore step 2: re-apply **`0016_revoke_anon_privileges.sql` after `0012`**. It is all revokes, so running it twice is safe. Generalise the rule to: "toda migración que toque `auth`/`storage` **o que revoque privilegios** se agrega a esta lista". Step 3 (checklist B plus the `authenticated` diff) stays as the proof.
- [ ] Restore step 1: add `-c 'SET session_replication_role = replica'` immediately before `-f data.sql`, as Supabase's docs do (review M6), and stop claiming that `data.sql` already opens with it.
- [ ] Spec `docs/superpowers/specs/2026-10-22-nightly-backups-design.md` §6 step 1: same correction (remove the "conserva … 0016 incluido" claim; add the `-c`). §6 step 2: add 0016 and the generalised rule.

## Task 8 (Important I2): restore only from a trusted run

- [ ] Runbook "Descargar y descifrar" and "Simulacro" step 1: replace the run listing with `gh run list --workflow backup.yml --branch develop --event schedule --status success --limit 5`. Allow `--event workflow_dispatch` for manual runs. Add a check: `gh run view <run-id> --json headBranch,event,headSha` must show `develop`, an event of `schedule` or `workflow_dispatch`, and a `headSha` equal to the `commit` field in `manifest.json` after decrypting. If anything differs, don't use that artifact. Explain in one line why: PR runs can upload artifacts without passing through the `backups` Environment.

## Task 9 (Minor M1): restore refuses symlinks and non-regular files

- [ ] Add `lstat` to the `FsLike` used by `restoreAll`. Before reading each file, require `isFile()` and `!isSymbolicLink()`, otherwise throw `CodedError('filetype', i)`. This mirrors the manifest check.
- [ ] Test: an entry that is a symlink (in the in-memory fs, an entry flagged as a symlink) gives `error: filetype index=<i>` and makes no upload call. If the tests use a real temp dir, use a real `symlinkSync`.

## Task 10 (Minor M2): recipients check matches what `age -R` accepts

- [ ] `parseRecipients`: stop trimming. Only strip a trailing `\r`. Ignore lines that are exactly empty or that start with `#` at column 0. Any other line must match `RECIPIENT` exactly, so leading or trailing spaces fail.
- [ ] Update `recipients.test.ts:23` so the indented and trailing-space forms are **rejected**.
- [ ] Workflow "Check recipients" step: after the node check, also run `age -R ops/backup/recipients.txt -o /dev/null </dev/null >/dev/null 2>&1 || { echo 'error: recipients'; exit 1; }`. Move the `age` install step **before** this step if needed. This makes age's own parser the final check before any data is dumped.

## Task 11 (Minor M3): `errorLine` prints only known code shapes

- [ ] `codeOf`: accept a code only if it matches `^(E[A-Z0-9]+|ERR_[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+)$`, or if it is one of the internal `CodedError` codes (`env`, `size`, `path`, `filetype`, `crosscheck`, `recipients`, `args`; export the list from `safe-error.ts`, where `CodedError` lives). Anything else gives `error: unknown`.
- [ ] Tests: `{ code: 'sb_secret_abcdefghijklmnop' }` → `error: unknown`. `ENOENT`, `ERR_INVALID_URL`, `UND_ERR_SOCKET` and each internal code pass through unchanged.

## Task 12 (Minor M4): `tar` must not print paths

- [ ] Encrypt step: change the pipeline to `tar -C "$RUNNER_TEMP/backup" -cf - . 2>/dev/null | age -R …`. pipefail still fails the step if tar exits non-zero. Add one line before it: `# tar errors name minors' files; pipefail still catches failures.`
- [ ] Re-run `actionlint`.

## Task 13 (Minors M5, M7): restore guards and Mac hygiene

- [ ] `storage-restore.ts`: refuse a target URL whose host starts with the production ref `eksbaugyypadtanyjcje.` (the ref is already public in `docs/security/pre-real-data-checklist.md`). Exit with `error: target`. Test it.
- [ ] `restoreAll`: skip entries whose last segment is `.emptyFolderPlaceholder` and whose size is 0. These are Dashboard folder markers, and the bucket's MIME allowlist may reject them as `application/octet-stream`. The entry point prints `restored=<n> skipped=<n>`. Test it, and update the runbook's expected output.
- [ ] Runbook: decrypted data goes to a **RAM disk** (the same recipe the runbook already uses for keys) instead of `mktemp -d` on the internal disk, and gets detached when done. Add a line to the key-generation steps: turn off Handoff/Universal Clipboard before using `pbcopy`/`pbpaste` with a private key, and clear the clipboard afterwards (the runbook already runs `pbcopy < /dev/null`).
- [ ] Runbook "Simulacro": add a checklist item asking to confirm in the first drill (a) that a fresh project gets checklist B green only after re-applying 0016, and (b) whether the CLI's `data.sql` ends with pg_dump's `-- PostgreSQL database dump complete` line. If it does, a later branch can add a CI check for it. This plan does **not** add one, because nobody has verified the line exists.

## Cycle 2 verification

Report the same checklist items 1–6 as before, with deltas versus 44/402, plus:
7. the Task 10 workflow excerpt and `actionlint` output;
8. a synthetic run of `storage-restore.ts` against a fake server, showing a symlink refused, the placeholder skipped and the production URL refused, with the printed lines.
