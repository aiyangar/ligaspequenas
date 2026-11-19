# Lote R — `flashOf` compartido y comentario del *por qué* en `TeamDetailPage` (#135, #146) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. **R se despacha solo después de que el lote Q (`fix/player-save-zero-rows-and-stale-refresh`) esté mergeado en `develop`**: los dos tocan `src/players/PlayerFormPage.tsx`. El implementer lee el plan desde su propio worktree y marca `- [x]` ahí, en su copia, al terminar cada paso.

**Goal:** El helper `flashOf` (lee el mensaje `flash` que un formulario deja en el history state) vive una sola vez en `src/lib/flash.ts`, con su propio test, y `PlayerFormPage` y `TeamDetailPage` lo importan (#135); el comentario de `TeamDetailPage` sobre ese `useState` explica el *por qué* en vez de repetir el código (#146). Sin cambio de comportamiento.

**Architecture:** Módulo nuevo `src/lib/flash.ts` con `export function flashOf(state: unknown): string | null`, cuerpo idéntico a las dos copias actuales. Las dos páginas borran su copia local y agregan `import { flashOf } from '../lib/flash'` junto a `import { isAdmin } from '../lib/authorize'`. Los tests de página que ya fijan los avisos (`the %s flash from the team form shows as a toast`, `the create flash is dropped from history once shown…`, etc.) quedan sin tocar y son la red de "sin cambio de comportamiento".

**Tech Stack:** React 19.2, react-router-dom 7, Vitest 4.1.9 (globals) + Testing Library, TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` (§1 lote R, §2 decisión #135 + #146, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5.

## Global Constraints

- Rama `update/shared-flash-helper`, cortada de `origin/develop` **con Q ya mergeado** (comprobación en Step 0.2). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/shared-flash-helper` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Si `develop` avanza mientras trabajas y el orquestador lo pide, `git -C $WT rebase origin/develop` (nunca `stash`; si hay cambios sin commitear, primero commitea o apártalos con `git diff`).
- Las ediciones se describen **por ancla** (texto exacto a buscar), no por número de línea: Q cambió líneas de `PlayerFormPage.tsx` (import de `react` y `refreshRow`) que R no toca. El planner comprobó que el diff de R aplica limpio con y sin Q encima.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `src/lib/flash.ts` (nuevo), `src/lib/flash.test.ts` (nuevo), `src/players/PlayerFormPage.tsx`, `src/teams/TeamDetailPage.tsx` y este plan. Antes de cada commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Solapes:** R solo comparte `src/players/PlayerFormPage.tsx` con Q (por eso va después). No comparte archivos con S (`ops/backup/*`), T (`src/payments/*`, `src/documents/*`), U (`supabase/functions/invite-user/*`) ni V (docs de 2026-10-16). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia del planner (Q aplicado sobre `origin/develop` = `5effa8f`): **48 archivos, 572 tests**. Este lote agrega **+1 archivo y +2 tests**.
- **Verificación en navegador:** la hace el orquestador (sección final).

## Review Focus

- **Sin cambio de comportamiento:** los avisos `Jugador creado` (jugadores) y `Equipo creado`/`Cambios guardados` (equipos) siguen saliendo una vez y no se repiten al recargar (tests de página existentes, sin tocar; navegador).
- **Estado sin flash** (`null`, `undefined`, `{}`, otro objeto) → `null`, así no aparece un toast vacío (Task 1).
- **Una sola definición:** `grep -rn "function flashOf" src` → solo `src/lib/flash.ts` (Task 2).
- **El comentario de `TeamDetailPage`** dice el *por qué* (montaje fresco desde el formulario), no el *qué* (Task 2). El de `PlayerFormPage` (`// the create flow lands on a fresh instance (keyed by id), so its flash is read once here`) ya es un *por qué* y no cambia.
- **Nada de Q se pierde:** el diff de R en `PlayerFormPage.tsx` solo agrega el import y borra la copia local; `useRef`/`refreshRow` de Q siguen intactos (Step 2.3).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `update/shared-flash-helper`.
- [x] **Step 0.2:** Q está en la base: `git -C $WT log --oneline -1 --grep "#145" origin/develop` → una línea (`fix: ignore stale player refreshes…`), y `grep -c "refreshRequest" $WT/src/players/PlayerFormPage.tsx` → mayor que 0. Si no, **detente** y avisa al orquestador.
- [x] **Step 0.3:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.4:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado: 48 y 572 si nada más se mergeó; si S, T, U o V ya entraron, los números serán mayores; lo que cuenta es el delta).

