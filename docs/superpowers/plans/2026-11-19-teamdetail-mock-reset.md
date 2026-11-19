# Aislamiento de mocks en los tests de `TeamDetailPage` (#166) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> El implementer lee el plan desde su propio worktree y marca `- [x]` ahí, en su copia, al terminar cada paso.

**Goal:** Ningún `*Once` sin consumir de un test de `src/teams/TeamDetailPage.test.tsx` llega al test siguiente: el `beforeEach` reinicia con `mockReset()` todos los mocks del objeto `mocks` antes de volver a poner los valores por defecto. Sin cambios de producto.

**Architecture:** Enfoque A del spec. En el `beforeEach` (l.48), `vi.clearAllMocks()` se sustituye por `for (const fn of Object.values(mocks)) fn.mockReset()` con una línea de *por qué*. Es seguro reiniciar **todos**: el `beforeEach` ya reconfigura los 8 (`useTenant`, `fetchTeam`, `fetchRoster`, `fetchEligiblePlayers`, `assignPlayer`, `movePlayer`, `removeFromRoster`, `deleteTeam`), y el archivo no tiene otros mocks (`vi.fn` solo en `vi.hoisted`, sin `spyOn`/`stubGlobal`). `mockReset` también borra las llamadas, así que `clearAllMocks` sobra. Mismo arreglo que `mocks.fetchPlayer.mockReset()` en `src/players/PlayerFormPage.test.tsx` (lote N), aplicado a todo el objeto en vez de a un solo mock.

**Tech Stack:** Vitest 4.1.9 (globals, jsdom) + Testing Library, React 19, react-router-dom 7, TypeScript (`tsc -b`), ESLint, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-19-teamdetail-mock-reset-design.md` (enfoque A). Issue: #166.

## Global Constraints

- Rama `fix/teamdetail-mock-reset` (de `origin/develop` `d5112da`). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/teamdetail-mock-reset`; en este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), un comando git por llamada al shell. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre worktrees paralelos y ya se pisaron trabajos así. Para descartar: `git -C $WT checkout -- <archivo>`; para apartar: `git -C $WT diff -- <archivo> > "$(mktemp)"` y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `src/teams/TeamDetailPage.test.tsx` y este plan. Antes de cada commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista. Si necesitas otro archivo, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Commits en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos (medidos por el planner en una copia de `d5112da`): baseline **49 archivos, 586 tests**; este fix agrega **+0 archivos, +2 tests** → 49 / 588.
- No hay verificación en navegador: el cambio es solo de tests.

## Decisión: el par de regresión se queda como test permanente

El par (`describe('mock isolation between tests')`) se queda en el archivo. Razón: es la única protección que falla si alguien vuelve a `vi.clearAllMocks()` o reinicia solo algunos mocks; el rojo original (#166) solo aparece bajo sobrecarga y no es reproducible a voluntad. Depende del orden **a propósito** (Vitest ejecuta los tests de un archivo en orden; el repo no usa `sequence.shuffle`), y lo dice su comentario. Si alguien filtra con `-t` solo el segundo, pasa trivialmente; eso es aceptable.

El primer test deja en cola un `mockImplementationOnce` que lanza en **cada** mock de `mocks`, así el par también exige que el reinicio cubra todos (el planner comprobó que reiniciar solo `fetchRoster` sigue en rojo).

## Review Focus

- **Escenario exacto del issue:** un `mockRejectedValueOnce` de `fetchRoster` sin consumir ya no convierte "Equipo no encontrado" en el error de carga (cubierto por el par: `fetchRoster` está entre los mocks que el primer test deja en cola).
- **Reinicio parcial:** si solo se reinicia un mock (como en lote N), `useTenant` sigue filtrando su `*Once` y el segundo test falla (Step 1.2b).
- **Defaults perdidos:** `mockReset` borra también `mockResolvedValue`; todos los mocks que se reinician deben volver a configurarse en el mismo `beforeEach` (hoy lo están los 8). Los 16 tests existentes en verde lo prueban.
- **Conteos de llamadas:** tests como `expect(mocks.fetchRoster).toHaveBeenCalledTimes(2)` dependen de que el contador empiece en 0; `mockReset` lo hace (suite en verde).
- **Sin flakiness nueva:** el archivo pasa 3 veces seguidas (Step 1.4).

---

## Task 0: Preparar y medir el baseline

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `fix/teamdetail-mock-reset`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → solo el commit de este plan (`docs: plan …`).
- [ ] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado 49 y 586; si `develop` avanzó, cuenta el delta).

