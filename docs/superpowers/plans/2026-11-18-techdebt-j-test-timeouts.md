# Lote J — Tests de formularios lentos bajo carga (#34) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. **Este lote va al último:** se despacha solo cuando C, D, E, F, G, H e I están **todos** mergeados a `develop`, y se mide sobre ese `develop` final sin ninguna otra suite corriendo en la máquina. El implementer lee el plan desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí.

**Goal:** Que los tests de formularios que escriben con `userEvent` dejen de fallar por el timeout de 5 s de Vitest cuando la máquina está cargada. Primero se ataca la causa, como prefiere el issue: `userEvent.setup({ delay: null })` en los tests lentos, que conserva el guard de 5 s. Solo los que sigan lentos o con timeout después de eso reciben un timeout por test. Todo se elige por medición. El timeout global no cambia.

**Architecture:** Dos palancas, en este orden, sobre el conjunto de tests que seleccione la medición:
1. **Causa raíz:** en cada test seleccionado, `userEvent.setup()` → `userEvent.setup({ delay: null })`. user-event deja de agendar un `setTimeout` entre tecla y tecla, que es lo que se encola detrás de la carga de CPU. El test no cambia en nada más.
2. **Respaldo:** si un test sigue en ≥ 2500 ms o con timeout después de la palanca 1, se le pasa `{ timeout: TYPING_TEST_TIMEOUT }` (15 s) como opción por test de Vitest 4. La constante vive en `src/test/timeouts.ts`, con una línea de *por qué*; el directorio `src/test/` lo creó el lote I.

`vite.config.ts` no se toca. La selección usa un protocolo de carga reproducible (3 corridas completas en paralelo, dos rondas) y una regla objetiva sobre los tiempos por test del reporter `verbose`.

