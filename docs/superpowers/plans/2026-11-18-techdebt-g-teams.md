# Lote G — Equipos: tests de detalle y diálogo de añadir (#31, #36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Fijar con tests que un movimiento fallido y una asignación fallida conservan su error aunque la recarga también falle (#31), y que `AddPlayerDialog` muestre "Cargando…" en vez de la lista anterior cuando cambian `categoryId`/`teamId` con el diálogo abierto (#36).

**Architecture:** #31 es solo de tests en `TeamDetailPage.test.tsx` (el comportamiento ya existe; el rojo se demuestra revirtiendo temporalmente el `await bestEffortRefresh(); return` de cada handler). #36 agrega a `AddPlayerDialog` el patrón de React "ajustar estado cuando cambia una prop" durante el render: guarda en estado la fuente cargada (`categoryId/teamId`) y, si cambia, vuelve a `loading` y limpia error, búsqueda y confirmación pendiente antes de pintar. El efecto de carga no cambia. Sin cambios de base de datos ni de API.

**Tech Stack:** React 19.2, MUI 9, react-router-dom 7, Vitest 4.1.9 + Testing Library + user-event 14, TypeScript 6 (`tsc -b`), ESLint 10 (`eslint-plugin-react-hooks` 7), pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§3 decisión sobre #36, §4 lote G).

## Global Constraints

- Rama `fix/teams-tests-dialog`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/teams-tests-dialog` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Archivos permitidos** (solo estos): `src/teams/TeamDetailPage.test.tsx`, `src/teams/AddPlayerDialog.tsx`, `src/teams/AddPlayerDialog.test.tsx` y este plan. **No** toques `TeamsPage*` (lote H) ni `TeamDetailPage.tsx` (solo se muta temporalmente en Task 1 y se restaura). El `deferred` local de `AddPlayerDialog.test.tsx` **no** se migra al helper compartido (spec §4, #39).
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `24c14a4`: **45 archivos, 449 tests**. Este lote agrega **0 archivos y +3 tests**.

## Review Focus

- **#21 no puede volver para movimientos ni para asignaciones:** si alguien quita el `await bestEffortRefresh(); return` de `handleMove` o de `handleAssign`, un test tiene que fallar (Task 1, mutaciones de Steps 1.2 y 1.3).
- **Cambiar de equipo/categoría con el diálogo abierto nunca pinta la lista anterior**, ni siquiera un frame: el ajuste de estado ocurre en el render, no en un efecto (Task 2).
- **Una respuesta vieja no pisa a la nueva:** el flag `active` del efecto existente descarta la respuesta de la fuente anterior; el test de Task 2 resuelve solo la nueva.

---

## Task 0: Preparar y medir el baseline

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `fix/teams-tests-dialog`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [ ] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 45 y 449, todo verde).

---

## Task 1: Tests de movimiento fallido y doble falla al asignar (#31)

**Files:**
- Modify: `src/teams/TeamDetailPage.test.tsx` (2 tests nuevos al final)
- Mutación temporal (se restaura): `src/teams/TeamDetailPage.tsx` (`handleAssign` l.114–125, `handleMove` l.127–137)

Los dos tests son de caracterización (el código ya es correcto desde #21/PR #30), así que pasan al primer intento. El rojo se demuestra con dos mutaciones temporales, exactamente la regresión que el issue dice que hoy pasaría desapercibida.

- [ ] **Step 1.1: Escribir los tests**

Agrega al final de `src/teams/TeamDetailPage.test.tsx`:

```tsx
test('a failed assign keeps its error when the reload also fails', async () => {
  mocks.fetchEligiblePlayers.mockResolvedValue([p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null })])
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.assignPlayer.mockResolvedValue({ ok: false, error: 'RLS denied' })
  mocks.fetchRoster.mockRejectedValue(new Error('boom'))
  await user.click(screen.getByRole('button', { name: 'Añadir jugador' }))
  await user.click(await screen.findByText('Free Agent'))
  expect(await screen.findByText('RLS denied')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.fetchRoster).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('No se pudo actualizar la vista. Recarga la página.')).not.toBeInTheDocument()
})

