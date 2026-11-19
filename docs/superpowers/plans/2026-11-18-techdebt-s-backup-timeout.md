# Lote S — Respaldos: código fijo `timeout` y respaldo a `cause.code` fijado (#136, #141) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Cuando una petición de los scripts de respaldo se corta por `AbortSignal.timeout`, la línea de error dice `error: timeout` en vez de `error: unknown`, sin imprimir nunca el texto del error (#136); y un test fija que un código con forma de Node pero fuera de la lista cae al `code` de su `cause` (#141).

**Architecture:** En `ops/backup/lib/safe-error.ts`, `'timeout'` se agrega a `INTERNAL_CODES` (así es un código interno más, válido también para `CodedError`) y `codeOf` devuelve `'timeout'` cuando el valor tiene `name === 'TimeoutError'`, antes de mirar `code`. Como `errorLine` ya prueba `codeOf(err) ?? codeOf(err.cause)`, el timeout se reconoce en el error o en su `cause` sin más cambios. #141 es solo un test.

**Tech Stack:** Node 24 (los scripts corren con type stripping: `node ops/backup/*.ts`), Vitest 4.1.9 (`// @vitest-environment node`), TypeScript 6 (`tsc -b` incluye `tsconfig.ops.json`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` (§1 lote S, §2 decisiones #136 y #141, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Contexto: `docs/superpowers/plans/2026-11-18-techdebt-p-backups-node-code.md` (#121, tabla de evidencia).

## Evidencia: la forma del timeout en Node 24

El único `AbortSignal` de `ops/backup` es `fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })` en `createApi` (`ops/backup/lib/storage.ts`). El planner lo reprodujo en Node `v24.14.1` (la CI usa `node-version: 24`) contra un servidor HTTP local, con `AbortSignal.timeout(200)`, y anotó el error que llega al `catch`:

| Dónde corta | Error observado |
|---|---|
| `fetch` antes de los headers (servidor que no responde) | `DOMException`, `name: 'TimeoutError'`, `code: 23` (número), sin `cause` |
| `res.arrayBuffer()` a media respuesta (headers enviados, cuerpo incompleto) | igual: `DOMException` `TimeoutError`, `code: 23`, sin `cause` |
| `res.json()` a media respuesta | igual |
| `AbortController.abort()` manual (no se usa en `ops/backup`) | `DOMException`, `name: 'AbortError'`, `code: 20` → sigue `unknown` |

Es decir, `fetch` rechaza con `signal.reason` tal cual, así que el test puede usar el `signal.reason` real de `AbortSignal.timeout(1)` en vez de un objeto inventado. El caso "en `cause`" (spec §2) no lo produce Node 24 hoy; se cubre igual porque `errorLine` ya mira `cause` y un `TypeError('fetch failed', { cause })` es la forma en la que undici envuelve sus otros errores.

## Global Constraints

- Rama `fix/backup-timeout-code`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/backup-timeout-code` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env` ni red.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca dispara el workflow de respaldo ni usa secretos o llaves. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `ops/backup/lib/safe-error.ts`, `ops/backup/safe-error.test.ts` y este plan. Antes de cada commit, `git -C $WT status -s` debe listar **solo** esos.
- **Paralelo:** Q, S, T, U y V corren a la vez y no comparten archivos (verificado por el planner: Q `src/players/*`; S `ops/backup/lib/safe-error.ts` y `ops/backup/safe-error.test.ts`; T `src/payments/*` y `src/documents/*`; U `supabase/functions/invite-user/*`; V dos `.md` de 2026-10-16). R va después de Q y solo toca `src/lib/flash*`, `src/players/PlayerFormPage.tsx` y `src/teams/TeamDetailPage.tsx`. Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Solo sintaxis TypeScript borrable (Node corre `ops/backup/*.ts` con type stripping).
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0. Referencia medida por el planner en `origin/develop` = `5effa8f`: **48 archivos, 566 tests**; `ops/backup`: 5 archivos, 120 tests. Este lote agrega **0 archivos y +5 tests** (Task 1: 3 nuevos + 1 que genera `test.each` sobre `INTERNAL_CODES` con `timeout`; Task 2: 1).

## Review Focus

- **Nunca se imprime el texto de un timeout**, aunque el mensaje traiga URL o llave: `new DOMException('https://… sb_secret_…', 'TimeoutError')` → `error: timeout` (Task 1).
- **El timeout real de Node 24** (`signal.reason` de `AbortSignal.timeout`) y el envuelto en `cause` → `error: timeout` (Task 1).
- **Un aborto manual no es timeout:** `AbortError` sigue `error: unknown` (Task 1).
- **`timeout` es un código interno más:** pasa por `CodedError('timeout')` y por `{ code: 'timeout' }` (Task 1, vía `the internal code %s passes through`); la lista de Node (`NODE_ERROR_CODES`) no cambia.
- **Respaldo a `cause.code`** cuando el código de arriba tiene forma de Node pero no está en la lista (Task 2, con mutación). El respaldo nocturno sigue verde (orquestador).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/backup-timeout-code`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile`, `pnpm exec vitest run` (anota `B_files`, `B_tests`; esperado 48 y 566) y `pnpm exec vitest run ops/backup` (5 archivos, 120 tests).

---

## Task 1: Un timeout imprime `error: timeout` (#136)

**Files:**
- Modify: `ops/backup/safe-error.test.ts` (3 tests nuevos al final)
- Modify: `ops/backup/lib/safe-error.ts` (`INTERNAL_CODES`; inicio de `codeOf`)

**Interfaces:**
- Produces: `INTERNAL_CODES` incluye `'timeout'` (y por tanto `InternalCode`); `errorLine` sin cambio de firma.

- [x] **Step 1.1: Escribir los tests (rojo)**

Al final de `ops/backup/safe-error.test.ts`:

```ts
test('an AbortSignal timeout prints the fixed code timeout, on the error or on its cause', async () => {
  const signal = AbortSignal.timeout(1)
  await new Promise((resolve) => signal.addEventListener('abort', resolve))
  expect(signal.reason).toMatchObject({ name: 'TimeoutError', code: 23 })
  expect(errorLine(signal.reason)).toBe('error: timeout')
  expect(errorLine(new TypeError('fetch failed', { cause: signal.reason }))).toBe('error: timeout')
})

test('a timeout never prints its message', () => {
  expect(errorLine(new DOMException('https://abc.supabase.co/storage/v1/object/x sb_secret_ABC', 'TimeoutError'))).toBe('error: timeout')
})

test('a manual abort is not a timeout', () => {
  expect(errorLine(new DOMException('aborted', 'AbortError'))).toBe('error: unknown')
})
```

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts`
Expected (verificado por el planner): FAIL en 2 tests — `an AbortSignal timeout prints the fixed code timeout…` y `a timeout never prints its message`, ambos `expected 'error: unknown' to be 'error: timeout'`. 40 pasan, incluido `a manual abort is not a timeout` (pin: hoy ya es `unknown` y debe seguirlo).

- [x] **Step 1.2: Implementar**

En `ops/backup/lib/safe-error.ts`:

1. En `INTERNAL_CODES`, agrega `'timeout',` después de `'target',` (orden alfabético).
2. En `codeOf`, justo después de `if (!isObject(value)) return undefined`, agrega:

```ts
  // AbortSignal.timeout rejects with a DOMException whose code is the number 23
  if (value.name === 'TimeoutError') return 'timeout'
```

Nada más cambia (`errorLine`, `NODE_ERROR_CODES`, `ERRNO_CODES` quedan igual).

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts` → 43 tests PASS (los 3 nuevos + `the internal code timeout passes through`, que `test.each([...INTERNAL_CODES])` genera solo).

- [x] **Step 1.3: Commit**

`git -C $WT status -s` → solo `safe-error.ts`, `safe-error.test.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-s-backup-timeout.md ops/backup/lib/safe-error.ts ops/backup/safe-error.test.ts
```

```bash
git -C $WT commit -m "fix: print a fixed timeout code when a backup request hits its AbortSignal timeout (#136)" -m "On Node 24 fetch rejects with the signal's DOMException TimeoutError, whose code is the number 23, so the error line said unknown. A TimeoutError, on the error or its cause, now maps to the internal code timeout; its message is still never printed." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Fijar el respaldo a `cause.code` (#141)

**Files:**
- Modify: `ops/backup/safe-error.test.ts` (1 test nuevo al final)

- [x] **Step 2.1: Escribir el test**

Al final del archivo:

```ts
test('an unknown Node-shaped code falls back to the code of its cause', () => {
  expect(errorLine({ code: 'ERR_FAKE', cause: { code: 'UND_ERR_SOCKET' } })).toBe('error: UND_ERR_SOCKET')
})
```

Run: `pnpm exec vitest run ops/backup/safe-error.test.ts` → 44 PASS (es un pin: el comportamiento ya existe).

- [x] **Step 2.2: Mutación (rojo demostrado)**

Aparta la versión verde: `G=$(mktemp)` y `cp $WT/ops/backup/lib/safe-error.ts "$G"`. En `errorLine`, cambia temporalmente `const code = codeOf(err) ?? codeOf(isObject(err) ? err.cause : undefined)` por `const code = codeOf(err)`. Run → FAIL en exactamente 3 tests (verificado por el planner): `a fetch failure prints the code of its cause`, `an AbortSignal timeout prints the fixed code timeout, on the error or on its cause` y `an unknown Node-shaped code falls back to the code of its cause`. Restaura con `cp "$G" $WT/ops/backup/lib/safe-error.ts` y `rm "$G"`; `git -C $WT diff --stat -- ops/backup/lib/safe-error.ts` → vacío (Task 1 ya está commiteado). Run → 44 PASS.

- [x] **Step 2.3: `ops/backup`, suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run ops/backup` → 5 archivos, 125 tests PASS. `pnpm exec vitest run` → `B_files` archivos, `B_tests + 5` tests, todo verde (planner: 48 y 571). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

Run: `node ops/backup/crosscheck.ts` (sin argumentos) → stderr `error: args` y exit 1 (el script sigue arrancando con type stripping).

- [x] **Step 2.4: Commit**

`git -C $WT status -s` → solo `safe-error.test.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-s-backup-timeout.md ops/backup/safe-error.test.ts
```

```bash
git -C $WT commit -m "test: pin the cause-code fallback for an unknown Node-shaped code in backup error lines (#141)" -m "A top-level code with the ERR_ shape but outside the known list is ignored, and errorLine falls back to the code of its cause. No test held that path." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.1, la mutación de 2.2, las salidas verdes de 2.3 y la salida de `node ops/backup/crosscheck.ts`.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #136` y `Closes #141`. El cuerpo incluye la tabla de evidencia de este plan.
- [ ] **O2. Respaldo en verde con el código nuevo** (el workflow corre sobre `develop`, la rama por defecto):

```bash
gh workflow run backup.yml --repo aiyangar/ligaspequenas --ref develop
```

Luego, sondea (cada ~10 s, hasta 2 min) hasta que aparezca una corrida `workflow_dispatch` cuyo `headSha` sea el merge commit del PR (`MERGE_SHA`):

```bash
gh run list --repo aiyangar/ligaspequenas --workflow backup.yml --event workflow_dispatch --limit 5 --json databaseId,status,conclusion,headSha,createdAt --jq ".[] | select(.headSha == \"$MERGE_SHA\")"
```

Toma su `databaseId` (si hay varias, la de `createdAt` más reciente) y sigue esa corrida:

```bash
gh run watch <databaseId> --repo aiyangar/ligaspequenas --exit-status
```

→ exit 0 y `conclusion: success`. Si falla, `gh run view <databaseId> --repo aiyangar/ligaspequenas --log-failed` y anota la línea `error: …` (nunca contiene secretos por diseño; con este lote un corte por tiempo dirá `error: timeout`). Rollback: `git revert -m 1` del merge en una rama `fix/*` nueva → PR → merge; nunca parchar hacia adelante.
- [ ] **O3.** El siguiente respaldo programado (09:17 UTC) también termina `success`.

---

## Discrepancias

- **`timeout` dentro de `INTERNAL_CODES` (decisión del planner).** El spec dice "`INTERNAL_CODES` (o equivalente)". Meterlo en la lista hace que `{ code: 'timeout' }` y `CodedError('timeout')` también impriman `timeout`; es texto fijo nuestro, no puede filtrar nada, y evita una segunda lista. Nadie lanza hoy `CodedError('timeout')`.
- **Se reconoce por `name`, no por `instanceof DOMException`.** El spec fija `name === 'TimeoutError'`. Un objeto cualquiera con ese `name` también dará `timeout`; como la salida es un literal fijo, no hay fuga.
- **Timeout envuelto en `cause`.** Node 24 no lo envuelve (tabla de evidencia); el test lo cubre igual porque el spec lo pide y porque un cambio de undici podría envolverlo como envuelve `ECONNRESET`.
