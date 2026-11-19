# Lote Q — Guardar jugador con cero filas y refrescos viejos de la ficha (#134, #145) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Dos arreglos en la ficha del jugador: un guardado que RLS filtra (cero filas, sin error de PostgREST) deja de verse como éxito y muestra `Error: No tienes permiso para esta acción.` sin toast ni refresco (#134); y cuando dos refrescos de la fila se cruzan (dos guardados seguidos, o un cambio de equipo y un guardado), solo la respuesta de la última solicitud llega a la pantalla (#145).

**Architecture:**
- **#134:** `updatePlayer` en `src/players/players.ts` encadena `.select('id')`, igual que `setPhotoPath` (mismo archivo) y `updateDocument` (`documents.ts`). Error de PostgREST → `{ ok: false, error: error.message }` (sin cambio); cero filas → `{ ok: false, error: NO_PERMISSION_MESSAGE }` (ya importado de `documents.ts` desde la ola 3). `PlayerFormPage.handleSubmit` ya trata `!result.ok` como error sin toast ni `refreshRow`; no cambia.
- **#145:** `refreshRow` en `PlayerFormPage.tsx` numera cada solicitud con un `useRef<number>` (`refreshRequest`): toma `const request = ++refreshRequest.current` antes de `fetchPlayer` y, tanto en el éxito como en el `catch`, sale sin tocar nada si `request !== refreshRequest.current`. Como los tres refrescos (guardar, foto, equipo) pasan por `refreshRow`, un solo contador los cubre. Guardar **no** se vuelve a bloquear durante el refresco (spec §2).

**Tech Stack:** React 19.2, MUI 9, react-router-dom 7, supabase-js 2, Vitest 4.1.9 + Testing Library + user-event 14, TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` (§1 lote Q, §2 decisiones #134 y #145, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Patrón de referencia: `setPhotoPath` en `src/players/players.ts` (lote N).

## Global Constraints

- Rama `fix/player-save-zero-rows-and-stale-refresh`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-save-zero-rows-and-stale-refresh` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `src/players/players.ts`, `src/players/players.test.ts`, `src/players/PlayerFormPage.tsx`, `src/players/PlayerFormPage.test.tsx` y este plan. Antes de cada commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Paralelo:** Q, S, T, U y V corren a la vez en worktrees distintos y no comparten archivos (verificado por el planner: Q `src/players/{players,PlayerFormPage}{,.test}.ts(x)`; S `ops/backup/lib/safe-error.ts` y `ops/backup/safe-error.test.ts`; T `src/payments/payments{,.test}.ts` y `src/documents/documents{,.test}.ts`; U `supabase/functions/invite-user/{http,http.test,index}.ts`; V dos `.md` de 2026-10-16). Q solo **importa** `NO_PERMISSION_MESSAGE` de `documents.ts`, no lo edita. R va **después** de Q (comparte `PlayerFormPage.tsx`). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `5effa8f`: **48 archivos, 566 tests**. Este lote agrega **0 archivos y +6 tests** (Task 1: 2; Task 2: 4).
- **Verificación en navegador:** la hace el orquestador (sección final), no el implementer.

## Review Focus

- **Cero filas al guardar** → `Error: No tienes permiso para esta acción.` como alerta, **sin** `Cambios guardados` y **sin** refresco: la fila no se vuelve a leer, así lo tecleado no se "revierte" en silencio (Task 1 + pin de página en Task 2).
- **Un error de PostgREST al guardar** sigue mostrando su texto tal cual (`error.message`); el lote no lo traduce (Task 1, `updatePlayer returns the PostgREST error message`; ver Discrepancias).
- **Dos guardados seguidos con la lectura vieja llegando al final** → queda la fila del último; Guardar sigue habilitado durante el refresco (Task 2).
- **Un refresco viejo que falla** después de que uno nuevo ya llegó no muestra `Error: no se pudo actualizar la vista…` (Task 2).
- **Refrescos de distinto origen** (cambio de equipo, luego guardar) comparten el contador: el viejo no pisa al nuevo (Task 2). La foto pasa por el mismo `refreshRow`; sin test propio (ver Discrepancias).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/player-save-zero-rows-and-stale-refresh`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 48 y 566, todo verde).

---

## Task 1: `updatePlayer` detecta cero filas (#134)

**Files:**
- Modify: `src/players/players.test.ts` (bloque `// write chains` del `beforeEach`; test `updatePlayer updates by id and returns ok`; 2 tests nuevos justo después de él)
- Modify: `src/players/players.ts` (cuerpo de `updatePlayer`)

