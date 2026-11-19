# Lote K — Minors pendientes de los respaldos (#97) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y su spec se mergean a `develop` en un PR de docs **antes** de despachar al implementer. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Cerrar los cuatro Minors de la revisión de #87 (issue #97): la restauración de Storage rechaza un `storage/` o `storage/player-files/` que sea symlink (1) y valida el tamaño de todos los archivos antes de la primera subida (2); el runbook no reusa un `/Volumes/backupsdata` viejo y apaga Spotlight en el disco en RAM (3); `errorLine` solo deja pasar códigos `E…` que estén en la lista de errno de Node (4).

**Architecture:** Cambios chicos en `ops/backup/lib/storage.ts` (`FileKind` gana `size`; `restoreAll` revisa las dos carpetas raíz con `lstat` y compara tamaños en el pre-chequeo) y `ops/backup/lib/safe-error.ts` (un `Set` construido con `util.getSystemErrorMap()` y las constantes de error de `node:dns` reemplaza el regex `E[A-Z0-9]+`). Tests nuevos en `ops/backup/storage.test.ts` y `ops/backup/safe-error.test.ts`, primero en rojo. El runbook `docs/ops/backups.md` cambia en dos lugares. El workflow `backup.yml` no cambia.

**Tech Stack:** Node 24 (los scripts de `ops/backup` corren con `node archivo.ts`, type stripping nativo); Vitest 4 (los tests de `ops/backup` corren dentro de `pnpm exec vitest run`, con `// @vitest-environment node`); TypeScript `tsc -b` (incluye `tsconfig.ops.json`, que cubre `ops/backup/**/*.ts`); ESLint (`pnpm lint`, con globals de Node para `ops/**`); GitHub Actions (`.github/workflows/backup.yml`, Node 24).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§3: "#97: se aplican los 4 Minors tal como los describe el issue. El 4 (regex de errno) se ajusta a la lista de errno de Node"; §5: tests de `ops/backup` en verde y el workflow nocturno sigue pasando después del merge). Detalle: `gh issue view 97 --repo aiyangar/ligaspequenas`.

## Global Constraints