---

## Task 1: Reiniciar todos los mocks en `beforeEach` (#166)

**Files:**
- Modify: `src/teams/TeamDetailPage.test.tsx` (ancla `beforeEach(() => {\n  vi.clearAllMocks()`, ~l.48-49; y final del archivo)

**Interfaces:**
- Consumes: el objeto `mocks` de `vi.hoisted` (l.8-11) y `renderPage()` del mismo archivo.

- [ ] **Step 1.1: Escribir el par de regresión (rojo)**

Al final del archivo, después de `test('without a flash no toast is shown', …)`:

```tsx
// Order-dependent on purpose: the first test leaves *Once responses queued for the second (#166)
describe('mock isolation between tests', () => {
  test('a test that queues *Once responses and never consumes them', () => {
    for (const fn of Object.values(mocks)) fn.mockImplementationOnce(() => { throw new Error('leaked *Once') })
    expect(mocks.fetchTeam).not.toHaveBeenCalled()
  })

  test('the next test gets the beforeEach defaults, not the leaked responses', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /MTY AC Rojo/ })).toBeInTheDocument()
    expect(screen.getByText('Ana Roster')).toBeInTheDocument()
  })
})
```

`describe` y `test` son globals (no se importan).

- [ ] **Step 1.2: Correr y ver el rojo**

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx` (en `$WT`)
Expected: `Tests  1 failed | 17 passed (18)`, `Errors  1 error`. Falla `the next test gets the beforeEach defaults, not the leaked responses` con `Unable to find role="heading" and name /MTY AC Rojo/` (se ve el `MuiAlert-colorError`) y el error no manejado `Caused by: Error: leaked *Once`. Si pasa, **detente**: el test no está probando nada.

- [ ] **Step 1.2b (opcional, no se commitea): comprobar que un reinicio parcial no basta**

Añade temporalmente `mocks.fetchRoster.mockReset()` debajo de `vi.clearAllMocks()` y corre el mismo comando → sigue `1 failed | 17 passed`. Luego borra esa línea a mano (nunca `stash`, ni `checkout` del archivo, que perdería el Step 1.1).

- [ ] **Step 1.3: El arreglo (verde)**

En el `beforeEach`, sustituye la línea `  vi.clearAllMocks()` por exactamente:

```tsx
  // mockReset also drops unconsumed *Once responses, which clearAllMocks would leak into the next test
  for (const fn of Object.values(mocks)) fn.mockReset()
```

Nada más cambia en el `beforeEach` (los `mockReturnValue`/`mockResolvedValue` siguientes se quedan igual).

- [ ] **Step 1.4: Correr y ver el verde (3 veces)**

Run (3 veces): `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: `Test Files  1 passed (1)`, `Tests  18 passed (18)`, sin `Errors`, las tres veces.

- [ ] **Step 1.5: Verificación completa**

En `$WT`:
- `pnpm exec vitest run` → `Test Files  49 passed (49)`, `Tests  588 passed (588)` (o `B_files` / `B_tests + 2`).
- `pnpm exec tsc -b` → sale con código 0, sin salida.
- `pnpm lint` → sale con código 0.

- [ ] **Step 1.6: Commit**

`git -C $WT status -s` → solo `M src/teams/TeamDetailPage.test.tsx` y `M docs/superpowers/plans/2026-11-19-teamdetail-mock-reset.md`.

```bash
git -C $WT add src/teams/TeamDetailPage.test.tsx docs/superpowers/plans/2026-11-19-teamdetail-mock-reset.md
git -C $WT commit -m "fix: reset TeamDetailPage mocks so queued *Once responses cannot leak (#166)

clearAllMocks keeps unconsumed mock*Once values, so a test that timed out
could hand its queued rejection to the next one.

Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando git por llamada al shell: `add` y `commit` van en llamadas separadas.)
