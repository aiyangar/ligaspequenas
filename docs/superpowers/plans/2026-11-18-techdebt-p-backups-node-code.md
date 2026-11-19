# Lote P — Respaldos: solo códigos `ERR_*`/`UND_ERR_*` conocidos en la línea de error (#121) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** `errorLine` (lo único que los scripts de `ops/backup` imprimen al fallar) deja de aceptar cualquier `ERR_<MAYÚSCULAS>` o `UND_ERR_<MAYÚSCULAS>`: un código con forma de Node solo se imprime si además está en una lista explícita de códigos que esos scripts pueden lanzar de verdad; cualquier otro sale `error: unknown` (#121).

**Architecture:** En `ops/backup/lib/safe-error.ts`, la regex `NODE_CODE` se reemplaza por `NODE_CODE_SHAPE = /^(ERR|UND_ERR)_[A-Z0-9_]+$/` **y** `export const NODE_ERROR_CODES`, una lista de 6 códigos justificada abajo con evidencia. `codeOf` acepta un código de Node solo si cumple las dos. Los errno (`ERRNO_CODES`, lista exacta desde #97) y los códigos internos (`INTERNAL_CODES`) no cambian. Un test fija que cada entrada de la lista tiene la forma de Node, así una entrada mal escrita no puede abrir un hueco.

**Tech Stack:** Node 24 (los scripts corren con type stripping: `node ops/backup/*.ts`), Vitest 4.1.9 (`// @vitest-environment node`), TypeScript 6 (`tsc -b` incluye `tsconfig.ops.json`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` (§1 lote P, §2 decisión #121, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Contexto: `docs/superpowers/plans/2026-11-18-techdebt-k-backups.md` (#97, errno exacto).

## Evidencia: qué códigos `ERR_*`/`UND_ERR_*` pueden salir de `ops/backup`

Los scripts de producción (`storage-dump.ts`, `storage-restore.ts`, `crosscheck.ts`, `manifest.ts`, vía `runMain`) solo hacen cuatro cosas que lanzan errores de Node: `fs/promises` (`lstat`, `mkdir`, `readFile`, `writeFile`, `readdir` en `lib/node-fs.ts`, `lib/manifest.ts`, `crosscheck.ts`, `storage-restore.ts`), `new URL` (`assertRestoreTarget`, `lib/storage.ts:197`), `fetch` con `AbortSignal.timeout(120_000)` (`lib/storage.ts:50`) y `res.json()`/`res.arrayBuffer()`. `check-recipients.ts` usa `readFileSync` y lanza `RecipientsError` (sin `code`). El planner provocó cada falla posible de esas llamadas en Node `v24.14.1` (la CI usa `node-version: 24`) y anotó `code` del error y de su `cause` (`errorLine` mira los dos):

| Llamada (dónde) | Falla provocada | `code` observado |
|---|---|---|
| `new URL` (`assertRestoreTarget`) | URL inválida | `ERR_INVALID_URL` |
| `fetch` (`createApi`) | `SUPABASE_URL` relativa / inválida | `cause.code = ERR_INVALID_URL` |
| `readFile` (`node-fs`, `manifest`, `crosscheck`, `storage-restore`) | ruta con byte nulo | `ERR_INVALID_ARG_VALUE` |
| `readFile` | ruta `undefined` (argumento faltante) | `ERR_INVALID_ARG_TYPE` |
| `readFile` (`fs.readFile` en `restoreAll`, `buildManifest`) | archivo de 3 GiB (sparse) | `ERR_FS_FILE_TOO_LARGE` |
| `fetch` | el servidor cierra el socket a media respuesta o antes de los headers | `cause.code = UND_ERR_SOCKET` |
| `fetch` | host que no responde (connect timeout de undici, 10 s < 120 s del `AbortSignal`) | `cause.code = UND_ERR_CONNECT_TIMEOUT` |
| `fs` en general | `ENOENT`, `EISDIR`, `EEXIST`, `EPERM`, `ENOTDIR`; `fetch`: `ECONNRESET`, `ENOTFOUND` | errno → ya cubiertos por `ERRNO_CODES` |
| `readFile(…, 'utf8')` | > `MAX_STRING_LENGTH` (600 MB) | `RangeError` **sin** `code` → `unknown` |
| `AbortSignal.timeout` | timeout de 120 s | `DOMException` `TimeoutError`, `code = 23` (número) → `unknown` |
| `res.json()` | JSON inválido | `SyntaxError` sin `code` → `unknown` |
| `fetch` | header inválido / respuesta HTTP corrupta | `TypeError` sin `code` / `HTTPParserError` sin `code` → `unknown` |

Los timeouts de headers/body de undici (`UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_BODY_TIMEOUT`, 300 s por defecto) no pueden ocurrir: el `AbortSignal` de 120 s corta antes. Por eso la lista es exactamente:

```
ERR_FS_FILE_TOO_LARGE, ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE, ERR_INVALID_URL,
UND_ERR_CONNECT_TIMEOUT, UND_ERR_SOCKET
```

Los tres que ya tiene el test `the system code %s passes through` (`ERR_INVALID_URL`, `UND_ERR_SOCKET`, `UND_ERR_CONNECT_TIMEOUT`) están en ella. Un código de Node real que no esté en la lista sale `unknown`: se pierde diagnóstico, nunca se filtra texto. Si algún día aparece un `unknown` en el respaldo nocturno, se reproduce y se agrega con su evidencia.

## Global Constraints

- Rama `fix/backups-node-code`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/backups-node-code` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env` ni red.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca dispara el workflow de respaldo ni usa secretos o llaves. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git apply`.
- **Archivos permitidos** (solo estos): `ops/backup/lib/safe-error.ts`, `ops/backup/safe-error.test.ts` y este plan. Antes de cada commit, `git -C $WT status -s` debe listar **solo** esos.
- **Paralelo:** L, M, N, O y P corren a la vez en worktrees distintos y no comparten archivos (verificado por el planner: L toca `supabase/functions/invite-user/*` y `src/users/*`; M `src/teams/*`; N `src/players/*` y `src/documents/documents.ts`; O `src/payments/*`; P `ops/backup/*`). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Solo sintaxis TypeScript borrable (Node corre `ops/backup/*.ts` con type stripping): anotaciones de tipo sí, `enum`/`namespace` no.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `9669e97`: **48 archivos, 538 tests**. Este lote agrega **0 archivos y +7 tests** (Task 1: 1; Task 2: 6).

## Review Focus

- **Ningún `ERR_…`/`UND_ERR_…` inventado se imprime**, ni en el error ni en su `cause` (`ERR_SB_SECRET_…`, `ERR_AGE_SECRET_KEY_…`, `UND_ERR_SB_SECRET_…`) (Task 1).
- **Los códigos reales siguen saliendo:** los 6 de la lista (Task 2), y los errno y códigos internos sin cambio (tests existentes).
- **La lista no puede contener algo sin forma de Node:** cada entrada se valida contra la forma en un test (Task 2, con mutación).
- **El respaldo nocturno sigue verde** con el código nuevo (orquestador: `workflow_dispatch` sobre `develop`).
- **Nunca se imprime `err.message`** (invariante de `errorLine`, sin cambio).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/backups-node-code`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 48 y 538, todo verde). `pnpm exec vitest run ops/backup` → 5 archivos, 113 tests.

---

## Task 1: Un código con forma de Node pero desconocido sale `unknown`

**Files:**
- Modify: `ops/backup/safe-error.test.ts` (1 test nuevo al final)
- Modify: `ops/backup/lib/safe-error.ts` (`NODE_CODE` l.78 y `codeOf` l.84)

**Interfaces:**
- Produces: `export const NODE_ERROR_CODES: readonly string[]` en `ops/backup/lib/safe-error.ts` (Task 2 lo importa).

- [x] **Step 1.1: Escribir el test (rojo)**

Al final de `ops/backup/safe-error.test.ts`:

```ts
test('a Node-shaped code outside the known list is never printed', () => {
  expect(errorLine({ code: 'ERR_SB_SECRET_ABCDEFGHIJKLMNOP' })).toBe('error: unknown')
  expect(errorLine({ code: 'ERR_AGE_SECRET_KEY_1QQQ' })).toBe('error: unknown')
  expect(errorLine({ code: 'UND_ERR_SB_SECRET_ABCDEFGH' })).toBe('error: unknown')
  expect(errorLine(new TypeError('fetch failed', { cause: { code: 'ERR_SB_SECRET_ABCDEFGH' } }))).toBe('error: unknown')
})
```

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts`
Expected: FAIL solo en `a Node-shaped code outside the known list is never printed` con `expected 'error: ERR_SB_SECRET_ABCDEFGHIJKLMNOP' to be 'error: unknown'` (verificado por el planner); 32 pasan.

- [x] **Step 1.2: Implementar**

En `ops/backup/lib/safe-error.ts`:

1. Reemplaza `const NODE_CODE = /^(ERR_[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+)$/` por:

```ts
// Node and undici codes the backup scripts were observed to raise (fs/promises, URL, fetch on Node 24); see #121.
export const NODE_ERROR_CODES: readonly string[] = [
  'ERR_FS_FILE_TOO_LARGE',
  'ERR_INVALID_ARG_TYPE',
  'ERR_INVALID_ARG_VALUE',
  'ERR_INVALID_URL',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]
const NODE_CODE_SHAPE = /^(ERR|UND_ERR)_[A-Z0-9_]+$/
```

2. En `codeOf`, reemplaza:

```ts
  return ERRNO_CODES.has(code) || NODE_CODE.test(code) || (INTERNAL_CODES as readonly string[]).includes(code)
```

por:

```ts
  const nodeCode = NODE_CODE_SHAPE.test(code) && NODE_ERROR_CODES.includes(code)
  return ERRNO_CODES.has(code) || nodeCode || (INTERNAL_CODES as readonly string[]).includes(code)
```

El comentario de l.72 (`// Node's own errno names, Node/undici code shapes or our own codes; …`) queda como está.

Comprobación: `grep -n "NODE_CODE\b" ops/backup/lib/safe-error.ts` → sin salida.

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts` → 33 tests PASS (incluido `the system code %s passes through` con `ERR_INVALID_URL`, `UND_ERR_SOCKET`, `UND_ERR_CONNECT_TIMEOUT`).

- [x] **Step 1.3: Commit**

`git -C $WT status -s` → solo `safe-error.ts`, `safe-error.test.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-p-backups-node-code.md ops/backup/lib/safe-error.ts ops/backup/safe-error.test.ts
```

```bash
git -C $WT commit -m "fix: print only known Node and undici codes in backup error lines (#121)" -m "The ERR_/UND_ERR_ pattern accepted any uppercase string with that prefix. A Node-shaped code must now also be one of the codes the backup scripts were observed to raise from fs/promises, URL and fetch on Node 24; anything else prints unknown." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: La lista conocida pasa y tiene la forma de Node

**Files:**
- Modify: `ops/backup/safe-error.test.ts` (import l.2; `test.each` nuevo al final)

- [ ] **Step 2.1: Escribir el test**

1. En el import de `./lib/safe-error.ts`, agrega `NODE_ERROR_CODES` (orden: `CodedError, HttpError, INTERNAL_CODES, NODE_ERROR_CODES, errorLine`).
2. Al final del archivo:

```ts
test.each([...NODE_ERROR_CODES])('the known Node code %s has the Node shape and passes through', (code) => {
  expect(code).toMatch(/^(ERR|UND_ERR)_[A-Z0-9_]+$/)
  expect(errorLine({ code })).toBe(`error: ${code}`)
})
```

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts` → 39 tests PASS.

- [ ] **Step 2.2: Mutaciones (rojo demostrado)**

a. En `NODE_ERROR_CODES`, agrega temporalmente `'ERR_lower'` al final. Run → FAIL solo en `the known Node code ERR_lower has the Node shape and passes through` (`toMatch`).

b. Restaura con `git -C $WT checkout -- ops/backup/lib/safe-error.ts` (Task 1 ya está commiteado en el Step 1.3, así que solo se descarta la mutación). Comprueba `git -C $WT diff --stat -- ops/backup/lib/safe-error.ts` → vacío.

c. En `codeOf`, cambia temporalmente `const nodeCode = NODE_CODE_SHAPE.test(code) && NODE_ERROR_CODES.includes(code)` por `const nodeCode = NODE_CODE_SHAPE.test(code)`. Run → FAIL solo en `a Node-shaped code outside the known list is never printed`. Restaura con `git -C $WT checkout -- ops/backup/lib/safe-error.ts`; `git -C $WT diff --stat -- ops/backup/lib/safe-error.ts` → vacío. Vuelve a correr → 39 PASS.

- [ ] **Step 2.3: `ops/backup`, suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run ops/backup` → 5 archivos, 120 tests PASS (incluye los tests de `storage-dump.ts`/`storage-restore.ts`/`manifest.ts` que corren los scripts reales con `spawnSync` y comparan la línea de error). `pnpm exec vitest run` → `B_files` archivos, `B_tests + 7` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

Run: `node ops/backup/crosscheck.ts` (sin argumentos) → stderr `error: args` y exit 1 (el script sigue arrancando con type stripping).

- [ ] **Step 2.4: Commit**

`git -C $WT status -s` → solo `safe-error.test.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-p-backups-node-code.md ops/backup/safe-error.test.ts
```

```bash
git -C $WT commit -m "test: pin the known Node codes and their shape in backup error lines (#121)" -m "Every listed code must match the Node ERR_/UND_ERR_ shape and pass through, so a mistyped entry cannot widen what errorLine prints." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.1, las dos mutaciones de 2.2, las salidas verdes de 2.3 y la salida de `node ops/backup/crosscheck.ts`.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #121`. El cuerpo incluye la tabla de evidencia de este plan y la decisión de cubrir también `UND_ERR_*` (ver Discrepancias).
- [ ] **O2. Respaldo en verde con el código nuevo** (el workflow corre sobre `develop`, la rama por defecto):

```bash
gh workflow run backup.yml --repo aiyangar/ligaspequenas --ref develop
```

Luego `gh run list --repo aiyangar/ligaspequenas --workflow backup.yml --limit 1 --json databaseId,status,conclusion,headSha` hasta `status: completed`; esperado `conclusion: success` y `headSha` = el merge del PR. Si falla, `gh run view <id> --repo aiyangar/ligaspequenas --log-failed` y anota la línea `error: …` (nunca contiene secretos por diseño). Rollback: revert del merge en una rama `fix/*` nueva, nunca parchar hacia adelante.
- [ ] **O3.** El siguiente respaldo programado (09:17 UTC) también termina `success`.

---

## Discrepancias

- **`UND_ERR_*` (decisión del planner).** El issue y el spec §2 hablan de `ERR_*`, pero la misma regex `NODE_CODE` aceptaba también cualquier `UND_ERR_<MAYÚSCULAS>`: el mismo hueco. Se cierran los dos con la misma lista y la misma forma. Si la revisión lo considera fuera de alcance, basta con dejar `UND_ERR_[A-Z0-9_]+` en la forma sin lista, en un issue aparte.
- **Lista por evidencia, no por catálogo.** No se usa el catálogo completo de Node (más de 300 `ERR_*`, solo accesible con `--expose-internals`): la lista son los códigos que las llamadas de `ops/backup` producen de verdad (tabla arriba). Lo demás sale `unknown`, que es el lado seguro.
- **Timeouts como `unknown`.** El timeout de 120 s de `AbortSignal.timeout` lanza un `DOMException` con `code` numérico (`23`) y nombre `TimeoutError`; hoy y después del lote imprime `error: unknown`. Es una pérdida de diagnóstico, no una fuga; se puede proponer como issue (p. ej. un código interno `timeout`) sin mezclarlo con #121.