**Tech Stack:** Vitest 4.1.9 (reporter `verbose`, opción `timeout` por test), Testing Library + user-event 14 (`delay: null`), TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md`: §3 (#34; el orquestador revisó su propia decisión, ver Discrepancias) y §4 (lote J).

## Global Constraints

- **Rama y worktree.** Rama `fix/form-test-timeouts`, cortada de `origin/develop` **después** de los merges de C, D, E, F, G, H e I. Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/form-test-timeouts` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`.
- **Por qué va al último.** J toca archivos de test de casi todos los lotes de UI y mide tiempos que esos lotes cambian. Con todos mergeados no hay edición en paralelo, y la medición refleja el código final.
- **Git.** Siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`.
- **Lo que el implementer nunca hace.** Push, PR o merge; usar el Supabase MCP o tocar la base; tocar `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Archivos permitidos:**
  - `src/test/timeouts.ts` (nuevo, solo si hace falta la palanca 2).
  - Los `*.test.tsx` que contengan tests seleccionados en el Task 1, y en ellos solo la línea `userEvent.setup(…)` de esos tests, su línea `test(…)` (palanca 2) y el import de `TYPING_TEST_TIMEOUT`.
  - Este plan.
- **Prohibido:** `vite.config.ts`, cualquier `testTimeout` o `vi.setConfig` global, cambiar otra cosa del cuerpo de un test, y `delay: null` en tests que no fueron seleccionados.
- **Medición.** Los logs van **fuera** del repo (`LOGS=$(mktemp -d)` al inicio) y nunca se commitean. Mientras se mide no corre nada más pesado en la máquina (ni otros implementers ni otras suites). Si hay algo corriendo, espera y repite.
- **Convenciones.** Código, identificadores y comentarios en inglés; sin comentarios salvo la línea de *por qué* de `timeouts.ts`. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- **Conteos.** El lote no agrega archivos de test ni tests. Esperado al final: `B_files` y `B_tests` sin cambios.

## Review Focus

- **Selección por evidencia:** cada test tocado aparece en la tabla de medición del reporte con su peor duración bajo carga, antes y después de cada palanca, y la regla que cumplió. Ningún test se toca sin evidencia.
- **Causa antes que margen:** ningún test recibe `{ timeout }` sin haber pasado antes por `delay: null` y vuelto a medirse.
- **El guard de 5 s sigue vigente para todo lo demás:** `grep -rn "testTimeout\|setConfig" vite.config.ts src` → sin salida.
- **Ningún test cambia lo que verifica:** el diff de cada archivo toca solo `userEvent.setup(…)`, la línea `test('…'` y el import.

---

## Medición de referencia del planner (2026-11-18, `origin/develop` = `24c14a4`, antes de los lotes)

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

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `fix/form-test-timeouts`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [ ] **Step 0.3: Confirmar que todos los lotes de UI están en la base.** Para cada rama (`fix/documents-section-hardening`, `fix/player-page-polish`, `fix/players-list-export-polish`, `fix/payments-a11y-tests`, `fix/teams-tests-dialog`, `fix/lists-a11y-loading`, `fix/users-auth-polish`):
  1. `gh pr list --repo aiyangar/ligaspequenas --state merged --base develop --head <rama> --json number,mergeCommit` → un PR con `mergeCommit`.
  2. `git -C $WT merge-base --is-ancestor <mergeCommit.oid> origin/develop` → exit 0.

  Si falta alguno, **detente** y avisa al orquestador.
- [ ] **Step 0.4:** `ls $WT/src/test/` muestra `deferred.ts` y `authListener.ts` (lote I). En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests` (todo verde, sin carga).
- [ ] **Step 0.5:** `LOGS=$(mktemp -d)` y anota la ruta en el reporte. Anota `sysctl -n hw.ncpu`.

---

## Task 1: Medir y seleccionar (el "rojo")

El rojo de este lote no es un test nuevo. Es la evidencia de que ciertos tests revientan o rozan el timeout bajo una carga reproducible.

- [ ] **Step 1.1: Corrida sin carga**

Run (en `$WT`): `pnpm exec vitest run --reporter verbose > "$LOGS/idle.txt" 2>&1`
Expected: `Tests  B_tests passed (B_tests)`.

- [ ] **Step 1.2: Protocolo de carga (dos rondas de 3 corridas en paralelo)**

Ronda 1 (en `$WT`, un solo comando; espera a que terminen las tres):

```bash
for i in 1 2 3; do pnpm exec vitest run --reporter verbose > "$LOGS/load-a-$i.txt" 2>&1 & done; wait
```

Ronda 2: el mismo comando con `load-b-$i.txt`.

- [ ] **Step 1.3: Extraer tiempos y timeouts**

Peor duración por test bajo carga (el planner verificó este comando sobre sus logs):

```bash
cat "$LOGS"/load-*.txt | grep -E "^ +[✓×] " | sed -E 's/^ +[✓×] (.*) ([0-9]+)ms$/\2\t\1/' | sort -t$'\t' -k2,2 -k1,1nr | awk -F'\t' '!seen[$2]++' | sort -nr | head -40
```

Timeouts de test, de cualquier duración:

```bash
grep -h -B2 "Test timed out in" "$LOGS"/load-*.txt | grep -E "FAIL" | sort | uniq -c
```

Otros fallos bajo carga (van al reporte; no se arreglan aquí):

```bash
cat "$LOGS"/load-*.txt | grep -E "^ +× " | sort | uniq -c
```

- [ ] **Step 1.4: Aplicar la regla de selección**

Un test se selecciona si cumple **(A o B) y C**:

- **A.** Falló con `Test timed out in` en al menos 1 de las 6 corridas de carga.
- **B.** Su peor duración bajo carga es ≥ 2500 ms, la mitad del límite: no deja margen para una carga un poco mayor.
- **C.** Es un test de formulario que escribe con `userEvent`: su cuerpo llama `user.type`, `user.clear`, `user.selectOptions` o `user.keyboard`. Compruébalo leyendo el test.

Un test que falla por otra causa (p. ej. `Unable to find …` de un `findBy*`) **no** se selecciona: se lista en el reporte como fallo bajo carga fuera de alcance. Si un test **que no escribe** cumple A, **detente** y repórtalo: ninguna de las dos palancas aplica sin decisión del orquestador.

Escribe en el reporte la tabla con estas columnas: archivo › nombre, sin carga (de `idle.txt`), peor bajo carga, número de timeouts en 6 corridas y reglas cumplidas. Según la medición de referencia se esperarían al menos `PlayerFormPage › create mode submits createPlayer with the tenant id` (A) y `PlayerFormPage › creating shows an in-app success confirmation` (B). El resultado real manda.

Si **ningún** test cumple A ni B, **detente** y reporta la tabla. El issue se cerraría con esa evidencia, sin cambio de código; decide el orquestador.

---

## Task 2: Palanca 1, `delay: null` en los seleccionados

**Files:**
- Modify: cada `*.test.tsx` con tests seleccionados en el Step 1.4 (solo la línea `userEvent.setup()` de esos tests)

- [ ] **Step 2.1: Aplicar `delay: null`**

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

- [ ] **Step 2.2: Volver a medir con la palanca 1**

Repite el Step 1.2 con logs `delay-a-$i.txt` y `delay-b-$i.txt`, y el Step 1.3 sobre `delay-*`. Para cada test seleccionado, anota en la tabla su peor duración y sus timeouts con `delay: null`.

Un test pasa a la palanca 2 si **después** de `delay: null` sigue cumpliendo A o B. Si ninguno cumple, salta el Task 3 y ve al Task 4.

- [ ] **Step 2.3: Commit**

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

- [ ] **Step 3.1: Crear la constante**

Crea `src/test/timeouts.ts`:

```ts
// userEvent typing tests that stay near the 5 s default under CPU load even without per-key delays (#34)
export const TYPING_TEST_TIMEOUT = 15_000
```

- [ ] **Step 3.2: Aplicarla a cada test de la palanca 2**

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

- [ ] **Step 3.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-j-test-timeouts.md src/test/timeouts.ts <cada archivo de test modificado>
```

```bash
git -C $WT commit -m "test: give the form tests still slow without key delays a 15 s budget (#34)" -m "After delay: null these tests still timed out or took at least half of the 5 s default under three parallel runs, so they get a per-test timeout. Every other test keeps the default guard." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: Verde bajo el mismo protocolo

- [ ] **Step 4.1: Sin carga**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `Tests  B_tests passed (B_tests)`.

- [ ] **Step 4.2: Con carga (dos rondas, logs `green-a-$i.txt` y `green-b-$i.txt`)**

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

Si aparece un timeout en un test no seleccionado que cumple la regla, vuelve a la palanca 1 para ese test (Task 2), luego a la palanca 2 si hace falta, y reporta por qué no salió en la primera medición. Si la corrida falla por otra causa, repórtalo y no lo toques.

- [ ] **Step 4.3: Tipos y lint**

`pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 4.4:** Si el Step 4.2 obligó a tocar más tests, haz un commit adicional con el mismo formato que el Task 2 o el Task 3, según la palanca.

**Reporte al orquestador:**
- Los SHAs.
- `B_files`/`B_tests`, `hw.ncpu` y la ruta de `$LOGS`.
- La tabla del Step 1.4, ampliada con las columnas "con `delay: null`" y "con timeout por test". Para cada test tocado, la evidencia A/B/C; también los descartados cerca del umbral.
- Los conteos de timeouts antes (Step 1.3), después de la palanca 1 (Step 2.2) y al final (Step 4.2).
- Las 6 líneas `Tests` del Step 4.2.
- La lista de otros fallos bajo carga fuera de alcance.
- Las salidas de los Steps 4.1 y 4.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- PR a `develop` con `Closes #34`. El cuerpo incluye la tabla de medición y los conteos de timeouts antes, después de `delay: null` y al final. Lista aparte los fallos bajo carga que no son de timeout, si hay, como candidatos a issue nuevo.
- Sin verificación en navegador (solo tests).

---

## Discrepancias

- **Spec §3 vs. issue #34.** El spec decía que el timeout se subía solo donde hacía falta. El issue prefiere `userEvent.setup({ delay: null })` (o escribir menos caracteres) y "keep the default timeout as a guard". Tras la revisión adversarial del plan, el orquestador revisó su propia decisión: primero la causa (`delay: null`, palanca 1) y el timeout por test solo como respaldo para lo que siga lento (palanca 2). La medición del planner lo respalda: `delay: null` bajó el peor caso de 5.1 s a ~4.0 s y de 3.5 s a ~2.4 s, pero no bastó para `create mode submits createPlayer…`.
- **Lista del issue vs. medición.** El issue nombra:
  - `PlayerFormPage`: "a failed save surfaces the error", "create mode submits…" y "creating shows…".
  - `TeamFormPage`: "create mode submits createTeam…".
  - `UsersPage`: "invites a user…".

  En la medición de referencia, "a failed save surfaces the error" quedó lejos del umbral (260 ms sin carga) y `TeamFormPage` quedó en 2438 ms, apenas bajo la regla B. Por eso la selección la decide la medición del implementer sobre el `develop` final, no la lista del issue.
- **Fallos bajo sobrecarga que no son de timeout.** Con 5 corridas en paralelo también fallan los `findBy*` por su espera de 1 s. Ni el issue ni el spec cubren eso, y ninguna de las dos palancas lo arregla. Se reporta y, si aparece en el protocolo de 3 corridas, se propone como issue nuevo.
- **Orden.** J iba en la ola 2 "después de D, G e I". Ahora espera a **todos** los lotes de UI (C–I), porque mide tiempos que esos lotes cambian y toca archivos de varios de ellos; así nunca se edita en paralelo y la medición es la del código final. `src/test/` depende del lote I (Step 0.4).
