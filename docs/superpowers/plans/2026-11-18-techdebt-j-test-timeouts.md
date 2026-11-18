# Lote J — Timeouts de tests de formularios bajo carga (#34) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. **Este lote es de la ola 2:** se despacha solo cuando D (`fix/player-page-polish`), G (`fix/teams-tests-dialog`) e I (`fix/users-auth-polish`) ya están mergeados a `develop` (spec §4), y además después de F y H si la medición del Task 1 selecciona tests de sus archivos (ver Global Constraints). El implementer lee el plan desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí.

**Goal:** Que los tests de formularios que escriben con `userEvent` dejen de fallar por el timeout de 5 s de Vitest cuando la máquina está cargada (varias suites en paralelo), subiendo el timeout **solo** en los tests que lo necesitan, elegidos por medición y no a ojo. El timeout global no cambia.

**Architecture:** Un archivo nuevo `src/test/timeouts.ts` (el directorio `src/test/` lo crea el lote I) exporta `TYPING_TEST_TIMEOUT = 15_000` con una línea de *por qué*. Cada test seleccionado pasa ese valor como opción por test de Vitest 4: `test('name', { timeout: TYPING_TEST_TIMEOUT }, async () => { … })`. `vite.config.ts` no se toca (sin `testTimeout` global). Selección: un protocolo de carga reproducible (3 corridas completas en paralelo, dos rondas) más una regla objetiva sobre los tiempos por test del reporter `verbose`.

**Tech Stack:** Vitest 4.1.9 (reporter `verbose`, opción `timeout` por test), Testing Library + user-event 14, TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§3 decisión sobre #34: "solo donde hace falta… no se sube el timeout global"; §4 lote J).

## Global Constraints

- Rama `fix/form-test-timeouts`, cortada de `origin/develop` **después** de los merges de D, G e I. Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/form-test-timeouts` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`.
- **Orden respecto de la ola 2:** J edita archivos de test de otros lotes. Antes de despachar, el orquestador confirma que D, G e I están en `develop`. Si la medición del Task 1 selecciona un test de un archivo de F (`src/payments/*`) o de H (`src/players/PlayersPage*`, `src/teams/TeamsPage*`, `src/payments/DebtorsPage*`), ese lote también tiene que estar mergeado antes de editarlo; si H sigue abierto, el implementer **no** toca esos archivos, lo reporta y el orquestador decide (esperar a H o un follow-up). Nunca se editan en paralelo con otro lote.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Archivos permitidos:** `src/test/timeouts.ts` (nuevo), los archivos `*.test.tsx` que contengan tests seleccionados por la regla del Task 1 (y solo esas líneas `test(…)` más el import), y este plan. **Prohibido:** `vite.config.ts`, cualquier `testTimeout`/`vi.setConfig` global, cambiar el cuerpo de un test, cambiar `userEvent.setup()`.
- Los logs de medición van **fuera** del repo: `LOGS=$(mktemp -d)` al inicio; nunca se commitean.
- Código, identificadores y comentarios en inglés; sin comentarios salvo la línea de *por qué* de `timeouts.ts`. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: este lote no agrega archivos de test ni tests (`timeouts.ts` no es un archivo de test). Esperado al final: `B_files` y `B_tests` sin cambios.

## Review Focus

- **Selección por evidencia:** cada test con timeout subido aparece en la tabla de medición del reporte con su peor duración bajo carga y la regla que cumplió. Ningún test sin evidencia.
- **El guard de 5 s sigue vigente para todo lo demás:** `grep -n "testTimeout\|setConfig" vite.config.ts src -r` → sin salida.
- **Ningún test cambia de comportamiento:** el diff de cada archivo de test toca solo la línea `test('…', {…}, async () => {` y el import.

---

## Medición de referencia del planner (2026-11-18, `origin/develop` = `24c14a4`, antes de D/G/I)

Máquina: 10 núcleos (`sysctl -n hw.ncpu`). Solo como referencia: **el implementer tiene que volver a medir** (Task 1), porque D, G e I cambian `PlayerFormPage.test.tsx`, `TeamDetailPage.test.tsx`, `AddPlayerDialog.test.tsx` y `UsersPage.test.tsx`.

| Test (archivo › nombre) | Sin carga | Peor con 3 corridas en paralelo | Resultado bajo carga |
|---|---|---|---|
| `PlayerFormPage` › create mode submits createPlayer with the tenant id | 785 ms | 5106 ms | **timeout 3/3** |
| `PlayerFormPage` › creating shows an in-app success confirmation | 634 ms | 3524 ms | pasa |
| `UsersPage` › invites a user through the inviteUser client | 325 ms | 2547 ms | pasa |
| `TeamFormPage` › create mode submits createTeam with tenant and active season id | 406 ms | 2438 ms | pasa |
| `PaymentDialog` › Otro without a note is blocked with a field error | 288 ms | 2303 ms | pasa |
| `PlayerDocumentsSection` › lists the 6 documents with their status | 248 ms | 2119 ms | pasa (no escribe: fuera de la regla) |