---

## Task 1: `src/lib/flash.ts` con su test (#135)

**Files:**
- Create: `src/lib/flash.test.ts`
- Create: `src/lib/flash.ts`

**Interfaces:**
- Produces: `export function flashOf(state: unknown): string | null` en `src/lib/flash.ts` (Task 2 lo importa).

- [x] **Step 1.1: Escribir el test (rojo)**

`src/lib/flash.test.ts` (Vitest con globals, como `src/lib/category.test.ts`):

```ts
import { flashOf } from './flash'

test('flashOf reads the flash message a form left in history state', () => {
  expect(flashOf({ flash: 'Equipo creado' })).toBe('Equipo creado')
})

test('flashOf is null when history state carries no flash', () => {
  expect(flashOf(null)).toBeNull()
  expect(flashOf(undefined)).toBeNull()
  expect(flashOf({})).toBeNull()
  expect(flashOf({ from: '/equipos' })).toBeNull()
})
```

Run: `pnpm exec vitest run src/lib/flash.test.ts`
Expected (verificado por el planner): FAIL del archivo con `Error: Failed to resolve import "./flash" from "src/lib/flash.test.ts". Does the file exist?` (`Tests  no tests`).

- [x] **Step 1.2: Implementar**

Crea `src/lib/flash.ts` con `export function flashOf(state: unknown): string | null` y exactamente el cuerpo de las copias actuales:

```ts
  return (state as { flash?: string } | null)?.flash ?? null
```

Sin comentarios.

Run: `pnpm exec vitest run src/lib/flash.test.ts` → 2 tests PASS.

- [x] **Step 1.3: Commit**