test('a failed move keeps its error when the reload also fails', async () => {
  mocks.fetchEligiblePlayers.mockResolvedValue([p({ id: 'inB', full_name: 'Beto Otro', team_id: 'other', team_name: 'Otro' })])
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.movePlayer.mockResolvedValue({ ok: false, error: 'RLS denied' })
  mocks.fetchRoster.mockRejectedValue(new Error('boom'))
  await user.click(screen.getByRole('button', { name: 'Añadir jugador' }))
  await user.click(await screen.findByText('Beto Otro'))
  await user.click(await screen.findByRole('button', { name: 'Mover' }))
  expect(await screen.findByText('RLS denied')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.movePlayer).toHaveBeenCalledWith('inB', 's1', 'team9')
  expect(mocks.fetchRoster).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('No se pudo actualizar la vista. Recarga la página.')).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: 12 tests PASS.

- [ ] **Step 1.2: Mutación de `handleMove` (rojo demostrado)**

En `src/teams/TeamDetailPage.tsx`, dentro de `handleMove`, borra temporalmente estas dos líneas del bloque `if (!res.ok) { … }`:

```tsx
      await bestEffortRefresh()
      return
```

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: FAIL solo en `a failed move keeps its error when the reload also fails` (aparece `No se pudo actualizar la vista. Recarga la página.` y pisa `RLS denied`).

Restaura: `git -C $WT checkout -- src/teams/TeamDetailPage.tsx`.

- [ ] **Step 1.3: Mutación de `handleAssign` (rojo demostrado)**

Igual que 1.2 pero dentro de `handleAssign`: borra temporalmente `      await bestEffortRefresh()` y `      return` de su bloque `if (!res.ok) { … }`.

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: FAIL solo en `a failed assign keeps its error when the reload also fails`. (El test existente `a failed assign shows its error, closes the dialog and still reloads` sigue verde con esta mutación: por eso hacía falta el nuevo.)

Restaura: `git -C $WT checkout -- src/teams/TeamDetailPage.tsx`; `git -C $WT diff --stat -- src/teams/TeamDetailPage.tsx` → vacío. Vuelve a correr el archivo → 12 PASS.

- [ ] **Step 1.4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-g-teams.md src/teams/TeamDetailPage.test.tsx
```

```bash
git -C $WT commit -m "test: pin failed move and failed assign keeping their error when the reload fails (#31)" -m "Dropping the best-effort refresh and early return from handleMove or handleAssign kept the suite green, so #21 could come back unnoticed. Both double failures are now pinned like the remove path." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: `AddPlayerDialog` vuelve a "Cargando…" si cambia la fuente con el diálogo abierto (#36)

**Files:**
- Modify: `src/teams/AddPlayerDialog.test.tsx` (test nuevo al final)
- Modify: `src/teams/AddPlayerDialog.tsx` (después de los `useState`, l.32–37)

Spec §3 permite "el `key` sugerido o el 'Cargando…' al re-ejecutar el efecto". Este plan usa el segundo, dentro del componente: cubre a cualquier llamador (no depende de que el padre recuerde el `key`) y se prueba directo con `rerender`. Va en el render y no en el efecto porque `react-hooks/set-state-in-effect` prohíbe el `setState` síncrono en el cuerpo del efecto (ver el comentario existente en l.39–40) y porque así la lista vieja no llega a pintarse.

- [ ] **Step 2.1: Escribir el test (rojo)**

Agrega al final de `src/teams/AddPlayerDialog.test.tsx` (usa el `deferred` local del archivo):

```tsx
test('switching team or category while open shows Cargando… instead of the previous list', async () => {
  const props = { onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open categoryId="cat1" teamId="A" {...props} />)
  await screen.findByText('Free Agent')
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  rerender(<AddPlayerDialog open categoryId="cat2" teamId="B" {...props} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByText('Free Agent')).not.toBeInTheDocument()
  expect(mocks.fetchEligiblePlayers).toHaveBeenLastCalledWith('cat2', 'B')
  await act(async () => {
    rows.resolve([p({ id: 'other', full_name: 'Carla Nueva', team_id: null, team_name: null, category_id: 'cat2' })])
  })
  expect(await screen.findByText('Carla Nueva')).toBeInTheDocument()
  expect(screen.queryByText('Free Agent')).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: FAIL solo en el test nuevo con `Unable to find an element with the text: Cargando…` (la lista anterior sigue visible); 8 pasan.

- [ ] **Step 2.2: Implementar**

En `src/teams/AddPlayerDialog.tsx`, justo después de `  const [loading, setLoading] = useState(true)` y antes del comentario `// Reset search/pending inside the async callback …`, agrega:

```tsx
  const source = `${categoryId}/${teamId}`
  const [loadedSource, setLoadedSource] = useState(source)

  // Adjusting state during render (not in the effect) so the previous list never paints for the new source.
  if (loadedSource !== source) {
    setLoadedSource(source)
    setLoadError(false)
    setLoading(true)
    setSearch('')
    setPending(null)
  }
```

El efecto de carga (`[open, categoryId, teamId, reloadKey]`) y `handleExited` no cambian.

Run: `pnpm exec vitest run src/teams/AddPlayerDialog.test.tsx`
Expected: 9 tests PASS.

Run: `pnpm exec eslint src/teams`
Expected: exit 0 (el planner lo verificó con `eslint-plugin-react-hooks` 7: el patrón no dispara `set-state-in-effect` ni otra regla).

- [ ] **Step 2.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 3` tests (2 de Task 1, 1 de Task 2), todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 2.4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-g-teams.md src/teams/AddPlayerDialog.tsx src/teams/AddPlayerDialog.test.tsx
```

```bash
git -C $WT commit -m "fix: show Cargando… when AddPlayerDialog's team or category changes while open (#36)" -m "The load effect re-ran without resetting, so the previous list stayed visible until the new fetch resolved. The dialog now resets to loading during render when its source changes, for any caller." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, salidas de las mutaciones (1.2, 1.3), del rojo (2.1) y las tres salidas verdes del Step 2.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- PR a `develop` con `Closes #31` y `Closes #36`.
- Sin verificación en navegador obligatoria (spec §5 no la pide para G): ningún llamador cambia `categoryId`/`teamId` con el diálogo abierto hoy, y #31 es solo de tests. Opcional: abrir un equipo → Añadir jugador → la lista carga como antes.

---

## Discrepancias

- **#36 dice "Fix if ever needed: key the dialog on `teamId` from the parent".** Spec §3 decidió implementarlo y permite el `key` o el "Cargando…" al re-ejecutar el efecto. El plan elige lo segundo dentro de `AddPlayerDialog` porque (a) protege a todos los llamadores, (b) se prueba sin simular un cambio de ruta con el diálogo abierto (el diálogo es modal, en `TeamDetailPage` eso no se puede provocar desde la UI) y (c) no toca `TeamDetailPage.tsx`. El efecto observable es el mismo que el del `key`: "Cargando…" y nada de la lista anterior.
- **#31 es solo de tests:** no hay rojo natural; se demuestra con dos mutaciones temporales (Steps 1.2 y 1.3), que son exactamente la regresión que describe el issue. Para la asignación, la mutación pasa con el test existente y falla con el nuevo, lo que confirma el hueco que señala el Nit.
- El test de movimiento usa un jugador en otro equipo (`team_id: 'other'`, `team_name: 'Otro'`) como pide el issue; el diálogo de confirmación "Mover" vive dentro de `AddPlayerDialog`, así que el `waitFor(... queryByRole('dialog') ...)` espera a que se cierren los dos.
