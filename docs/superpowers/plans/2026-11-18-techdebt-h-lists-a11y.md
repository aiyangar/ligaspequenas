# Lote H — Listas con `<li>` y "Cargando…" al reintentar (#71 #23) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Ola 2.** Este lote se despacha **después** de que los lotes E (`fix/players-list-export-polish`), F (`fix/payments-a11y-tests`) y G (`fix/teams-tests-dialog`) estén mergeados en `develop` (spec §4). El plan se escribió contra `origin/develop` en `24c14a4` (2026-11-18), **antes** de esos merges.

> **Re-lectura obligatoria.** E reescribe partes de `src/players/PlayersPage.tsx` y su test (filtros, mensaje de filtros vacíos, foco del export), y F cambia `src/payments/DebtorsPage.tsx` y su test (#72: `aria-label` y `aria-describedby` en el link del deudor). Antes de cada tarea, **vuelve a leer** el archivo que vas a tocar y ubica los cambios por las **anclas** que da cada paso (nombres de componentes, textos, props), no por números de línea: los números de este plan son los de `24c14a4` y ya no van a coincidir. Lo que manda es el **comportamiento** que fija cada test; si el código mergeado de E/F/G hace que un fragmento de abajo no encaje tal cual, adáptalo conservando ese comportamiento y anótalo en el reporte.

**Goal:** En Jugadores, Equipos y Quién debe, cada link de la lista vive dentro de un `<li>` (los `<ul>` dejan de tener `<a>` como hijos directos), así un lector de pantalla anuncia "lista, N elementos" (#71). Jugadores y Equipos muestran "Cargando…" mientras la carga inicial (o su reintento) está en curso, en lugar de filtros con una lista vacía o una pantalla en blanco (#23).

**Architecture:** Cada `ListItemButton component={RouterLink}` se envuelve en `<ListItem disablePadding>` (MUI renderiza `<li>`; `disablePadding` conserva el aspecto). `PlayersPage` gana un estado `loaded` como el que ya tiene `TeamsPage`; mientras `!loaded && !loadError`, ambas muestran `<Typography sx={{ mt: 2 }}>Cargando…</Typography>` (el mismo texto de las fichas y de Quién debe). `DebtorsPage` ya muestra "Cargando…" al reintentar (pone `groups` en `null`), así que para #23 no cambia.

**Tech Stack:** React 19 / MUI 9 / React Router 7 / Vitest 4 + Testing Library / TypeScript (`tsc -b`) / ESLint / pnpm; Playwright (orquestador).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§4 fila H, §5). Detalle: `gh issue view 71 --repo aiyangar/ligaspequenas` y `gh issue view 23 …`.

## Global Constraints

- Rama `fix/lists-a11y-loading`, worktree `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/lists-a11y-loading`, cortado de `origin/develop` **con E, F y G ya mergeados**. En este plan `$WT` es esa ruta. Primera acción: `pnpm install --frozen-lockfile`.
- **Archivos que este lote puede tocar:** `src/players/PlayersPage.tsx`, `src/players/PlayersPage.test.tsx`, `src/teams/TeamsPage.tsx`, `src/teams/TeamsPage.test.tsx`, `src/payments/DebtorsPage.tsx`, `src/payments/DebtorsPage.test.tsx` y este plan. El lote J (#34, también ola 2) toca tests de formularios con `userEvent` (`PlayerFormPage`, `TeamDetailPage`, `AddPlayerDialog`, …), no estos archivos.
- Git: siempre `git -C $WT …`, un comando git por llamada. Nunca `CLAUDE_GIT_OVERRIDE`. Sin push, PR ni merge. Nunca toques el checkout principal. Sin Supabase MCP ni base de datos.
- Código, identificadores, comentarios y commits en inglés. Sin comentarios salvo una línea corta con el *por qué*. Cada commit termina con `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. Cada `git add` incluye este plan.
- Cierre: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint` en verde. Conteos como delta sobre `B_files`/`B_tests` del Step 0 (depende de lo que mergearon E/F/G; mídelo).
- Helpers de test: los tests nuevos usan solo helpers que existen en `24c14a4` en cada archivo (`renderPage`, `player`, `team`, `mocks`, `exportButton` no se usa). Si E/F/G renombraron alguno, usa el equivalente y anótalo.
- PR (lo abre el orquestador): `Closes #71`, `Closes #23`.

## Review Focus

- **Semántica de lista en las tres páginas:** `getAllByRole('listitem')` dentro de cada lista cuenta los links, y ningún `<ul>` tiene un `<a>` como hijo directo (Tasks 1–3). En Equipos, el `ListSubheader` ya es un `<li>`: el test cuenta links, no `listitem`.
- **Nada visual cambia** salvo "Cargando…": `ListItem disablePadding` no agrega padding; en Quién debe el `divider` sigue en el `ListItemButton`.
- **"Cargando…" no tapa un error ni un estado vacío:** con `loadError` se ve `LoadError`; con la carga terminada y cero equipos, el mensaje de "No hay equipos…" (Tasks 4–5). En Jugadores, el mensaje de filtros vacíos de E (#76) solo existe cuando ya cargó.
- **Quién debe con el link de F (#72):** el `<li>` envuelve al link con su `aria-label`/`aria-describedby` sin tocarlos.

---

## Task 0: Preparar y medir el baseline

- [x] **Step 1:** `git -C $WT branch --show-current` → `fix/lists-a11y-loading`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. Confirma que E, F y G están en la base: `git -C $WT log origin/develop --oneline --grep "#85"`, `--grep "#72"` y `--grep "#3[16]"` muestran cada uno al menos un commit. Si falta alguno, **detente y reporta**.
- [x] **Step 2:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests`.
- [x] **Step 3:** Lee completos `src/players/PlayersPage.tsx`, `src/teams/TeamsPage.tsx`, `src/payments/DebtorsPage.tsx` y sus tres tests. Ubica en cada uno las anclas que usan las tareas: el `List` que mapea jugadores/equipos/deudores, cada `ListItemButton component={RouterLink}`, el bloque `loadError ? <LoadError …/> : …` y, en Jugadores, el ternario de E con "Sin jugadores con estos filtros.".

---

## Task 1: `<li>` en la lista de Jugadores (#71)

**Files:**
- Modify: `src/players/PlayersPage.test.tsx`
- Modify: `src/players/PlayersPage.tsx`

- [x] **Step 1: Test (rojo)**

Al final del archivo:

```ts
test('each player is a list item that holds its link', async () => {
  renderPage()
  await screen.findByText('Ana Ruiz')
  const list = screen.getByRole('list')
  const items = within(list).getAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/jugadores/p1')
  expect(list.querySelectorAll(':scope > a')).toHaveLength(0)
})
```

(3 = los tres jugadores del fixture por defecto del `beforeEach`, con `p1` "Ana Ruiz" primero. Si E cambió ese fixture, ajusta el número y el primer id a lo que el `beforeEach` mergeado carga, sin filtros.)

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx -t "list item that holds"` → FAIL (`Unable to find an accessible element with the role "listitem"`).

- [x] **Step 2: Implementar**

Importa `import ListItem from '@mui/material/ListItem'`. En el `visible.map(…)` de la lista de jugadores, la `key` pasa al `ListItem` y el `ListItemButton` queda dentro, sin otros cambios:

```tsx
            {visible.map((p) => (
              <ListItem key={p.id} disablePadding>
                <ListItemButton component={RouterLink} to={`/jugadores/${p.id}`}>
                  {/* the existing children of the ListItemButton, unchanged */}
                </ListItemButton>
              </ListItem>
            ))}
```

(El comentario es un marcador del plan; deja los hijos actuales y no escribas el comentario.)

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → todo PASS (los tests de chips usan `within(screen.getByRole('list'))` y siguen funcionando).

---

## Task 2: `<li>` en la lista de Equipos (#71)

**Files:**
- Modify: `src/teams/TeamsPage.test.tsx`
- Modify: `src/teams/TeamsPage.tsx`

- [x] **Step 1: Test (rojo)**

Cambia el import de Testing Library a `import { act, render, screen, within } from '@testing-library/react'` (`act` lo usa Task 5). Al final del archivo:

```ts
test('each team is a list item that holds its link', async () => {
  renderPage()
  await screen.findByText('MTY AC Rojo')
  const list = screen.getByRole('list')
  const links = within(list).getAllByRole('link')
  expect(links).toHaveLength(2)
  for (const link of links) expect(link.closest('li')).not.toBeNull()
  expect(list.querySelectorAll(':scope > a')).toHaveLength(0)
})
```

(Los dos equipos del `beforeEach` comparten categoría, así que hay un solo `List`. El `ListSubheader` ya es un `<li>`: por eso el test cuenta links, no `listitem`.)

Run: `pnpm exec vitest run src/teams/TeamsPage.test.tsx -t "list item that holds"` → FAIL (`link.closest('li')` es `null`).

- [x] **Step 2: Implementar**

Importa `ListItem` y, en el `list.map((t) => …)`, envuelve el `ListItemButton` igual que en Task 1:

```tsx
          {list.map((t) => (
            <ListItem key={t.id} disablePadding>
              <ListItemButton component={RouterLink} to={`/equipos/${t.id}`}>
                <ListItemText
                  primary={t.name}
                  secondary={`${t.color ?? 'Sin color'} · ${t.coach ?? 'Sin coach'} · ${t.player_count} jugadores`}
                />
              </ListItemButton>
            </ListItem>
          ))}
```

Run: `pnpm exec vitest run src/teams/TeamsPage.test.tsx` → todo PASS.

---

## Task 3: `<li>` en las listas de Quién debe (#71)

**Files:**
- Modify: `src/payments/DebtorsPage.test.tsx`
- Modify: `src/payments/DebtorsPage.tsx`

- [x] **Step 1: Test (rojo)**

Al final del archivo:

```ts
test('each player in a group is a list item that holds its link', async () => {
  renderPage()
  const region = await screen.findByRole('region', { name: 'Con adeudo (1)' })
  const list = within(region).getByRole('list')
  const items = within(list).getAllByRole('listitem')
  expect(items).toHaveLength(1)
  expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/jugadores/p1')
  expect(document.querySelectorAll('ul > a')).toHaveLength(0)
})
```

(Usa el fixture por defecto: Ana `p1` es la única con adeudo. Si F cambió el nombre accesible de la región o el fixture, ajusta el `name` de la región y el id; el comportamiento a fijar es "un `<li>` por deudor, con su link dentro".)

Run: `pnpm exec vitest run src/payments/DebtorsPage.test.tsx -t "list item that holds"` → FAIL (no hay `listitem`).

- [x] **Step 2: Implementar**

Importa `ListItem`. En el componente que renderiza el link de cada jugador (`PlayerLink` en `24c14a4`), envuelve el `ListItemButton` completo —con todas las props que tenga después de F (`divider`, `sx`, `aria-label`, `aria-describedby`, …) y sus hijos— en `<ListItem disablePadding>…</ListItem>`. Forma en `24c14a4`:

```tsx
    <ListItem disablePadding>
      <ListItemButton component={RouterLink} to={`/jugadores/${player.id}`} divider sx={{ display: 'block' }}>
        <ListItemText primary={player.full_name} secondary={playerCategoryText(player)} />
        {children}
      </ListItemButton>
    </ListItem>
```

Si F dejó un elemento con `id` para `aria-describedby` **fuera** del `ListItemButton`, ese elemento también va dentro del `ListItem` (un `<ul>` solo puede tener `<li>` como hijos).

Run: `pnpm exec vitest run src/payments/DebtorsPage.test.tsx` → todo PASS (incluye `admin and readonly see the same read-only page`, que exige cero `button`: `ListItem` no agrega ninguno).

- [x] **Step 3: Commit de las tres listas**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-h-lists-a11y.md src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx src/teams/TeamsPage.tsx src/teams/TeamsPage.test.tsx src/payments/DebtorsPage.tsx src/payments/DebtorsPage.test.tsx
git -C $WT commit -m "fix: wrap list links in list items on Jugadores, Equipos and Quién debe (#71)" -m "The MUI lists rendered <a> elements directly inside <ul>, which is invalid markup and made screen readers announce an empty list. Each link now sits in a ListItem with disablePadding, so nothing changes visually." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: "Cargando…" en Jugadores (#23)

**Files:**
- Modify: `src/players/PlayersPage.test.tsx`
- Modify: `src/players/PlayersPage.tsx`

- [ ] **Step 1: Test (rojo)**

```ts
test('the first load and a retry show Cargando… until the players arrive', async () => {
  let finishRetry!: (rows: PlayerRow[]) => void
  mocks.fetchPlayers
    .mockRejectedValueOnce(new Error('boom'))
    .mockReturnValueOnce(new Promise<PlayerRow[]>((r) => { finishRetry = r }))
  const user = userEvent.setup()
  renderPage()
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByLabelText('Buscar por nombre')).not.toBeInTheDocument()
  await act(async () => finishRetry([player({ id: 'p1', full_name: 'Ana Ruiz' })]))
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx -t "Cargando"` → FAIL (no hay "Cargando…"; se ven los filtros).

- [ ] **Step 2: Implementar**

1. Agrega `const [loaded, setLoaded] = useState(false)` junto a `loadError`.
2. En el `.then` del efecto de carga, después de `setPlayers(rows)`, agrega `setLoaded(true)`.
3. En el JSX, el bloque `loadError ? <LoadError onRetry={handleRetry} /> : (<>filtros + lista</>)` pasa a tener un caso intermedio:

```tsx
      {loadError ? (
        <LoadError onRetry={handleRetry} />
      ) : !loaded ? (
        <Typography sx={{ mt: 2 }}>Cargando…</Typography>
      ) : (
        /* the existing fragment with the filters, the empty-filters message and the list, unchanged */
      )}
```

(Marcador del plan: deja el fragmento existente. `handleRetry` no cambia: tras un error `loaded` sigue en `false`, así que el reintento muestra "Cargando…".) El botón "Exportar a Excel" vive en el encabezado y no depende de este bloque; sigue deshabilitado mientras no hay jugadores visibles.

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx` → todo PASS.

---

## Task 5: "Cargando…" en Equipos (#23)

**Files:**
- Modify: `src/teams/TeamsPage.test.tsx`
- Modify: `src/teams/TeamsPage.tsx`

- [ ] **Step 1: Test (rojo)**

```ts
test('the first load and a retry show Cargando… until the teams arrive', async () => {
  let finishRetry!: (rows: TeamRow[]) => void
  mocks.fetchTeams
    .mockRejectedValueOnce(new Error('boom'))
    .mockReturnValueOnce(new Promise<TeamRow[]>((r) => { finishRetry = r }))
  const user = userEvent.setup()
  renderPage()
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  await act(async () => finishRetry([team({ id: 't1', name: 'MTY AC Rojo' })]))
  expect(await screen.findByText('MTY AC Rojo')).toBeInTheDocument()
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/teams/TeamsPage.test.tsx -t "Cargando"` → FAIL (la página queda en blanco).

- [ ] **Step 2: Implementar**

Después de `{loadError && <LoadError onRetry={handleRetry} />}` agrega:

```tsx
      {!loaded && !loadError && <Typography sx={{ mt: 2 }}>Cargando…</Typography>}
```

Run: `pnpm exec vitest run src/teams/TeamsPage.test.tsx` → todo PASS (incluye `empty active season shows an explanatory state`: con la carga terminada `loaded` es `true` y sale el mensaje de vacío).

- [ ] **Step 3: Suite completa, tipos y lint**

Run: `pnpm exec vitest run` → `B_files` archivos, `B_tests + 5` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-h-lists-a11y.md src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx src/teams/TeamsPage.tsx src/teams/TeamsPage.test.tsx
git -C $WT commit -m "fix: show Cargando… while the players and teams lists load or retry (#23)" -m "After Reintentar, Equipos rendered blank and Jugadores showed its filters over an empty list until the response arrived. Both now show the same Cargando… as the detail pages." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** SHAs, `B_files`/`B_tests` y conteos finales, salida de cada rojo y verde, y **cada adaptación** que hiciste por cambios de E/F/G (archivo, qué fragmento no encajaba y cómo quedó).

---

## Verificación en navegador (orquestador, después de la revisión limpia)

Dev server en `$WT`, sesión admin persistente de Playwright. Nada escribe en la base.

- [ ] **Listas (#71):** en `/` (Jugadores), `/equipos` y `/quien-debe`, `document.querySelectorAll('ul > a').length === 0` y `document.querySelectorAll('ul > li > a').length` igual al número de filas visibles. Captura de cada página: el aspecto es el mismo de antes (sin padding extra, divisores iguales en Quién debe).
- [ ] **Cargando… al reintentar (#23):** con `page.route` haz fallar (`route.abort()`) la primera petición a `/rest/v1/players_with_category` y retrasa ~2 s la segunda (`setTimeout` + `route.continue()`). En `/`: aparece "No se pudo cargar la información." → Reintentar → se ve "Cargando…" (sin filtros) → aparece la lista. Igual en `/equipos` con `/rest/v1/teams_with_meta` (la vista de `fetchTeams` en `24c14a4`; si G la cambió, confírmala en la pestaña de red).

## Discrepancias

- **Quién debe ya cumple #23.** `handleRetry` de `DebtorsPage` pone `groups` en `null` y la página muestra "Cargando…"; el issue solo nombra Jugadores y Equipos. Aquí solo recibe el arreglo de #71.
- **Plan escrito antes de los merges de E, F y G.** Los fragmentos de código son los de `24c14a4`; el comportamiento fijado por los tests no depende de lo que E, F o G hagan por dentro. Las adaptaciones las reporta el implementer.