Con 5 corridas en paralelo (sobrecarga extrema, 50 workers en 10 núcleos) fallaron 13–20 tests por corrida (84 fallos en las 5 corridas: 75 por `Test timed out in 5000ms` y el resto por esperas de `findBy*` de 1 s de Testing Library, que un `timeout` de test no arregla). Ese escenario no es el del issue y queda fuera (ver Discrepancias).

Con `{ timeout: 15_000 }` en los dos primeros tests de la tabla, las 3 corridas en paralelo terminaron `449 passed (449)`; el peor caso de `create mode submits createPlayer…` bajó a 4.9 s, pegado al límite de 5 s, lo que confirma que necesitaba el margen.

---

## Task 0: Preparar y medir el baseline

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `fix/form-test-timeouts`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [ ] **Step 0.3:** Confirma que D, G e I están en la base. Para cada rama (`fix/player-page-polish`, `fix/teams-tests-dialog`, `fix/users-auth-polish`): `gh pr list --repo aiyangar/ligaspequenas --state merged --base develop --head <rama> --json number,mergeCommit` → un PR con `mergeCommit`; y `git -C $WT merge-base --is-ancestor <mergeCommit.oid> origin/develop` → exit 0. Si falta alguno, **detente** y avisa al orquestador.
- [ ] **Step 0.4:** `ls $WT/src/test/` muestra `deferred.ts` y `authListener.ts` (lote I). En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests` (todo verde, sin carga).
- [ ] **Step 0.5:** `LOGS=$(mktemp -d)` y anota la ruta en el reporte.

---

## Task 1: Medir y seleccionar (el "rojo")

El rojo de este lote no es un test nuevo: es la evidencia de que ciertos tests revientan o rozan el timeout bajo una carga reproducible.

- [ ] **Step 1.1: Corrida sin carga**

Run (en `$WT`): `pnpm exec vitest run --reporter verbose > "$LOGS/idle.txt" 2>&1`
Expected: `Tests  B_tests passed`.

- [ ] **Step 1.2: Protocolo de carga (dos rondas de 3 corridas en paralelo)**

Ronda 1 (en `$WT`, un solo comando; espera a que terminen las tres):

```bash
for i in 1 2 3; do pnpm exec vitest run --reporter verbose > "$LOGS/load-a-$i.txt" 2>&1 & done; wait
```

Ronda 2: el mismo comando con `load-b-$i.txt`.

No corras nada más pesado en la máquina durante las rondas (otros planners/implementers incluidos: si hay otra suite corriendo, espera y repite). Anota `sysctl -n hw.ncpu`.

- [ ] **Step 1.3: Extraer tiempos y timeouts**

Peor duración por test bajo carga (todas las corridas de carga):

```bash
cat "$LOGS"/load-*.txt | grep -E "^ +[✓×] " | sed -E 's/^ +[✓×] (.*) ([0-9]+)ms$/\2\t\1/' | sort -t$'\t' -k2,2 -k1,1nr | awk -F'\t' '!seen[$2]++' | sort -nr | head -40
```

Timeouts de test (los que la regla A cuenta):

```bash
grep -h -B2 "Test timed out in 5000ms" "$LOGS"/load-*.txt | grep -E "FAIL" | sort | uniq -c
```

Otros fallos bajo carga (para el reporte, no se arreglan aquí):

```bash
cat "$LOGS"/load-*.txt | grep -E "^ +× " | sort | uniq -c
```

- [ ] **Step 1.4: Aplicar la regla de selección**

Un test se selecciona si cumple **(A o B) y C**:

- **A.** Falló con `Test timed out in 5000ms` en al menos 1 de las 6 corridas de carga.
- **B.** Su peor duración bajo carga es ≥ 2500 ms (la mitad del límite: sin margen para una carga un poco mayor).
- **C.** Es un test de formulario que escribe con `userEvent` (su cuerpo llama `user.type`, `user.clear`, `user.selectOptions` o `user.keyboard`). Compruébalo leyendo el test.

Un test que falla por otra causa (p. ej. `Unable to find …` de un `findBy*`) **no** se selecciona: se lista en el reporte como fallo bajo carga fuera de alcance.

Escribe en el reporte la tabla: archivo › nombre, sin carga (de `idle.txt`), peor bajo carga, # timeouts en 6 corridas, reglas cumplidas. Con la medición de referencia de arriba se esperaría al menos `PlayerFormPage › create mode submits createPlayer with the tenant id` (A) y `PlayerFormPage › creating shows an in-app success confirmation` (B), y posiblemente `UsersPage › invites a user through the inviteUser client` (B, en el borde). El resultado real manda.

Si **ningún** test cumple A ni B, **detente**: reporta la tabla al orquestador (el issue se cerraría con esa evidencia, sin cambio de código; decide el orquestador).

---

## Task 2: Subir el timeout solo en los seleccionados

**Files:**
- Create: `src/test/timeouts.ts`
- Modify: cada `*.test.tsx` con tests seleccionados en el Step 1.4 (solo la línea `test(` del test y el import)

- [ ] **Step 2.1: Crear la constante**

Crea `src/test/timeouts.ts`:

```ts
// userEvent typing tests run near the 5 s default when several suites share the CPU (#34)
export const TYPING_TEST_TIMEOUT = 15_000
```

- [ ] **Step 2.2: Aplicarla a cada test seleccionado**

En cada archivo con tests seleccionados:

1. Agrega el import junto a los demás imports locales (después de los imports de paquetes), con la ruta relativa correcta. Desde `src/players/`, `src/teams/`, `src/users/` o `src/payments/`:

```ts
import { TYPING_TEST_TIMEOUT } from '../test/timeouts'
```

2. En cada test seleccionado, pasa la opción como segundo argumento (forma de Vitest 4; el planner la verificó con `tsc -b`, `eslint` y bajo carga). Ejemplo con el test de la medición de referencia:

```ts
test('create mode submits createPlayer with the tenant id', async () => {
```

pasa a:

```ts
test('create mode submits createPlayer with the tenant id', { timeout: TYPING_TEST_TIMEOUT }, async () => {
```

No cambies nada más del test. Los tests no seleccionados del mismo archivo quedan con el timeout por defecto.

Comprobaciones:
- `git -C $WT diff --stat` → solo `src/test/timeouts.ts` (nuevo, sin trackear hasta el `add`) y los archivos de test seleccionados.
- `git -C $WT diff -U0 -- 'src/**/*.test.tsx' | grep -E "^[+-][^+-]"` → solo líneas de import y líneas `test('…'` (cada `-test('X', async () => {` con su `+test('X', { timeout: TYPING_TEST_TIMEOUT }, async () => {`).
- `grep -rn "TYPING_TEST_TIMEOUT" src --include=*.test.tsx | grep -c "{ timeout: TYPING_TEST_TIMEOUT }"` = número de tests seleccionados.
- `grep -rn "testTimeout\|setConfig" vite.config.ts src` → sin salida.

- [ ] **Step 2.3: Verde bajo el mismo protocolo**

Run (en `$WT`): `pnpm exec vitest run` sin carga → `B_files` archivos, `B_tests` tests, todo verde.

Repite el Step 1.2 (dos rondas, logs `green-a-$i.txt` y `green-b-$i.txt`) y el Step 1.3 sobre `green-*`.
Expected: **0** `Test timed out in 5000ms` en los tests seleccionados en las 6 corridas. Si aparece un timeout nuevo en un test **no** seleccionado que cumpla la regla, agrégalo (vuelve al Step 2.2) y reporta por qué no salió en la primera medición. Fallos de otro tipo se reportan, no se tocan.

- [ ] **Step 2.4: Tipos y lint**

`pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 2.5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-j-test-timeouts.md src/test/timeouts.ts <cada archivo de test modificado>
```

```bash
git -C $WT commit -m "test: give userEvent form tests that time out under load a 15 s budget (#34)" -m "Measured with three parallel full runs (two rounds): only the tests that timed out or took at least half of the 5 s default and type with userEvent get the per-test timeout. The global default stays as the guard for everything else." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** SHA; `B_files`/`B_tests`; `hw.ncpu`; ruta de `$LOGS`; la tabla del Step 1.4 (con la evidencia A/B/C de cada test seleccionado y de los descartados cerca del umbral); los conteos de timeouts antes (Step 1.3) y después (Step 2.3); la lista de otros fallos bajo carga fuera de alcance; y las salidas de los Steps 2.3–2.4.

---

## Orquestador (después de la revisión pre-PR y del merge)

- PR a `develop` con `Closes #34`. El cuerpo incluye la tabla de medición y los conteos de timeouts antes/después, y lista aparte los fallos bajo carga que no son de timeout (si hay) como candidatos a issue nuevo.
- Sin verificación en navegador (solo tests).

---

## Discrepancias

- **#34 prefiere `userEvent.setup({ delay: null })` o escribir menos caracteres y "keep the default timeout as a guard".** Spec §3 (decisión del orquestador, revisable) eligió subir el timeout **solo** donde hace falta, por test, sin tocar el global. El plan sigue el spec: el guard de 5 s se mantiene para todos los demás tests y no se cambia cómo escriben los tests. Si el orquestador prefiere `delay: null`, es un cambio de plan (tocaría el cuerpo de los tests y su timing), no del implementer.
- **Lista del issue vs. medición:** el issue nombra `PlayerFormPage` ("a failed save surfaces the error", "create mode submits…", "creating shows…"), `TeamFormPage` ("create mode submits createTeam…") y `UsersPage` ("invites a user…"). En la medición de referencia, "a failed save surfaces the error" quedó lejos del umbral (260 ms sin carga) y `TeamFormPage` quedó en 2438 ms, apenas bajo la regla B. Por eso la selección la decide la medición del implementer después de D/G/I, no la lista del issue.
- **Fallos bajo sobrecarga que no son de timeout:** con 5 corridas en paralelo también fallan `findBy*` por su espera de 1 s. Ni el issue ni el spec cubren eso, y subir `testTimeout` no lo arregla; se reporta y, si aparece en el protocolo de 3 corridas, se propone como issue nuevo.
- **`src/test/` depende del lote I** (lo crea con `deferred.ts`). Si por algún motivo I no está mergeado, J no arranca (Step 0.3/0.4).