**Interfaces:**
- Consumes: `NO_PERMISSION_MESSAGE` (`'No tienes permiso para esta acción.'`), ya importado en `players.ts` desde `../documents/documents`.
- Produces: sin cambio de firma: `updatePlayer(id: string, values: PlayerFormValues): Promise<UpdatePlayerResult>`.

- [x] **Step 1.1: Ajustar el mock y escribir los tests (rojo)**

En `src/players/players.test.ts`:

1. En `beforeEach`, el mock de `updateEq` hoy devuelve una promesa con `select` para servir a `updatePlayer` (que hacía `await …eq()`) y a la foto (`…eq().select('id')`). Ahora todas las escrituras encadenan `select`; reemplaza:

```ts
  // write chains: from().insert().select('id').single(), from().update().eq() and from().update().eq().select('id')
```

por

```ts
  // write chains: from().insert().select('id').single() and from().update().eq().select('id')
```

y, dentro de `mocks.updateEq.mockImplementation(() => { … })`, `return Object.assign(Promise.resolve({ error: null }), { select: mocks.updateSelect })` por `return { select: mocks.updateSelect }`.

2. En `updatePlayer updates by id and returns ok`, después de `expect(mocks.updateEq).toHaveBeenCalledWith('id', 'p1')` agrega `  expect(mocks.updateSelect).toHaveBeenCalledWith('id')`.

3. Justo después de ese test:

```ts
test('updatePlayer reports zero updated rows as a permission error', async () => {
  mocks.updateSelect.mockResolvedValue({ data: [], error: null })
  const result = await updatePlayer('p1', { ...emptyPlayer(), full_name: 'Ana', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' })
  expect(result).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
})

test('updatePlayer returns the PostgREST error message', async () => {
  mocks.updateSelect.mockResolvedValue({ data: null, error: { message: 'curp_format' } })
  const result = await updatePlayer('p1', { ...emptyPlayer(), full_name: 'Ana', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' })
  expect(result).toEqual({ ok: false, error: 'curp_format' })
})
```

Usa `mockResolvedValue` (no `*Once`): `vi.clearAllMocks` no vacía las respuestas `*Once` y, en rojo, `updatePlayer` no las consume, así que se filtrarían a los tests de la foto. El `beforeEach` restablece el valor por defecto en cada test.

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected (verificado por el planner): FAIL en 3 tests — `updatePlayer updates by id and returns ok` (`expected "vi.fn()" to be called with arguments: [ 'id' ]`), `updatePlayer reports zero updated rows…` (`expected { ok: true } to deeply equal { ok: false, …(1) }`) y `updatePlayer returns the PostgREST error message` (`expected { ok: true } to deeply equal { ok: false, error: 'curp_format' }`: con el mock nuevo el error viaja solo en `select`). 27 pasan, incluidos todos los de la foto.

- [x] **Step 1.2: Implementar**

En `updatePlayer`, reemplaza:

```ts
  const { error } = await supabase.from('players').update(toRecord(values)).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
```

por:

```ts
  const { data, error } = await supabase.from('players').update(toRecord(values)).eq('id', id).select('id')
  if (error) return { ok: false, error: error.message }
  // RLS filters the row instead of raising, so a forbidden save looks like a success on zero rows
  if (!data || data.length === 0) return { ok: false, error: NO_PERMISSION_MESSAGE }
  return { ok: true }
```

