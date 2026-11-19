# Lote J — Tests de formularios lentos bajo carga (#34) y esperas de Testing Library (#120) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y los specs `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` y `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. **Este lote va al último:** se despacha solo cuando C, D, E, F, G, H e I (olas 1 y 2) **y** L, M, N, O y P (ola 3) están **todos** mergeados a `develop`, y se mide sobre ese `develop` final sin ninguna otra suite corriendo en la máquina. El implementer lee el plan desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí.

**Goal:** Que los tests de formularios que escriben con `userEvent` dejen de fallar por el timeout de 5 s de Vitest cuando la máquina está cargada. Primero se ataca la causa, como prefiere el issue: `userEvent.setup({ delay: null })` en los tests lentos, que conserva el guard de 5 s. Solo los que sigan lentos o con timeout después de eso reciben un timeout por test. Todo se elige por medición. El timeout global no cambia. Además (#120, ola 3), con la misma medición se decide si las esperas de Testing Library (`findBy*`/`waitFor`, 1 s por defecto) necesitan más margen: `configure({ asyncUtilTimeout })` global en `src/test-setup.ts` si los fallos de espera están repartidos, esperas puntuales si son pocos, o ningún cambio si el protocolo no produce ninguno. Nunca a ciegas.

**Architecture:** Dos palancas, en este orden, sobre el conjunto de tests que seleccione la medición:
1. **Causa raíz:** en cada test seleccionado, `userEvent.setup()` → `userEvent.setup({ delay: null })`. user-event deja de agendar un `setTimeout` entre tecla y tecla, que es lo que se encola detrás de la carga de CPU. El test no cambia en nada más.
2. **Respaldo:** si un test sigue en ≥ 2500 ms o con timeout después de la palanca 1, se le pasa `{ timeout: TYPING_TEST_TIMEOUT }` (15 s) como opción por test de Vitest 4. La constante vive en `src/test/timeouts.ts`, con una línea de *por qué*; el directorio `src/test/` lo creó el lote I.

3. **Esperas de Testing Library (#120):** solo si el protocolo produce fallos de espera (`Unable to find …` / `Timed out in waitFor`), con la regla F del Step 1.5: global (`configure({ asyncUtilTimeout })` en `src/test-setup.ts`) o puntual (opción `{ timeout: FIND_TIMEOUT }` en los `findBy*`/`waitFor` que fallaron). Valor inicial 2000 ms; 3000 ms como máximo.

`vite.config.ts` no se toca. La selección usa un protocolo de carga reproducible (3 corridas completas en paralelo, dos rondas) y una regla objetiva sobre los tiempos por test del reporter `verbose`.

**Tech Stack:** Vitest 4.1.9 (reporter `verbose`, opción `timeout` por test), Testing Library (`configure({ asyncUtilTimeout })`, opción `timeout` de `findBy*`/`waitFor`) + user-event 14 (`delay: null`), TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md`: §3 (#34; el orquestador revisó su propia decisión, ver Discrepancias) y §4 (lote J). `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md`: §1 (#120 se suma a J; J sigue siendo el último lote) y §2 (#120: se decide con evidencia de una corrida con carga; global en `src/test-setup.ts` si hace falta, o esperas puntuales; nunca a ciegas).

## Global Constraints

- **Rama y worktree.** Rama `fix/form-test-timeouts`, cortada de `origin/develop` **después** de los merges de C, D, E, F, G, H, I, L, M, N, O y P. Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/form-test-timeouts` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`.
- **Por qué va al último.** J toca archivos de test de casi todos los lotes de UI y mide tiempos que esos lotes cambian (la ola 3 agrega tests a `UsersPage`, `TeamDetailPage`, `TeamFormPage`, `PlayerFormPage`, `players`, `payments` y `safe-error`). Con todos mergeados no hay edición en paralelo, y la medición refleja el código final.
- **Nunca `git stash`**: el stash es compartido entre worktrees. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git apply`. Antes de cada commit, `git -C $WT status -s` debe listar **solo** archivos permitidos y este plan.
- **Git.** Siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`.
- **Lo que el implementer nunca hace.** Push, PR o merge; usar el Supabase MCP o tocar la base; tocar `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Archivos permitidos:**
  - `src/test/timeouts.ts` (nuevo, solo si hace falta la palanca 2 o la palanca 3 puntual).
  - Los `*.test.tsx` que contengan tests seleccionados en el Task 1, y en ellos solo la línea `userEvent.setup(…)` de esos tests, su línea `test(…)` (palanca 2) y el import de `TYPING_TEST_TIMEOUT`.
  - `src/test-setup.ts`, solo si la regla F elige la palanca 3 global: el import de `configure` y una llamada `configure({ asyncUtilTimeout: … })` con su línea de *por qué*.
  - Si la regla F elige la palanca 3 puntual: en los `*.test.tsx` de los tests con fallo de espera, solo la llamada `findBy*`/`waitFor` que falló (agregando `{ timeout: FIND_TIMEOUT }`) y el import de `FIND_TIMEOUT`.
  - Este plan.
- **Prohibido:** `vite.config.ts`, cualquier `testTimeout` o `vi.setConfig` global, cambiar otra cosa del cuerpo de un test, `delay: null` en tests que no fueron seleccionados, y cualquier `asyncUtilTimeout`/`{ timeout }` de espera sin un fallo de espera medido que lo justifique.
- **Medición.** Los logs van **fuera** del repo (`LOGS=$(mktemp -d)` al inicio) y nunca se commitean. Mientras se mide no corre nada más pesado en la máquina (ni otros implementers ni otras suites). Si hay algo corriendo, espera y repite.
- **Convenciones.** Código, identificadores y comentarios en inglés; sin comentarios salvo la línea de *por qué* de `timeouts.ts`. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- **Conteos.** El lote no agrega archivos de test ni tests. Esperado al final: `B_files` y `B_tests` sin cambios.
- **Paralelo.** J no corre en paralelo con nadie (es el último); por eso no comparte archivos con L–P aunque toque sus tests.

## Review Focus

- **Selección por evidencia:** cada test tocado aparece en la tabla de medición del reporte con su peor duración bajo carga, antes y después de cada palanca, y la regla que cumplió. Ningún test se toca sin evidencia.
- **Causa antes que margen:** ningún test recibe `{ timeout }` sin haber pasado antes por `delay: null` y vuelto a medirse.
- **El guard de 5 s sigue vigente para todo lo demás:** `grep -rn "testTimeout\|setConfig" vite.config.ts src` → sin salida.
- **Ningún test cambia lo que verifica:** el diff de cada archivo toca solo `userEvent.setup(…)`, la línea `test('…'`, la opción `{ timeout: FIND_TIMEOUT }` de una espera que falló y los imports.
- **#120 por evidencia:** el reporte trae, por separado de los timeouts de test, el conteo de fallos de espera (`Unable to find …` / `Timed out in waitFor`) en las 6 corridas de carga, antes y después, y qué rama de la regla F se aplicó. Si no hubo ninguno, no hay cambio y #120 se cierra con esa tabla.
- **Un `asyncUtilTimeout` más alto no esconde regresiones:** un `findBy*` que nunca va a encontrar su elemento tarda más en fallar, pero sigue fallando; el valor queda en 2000–3000 ms, por debajo del timeout de test de 5 s.

---

## Medición de referencia del planner (2026-11-18, `origin/develop` = `24c14a4`, antes de los lotes)

> Ola 3 (2026-11-18, `origin/develop` = `9669e97`, con C–I mergeados, 48 archivos / 538 tests, 10 núcleos): con el protocolo de 3 corridas en paralelo, dos rondas, las 6 corridas terminaron `538 passed (538)`, con **0** `Test timed out` y **0** fallos de espera. Con 5 corridas en paralelo (una ronda, sobrecarga) fallaron 37–41 tests por corrida; los fallos fueron casi todos `Test timed out in 5000ms` (356 líneas en los 5 logs) y solo 7 fueron fallos de espera de `findBy*` (`Unable to find role="alert"` ×2, `… No se pudo enviar el…` ×2, `… Equipo no encontrado.`, `… Ana Ruiz.`, `… Ana Roster.`). Es el escenario de #120: los fallos de espera aparecen junto con los timeouts de test, no solos. Referencia nada más: el implementer vuelve a medir sobre el `develop` final.

La máquina tiene 10 núcleos (`sysctl -n hw.ncpu`). Estos números son solo referencia: **el implementer vuelve a medir** sobre el `develop` final, porque C, D, E, F, G, H e I cambian varios de estos archivos de test.

| Test (archivo › nombre) | Sin carga | Peor con 3 corridas en paralelo | Bajo carga | Con `delay: null` (3 en paralelo) |
|---|---|---|---|---|
| `PlayerFormPage` › create mode submits createPlayer with the tenant id | 785 ms | 5106 ms | **timeout 3/3** | 3911–4016 ms, pasa 3/3 (sigue ≥ 2500 → palanca 2) |
| `PlayerFormPage` › creating shows an in-app success confirmation | 634 ms | 3524 ms | pasa | 2297–2439 ms (bajo el umbral) |
| `UsersPage` › invites a user through the inviteUser client | 325 ms | 2547 ms | pasa | no medido |
| `TeamFormPage` › create mode submits createTeam with tenant and active season id | 406 ms | 2438 ms | pasa | no medido |
| `PaymentDialog` › Otro without a note is blocked with a field error | 288 ms | 2303 ms | pasa | no medido |
| `PlayerDocumentsSection` › lists the 6 documents with their status | 248 ms | 2119 ms | pasa (no escribe: fuera de la regla) | — |

Con `delay: null` en los dos primeros tests, las 3 corridas en paralelo terminaron `449 passed (449)` sin ningún `Test timed out`. `delay: null` bajó el peor caso de los dos, pero `create mode submits createPlayer…` quedó en ~4 s, demasiado cerca de 5 s: es el caso para el que existe la palanca 2.

Con 5 corridas en paralelo (sobrecarga extrema, 50 workers en 10 núcleos) fallaron 13–20 tests por corrida: 84 fallos en las 5 corridas, 75 por `Test timed out in 5000ms` y el resto por esperas de `findBy*`, que tienen 1 s en Testing Library y que un `timeout` de test no arregla. Ese escenario no es el del issue y queda fuera (ver Discrepancias).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/form-test-timeouts`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3: Confirmar que todos los lotes están en la base.** Para cada rama (olas 1 y 2: `fix/documents-section-hardening`, `fix/player-page-polish`, `fix/players-list-export-polish`, `fix/payments-a11y-tests`, `fix/teams-tests-dialog`, `fix/lists-a11y-loading`, `fix/users-auth-polish`; ola 3: `fix/users-invite-edge-cases`, `fix/team-form-flash`, `fix/player-photo-zero-rows-and-refresh`, `fix/payments-403-match`, `fix/backups-node-code`):
  1. `gh pr list --repo aiyangar/ligaspequenas --state merged --base develop --head <rama> --json number,mergeCommit` → un PR con `mergeCommit`.
  2. `git -C $WT merge-base --is-ancestor <mergeCommit.oid> origin/develop` → exit 0.

  Si falta alguno, **detente** y avisa al orquestador.
- [x] **Step 0.4:** `ls $WT/src/test/` muestra `deferred.ts` y `authListener.ts` (lote I). En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests` (todo verde, sin carga).
- [x] **Step 0.5:** `LOGS=$(mktemp -d)` y anota la ruta en el reporte. Anota `sysctl -n hw.ncpu`.

---

## Task 1: Medir y seleccionar (el "rojo")

El rojo de este lote no es un test nuevo. Es la evidencia de que ciertos tests revientan o rozan el timeout bajo una carga reproducible.

- [x] **Step 1.1: Corrida sin carga**

Run (en `$WT`): `pnpm exec vitest run --reporter verbose > "$LOGS/idle.txt" 2>&1`
Expected: `Tests  B_tests passed (B_tests)`.

- [x] **Step 1.2: Protocolo de carga (dos rondas de 3 corridas en paralelo)**

Ronda 1 (en `$WT`, un solo comando; espera a que terminen las tres):

```bash
for i in 1 2 3; do pnpm exec vitest run --reporter verbose > "$LOGS/load-a-$i.txt" 2>&1 & done; wait
```

Ronda 2: el mismo comando con `load-b-$i.txt`.

- [x] **Step 1.3: Extraer tiempos y timeouts**

Peor duración por test bajo carga (el planner verificó este comando sobre sus logs):

```bash
cat "$LOGS"/load-*.txt | grep -E "^ +[✓×] " | sed -E 's/^ +[✓×] (.*) ([0-9]+)ms$/\2\t\1/' | sort -t$'\t' -k2,2 -k1,1nr | awk -F'\t' '!seen[$2]++' | sort -nr | head -40
```

Timeouts de test, de cualquier duración:

```bash
grep -h -B2 "Test timed out in" "$LOGS"/load-*.txt | grep -E "FAIL" | sort | uniq -c
```

Otros fallos bajo carga (todos los `×`; los de espera los clasifica el Step 1.5):

```bash
cat "$LOGS"/load-*.txt | grep -E "^ +× " | sort | uniq -c
```

Fallos de espera de Testing Library (#120), por mensaje:

```bash
grep -hE "Unable to find|Timed out in waitFor" "$LOGS"/load-*.txt | cut -c1-120 | sort | uniq -c | sort -rn
```

- [x] **Step 1.4: Aplicar la regla de selección**

Un test se selecciona si cumple **(A o B) y C**:

- **A.** Falló con `Test timed out in` en al menos 1 de las 6 corridas de carga.
- **B.** Su peor duración bajo carga es ≥ 2500 ms, la mitad del límite: no deja margen para una carga un poco mayor.
- **C.** Es un test de formulario que escribe con `userEvent`: su cuerpo llama `user.type`, `user.clear`, `user.selectOptions` o `user.keyboard`. Compruébalo leyendo el test.

Un test que falla por otra causa (p. ej. `Unable to find …` de un `findBy*`) **no** se selecciona aquí: lo clasifica el Step 1.5 (#120). Si un test **que no escribe** cumple A, **detente** y repórtalo: ninguna de las dos palancas aplica sin decisión del orquestador.

Escribe en el reporte la tabla con estas columnas: archivo › nombre, sin carga (de `idle.txt`), peor bajo carga, número de timeouts en 6 corridas y reglas cumplidas. Según la medición de referencia se esperarían al menos `PlayerFormPage › create mode submits createPlayer with the tenant id` (A) y `PlayerFormPage › creating shows an in-app success confirmation` (B). El resultado real manda.

Si **ningún** test cumple A ni B, no hay palancas 1–2: anótalo (el #34 se cerraría con esa evidencia, sin cambio de código) y sigue con el Step 1.5 y, según su resultado, con el Task 4 o directo al Task 5.

- [x] **Step 1.5: Regla F, esperas de Testing Library (#120)**

Un **fallo de espera** es un test `×` en las 6 corridas de carga cuyo error es `Unable to find …` (de un `findBy*`) o `Timed out in waitFor`, y que **no** tiene `Test timed out in` en esa misma corrida (si tiene los dos, cuenta como timeout de test y lo atienden las palancas 1–2). Para cada uno, localiza la llamada que falló (la línea `❯ archivo:línea` del log) y confirma leyendo el test que pasa sin carga (`idle.txt`).

Escribe en el reporte una tabla aparte: archivo › nombre, llamada (`findByText('…')`, `waitFor(…)`), corridas en que falló (de 6) y si pasa sin carga. Decide:

- **F0 — ningún fallo de espera:** sin cambio para #120. Además, corre **una** ronda de 5 en paralelo (`for i in 1 2 3 4 5; do … > "$LOGS/over-$i.txt" …; done; wait`) y repite los tres conteos del Step 1.3 sobre `over-*`; esos números van al PR como la evidencia de que los fallos de espera solo aparecen en sobrecarga y acompañados de timeouts de test (ver la referencia del planner). Salta el Task 4.
- **F1 — fallos de espera en 1 o 2 archivos de test:** palanca 3 **puntual** (Task 4, Step 4.1a) solo en esas llamadas.
- **F2 — fallos de espera en 3 o más archivos de test:** palanca 3 **global** (Task 4, Step 4.1b).

Un fallo de espera que **también** falla sin carga no es de carga: **detente** y repórtalo.

---

## Task 2: Palanca 1, `delay: null` en los seleccionados

**Files:**
- Modify: cada `*.test.tsx` con tests seleccionados en el Step 1.4 (solo la línea `userEvent.setup()` de esos tests)

- [x] **Step 2.1: Aplicar `delay: null`**

En cada test seleccionado, cambia su línea:

```ts
  const user = userEvent.setup()
```

por:

```ts
  const user = userEvent.setup({ delay: null })
```

Solo en los tests seleccionados; los demás del mismo archivo no cambian. Si un test seleccionado no tiene `userEvent.setup()` propio (p. ej. lo crea un helper compartido del archivo), **no** cambies el helper: anótalo en el reporte y ese test va directo a la palanca 2.

Comprobaciones:
- `git -C $WT diff -U0 -- 'src/**/*.test.tsx' | grep -E "^[+-][^+-]"` → solo pares `-  const user = userEvent.setup()` / `+  const user = userEvent.setup({ delay: null })`.
- `grep -rn "delay: null" src --include=*.test.tsx | wc -l` = número de tests seleccionados con `setup()` propio.

Run (en `$WT`): `pnpm exec vitest run` sin carga → `Tests  B_tests passed (B_tests)`.

- [x] **Step 2.2: Volver a medir con la palanca 1**

Repite el Step 1.2 con logs `delay-a-$i.txt` y `delay-b-$i.txt`, y el Step 1.3 sobre `delay-*`. Para cada test seleccionado, anota en la tabla su peor duración y sus timeouts con `delay: null`.

Un test pasa a la palanca 2 si **después** de `delay: null` sigue cumpliendo A o B. Si ninguno cumple, salta el Task 3 y sigue con el Task 4 (si la regla F lo pidió) o con el Task 5.

- [x] **Step 2.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-j-test-timeouts.md <cada archivo de test modificado>
```

```bash
git -C $WT commit -m "test: type without per-key delays in form tests that time out under load (#34)" -m "Measured with three parallel full runs (two rounds): the userEvent form tests that timed out or took at least half of the 5 s default now use userEvent.setup({ delay: null }), so typing no longer queues a timer per key behind a busy CPU. The 5 s default stays as the guard." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 3: Palanca 2, timeout por test solo para los que siguen lentos

**Files:**
- Create: `src/test/timeouts.ts`
- Modify: cada `*.test.tsx` con tests que el Step 2.2 mandó a la palanca 2 (la línea `test(` y el import)

- [x] **Step 3.1: Crear la constante**

Crea `src/test/timeouts.ts`:

```ts
// userEvent typing tests that stay near the 5 s default under CPU load even without per-key delays (#34)
export const TYPING_TEST_TIMEOUT = 15_000
```

- [x] **Step 3.2: Aplicarla a cada test de la palanca 2**

1. Agrega el import junto a los imports locales del archivo (después de los de paquetes), con la ruta relativa correcta. Desde `src/players/`, `src/teams/`, `src/users/`, `src/payments/` o `src/documents/`:

```ts
import { TYPING_TEST_TIMEOUT } from '../test/timeouts'
```

2. Pasa la opción como segundo argumento, en la forma de Vitest 4. El planner la verificó con `tsc -b`, `eslint` y bajo carga. Ejemplo:

```ts
test('create mode submits createPlayer with the tenant id', async () => {
```

pasa a:

```ts
test('create mode submits createPlayer with the tenant id', { timeout: TYPING_TEST_TIMEOUT }, async () => {
```

No cambies nada más del test.

Comprobaciones:
- `grep -rn "{ timeout: TYPING_TEST_TIMEOUT }" src --include=*.test.tsx | wc -l` = número de tests de la palanca 2.
- `grep -rn "testTimeout\|setConfig" vite.config.ts src` → sin salida.

- [x] **Step 3.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-j-test-timeouts.md src/test/timeouts.ts <cada archivo de test modificado>
```

```bash
git -C $WT commit -m "test: give the form tests still slow without key delays a 15 s budget (#34)" -m "After delay: null these tests still timed out or took at least half of the 5 s default under three parallel runs, so they get a per-test timeout. Every other test keeps the default guard." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: Palanca 3, esperas de Testing Library (#120)

Solo si el Step 1.5 decidió F1 o F2. Con F0, salta al Task 5.

**Files (según la rama):**
- F1: Modify `src/test/timeouts.ts` (crear si el Task 3 no lo creó) y los `*.test.tsx` con fallos de espera (solo la llamada que falló y el import).
- F2: Modify `src/test-setup.ts`.

- [ ] **Step 4.1a (F1): Espera puntual** — N/A (F0: no wait failures under the protocol)

En `src/test/timeouts.ts` agrega (o crea el archivo con):

```ts
// findBy*/waitFor calls that missed the 1 s Testing Library default under three parallel runs (#120)
export const FIND_TIMEOUT = 2000
```

En cada llamada que falló, pasa la opción en su forma de Testing Library e importa `FIND_TIMEOUT` desde `'../test/timeouts'`:
- `findBy*`: tercer argumento, p. ej. `await screen.findByText('Ana Roster')` → `await screen.findByText('Ana Roster', undefined, { timeout: FIND_TIMEOUT })`; con opciones de query existentes (`{ name: … }`), se conservan como segundo argumento.
- `waitFor(cb)` → `waitFor(cb, { timeout: FIND_TIMEOUT })`.

Nada más del test cambia. Comprobación: `grep -rn "FIND_TIMEOUT" src --include=*.test.tsx | grep -v import | wc -l` = número de llamadas de la tabla del Step 1.5.

- [ ] **Step 4.1b (F2): Espera global** — N/A (F0: no wait failures under the protocol)

`src/test-setup.ts` queda:

```ts
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// findBy*/waitFor missed the 1 s default under three parallel full runs across several files (#120)
configure({ asyncUtilTimeout: 2000 })
```

- [ ] **Step 4.2: Volver a medir** — N/A (F0: no wait failures under the protocol)

Run (en `$WT`): `pnpm exec vitest run` sin carga → `Tests  B_tests passed (B_tests)`. Repite el Step 1.2 con logs `wait-a-$i.txt`/`wait-b-$i.txt` y los conteos del Step 1.3 sobre `wait-*`. Si todavía hay fallos de espera, sube el valor a **3000** (solo esa constante o esa llamada a `configure`), vuelve a medir con `wait2-*`, y si siguen, **detente** y reporta: más de 3000 ms se acerca al timeout de test de 5 s y ya no es un ajuste de margen.

- [ ] **Step 4.3: Commit** — N/A (F0: no wait failures under the protocol)

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-j-test-timeouts.md <src/test-setup.ts o src/test/timeouts.ts y los archivos de test modificados>
```

```bash
git -C $WT commit -m "test: give Testing Library waits the margin measured under load (#120)" -m "<F1: the findBy*/waitFor calls that missed the 1 s default under three parallel full runs get FIND_TIMEOUT | F2: misses spread over N files, so asyncUtilTimeout is raised globally in test-setup>. Value chosen by re-measuring the same protocol." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Deja en el segundo `-m` solo la variante aplicada, con `N` real.)

---

## Task 5: Verde bajo el mismo protocolo

- [x] **Step 5.1: Sin carga**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `Tests  B_tests passed (B_tests)`.

- [x] **Step 5.2: Con carga (dos rondas, logs `green-a-$i.txt` y `green-b-$i.txt`)**

Repite el Step 1.2. Criterio de verde, **todo** a la vez:
- Cada una de las 6 corridas termina con `Tests  B_tests passed (B_tests)`:

  ```bash
  grep -h "Tests " "$LOGS"/green-*.txt
  ```

  Esperado: 6 líneas, todas `Tests  B_tests passed (B_tests)`.

- No hay **ningún** `Test timed out in`, de ninguna duración, en ningún test:

  ```bash
  grep -c "Test timed out in" "$LOGS"/green-*.txt
  ```

  Esperado: `0` en los 6 archivos.

- No hay **ningún** fallo de espera (#120):

  ```bash
  grep -cE "Unable to find|Timed out in waitFor" "$LOGS"/green-*.txt
  ```

  Esperado: `0` en los 6 archivos.

Si aparece un fallo de espera nuevo, aplica la regla F del Step 1.5 a ese test (Task 4) y reporta por qué no salió en la primera medición. Si aparece un timeout en un test no seleccionado que cumple la regla, vuelve a la palanca 1 para ese test (Task 2), luego a la palanca 2 si hace falta, y reporta por qué no salió en la primera medición. Si la corrida falla por otra causa, repórtalo y no lo toques.

- [x] **Step 5.3: Tipos y lint**

`pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [x] **Step 5.4:** Si el Step 5.2 obligó a tocar más tests, haz un commit adicional con el mismo formato que el Task 2, el Task 3 o el Task 4, según la palanca.

**Reporte al orquestador:**
- Los SHAs.
- `B_files`/`B_tests`, `hw.ncpu` y la ruta de `$LOGS`.
- La tabla del Step 1.4, ampliada con las columnas "con `delay: null`" y "con timeout por test". Para cada test tocado, la evidencia A/B/C; también los descartados cerca del umbral.
- Los conteos de timeouts antes (Step 1.3), después de la palanca 1 (Step 2.2) y al final (Step 5.2).
- Para #120: la tabla del Step 1.5, la rama de la regla F aplicada (F0/F1/F2), los conteos de fallos de espera antes, después del Task 4 (si hubo) y al final, el valor elegido y, con F0, los conteos de la ronda de 5 en paralelo.
- Las 6 líneas `Tests` del Step 5.2.
- La lista de otros fallos bajo carga fuera de alcance.
- Las salidas de los Steps 5.1 y 5.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- PR a `develop` con `Closes #34` y `Closes #120`. El cuerpo incluye la tabla de medición y los conteos de timeouts antes, después de `delay: null` y al final; y, para #120, la tabla de fallos de espera, la rama F aplicada y su evidencia (con F0: "sin fallos de espera en el protocolo de 3 en paralelo; en la ronda de 5 los fallos de espera fueron X de Y y coincidieron con timeouts de test").
- Sin verificación en navegador (solo tests).

---

## Discrepancias

- **Spec §3 vs. issue #34.** El spec decía que el timeout se subía solo donde hacía falta. El issue prefiere `userEvent.setup({ delay: null })` (o escribir menos caracteres) y "keep the default timeout as a guard". Tras la revisión adversarial del plan, el orquestador revisó su propia decisión: primero la causa (`delay: null`, palanca 1) y el timeout por test solo como respaldo para lo que siga lento (palanca 2). La medición del planner lo respalda: `delay: null` bajó el peor caso de 5.1 s a ~4.0 s y de 3.5 s a ~2.4 s, pero no bastó para `create mode submits createPlayer…`.
- **Lista del issue vs. medición.** El issue nombra:
  - `PlayerFormPage`: "a failed save surfaces the error", "create mode submits…" y "creating shows…".
  - `TeamFormPage`: "create mode submits createTeam…".
  - `UsersPage`: "invites a user…".

  En la medición de referencia, "a failed save surfaces the error" quedó lejos del umbral (260 ms sin carga) y `TeamFormPage` quedó en 2438 ms, apenas bajo la regla B. Por eso la selección la decide la medición del implementer sobre el `develop` final, no la lista del issue.
- **Fallos bajo sobrecarga que no son de timeout (#120, ola 3).** Con 5 corridas en paralelo también fallan los `findBy*` por su espera de 1 s. Ese hallazgo se convirtió en #120 y el spec de la ola 3 (§1, §2) lo suma a J: se decide con la misma medición (regla F del Step 1.5). El protocolo de referencia sigue siendo el de 3 corridas en paralelo; la ronda de 5 solo se corre como evidencia cuando la regla F da F0.
- **Umbrales de la regla F (decisión del planner).** El spec no fija cuántos fallos justifican lo global. Se toma "3 o más archivos de test" porque entonces el problema es del entorno, no de una pantalla; con 1–2 archivos, una espera puntual no cambia el margen de los ~540 tests restantes. Valor inicial 2000 ms (el doble del default) y techo 3000 ms, para que dos esperas seguidas no sumen más que el timeout de test de 5 s.
- **Orden.** J iba en la ola 2 "después de D, G e I". Ahora espera a **todos** los lotes (C–I y, desde la ola 3, L–P), porque mide tiempos que esos lotes cambian y toca archivos de varios de ellos; así nunca se edita en paralelo y la medición es la del código final. `src/test/` depende del lote I (Step 0.4).