- **Una rama:** `fix/backups-review-minors`, cortada de `origin/develop` (con este plan ya mergeado). Worktree creado por el orquestador antes de despachar: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/backups-review-minors`. En este plan `$WT` es esa ruta absoluta (escríbela literal o empieza cada llamada con `WT=/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/backups-review-minors;`). La primera acción del implementer es `pnpm install --frozen-lockfile` dentro de él. Los tests no necesitan `.env` ni secretos.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`, nunca `git stash`. El implementer nunca hace push, PR ni merge: termina en commits + reporte. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- Archivos: solo `ops/backup/lib/storage.ts`, `ops/backup/lib/safe-error.ts`, `ops/backup/storage.test.ts`, `ops/backup/safe-error.test.ts`, `docs/ops/backups.md` y este plan. `.github/workflows/backup.yml` **no** se toca.
- Código, identificadores y comentarios en inglés; comentarios solo para un *por qué* no obvio, una línea. El runbook está en español y sigue así. Cada mensaje de commit termina con la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`.
- Cómo corren los tests de ops (verificado): `vite.config.ts` no restringe `include`, así que `pnpm exec vitest run` toma `ops/backup/*.test.ts`; cada archivo de ops declara `// @vitest-environment node`. Los tests de "entry points" lanzan los scripts reales con `node` (`spawnSync(process.execPath, [script…])`), así que también prueban que los imports nuevos (`node:dns`, `node:util`) cargan con el type stripping de Node. Para iterar rápido: `pnpm exec vitest run ops/backup`.
- La rama cierra con `pnpm exec vitest run`, `pnpm exec tsc -b` y `pnpm lint` en verde: `B_files` archivos y `B_tests + 10` tests (5 de storage + 5 de safe-error), sobre el baseline del Step 0.
- PR body: `Closes #97`.

## Review Focus

- **Un `storage/` o `storage/player-files/` symlink no sube nada de fuera del respaldo:** fijado con `memFs` (Task 2, test `a symlinked %s folder is refused before any upload`) y con archivos reales y el script real contra un Storage falso (test `a symlinked %s folder that points outside the backup is refused before any upload`), que reproduce lo que hizo el revisor.
- **Un tamaño que no cuadra en el archivo k no deja k−1 subidas hechas:** fijado en Task 2, test `a size mismatch in a later file stops the restore before the first upload`. El chequeo dentro del ciclo de subida se queda como defensa (el archivo podría cambiar entre el `lstat` y la lectura) y su error es el mismo.
- **Ningún código que no sea errno de Node se imprime, y los errno reales siguen pasando** (incluido `EAI_AGAIN`, que hoy se pierde porque el regex no admite `_`): fijado en Task 1. Revisar que el `Set` no quede vacío en otra plataforma: `getSystemErrorMap()` es de libuv y existe en Linux (CI) y macOS (simulacro); el test `the system code %s passes through` lo vigila en ambos.
- **Nada cambia para lo que ya funcionaba:** los 103 tests actuales de `ops/backup` siguen pasando sin tocar sus expectativas (solo `memFs` gana `size`).

---

## Task 1: `errorLine` solo acepta errno de Node (Minor 4)

**Files:**
- Modify: `ops/backup/safe-error.test.ts` (l.60–65)
- Modify: `ops/backup/lib/safe-error.ts` (imports; l.69–77)

- [x] **Step 0: Preparar y medir el baseline**

`git -C $WT branch --show-current` → `fix/backups-review-minors`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. En `$WT`: `pnpm install --frozen-lockfile`, `pnpm exec vitest run` (anota `B_files` y `B_tests`, todo verde) y `pnpm exec vitest run ops/backup` (esperado hoy: `Test Files 5 passed (5)`, `Tests 103 passed (103)`).

- [x] **Step 1: Escribir los tests (rojo)**

En `ops/backup/safe-error.test.ts`, reemplaza el `test.each([...])(` de la línea 60 (solo su lista; el cuerpo `'the system code %s passes through'` no cambia) e inserta un test nuevo justo antes, para que quede así:

```ts
test('an uppercase code that is not a Node errno is never printed', () => {
  expect(errorLine({ code: 'ESECRETKEY1QQQ' })).toBe('error: unknown')
  expect(errorLine({ code: 'EAGESECRETKEY' })).toBe('error: unknown')
})

test.each([
  'ENOENT',
  'EACCES',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ERR_INVALID_URL',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])(
  'the system code %s passes through',
  (code) => {
    expect(errorLine({ code })).toBe(`error: ${code}`)
  },
)
```

- [x] **Step 2: Verificar que fallan**

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts`
Expected: 2 FAIL — `an uppercase code that is not a Node errno is never printed` (`expected 'error: ESECRETKEY1QQQ' to be 'error: unknown'`) y `the system code EAI_AGAIN passes through` (`expected 'error: unknown' to be 'error: EAI_AGAIN'`). El resto pasa (`ECONNRESET`, `ETIMEDOUT` y `ENOTFOUND` ya pasan con el regex actual).

- [x] **Step 3: Implementar**

En `ops/backup/lib/safe-error.ts`:

1. Al inicio del archivo, antes de `export class HttpError`:

```ts
import * as dns from 'node:dns'
import { getSystemErrorMap } from 'node:util'

```

2. Reemplaza el bloque de las líneas 69–77 (el comentario, `const SYSTEM_CODE = …` y `function codeOf`) por:

```ts
// Node's own errno names, Node/undici code shapes or our own codes; anything else could carry arbitrary text, even a key.
const ERRNO_CODES: ReadonlySet<string> = new Set(
  [...[...getSystemErrorMap().values()].map(([name]) => name), ...Object.values(dns)].filter(
    (code: unknown): code is string => typeof code === 'string' && /^E[A-Z0-9_]+$/.test(code),
  ),
)
const NODE_CODE = /^(ERR_[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+)$/

function codeOf(value: unknown): string | undefined {
  if (!isObject(value)) return undefined
  const code = value.code
  if (typeof code !== 'string') return undefined
  return ERRNO_CODES.has(code) || NODE_CODE.test(code) || (INTERNAL_CODES as readonly string[]).includes(code)
    ? code
    : undefined
}
```

(`getSystemErrorMap()` trae los nombres de libuv, `ENOENT`, `ECONNREFUSED`, `EAI_AGAIN`…; las constantes de `node:dns` traen los códigos que no son de libuv, como `ENOTFOUND` y `ETIMEOUT`. El filtro descarta `UNKNOWN` y todo lo que no sea string. Verificado en Node 24.14: 85 nombres de libuv, 24 de DNS.)

- [x] **Step 4: Verificar que pasan**

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts`
Expected: todo PASS (los 2 que fallaban incluidos).

- [x] **Step 5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-k-backups.md ops/backup/lib/safe-error.ts ops/backup/safe-error.test.ts
git -C $WT commit -m "fix: print only Node errno codes from backup errors (#97)" -m "E[A-Z0-9]+ let any uppercase word starting with E through, so a code carrying text could reach the public log. The allow-list now comes from Node itself (libuv's error map plus the dns error codes), which also lets EAI_AGAIN through." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

---

## Task 2: la restauración revisa las carpetas raíz y todos los tamaños antes de subir (Minors 1 y 2)

**Files:**
- Modify: `ops/backup/storage.test.ts` (`memFs` l.73–81; tests nuevos después de l.283 y antes de l.427)
- Modify: `ops/backup/lib/storage.ts` (`FileKind` l.26–30; `assertRegularFile` l.176–184; `restoreAll` l.206–215)

**Interfaces:**
- `FileKind` gana `size: number` (lo trae `fs.Stats`, así que `nodeFs` en `lib/node-fs.ts` no cambia).
- `restoreAll(api, backupRoot, index, fs)` mantiene firma y resultado. Nuevos errores, todos antes de cualquier subida: `CodedError('filetype')` (sin índice) si `<backupRoot>/storage` o `<backupRoot>/storage/player-files` no son carpetas reales; `CodedError('size', i)` si el `lstat().size` del archivo `i` no coincide con el índice.

- [ ] **Step 1: Escribir los tests (rojo)**

En `ops/backup/storage.test.ts`:

1. En `memFs`, `kind` gana el tamaño y los archivos lo reportan (líneas 73–81 quedan así):

```ts
  const kind = (file: boolean, dir: boolean, link: boolean, size = 0) => ({
    isFile: () => file,
    isDirectory: () => dir,
    isSymbolicLink: () => link,
    size,
  })
  const fs: FsLike = {
    async lstat(path) {
      if (symlinks.includes(path)) return kind(false, false, true)
      if (path in files) return kind(true, false, false, files[path].length)
```

(El resto de `memFs` no cambia.)

2. Dentro de `describe('restore', …)`, justo después del test `a file whose size differs from the index is not uploaded` (termina en la l.283) y antes del `test.each(['../etc/passwd', …`:

```ts
  test.each(['/r/storage', '/r/storage/player-files'])(
    'a symlinked %s folder is refused before any upload',
    async (link) => {
      const { calls, api } = fakeFetch({ folders: {} })
      const err = await restoreAll(api, '/r', index, memFs(files, [link]).fs).catch((e: unknown) => e)
      expect(errorLine(err)).toBe('error: filetype')
      expect(calls).toHaveLength(0)
    },
  )

  test('a size mismatch in a later file stops the restore before the first upload', async () => {
    const { calls, api } = fakeFetch({ folders: {} })
    const two: StorageObject[] = [...index, { path: 't1/p2/curp.pdf', size: 4, mimetype: 'application/pdf' }]
    const fs = memFs({ ...files, '/r/storage/player-files/t1/p2/curp.pdf': bytes(2) }).fs
    const err = await restoreAll(api, '/r', two, fs).catch((e: unknown) => e)
    expect(errorLine(err)).toBe('error: size index=2')
    expect(calls).toHaveLength(0)
  })
```

3. Dentro de `describe('storage-restore against a local fake Storage server', …)`, justo antes del test `a symlink in the backup is refused before it is uploaded` (l.427):

```ts
    test.each(['storage', 'storage/player-files'])(
      'a symlinked %s folder that points outside the backup is refused before any upload',
      async (link) => {
        const outside = mkdtempSync(join(tmpdir(), 'outside-'))
        try {
          const bucket = link === 'storage' ? join(outside, 'player-files') : outside
          mkdirSync(join(bucket, 't1', 'p1'), { recursive: true })
          writeFileSync(join(bucket, 't1', 'p1', 'curp.pdf'), 'pdf')
          if (link === 'storage/player-files') mkdirSync(join(dir, 'storage'))
          symlinkSync(outside, join(dir, ...link.split('/')))
          writeFileSync(join(dir, 'storage-index.json'), JSON.stringify([curp]))
          expect(await runAsync([dir, target])).toEqual({ status: 1, out: 'error: filetype\n' })
          expect(uploads).toHaveLength(0)
        } finally {
          rmSync(outside, { recursive: true, force: true })
        }
      },
    )
```

(`mkdtempSync`, `mkdirSync`, `writeFileSync`, `symlinkSync`, `rmSync`, `tmpdir` y `join` ya están importados en el archivo; `dir`, `target`, `uploads`, `runAsync` y `curp` ya existen en ese `describe`.)

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm exec vitest run ops/backup/storage.test.ts`
Expected: 5 FAIL, todo lo demás PASS:
- `a symlinked /r/storage folder is refused before any upload` y `a symlinked /r/storage/player-files folder …` → `expected 'error: unknown' to be 'error: filetype'` (hoy la restauración termina "bien" y sube).
- `a size mismatch in a later file stops the restore before the first upload` → `expected [ { method: 'POST', …(3) } ] to have a length of +0 but got 1` (hoy sube el primer archivo antes de ver el tamaño del segundo).
- `a symlinked storage folder that points outside the backup …` y `a symlinked storage/player-files folder …` → `expected { status: +0, …(1) } to deeply equal { status: 1, out: 'error: filetype\n' }` (hoy sube el archivo de fuera del respaldo; es la reproducción del revisor).

- [ ] **Step 3: Implementar**

En `ops/backup/lib/storage.ts`:

1. `FileKind` (l.26–30):

```ts
export interface FileKind {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  size: number
}
```

2. Reemplaza `assertRegularFile` (l.176–184, con su comentario) por estas dos funciones:

```ts
// Like the manifest walk: every parent must be a real directory and the leaf a regular file, never a symlink.
async function assertRegularFile(fs: FsLike, root: string, object: StorageObject, index: number): Promise<void> {
  const segments = object.path.split('/')
  for (let depth = 1; depth <= segments.length; depth++) {
    const kind = await fs.lstat(join(root, ...segments.slice(0, depth)))
    const leaf = depth === segments.length
    if (kind.isSymbolicLink() || (leaf ? !kind.isFile() : !kind.isDirectory())) throw new CodedError('filetype', index)
    if (leaf && kind.size !== object.size) throw new CodedError('size', index)
  }
}

async function assertRealDirectory(fs: FsLike, path: string): Promise<void> {
  const kind = await fs.lstat(path)
  if (kind.isSymbolicLink() || !kind.isDirectory()) throw new CodedError('filetype')
}
```

3. En `restoreAll`, reemplaza desde `const root = bucketDir(join(backupRoot, 'storage'))` hasta el cierre del primer `for` (l.206–215) por:

```ts
  const storageDir = join(backupRoot, 'storage')
  const root = bucketDir(storageDir)
  // The walk starts at the backup root: a symlinked storage/ or bucket folder would lead outside it.
  await assertRealDirectory(fs, storageDir)
  await assertRealDirectory(fs, root)
  const pending: [number, StorageObject][] = []
  // Check every path, file type and size before the first upload, so a bad entry never leaves a half restore.
  for (const [i, object] of index.entries()) {
    assertSafePath(object.path)
    if (isFolderPlaceholder(object)) continue
    insideRoot(root, object.path)
    await assertRegularFile(fs, root, object, i)
    pending.push([i, object])
  }
```

El ciclo de subida que sigue (con su `if (data.length !== object.size) throw new CodedError('size', i)`) no cambia.

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm exec vitest run ops/backup`
Expected: `Test Files 5 passed (5)`, `Tests 113 passed (113)` (103 + 10). Los tests existentes `a missing file reports the fs code only` (`error: ENOENT`) y `a file whose size differs from the index is not uploaded` (`error: size index=1`, 0 llamadas) siguen pasando sin cambios.

- [ ] **Step 5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-k-backups.md ops/backup/lib/storage.ts ops/backup/storage.test.ts
git -C $WT commit -m "fix: check the storage folders and every size before restoring any file (#97)" -m "The lstat walk started below the bucket folder, so a symlinked storage/ or storage/player-files in a hostile archive could upload files from outside the backup. Both folders must now be real directories, and each file's size is compared with the index in the pre-check, so a mismatch never leaves a half restore." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

---

## Task 3: runbook — disco en RAM y lo que valida la restauración (Minor 3)

**Files:**
- Modify: `docs/ops/backups.md` (sección "Descargar y descifrar", l.109–121; sección "Restaurar Storage", l.202)

- [ ] **Step 1: Rojo**

En `$WT`:

```bash
grep -c 'mdutil -i off' docs/ops/backups.md
grep -c 'if \[ -e /Volumes/backupsdata \]' docs/ops/backups.md
grep -c 'al subir, que el tamaño coincida' docs/ops/backups.md
grep -c 'if \[ -e /Volumes/backupsram \]' docs/ops/backups.md
```

Expected: `0`, `0`, `1`, `0`. Confirma también que la l.59 es `ram=$(hdiutil attach -nomount ram://16384 | tr -d '[:space:]')` (receta USB de la llave de recuperación). Confirma también que `sed -n 109p docs/ops/backups.md` empieza con `Los datos descifrados van a un **disco en RAM**` y que la l.112 es `ram=$(hdiutil attach -nomount ram://4194304 | tr -d '[:space:]')`.

- [ ] **Step 1b: Disco en RAM de la llave de recuperación (mismo riesgo que el Minor 3)**

En `docs/ops/backups.md`, sección de la llave de **recuperación**, opción **USB**, reemplaza el bloque `bash` de las l.58–64 por este (un `/Volumes/backupsram` viejo haría que el nuevo se montara como `backupsram 1` y la llave se escribiera en el disco viejo):

```bash
if [ -e /Volumes/backupsram ]; then
  echo 'ALTO: /Volumes/backupsram ya existe; desmontarlo (hdiutil detach /Volumes/backupsram) y repetir'
else
  ram=$(hdiutil attach -nomount ram://16384 | tr -d '[:space:]')
  diskutil erasevolume APFS backupsram "$ram"
  age-keygen -o /Volumes/backupsram/recuperacion.txt   # imprime "Public key: age1…"
  cp /Volumes/backupsram/recuperacion.txt /Volumes/<USB>/
  hdiutil detach "$ram"
fi
```

Justo debajo del bloque agrega esta línea:

```text
Si imprime `ALTO`, no seguir hasta desmontar el volumen viejo.
```

 El párrafo "La USB (o la hoja)…" no cambia. Haz este paso antes del Step 2: así los números de línea del Step 2 se desplazan +4 (búscalos por texto, no por número).

- [ ] **Step 2: Disco en RAM (Minor 3)**

En `docs/ops/backups.md`, reemplaza el párrafo de la l.109 y el bloque `bash` que le sigue (l.111–121) por lo siguiente. Las líneas desde `gh run download` hasta `node -e …` son las mismas de hoy (con dos espacios de sangría); pasan a un segundo bloque envuelto en `if [ -n "$dir" ] && [ -n "$ram" ]; then … else echo "ALTO: corre primero el bloque anterior"; fi`:

````markdown
Los datos descifrados van a un **disco en RAM** (la misma receta que para las llaves), nunca al disco interno. 4194304 sectores son 2 GB; se ajusta si el respaldo crece. Si ya hay un volumen montado como `/Volumes/backupsdata` (uno viejo que no se desmontó), el nuevo se montaría como `backupsdata 1`, `$dir` apuntaría al viejo y el `hdiutil detach "$ram"` del final desmontaría el equivocado; por eso el primer bloque no crea nada en ese caso. Spotlight se apaga en el disco para que no indexe los documentos:

```bash
if [ -e /Volumes/backupsdata ]; then
  echo 'ALTO: /Volumes/backupsdata ya existe; desmontarlo (hdiutil detach /Volumes/backupsdata) y repetir'
else
  ram=$(hdiutil attach -nomount ram://4194304 | tr -d '[:space:]')
  diskutil erasevolume APFS backupsdata "$ram"
  dir=/Volumes/backupsdata
  sudo mdutil -i off "$dir"
  mdutil -s "$dir"
fi
```

Verde: no imprime `ALTO` y la salida de `mdutil -s` no dice `enabled` (en macOS actuales suele decir `Indexing disabled.`, pero el texto exacto varía por versión). Si imprime `ALTO` o dice `enabled`, no seguir. El segundo bloque solo corre si el primero definió `$dir` y `$ram` (por ejemplo, no tras un `ALTO`); si no, imprime `ALTO: corre primero el bloque anterior` y no ejecuta nada, aunque se pegue entero en un shell interactivo.

```bash
if [ -n "$dir" ] && [ -n "$ram" ]; then
  gh run download <run-id> -n backup-<ts> -D "$dir"
  # Copiar la llave principal del gestor de contraseñas al portapapeles. Así nunca se escribe en el disco.
  age -d -i <(pbpaste) "$dir/backup-<ts>.tar.age" | tar -xf - -C "$dir"
  pbcopy < /dev/null
  (cd "$dir" && shasum -a 256 -c SHA256SUMS)
  node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).commit)' "$dir/manifest.json"
else
  echo "ALTO: corre primero el bloque anterior"
fi
```
````

El párrafo "Verde: todas las líneas en `OK`…" y lo que sigue no cambian.

- [ ] **Step 3: Lo que valida la restauración (Minors 1 y 2)**

En la l.202 (después del Step 2 el número cambia; búscala con `grep -n 'al subir, que el tamaño coincida' docs/ops/backups.md`), reemplaza exactamente este texto:

```text
Antes de la primera subida comprueba que cada ruta sea segura y que cada archivo sea un archivo normal (ni symlink ni carpeta); al subir, que el tamaño coincida con `storage-index.json`. Si algo falla imprime `error: <código> index=<n>` y sale con 1.
```

por este:

```text
Antes de la primera subida comprueba que `storage/` y `storage/player-files/` sean carpetas reales (no symlinks), que cada ruta sea segura, que cada archivo sea un archivo normal (ni symlink ni carpeta) y que su tamaño coincida con `storage-index.json`; al subir lo vuelve a comparar con los bytes leídos. Si algo falla imprime `error: <código>` (más ` index=<n>` cuando el problema es de un archivo) y sale con 1.
```

El resto de la línea no cambia.

- [ ] **Step 4: Verde**

Repite los cuatro `grep -c` del Step 1. Expected: `1`, `1`, `0`, `1`. Además `grep -c 'carpetas reales (no symlinks)' docs/ops/backups.md` → `1`. Y `grep -cF 'if [ -n "$dir" ] && [ -n "$ram" ]; then' docs/ops/backups.md` → `1`; `grep -cF 'ALTO: corre primero el bloque anterior' docs/ops/backups.md` → `1`.

- [ ] **Step 5: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos y `B_tests + 10` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0. `git -C $WT diff --stat origin/develop` → solo los 5 archivos de la sección Global Constraints más este plan.

- [ ] **Step 6: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-k-backups.md docs/ops/backups.md
git -C $WT commit -m "docs: guard the backup RAM disk name and turn off Spotlight on it (#97)" -m "A stale /Volumes/backupsdata would make the new disk mount as 'backupsdata 1' while \$dir and the final detach pointed at the old one. The runbook now refuses to continue in that case (also for the recovery key's backupsram disk) and disables indexing so Spotlight never reads the decrypted documents; it also lists the restore's new pre-checks." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

**Reporte del implementer:** los tres SHA, `B_files`/`B_tests` y conteos finales, salidas de los rojos (Task 1 Step 2, Task 2 Step 2, Task 3 Step 1) y de los verdes (Task 1 Step 4, Task 2 Step 4, Task 3 Steps 4–5).

---

## Orquestador

- [ ] **Step O1: Revisión pre-PR** de la rama.
- [ ] **Step O2: PR** a `develop` con `Closes #97`; merge.
- [ ] **Step O3: El workflow nocturno sigue pasando (spec §5).** Después del merge: `gh workflow run backup.yml --ref develop --repo aiyangar/ligaspequenas`, luego `gh run list --workflow backup.yml --branch develop --event workflow_dispatch --limit 1 --repo aiyangar/ligaspequenas` y `gh run watch <run-id> --repo aiyangar/ligaspequenas` → `completed success`. Esta rama no toca `storage-dump.ts` ni el workflow, pero el paso "Dump Storage" importa `lib/safe-error.ts` y `lib/storage.ts`, así que la corrida prueba los imports nuevos en Linux/Node 24. Al día siguiente, confirmar que la corrida `schedule` también salió verde.

## Pruebas manuales que quedan para el owner (pendiente de aprobación del owner)

- **Simulacro de restauración.** El runbook (`docs/ops/backups.md`, sección `## Simulacro`, l.217) pide uno "después de cualquier cambio a `backup.yml` o a `ops/backup/`". Esta rama cambia `ops/backup/lib/storage.ts` (la restauración) y el bloque del disco en RAM, así que toca un simulacro en el Mac del owner contra un proyecto temporal. En él se verifica además que, tras `sudo mdutil -i off`, la salida de `mdutil -s` no dice `enabled` y que el guard `ALTO` no se dispara con un `/Volumes` limpio. El orquestador no lo puede correr (necesita la llave privada y el Mac del owner); queda listado en el PR y espera su aprobación.

- [ ] **Step M1 (owner, manual): simulacro de restauración** — pendiente de aprobación del owner. Verde: restauración completa en el proyecto temporal según el runbook, `mdutil -s "$dir"` sin la palabra `enabled` (el texto exacto varía por versión de macOS; se acepta cualquier salida que no diga `enabled`), el segundo bloque no imprime `ALTO: corre primero el bloque anterior`, el guard `ALTO` no se dispara con `/Volumes` limpio (ni en `backupsdata` ni en `backupsram` si se genera una llave), y el proyecto temporal se borra al final. #97 no se da por cerrado en el reporte final hasta que el owner lo apruebe.

## Discrepancias

- **Los números de línea del issue siguen vigentes** (`storage.ts:177-184` y `:206-221`, `safe-error.ts` regex en l.70); verificados contra `origin/develop` al 2026-11-18.
- **Minor 1, forma del arreglo:** el issue dice "empezar la caminata en la raíz del respaldo". El plan lo hace con dos `lstat` explícitos (`storage/` y `storage/player-files/` deben ser carpetas reales) antes de la caminata por entrada, que sigue empezando en el bucket. Es equivalente y no vuelve a recorrer las dos carpetas por cada archivo. `backupRoot` mismo no se revisa: es el argumento que da el operador (el disco en RAM).
- **Minor 2:** el chequeo de tamaño dentro del ciclo de subida se conserva (no lo pide quitar el issue); ahora es una segunda defensa y el comentario del pre-chequeo ya es cierto.
- **Minor 4:** además de cerrar el hueco, la lista de Node deja pasar `EAI_AGAIN` (fallo de DNS temporal), que el regex viejo convertía en `error: unknown` por el `_`. `ERR_[A-Z0-9_]+` y `UND_ERR_[A-Z0-9_]+` se quedan como regex: Node no expone la lista de sus códigos `ERR_*` en tiempo de ejecución y el issue solo señala el `E[A-Z0-9]+`.
- **Minor 3, mismo patrón en otro bloque:** la receta de la llave de recuperación (l.58–64) usa `backupsram` con el mismo riesgo de nombre repetido. El issue no lo menciona; por decisión del orquestador (2026-11-18) se le aplica el mismo guard (Task 3, Step 1b).
