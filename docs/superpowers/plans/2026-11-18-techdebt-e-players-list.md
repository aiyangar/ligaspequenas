# Lote E — Lista de jugadores y exportación (#76 #79 #83 #84 #85 #110) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en el PR de docs del barrido **antes** de despachar. El implementer los lee desde su worktree y marca `- [x]` en su copia del plan al terminar cada paso.

**Goal:** `fetchAllRows` deja de pedir para siempre si una respuesta ignora el rango (#110); un test lee el `.xlsx` real y prueba que un valor tipo fórmula se guarda como texto (#83); el test Pago + Documentos prueba de verdad el AND (#79); cambiar un filtro borra un error de exportación viejo (#84); filtros que no dejan a nadie muestran "Sin jugadores con estos filtros." (#76); y el foco vuelve a "Exportar a Excel" en un navegador real después de exportar (#85).

**Architecture:** `fetchAllRows` cuenta los bloques seguidos que no agregan filas nuevas y lanza al segundo (uno solo se tolera: un insert concurrente puede correr filas). El test del `.xlsx` usa la misma entrada que producción (`write-excel-file/browser`, `toBlob()`), lee el zip con un lector mínimo de directorio central y `DecompressionStream('deflate-raw')`. En `PlayersPage`, cada `onChange` de filtro pasa por `filterSetter`, que limpia `exportError`; un ternario muestra el mensaje de filtros vacíos en lugar de la lista; y el foco se devuelve en un `useEffect` sobre `exporting`, después del render que rehabilita el botón, guiado por un ref.

**Tech Stack:** React 19 / MUI 9 / `write-excel-file` 4.1.1 (fijo) / Vitest 4 + Testing Library (jsdom) / TypeScript (`tsc -b`) / ESLint / pnpm; Playwright (orquestador).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§4, §5). Detalle por issue: `gh issue view <n> --repo aiyangar/ligaspequenas` (la causa raíz de #85 está en el issue).

## Global Constraints

- Rama `fix/players-list-export-polish`, worktree `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/players-list-export-polish` (lo crea el orquestador desde `origin/develop`). En este plan `$WT` es esa ruta. Primera acción: `pnpm install --frozen-lockfile`. Los tests no necesitan `.env`.
- **Archivos que este lote puede tocar (y ningún otro):** `src/lib/fetchAllRows.ts`, `src/lib/fetchAllRows.test.ts`, `src/players/PlayersPage.tsx`, `src/players/PlayersPage.test.tsx`, `src/players/playersSheet.xlsx.test.ts` (nuevo) y este plan. Lotes C y D corren en paralelo: C es dueño de `src/documents/*`; D de `src/players/PlayerFormPage*`, `src/players/PlayerPhoto*` y `src/players/players.test.ts`. `src/players/playersSheet.ts`, `src/players/playersSheet.test.ts`, `src/players/players.ts` y `src/payments/*` no se tocan.
- Git: siempre `git -C $WT …`, un comando git por llamada. Nunca `CLAUDE_GIT_OVERRIDE`. Sin push, PR ni merge. Nunca toques el checkout principal. Sin Supabase MCP ni base de datos.
- Código, identificadores, comentarios y commits en inglés. Sin comentarios salvo una línea corta con el *por qué*. Cada commit termina con `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. Cada `git add` incluye este plan.
- Cierre: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint` en verde. Conteos como delta sobre `B_files`/`B_tests` del Step 0 (con `origin/develop` en `24c14a4`: **45 / 449**).
- **Tests de cobertura** (#83, #79): pasan con el código actual; su prueba es la **mutación** que indica el paso, restaurando después con `git -C $WT checkout -- <archivo>`. Nunca commitees una mutación. Todas se verificaron al planear.
- PR (lo abre el orquestador): `Closes #76`, `Closes #79`, `Closes #83`, `Closes #84`, `Closes #85`, `Closes #110`.

## Review Focus

- **#110 sin cortar una lectura legítima:** un bloque formado solo por filas ya leídas se tolera (insert concurrente que corre filas, el caso que fija `fetchPlayers keeps the first copy of a player repeated across blocks` en `players.test.ts`); el segundo seguido lanza. Lanzar (y no cortar) mantiene la regla de #73: nunca una lista parcial (Task 1).
- **#85 en navegador real:** jsdom deja enfocar un botón deshabilitado porque MUI le pone `tabindex`; Chrome no. El test simula a Chrome con un spy sobre `focus` y la verificación en navegador lo confirma (Task 6 y verificación final).
- **#84 en todos los filtros:** los 7 controles (búsqueda + 6 selects) limpian el error (Task 4).
- **#76 no confunde "sin datos" con "sin coincidencias":** sin jugadores no hay mensaje (Task 5).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 1:** `git -C $WT branch --show-current` → `fix/players-list-export-polish`; `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 2:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests`.

---

## Task 1: `fetchAllRows` no pagina para siempre (#110)

**Files:**
- Modify: `src/lib/fetchAllRows.test.ts`
- Modify: `src/lib/fetchAllRows.ts`

- [x] **Step 1: Tests**

Al final de `src/lib/fetchAllRows.test.ts`:

```ts
test('one block made only of rows already read is tolerated, as a concurrent insert can shift rows', async () => {
  const page = pages(ok([0]), ok([0]), ok([1]), ok([]))
  expect(await fetchAllRows(page, byValue)).toEqual([0, 1])
  expect(page.mock.calls.map(([from]) => from)).toEqual([0, 1, 2, 3])
})

test('a response that ignores the range throws instead of paging forever', async () => {
  const page = vi.fn(async (from: number): Promise<PageResult<number>> =>
    from > 100 ? { data: null, error: { message: 'runaway paging' } } : ok([0, 1]),
  )
  await expect(fetchAllRows(page, byValue)).rejects.toThrow('the server ignored the requested range')
  expect(page.mock.calls.map(([from]) => from)).toEqual([0, 2, 4])
})
```

(El segundo mock corta solo a partir de `from > 100` para que el rojo sea un fallo y no un bucle infinito: con el código actual, un mock que siempre responde `[0, 1]` agota la memoria del worker.)

- [x] **Step 2: Verificar el rojo**

Run: `pnpm exec vitest run src/lib/fetchAllRows.test.ts`
Expected: FAIL solo en `a response that ignores the range…` con `expected … to throw error including 'the server ignored the requested range' but got 'runaway paging'`. El de "tolerated" pasa (es la guarda de que el arreglo no corte de más).

- [x] **Step 3: Implementar**

En `fetchAllRows`, después de `let offset = 0` agrega `let staleBlocks = 0`, y reemplaza el bloque desde `offset += data.length` hasta el cierre del `for (;;)` por:

```ts
    offset += data.length
    const before = rows.length
    for (const row of data) {
      const k = key(row)
      if (seen.has(k)) continue
      seen.add(k)
      rows.push(row)
    }
    // one all-repeated block can be a concurrent insert; two in a row means the range is ignored
    staleBlocks = rows.length === before ? staleBlocks + 1 : 0
    if (staleBlocks === 2) throw new Error('fetchAllRows: the server ignored the requested range')
  }
```

- [x] **Step 4: Verificar el verde**

Run: `pnpm exec vitest run src/lib/fetchAllRows.test.ts src/players/players.test.ts src/payments/payments.test.ts` → todo PASS (los tests de dedupe de jugadores y pagos siguen pasando).

- [x] **Step 5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-e-players-list.md src/lib/fetchAllRows.ts src/lib/fetchAllRows.test.ts
git -C $WT commit -m "fix: stop paging when the server keeps ignoring the requested range (#110)" -m "fetchAllRows only stopped on an empty block, so a response that ignored the range would be requested forever. One block of already-read rows is still tolerated, since a concurrent insert can shift rows; a second one in a row throws instead of returning a partial list." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: El `.xlsx` real guarda las fórmulas como texto (#83)

**Files:**
- Create: `src/players/playersSheet.xlsx.test.ts`

**Interfaces (verificadas en `node_modules/write-excel-file` 4.1.1):** `write-excel-file/browser` exporta `default(sheetData, sheetOptions?)` que devuelve `{ toBlob(): Promise<Blob>; toFile(name): Promise<void> }`. `write-excel-file/node` devuelve `toBuffer()`, pero sus tipos importan `node:stream`, y `tsconfig.app.json` no incluye los tipos de Node (`"types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]`): por eso el test usa la entrada `browser`, que además es la que usa producción (`src/players/exportPlayers.ts`).

- [x] **Step 1: Crear el test**

```ts
import { expect } from 'vitest'
import writeExcelFile from 'write-excel-file/browser'
import { PLAYERS_SHEET_COLUMNS, buildPlayersSheet } from './playersSheet'
import type { PlayerRow } from './players'

const player: PlayerRow = {
  id: 'p1', tenant_id: 't1', full_name: '=1+1', birth_date: '2015-06-10',
  curp: '@SUM(1)', photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
  tutor_name: '+52 81', tutor_whatsapp: '8112345678', tutor_email: '-1',
  emergency_contact_name: null, emergency_contact_phone: null,
  affiliation_status: 'autoriza', affiliation_date: null, created_at: '', updated_at: '',
  edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
  category_id: 'cat1', team_id: null, team_name: null, payment_state: 'al_corriente', docs_delivered: 2,
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(source.pipeThrough(new DecompressionStream('deflate-raw'))).text()
}

// reads one entry of a zip through its central directory, so sizes are known even with data descriptors
async function zipEntry(zip: Uint8Array<ArrayBuffer>, name: string): Promise<string> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let eocd = zip.length - 22
  while (view.getUint32(eocd, true) !== 0x06054b50) eocd--
  let at = view.getUint32(eocd + 16, true)
  const count = view.getUint16(eocd + 10, true)
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localHeader = view.getUint32(at + 42, true)
    const entryName = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
    if (entryName === name) {
      const start = localHeader + 30 + view.getUint16(localHeader + 26, true) + view.getUint16(localHeader + 28, true)
      const data = zip.subarray(start, start + compressedSize)
      return method === 0 ? new TextDecoder().decode(data) : inflateRaw(data)
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`${name} not found`)
}

test('the written workbook stores formula-like values as shared strings, never as formulas', async () => {
  const blob = await writeExcelFile(buildPlayersSheet([player]), {
    columns: PLAYERS_SHEET_COLUMNS.map(({ width }) => ({ width })),
  }).toBlob()
  const zip = new Uint8Array(await blob.arrayBuffer())
  const sheet = await zipEntry(zip, 'xl/worksheets/sheet1.xml')
  const shared = await zipEntry(zip, 'xl/sharedStrings.xml')
  expect(sheet).not.toMatch(/<f[\s>]/)
  expect(sheet).toMatch(/<c r="A2"[^>]*t="s"/)
  for (const value of ['=1+1', '@SUM(1)', '+52 81', '-1']) expect(shared).toContain(`>${value}<`)
})
```

(`Blob.stream()` no existe en el `Blob` de jsdom; `arrayBuffer()` sí. `ReadableStream`, `DecompressionStream` y `Response` vienen de Node 24 y siguen disponibles en el entorno jsdom de Vitest. Verificado al planear.)

- [x] **Step 2: Verificar que pasa**

Run: `pnpm exec vitest run src/players/playersSheet.xlsx.test.ts` → 1 test PASS (cobertura, sin rojo).

- [x] **Step 3: Mutación**

En `src/players/playersSheet.ts` (`playerRow`), cambia la primera celda `p.full_name,` por `{ value: p.full_name.slice(1), type: 'Formula' },`.
Run: `pnpm exec vitest run src/players/playersSheet.xlsx.test.ts` → FAIL (`expected '<?xml … not to match /<f[\s>]/`).
Restaura: `git -C $WT checkout -- src/players/playersSheet.ts`.

- [x] **Step 4: Tipos y lint del archivo nuevo**

Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint src/players/playersSheet.xlsx.test.ts` → exit 0.

- [x] **Step 5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-e-players-list.md src/players/playersSheet.xlsx.test.ts
git -C $WT commit -m "test: check formula injection on the serialized players workbook (#83)" -m "The sheet test only inspected cell objects, so a library change that wrote strings as formulas would pass unnoticed. A test now writes the real xlsx with the production entry point and asserts formula-like values land as shared strings with no <f> element." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 3: Pago + Documentos prueban el AND (#79)

**Files:**
- Modify: `src/players/PlayersPage.test.tsx`

- [x] **Step 1: Sacar el fixture a una función**

Antes del comentario `// Chip texts also appear as filter <option>s…` agrega:

```ts
function roster(): PlayerRow[] {
  return [
    player({ id: 'p1', full_name: 'Ana Ruiz', category_name: 'Infantil Mayor', category_year: 1, team_id: 'team9', team_name: 'MTY AC Rojo', payment_state: 'con_adeudo', docs_delivered: DOCUMENT_TOTAL, affiliation_status: 'autoriza' }),
    player({ id: 'p2', full_name: 'Beto Gómez', status: 'baja', category_id: null, category_name: null, category_year: null, edad_liga: 25, team_id: null, team_name: null, payment_state: 'sin_pagos', docs_delivered: 2, affiliation_status: 'no_autoriza' }),
    player({ id: 'p3', full_name: 'Carla Paz', category_id: 'cat2', category_name: 'Infantil Menor', category_year: 2, payment_state: 'al_corriente', docs_delivered: DOCUMENT_TOTAL - 1 }),
  ]
}
```

y en `beforeEach` reemplaza el `mocks.fetchPlayers.mockResolvedValue([ …tres jugadores… ])` por `mocks.fetchPlayers.mockResolvedValue(roster())`.

- [x] **Step 2: Reescribir el test**

Reemplaza `Pago Con adeudo plus Documentos Completos leaves only the player matching both` completo por:

```ts
test('Pago Con adeudo plus Documentos Completos leaves only the player matching both', async () => {
  mocks.fetchPlayers.mockResolvedValue([
    ...roster(),
    player({ id: 'p4', full_name: 'Dani Sol', payment_state: 'con_adeudo', docs_delivered: 1 }),
  ])
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Dani Sol')
  await user.selectOptions(screen.getByLabelText('Pago'), 'con_adeudo')
  await waitFor(() => expect(screen.queryByText('Carla Paz')).not.toBeInTheDocument())
  expect(screen.getByText('Dani Sol')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Documentos'), 'completos')
  await waitFor(() => expect(screen.queryByText('Dani Sol')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument()
})
```

- [x] **Step 3: Verificar y mutar**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → todo PASS (mismo número de tests).
Mutación: en `PlayersPage.tsx` borra la línea `    if (docsFilter === 'completos' && !docsComplete(p)) return false`. Run `pnpm exec vitest run src/players/PlayersPage.test.tsx -t "Pago Con adeudo plus"` → FAIL (Dani sigue visible). (Con el test viejo esta mutación pasaba.) Restaura con `git -C $WT checkout -- src/players/PlayersPage.tsx`.

- [x] **Step 4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-e-players-list.md src/players/PlayersPage.test.tsx
git -C $WT commit -m "test: make the Pago plus Documentos test depend on the Documentos filter (#79)" -m "Ana was the only con_adeudo player, so the Documentos selection never changed the result. A con_adeudo player with incomplete documents now has to disappear." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: Cambiar un filtro borra el error de exportación (#84)

**Files:**
- Modify: `src/players/PlayersPage.test.tsx`
- Modify: `src/players/PlayersPage.tsx`

- [x] **Step 1: Tests (rojo)**

Al final del archivo:

```ts
test('changing a filter clears a stale export error', async () => {
  mocks.exportPlayersToExcel.mockRejectedValueOnce(new Error('chunk failed'))
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.click(exportButton())
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el archivo de Excel. Intenta de nuevo.')
  await user.selectOptions(screen.getByLabelText('Estatus'), 'activo')
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(mocks.exportPlayersToExcel).toHaveBeenCalledTimes(1)
})

test('typing in the search box also clears a stale export error', async () => {
  mocks.exportPlayersToExcel.mockRejectedValueOnce(new Error('chunk failed'))
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.click(exportButton())
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Buscar por nombre'), 'a')
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})
```

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → FAIL en estos 2 (el `Alert` sigue).

- [x] **Step 2: Implementar**

Después de `handleRetry` agrega:

```ts
  function filterSetter<T>(set: (value: T) => void) {
    return (value: T) => {
      setExportError(null)
      set(value)
    }
  }
  const changeSearch = filterSetter(setSearch)
  const changeCategoryId = filterSetter(setCategoryId)
  const changeStatus = filterSetter(setStatus)
  const changeTeamId = filterSetter(setTeamId)
  const changePaymentState = filterSetter(setPaymentState)
  const changeDocsFilter = filterSetter(setDocsFilter)
  const changeAffiliation = filterSetter(setAffiliation)
```

y en los 7 `onChange` de los filtros reemplaza el setter por su `change…` (mismo argumento): `setSearch(e.target.value)` → `changeSearch(e.target.value)`, `setCategoryId(…)` → `changeCategoryId(…)`, `setStatus(…)` → `changeStatus(…)`, `setTeamId(…)` → `changeTeamId(…)`, `setPaymentState(…)` → `changePaymentState(…)`, `setDocsFilter(…)` → `changeDocsFilter(…)`, `setAffiliation(…)` → `changeAffiliation(…)`. Al terminar, `grep -n "onChange={(e) => set" src/players/PlayersPage.tsx` no devuelve nada.

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → todo PASS.

- [x] **Step 3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-e-players-list.md src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx
git -C $WT commit -m "fix: clear a stale export error when the players filters change (#84)" -m "The error alert referred to an export of a list the admin has since changed; it now goes away with any filter or search change." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 5: Mensaje cuando los filtros no dejan a nadie (#76)

**Files:**
- Modify: `src/players/PlayersPage.test.tsx`
- Modify: `src/players/PlayersPage.tsx`

- [ ] **Step 1: Tests**

```ts
test('a filter combination that matches nobody says so', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(screen.queryByText('Sin jugadores con estos filtros.')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Pago'), 'al_corriente')
  await user.selectOptions(screen.getByLabelText('Documentos'), 'completos')
  expect(await screen.findByRole('status')).toHaveTextContent('Sin jugadores con estos filtros.')
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Documentos'), 'Todos')
  expect(await screen.findByText('Carla Paz')).toBeInTheDocument()
  expect(screen.queryByText('Sin jugadores con estos filtros.')).not.toBeInTheDocument()
})

test('with no players at all there is no filters message', async () => {
  mocks.fetchPlayers.mockResolvedValue([])
  renderPage()
  await waitFor(() => expect(mocks.fetchPlayers).toHaveBeenCalled())
  await waitFor(() => expect(exportButton()).toBeDisabled())
  expect(screen.queryByText('Sin jugadores con estos filtros.')).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: FAIL solo en `a filter combination that matches nobody says so`; `with no players at all…` pasa (es la guarda de que el mensaje no salga sin datos).

- [ ] **Step 2: Implementar**

Envuelve la `<List sx={{ mt: 2 }}>…</List>` de jugadores en un ternario (la lista por dentro no cambia):

```tsx
          {players.length > 0 && visible.length === 0 ? (
            <Typography role="status" color="text.secondary" sx={{ mt: 2 }}>
              Sin jugadores con estos filtros.
            </Typography>
          ) : (
            <List sx={{ mt: 2 }}>
              {/* the existing visible.map(...) of ListItemButton, unchanged */}
            </List>
          )}
```

(El comentario es un marcador del plan: deja el `visible.map` existente y no escribas el comentario.)

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → todo PASS.

- [ ] **Step 3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-e-players-list.md src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx
git -C $WT commit -m "feat: say when the players filters match nobody (#76)" -m "With six filters plus search an empty list became likely and looked like a broken page. When players exist but none match, a status message replaces the empty list." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 6: El foco vuelve a "Exportar a Excel" en un navegador real (#85)

**Files:**
- Modify: `src/players/PlayersPage.test.tsx`
- Modify: `src/players/PlayersPage.tsx`

**Causa (issue #85, confirmada al planear):** el `finally` de `handleExport` llama `focus()` justo después de `setExporting(false)`, antes del re-render, así que el botón sigue `disabled` y Chrome ignora el `focus()`. jsdom lo acepta porque MUI pone `tabindex` al botón, y por eso el test actual pasa.

- [ ] **Step 1: Test que simula al navegador (rojo)**

En el import de Vitest agrega `onTestFinished`: `import { beforeEach, expect, onTestFinished, vi } from 'vitest'`. Reemplaza el test `focus returns to the export button when the file is ready` completo por:

```ts
test('focus returns to the export button once it is enabled again', async () => {
  const run = deferred()
  mocks.exportPlayersToExcel.mockReturnValue(run.promise)
  // Browsers ignore focus() on a disabled button; jsdom honors it because MUI sets tabindex.
  const realFocus = HTMLElement.prototype.focus
  const focus = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options) {
    if (this instanceof HTMLButtonElement && this.disabled) return
    realFocus.call(this, options)
  })
  onTestFinished(() => focus.mockRestore())
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.click(exportButton())
  // Browsers drop focus from a button that becomes disabled; jsdom does not, so drop it by hand.
  act(() => exportButton().blur())
  expect(document.body).toHaveFocus()
  await act(async () => run.resolve())
  await waitFor(() => expect(exportButton()).toBeEnabled())
  expect(exportButton()).toHaveFocus()
})
```

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx -t "focus"`
Expected: FAIL en `focus returns to the export button once it is enabled again` (el foco queda en `body`); `focus stays where the user moved it…` pasa.

- [ ] **Step 2: Implementar**

Después de `const exportButtonRef = useRef<HTMLButtonElement>(null)` agrega `const restoreExportFocus = useRef(false)`. En el `finally` de `handleExport` reemplaza:

```ts
      exportingRef.current = false
      setExporting(false)
      if (document.activeElement === document.body) exportButtonRef.current?.focus()
```

por:

```ts
      exportingRef.current = false
      restoreExportFocus.current = true
      setExporting(false)
```

y después de `handleExport` agrega:

```ts
  // focus() on the still-disabled button is a no-op in browsers, so wait for the render that enables it
  useEffect(() => {
    if (exporting || !restoreExportFocus.current) return
    restoreExportFocus.current = false
    if (document.activeElement === document.body) exportButtonRef.current?.focus()
  }, [exporting])
```

(El ref evita enfocar el botón al montar la página, cuando `exporting` también es `false`. El efecto no llama `setState`.)

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → todo PASS.

- [ ] **Step 3: Suite completa, tipos y lint**

Run: `pnpm exec vitest run` → `B_files + 1` archivos, `B_tests + 7` tests (Task 1: 2; Task 2: 1; Task 4: 2; Task 5: 2; Tasks 3 y 6 reemplazan), todo verde (esperado 46 / 456). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-e-players-list.md src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx
git -C $WT commit -m "fix: return focus to Exportar a Excel after the render that re-enables it (#85)" -m "Chrome blurs the button when it becomes disabled and ignores focus() until it is enabled again, but focus() ran before that re-render, so keyboard users landed on body. Focus now returns from an effect once exporting is false; the test simulates the browser rule jsdom does not apply." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** SHAs, `B_files`/`B_tests` y conteos finales, salidas de cada rojo (Tasks 1, 4, 5, 6), de cada mutación (Tasks 2, 3) y de cada verde.

---

## Verificación en navegador (orquestador, después de la revisión limpia)

Dev server en `$WT`, sesión admin persistente de Playwright (Chromium). Datos de hoy: 1 jugador (spec §5). Nada de esto escribe en la base.

- [ ] **Foco al exportar (#85):** en `/`, enfoca "Exportar a Excel" con el teclado (Tab hasta el botón; `document.activeElement.textContent` → `Exportar a Excel`) y pulsa Enter, esperando la descarga con `page.waitForEvent('download')`. Después de la descarga, espera con `page.waitForFunction(() => document.activeElement?.textContent === 'Exportar a Excel')` (con timeout de unos segundos; antes del arreglo el foco quedaba en `BODY` y esta espera vence). Repite con clic de ratón: el foco también vuelve al botón.
- [ ] **Filtros sin coincidencias (#76):** elige un valor de Pago que el jugador no tenga (p. ej. "Al corriente" si está "Sin pagos") → se ve "Sin jugadores con estos filtros." y no hay lista; regresa Pago a "Todos" → el jugador vuelve y el mensaje desaparece.
- [ ] El archivo descargado abre en Excel/Numbers con el jugador (sanidad, sin cambios esperados).

## Discrepancias

- **#83 usa `write-excel-file/browser`, no `/node`.** El issue sugería `write-excel-file/node`, pero sus tipos importan `node:stream` y `tsconfig.app.json` no carga los tipos de Node (`tsc -b` fallaría o habría que sumar `node` a `types` para todo `src`). La entrada `browser` con `toBlob()` es la que usa producción y funciona en el jsdom de Vitest; el `.xlsx` se lee con un lector de zip de ~25 líneas y `DecompressionStream`. `fflate` (dependencia de la librería) no es dependencia directa del repo, así que no se importa.
- **#110 lanza, no corta.** El issue ofrecía "parar o lanzar, o un tope de iteraciones". Parar en el primer bloque sin filas nuevas rompería `fetchPlayers keeps the first copy of a player repeated across blocks` (`players.test.ts`, archivo del lote D) y devolvería listas parciales ante un insert concurrente con bloques chicos. Se tolera un bloque así y se lanza en el segundo seguido.
- **#85: el test viejo no era falso por jsdom en general,** sino porque jsdom considera enfocable un `<button disabled>` que tiene atributo `tabindex` (MUI lo pone). Verificado al planear: un `<button disabled>` sin `tabindex` no recibe foco en jsdom.