Comprobación: `grep -c "\.select('id')" src/players/players.ts` → `3` (insert, `setPhotoPath`, `updatePlayer`).

Run: `pnpm exec vitest run src/players/players.test.ts` → 30 tests PASS.
Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint src/players` → exit 0.

- [x] **Step 1.3: Commit**

`git -C $WT status -s` → solo `players.ts`, `players.test.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-q-player-save.md src/players/players.ts src/players/players.test.ts
```

```bash
git -C $WT commit -m "fix: report a player save that RLS filters out instead of showing success (#134)" -m "PostgREST answers an update whose row RLS hides with no error and no rows, so the page said Cambios guardados and then refetched the unchanged row. updatePlayer now selects the id back and treats zero rows as a permission error, like the photo writes and documents." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Solo el último refresco llega a la ficha (#145)

**Files:**
- Modify: `src/players/PlayerFormPage.test.tsx` (4 tests nuevos justo antes de `test('edit mode loads and shows the documents section'`)
- Modify: `src/players/PlayerFormPage.tsx` (import de `react`; `refreshRow`)

**Interfaces:**
- Consumes: `updatePlayer` de Task 1 (en la página va mockeado: `mocks.updatePlayer`).
- Produces: nada nuevo hacia fuera; `refreshRow(playerId: string): Promise<void>` conserva su firma.

- [x] **Step 2.1: Escribir los tests (rojo)**

En `src/players/PlayerFormPage.test.tsx`, justo antes de `test('edit mode loads and shows the documents section', async () => {`, agrega:

```tsx
test('a save that RLS filters out shows the permission error, no toast and no refresh', async () => {
  mocks.updatePlayer.mockResolvedValue({ ok: false, error: 'No tienes permiso para esta acción.' })
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^Error: No tienes permiso para esta acción\.$/)
  expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
  expect(mocks.fetchPlayer).toHaveBeenCalledTimes(1)
})

test('two quick saves keep the row of the last refresh even when the older one resolves last', async () => {
  const first = deferred<PlayerRow>()
  const second = deferred<PlayerRow>()
  mocks.fetchPlayer.mockResolvedValueOnce(ana).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(3))
  await act(async () => {
    second.resolve({ ...ana, status: 'baja', category_id: 'cat2', category_name: 'Infantil Menor', category_year: 2 })
  })
  expect(await screen.findByText(/Infantil Menor \(2do\)/)).toBeInTheDocument()
  await act(async () => {
    first.resolve(ana)
  })
  expect(screen.getByText(/Infantil Menor \(2do\)/)).toBeInTheDocument()
  expect(screen.queryByText(/Infantil Mayor \(1ro\)/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Equipo')).toBeDisabled()
})

test('a stale refresh that fails after a newer one succeeded shows no error', async () => {
  const first = deferred<PlayerRow>()
  const failFirst = new Promise<PlayerRow>((_, reject) => {
    void first.promise.then(() => reject(new Error('boom')))
  })
  mocks.fetchPlayer.mockResolvedValueOnce(ana).mockReturnValueOnce(failFirst).mockResolvedValueOnce(ana)
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2))
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(3))
  await act(async () => {
    first.resolve(ana)
  })
  expect(screen.queryByText('Error: no se pudo actualizar la vista. Recarga la página.')).not.toBeInTheDocument()
})

test('a team change refresh that resolves after a newer save refresh does not overwrite it', async () => {
  const teamRefresh = deferred<PlayerRow>()
  const saveRefresh = deferred<PlayerRow>()
  mocks.fetchPlayer.mockResolvedValueOnce(ana).mockReturnValueOnce(teamRefresh.promise).mockReturnValueOnce(saveRefresh.promise)
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.selectOptions(await screen.findByLabelText('Equipo'), 'team9')
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2))
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(3))
  await act(async () => {
    saveRefresh.resolve({ ...ana, team_id: 'team9', team_name: 'MTY AC Rojo' })
  })
  await waitFor(() => expect(screen.getByLabelText('Equipo')).toHaveValue('team9'))
  await act(async () => {
    teamRefresh.resolve(ana)
  })
  expect(screen.getByLabelText('Equipo')).toHaveValue('team9')
})
```

(El `beforeEach` ya hace `mocks.fetchPlayer.mockReset()`, así que las colas `*Once` de `fetchPlayer` no se filtran entre tests.)

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected (verificado por el planner): FAIL en 3 tests — `two quick saves…` (en `expect(screen.getByText(/Infantil Menor \(2do\)/))` **después** de `first.resolve(ana)`: `Unable to find an element with the text: /Infantil Menor \(2do\)/`), `a stale refresh that fails…` (`expect(element).not.toBeInTheDocument()` con el aviso `Error: no se pudo actualizar la vista…`) y `a team change refresh…` (`expect(element).toHaveValue(team9)`). 37 pasan, incluido `a save that RLS filters out…`: es un pin del comportamiento de la página, que ya trata `!ok` como error; el rojo de #134 está en Task 1.

- [x] **Step 2.2: Implementar el contador**

En `src/players/PlayerFormPage.tsx`:

1. `import { useEffect, useState } from 'react'` → `import { useEffect, useRef, useState } from 'react'`.
2. Reemplaza el bloque completo de `refreshRow` (el comentario `// only the row is replaced: …` y la función) por:

```tsx
  const refreshRequest = useRef(0)

  // only the row is replaced: typed values stay, while category and team rules follow the saved data
  async function refreshRow(playerId: string) {
    // saves, photo and team changes can overlap; only the latest request may touch the page
    const request = ++refreshRequest.current
    try {
      const refreshed = await fetchPlayer(playerId)
      if (request !== refreshRequest.current) return
      if (refreshed) setRow(refreshed)
    } catch {
      if (request !== refreshRequest.current) return
      setMessage('Error: no se pudo actualizar la vista. Recarga la página.')
    }
  }
```

`handleSubmit`, `handlePhotoChanged` y `handleTeamChange` no cambian (siguen llamando `await refreshRow(…)`); `setSubmitting(false)` sigue antes del refresco.

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx` → 40 tests PASS.

- [x] **Step 2.3: Mutación (cada guarda está fijada)**

Aparta la versión verde: `G=$(mktemp)` y `cp $WT/src/players/PlayerFormPage.tsx "$G"` (no uses `checkout --`: descartaría todo el Step 2.2, que aún no está commiteado). Quita temporalmente la línea `if (request !== refreshRequest.current) return` **del `catch`**. Run → FAIL solo en `a stale refresh that fails after a newer one succeeded shows no error` (verificado por el planner). Restaura con `cp "$G" $WT/src/players/PlayerFormPage.tsx` y `rm "$G"`. Run → 40 PASS.

- [x] **Step 2.4: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 6` tests, todo verde (planner: 48 y 572). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [x] **Step 2.5: Commit**

`git -C $WT status -s` → solo `PlayerFormPage.tsx`, `PlayerFormPage.test.tsx` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-q-player-save.md src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
```

```bash
git -C $WT commit -m "fix: ignore stale player refreshes after overlapping saves and team changes (#145)" -m "Guardar stays enabled while the row is read back, so two saves, or a team change and a save, could resolve out of order and leave the older row on screen. refreshRow now numbers its requests and only the latest one may set the row or show the refresh error." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, las salidas de los rojos (1.1 y 2.1, señalando el pin que pasa), la comprobación `grep` de 1.2, la mutación de 2.3 y las tres salidas verdes de 2.4.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #134` y `Closes #145`. El cuerpo dice que `updatePlayer` sigue devolviendo el texto de PostgREST tal cual en el camino de error (ver Discrepancias) y que R (`update/shared-flash-helper`) se corta **después** de este merge.

- [ ] **O2. Navegador** (Playwright, sesión admin persistente, dev server en `http://localhost:5173`; desktop 1280×800 y móvil 390×844). Con un jugador de prueba que **crea y borra el orquestador** (procedimiento de la ola 1: tutor y datos ficticios):
  1. **Guardado normal:** en la ficha cambia la fecha de nacimiento a una de otra categoría → Guardar → toast `Cambios guardados`, y sin recargar la línea `Categoría: …` y el selector de Equipo siguen a la nueva categoría.
  2. **Dos guardados con la lectura vieja llegando al final (#145):** con la ficha ya cargada y Equipo habilitado (jugador Activo), instala la ruta **después** de la carga inicial. Solo la **primera** lectura `GET …/rest/v1/players_with_category*` que coincida se lee en el momento y se entrega tarde; las demás pasan sin tocar:

     ```js
     let delayed = false
     await page.route('**/rest/v1/players_with_category*', async (route) => {
       if (delayed || route.request().method() !== 'GET') return route.continue()
       delayed = true
       const r = await route.fetch()
       await new Promise((resolve) => setTimeout(resolve, 3000))
       await route.fulfill({ response: r })
     })
     ```

     (`route.fetch()` lee la fila **en ese momento**, con Estatus Baja, y la entrega 3 s después; un `route.continue()` demorado leería el estado nuevo y no probaría nada.) Pasos: Estatus → Baja → Guardar; mientras esa lectura está retenida (Guardar sigue habilitado), Estatus → Activo → Guardar. La segunda lectura llega primero (Activo). Esperado cuando llega la respuesta vieja: Equipo **sigue habilitado** y **no** aparece `Jugador de baja: no asignable.` (sin el arreglo pasaría a deshabilitado). Después `await page.unroute('**/rest/v1/players_with_category*')`, recarga la página y comprueba el estado final: Estatus Activo y Equipo habilitado.
  3. **Cero filas (#134):** no se reproduce en vivo (exige quitarse permisos sobre `players`); lo cubren los tests de Task 1 y el pin de página de Task 2.
  4. **390 px:** sin scroll horizontal (`document.documentElement.scrollWidth <= 390`), el toast cabe.
  5. Sin errores en la consola.
  6. **Limpieza:** borrar el jugador de prueba y sus objetos con el procedimiento de la ola 1; comprobar que no quedan filas ni objetos en `player-files/<tenant>/<id>/`.

---

## Discrepancias

- **Texto del error de PostgREST al guardar (decisión del planner).** El spec §2 dice "igual que `setPhotoPath`/`updateDocument`", que además traducen el error con `documentErrorMessage`. Para #134 solo se pide el caso de cero filas; `updatePlayer` sigue devolviendo `error.message` sin traducir (lo que ya mostraba la ficha, p. ej. errores de CHECK de la CURP). Traducirlo cambiaría textos de validación existentes; si se quiere, va en un issue aparte.
- **Un refresco viejo que falla se ignora (decisión del planner).** El spec dice "solo aplica la respuesta de la última solicitud". Se lee como respuesta tanto el éxito como el fallo: si la última lectura ya llegó bien, un fallo de una anterior no pone el aviso de error. Si la **última** falla, el aviso sale como hoy.
- **Foto sin test propio de carrera.** `handlePhotoChanged` usa el mismo `refreshRow`, así que el contador la cubre; los tests fijan el cruce guardar/guardar y equipo/guardar. Un tercer test con la foto repetiría el mismo camino.
- **Carga inicial fuera del contador.** El efecto de carga (`fetchPlayer` al montar y en Reintentar) tiene su propio `active` y no pasa por `refreshRow`; no se toca.
- **Mock de `updateEq` simplificado.** Tras el lote ninguna escritura hace `await …eq()` a secas, así que el mock deja de devolver una promesa con `select` y devuelve solo `{ select }`. Por eso `updatePlayer returns the PostgREST error message` falla en rojo aunque el código de producción ya devolvía `error.message`.