`git -C $WT status -s` → solo `src/lib/flash.ts`, `src/lib/flash.test.ts` (ambos `??`) y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-r-shared-flash.md src/lib/flash.ts src/lib/flash.test.ts
```

```bash
git -C $WT commit -m "refactor: add a shared flashOf helper for history-state flash messages (#135)" -m "PlayerFormPage and TeamDetailPage each carried a copy because lotes M and N could not touch the same files in one wave. The helper now has one home and its own test." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Las páginas usan el helper; comentario del *por qué* (#135, #146)

**Files:**
- Modify: `src/players/PlayerFormPage.tsx` (import nuevo; borrar la función local)
- Modify: `src/teams/TeamDetailPage.tsx` (import nuevo; borrar la función local; reescribir un comentario)

**Interfaces:**
- Consumes: `flashOf` de Task 1.

- [ ] **Step 2.1: Editar por ancla**

En **cada** una de las dos páginas:

1. Justo después de la línea `import { isAdmin } from '../lib/authorize'` agrega `import { flashOf } from '../lib/flash'`.
2. Borra el bloque (y la línea en blanco que lo sigue):

```ts
function flashOf(state: unknown): string | null {
  return (state as { flash?: string } | null)?.flash ?? null
}
```

Solo en `src/teams/TeamDetailPage.tsx`, reemplaza la línea de comentario

```ts
  // the team form hands over its success message in history state; it is read once here
```

(la que está justo encima de `const [toast, setToast] = useState<string | null>(() => flashOf(location.state))`) por:

```ts
  // the team form always lands here on a fresh mount, so reading the flash at mount is enough
```

Nada más cambia en ninguno de los dos archivos.

- [ ] **Step 2.2: Comprobaciones**

- `grep -rn "function flashOf" $WT/src` → una sola línea, `src/lib/flash.ts:1`.
- `grep -c "from '../lib/flash'" $WT/src/players/PlayerFormPage.tsx $WT/src/teams/TeamDetailPage.tsx` → `1` y `1`.
- `git -C $WT diff --stat` → `src/players/PlayerFormPage.tsx | 5 +----` y `src/teams/TeamDetailPage.tsx | 7 ++-----` (planner: `2 files changed, 3 insertions(+), 9 deletions(-)`).

- [ ] **Step 2.3: Q sigue intacto**

`git -C $WT diff -- src/players/PlayerFormPage.tsx` → solo el `+import { flashOf }…` y las 4 líneas `-` de la función; ninguna línea de `useRef`, `refreshRequest` ni `refreshRow`.

- [ ] **Step 2.4: Suite completa, tipos y lint**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx src/teams/TeamDetailPage.test.tsx` → todo PASS sin tocar los tests (incluye `the %s flash from the team form shows as a toast`, `the flash is dropped from history once shown…`, `the create flash is dropped from history once shown…`, `saving an edit shows the toast without leaving a flash in history`).

Run (en `$WT`): `pnpm exec vitest run` → `B_files + 1` archivos, `B_tests + 2` tests, todo verde (planner: 49 y 574). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 2.5: Commit**

`git -C $WT status -s` → solo `PlayerFormPage.tsx`, `TeamDetailPage.tsx` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-r-shared-flash.md src/players/PlayerFormPage.tsx src/teams/TeamDetailPage.tsx
```

```bash
git -C $WT commit -m "refactor: read the flash message through the shared helper on both pages (#135 #146)" -m "Both pages drop their local flashOf copy. The TeamDetailPage comment now says why reading at mount is enough instead of restating the code." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, el resultado del Step 0.2, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.1, las comprobaciones de 2.2/2.3 y las salidas verdes de 2.4.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O0. Despacho:** solo con Q mergeado en `develop`; crear el worktree desde `origin/develop` actualizado (`git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas fetch origin` antes).
- [ ] **O1. PR** a `develop` con `Closes #135` y `Closes #146`; "sin cambio de comportamiento" en el cuerpo.
- [ ] **O2. Navegador** (Playwright, sesión admin persistente, `http://localhost:5173`; 1280×800 y 390×844), con un jugador y un equipo de prueba que crea y borra el orquestador:
  1. **Jugador:** Nuevo jugador → Guardar → la ficha muestra el toast `Jugador creado` una vez; recargar la página → no vuelve a salir.
  2. **Equipo:** Nuevo equipo → Guardar → `Equipo creado` una vez en el detalle; Editar → Guardar → `Cambios guardados` una vez; recargar → no se repite.
  3. **390 px:** los toasts caben, sin scroll horizontal (`document.documentElement.scrollWidth <= 390`).
  4. Sin errores en la consola.
  5. **Limpieza:** borrar el equipo y el jugador de prueba (procedimiento de la ola 1); sin residuos en `teams`, `players` ni en `player-files/<tenant>/<id>/`.

---

## Discrepancias

- **Comentario reescrito, no borrado (decisión del planner).** El spec permite cualquiera de las dos. Se reescribe porque el `useState` con inicializador perezoso solo es correcto si la página siempre se monta de cero al venir del formulario (ruta distinta de `/equipos/:id/editar`); esa invariante es justo lo que conviene dejar dicho.
- **Sin endurecer el tipo.** `flashOf({ flash: 42 })` devuelve `42` (el cast lo permite), como las copias actuales. No se agrega `typeof === 'string'` ni test de ese caso: el spec pide "sin cambio de comportamiento" y los únicos que escriben `flash` son nuestros formularios, siempre con texto.
