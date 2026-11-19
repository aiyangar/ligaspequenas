# Lote N — Foto del jugador con cero filas y ficha que se refresca al guardar (#119, #130) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Dos arreglos en la ficha del jugador: subir o quitar la foto detecta cuando RLS no deja actualizar la fila (cero filas) y lo reporta como error, borrando el objeto recién subido si era una foto nueva (#119); y después de guardar una edición la ficha vuelve a leer al jugador, así la categoría, el selector de Equipo y sus reglas siguen a lo guardado sin recargar la página y sin pisar lo que el usuario siga escribiendo (#130).

**Architecture:**
- **#119:** en `players.ts`, un helper privado `setPhotoPath(id, photoPath, opts)` hace `update({ photo_path }).eq('id', id).select('id')` y devuelve `string | null` (mensaje de error o `null`), igual que `updateDocument` en `documents.ts`: error de PostgREST → `documentErrorMessage(error.message, opts)`; cero filas → `NO_PERMISSION_MESSAGE`. `uploadPlayerPhoto` y `removePlayerPhoto` lo usan. En la subida, cualquier fallo del update (error o cero filas) borra el objeto recién subido solo si el jugador no tenía foto (`player.photo_path === null`), exactamente la regla actual y la de `uploadDocument`. `NO_PERMISSION_MESSAGE` pasa a exportarse desde `documents.ts` (una palabra; ya es el texto que usa `updateDocument`).
- **#130:** `PlayerFormPage` gana `refreshRow(playerId)`: `fetchPlayer` → `setRow` (nunca `setValues`), y si falla, `Error: no se pudo actualizar la vista. Recarga la página.`. Lo usan el guardado de una edición (nuevo), la foto y el cambio de equipo (los dos ya tenían ese mismo bloque copiado). Como solo cambia `row`, lo que el usuario tecleó después de guardar se conserva (el mismo cuidado que el test de la foto de #57.3).

**Tech Stack:** React 19.2, MUI 9, react-router-dom 7, supabase-js 2, Vitest 4.1.9 + Testing Library + user-event 14, TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` (§1 lote N, §2 decisiones #119 y #130, §3 verificación en navegador). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Patrón de referencia: `src/documents/documents.ts` (`updateDocument` l.128–138 y `uploadDocument` l.161–177).

## Global Constraints

- Rama `fix/player-photo-zero-rows-and-refresh`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-photo-zero-rows-and-refresh` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base ni Storage. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git apply`.
- **Archivos permitidos** (solo estos): `src/players/players.ts`, `src/players/players.test.ts`, `src/players/PlayerFormPage.tsx`, `src/players/PlayerFormPage.test.tsx`, `src/documents/documents.ts` (**solo** la palabra `export` en `NO_PERMISSION_MESSAGE`) y este plan. **No** cambies `updatePlayer` (ver Discrepancias). Antes de cada commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Paralelo:** L, M, N, O y P corren a la vez en worktrees distintos y no comparten archivos (verificado por el planner: L toca `supabase/functions/invite-user/*` y `src/users/*`; M `src/teams/*`; N `src/players/*` y `src/documents/documents.ts`; O `src/payments/*`; P `ops/backup/*`). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `9669e97`: **48 archivos, 538 tests**. Este lote agrega **0 archivos y +5 tests** (Task 1: 3; Task 2: 2).
- **Verificación en navegador:** la hace el orquestador (sección final), no el implementer.

## Review Focus

- **Cero filas al subir una foto nueva** → error de permiso **y** el objeto recién subido se borra (sin huérfanos en Storage); al **reemplazar** una foto existente no se borra nada (el objeto es el mismo path, sobrescrito por `upsert`) (Task 1).
- **Cero filas al quitar** → error de permiso en vez de éxito silencioso (Task 1). El orden sigue siendo "borrar el objeto, luego limpiar `photo_path`"; ver Discrepancias.
- **`updatePlayer` sigue igual:** su cadena `update().eq()` sin `.select` no cambia; el mock de `updateEq` sirve a las dos formas (Task 1, test `updatePlayer updates by id and returns ok` sin tocar).
- **Guardar refresca categoría y Equipo sin pisar lo tecleado:** con el refresco en vuelo, el usuario cambia el nombre; al llegar la fila nueva el nombre y el Estatus tecleados se quedan, y la categoría, el Equipo deshabilitado y su ayuda `Jugador de baja: no asignable.` siguen a la fila guardada (Task 2).
- **Un refresco fallido tras guardar** no deshace el guardado: queda el toast `Cambios guardados` y aparece el aviso de error de vista, como ya pasa con la foto y el equipo (Task 2).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/player-photo-zero-rows-and-refresh`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 48 y 538, todo verde).

---

## Task 1: La foto detecta cero filas (#119)

**Files:**
- Modify: `src/players/players.test.ts` (mocks l.5–21 y `beforeEach` l.46–52; tests `uploadPlayerPhoto upserts…`, `…rolls back a new photo when the update fails`, `…does not roll back a replacement`, `removePlayerPhoto removes the object first…`; 3 tests nuevos al final)
- Modify: `src/players/players.ts` (import l.4; helper nuevo antes de `uploadPlayerPhoto`; cuerpo de `uploadPlayerPhoto` l.202–206 y de `removePlayerPhoto` l.217–219)
- Modify: `src/documents/documents.ts` (l.61, solo `export`)

**Interfaces:**
- Consumes: `NO_PERMISSION_MESSAGE` (`'No tienes permiso para esta acción.'`), ahora exportado por `src/documents/documents.ts`.
- Produces: sin cambios de firma: `uploadPlayerPhoto(player, file, consentGranted): Promise<UpdatePlayerResult>` y `removePlayerPhoto(player): Promise<UpdatePlayerResult>`.

- [x] **Step 1.1: Ajustar los mocks y escribir los tests (rojo)**

En `src/players/players.test.ts`:

1. En `vi.hoisted`, agrega `updateSelect: vi.fn(),` después de `updateEq: vi.fn(),`.
2. En `beforeEach`, reemplaza el bloque:

```ts
  // write chains: from().insert().select('id').single()  and  from().update().eq()
  mocks.single.mockResolvedValue({ data: { id: 'newid' }, error: null })
  mocks.insert.mockReturnValue({ select: mocks.select })
  mocks.updateEq.mockImplementation(async () => {
    mocks.calls.push('update')
    return { error: null }
  })
```

por:

```ts
  // write chains: from().insert().select('id').single(), from().update().eq() and from().update().eq().select('id')
  mocks.single.mockResolvedValue({ data: { id: 'newid' }, error: null })
  mocks.insert.mockReturnValue({ select: mocks.select })
  mocks.updateSelect.mockResolvedValue({ data: [{ id: 'p1' }], error: null })
  mocks.updateEq.mockImplementation(() => {
    mocks.calls.push('update')
    return Object.assign(Promise.resolve({ error: null }), { select: mocks.updateSelect })
  })
```

(`updatePlayer` hace `await …eq()`; las escrituras de la foto encadenan `.select('id')`. El mock devuelve una promesa con `select` para servir a las dos.)

3. En `uploadPlayerPhoto upserts to tenant/player/photo, then sets photo_path` y en `removePlayerPhoto removes the object first, then clears photo_path`, justo antes de su `expect(mocks.calls)…`, agrega `  expect(mocks.updateSelect).toHaveBeenCalledWith('id')`.
4. En `uploadPlayerPhoto rolls back a new photo when the update fails`, reemplaza `mocks.updateEq.mockResolvedValueOnce({ error: { message: 'consent_required: x' } })` por `mocks.updateSelect.mockResolvedValueOnce({ data: null, error: { message: 'consent_required: x' } })`.
5. En `uploadPlayerPhoto does not roll back a replacement`, reemplaza `mocks.updateEq.mockResolvedValueOnce({ error: { message: 'boom' } })` por `mocks.updateSelect.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })`.
6. Al final del archivo:

```ts
test('uploadPlayerPhoto rolls back a new photo when RLS updates zero rows', async () => {
  mocks.updateSelect.mockResolvedValueOnce({ data: [], error: null })
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, photo('image/jpeg', 1), true)
  expect(res).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
  expect(mocks.remove).toHaveBeenCalledWith(['t1/p1/photo'])
  expect(mocks.calls).toEqual(['upload', 'update', 'remove'])
})

test('uploadPlayerPhoto keeps a replaced photo when RLS updates zero rows', async () => {
  mocks.updateSelect.mockResolvedValueOnce({ data: [], error: null })
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: 't1/p1/photo' }, photo('image/jpeg', 1), true)
  expect(res).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('removePlayerPhoto reports zero updated rows as a permission error', async () => {
  mocks.updateSelect.mockResolvedValueOnce({ data: [], error: null })
  const res = await removePlayerPhoto({ id: 'p1', photo_path: 't1/p1/photo' })
  expect(res).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
})
```

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: FAIL en 6 tests (verificado por el planner): `uploadPlayerPhoto upserts…` y `removePlayerPhoto removes the object first…` (`updateSelect` no llamado), `uploadPlayerPhoto rolls back a new photo when the update fails` (hoy el error viaja en `updateEq`, que ya no lo trae), y los 3 nuevos (hoy cero filas da `{ ok: true }`). 22 pasan, incluido `updatePlayer updates by id and returns ok`.

- [x] **Step 1.2: Implementar**

1. En `src/documents/documents.ts` l.61, cambia `const NO_PERMISSION_MESSAGE = 'No tienes permiso para esta acción.'` por `export const NO_PERMISSION_MESSAGE = 'No tienes permiso para esta acción.'`. Nada más en ese archivo.
2. En `src/players/players.ts`, agrega `NO_PERMISSION_MESSAGE` al import de `'../documents/documents'`:

```ts
import { NO_PERMISSION_MESSAGE, PLAYER_FILES_BUCKET, documentErrorMessage, playerFilePath, removeFile } from '../documents/documents'
```

3. Justo antes de `export async function uploadPlayerPhoto(` agrega:

```ts
async function setPhotoPath(
  id: string,
  photoPath: string | null,
  opts: { consentGranted?: boolean } = {},
): Promise<string | null> {
  const { data, error } = await supabase.from('players').update({ photo_path: photoPath }).eq('id', id).select('id')
  if (error) return documentErrorMessage(error.message, opts)
  // RLS filters the row instead of raising, so a forbidden update looks like a success on zero rows
  if (!data || data.length === 0) return NO_PERMISSION_MESSAGE
  return null
}

```

4. En `uploadPlayerPhoto`, reemplaza:

```ts
  const { error } = await supabase.from('players').update({ photo_path: path }).eq('id', player.id)
  if (error) {
    if (player.photo_path === null) await removeFile(path)
    return { ok: false, error: documentErrorMessage(error.message, { consentGranted }) }
  }
```

por:

```ts
  const error = await setPhotoPath(player.id, path, { consentGranted })
  if (error) {
    if (player.photo_path === null) await removeFile(path)
    return { ok: false, error }
  }
```

5. En `removePlayerPhoto`, reemplaza:

```ts
  const { error } = await supabase.from('players').update({ photo_path: null }).eq('id', player.id)
  if (error) return { ok: false, error: documentErrorMessage(error.message) }
```

por:

```ts
  const error = await setPhotoPath(player.id, null)
  if (error) return { ok: false, error }
```

Comprobación: `grep -n "update({ photo_path" src/players/players.ts` → una sola línea (dentro de `setPhotoPath`). `git -C $WT diff -- src/documents/documents.ts` → solo el `export`.

Run: `pnpm exec vitest run src/players src/documents`
Expected: todo PASS (`players.test.ts`: 28 tests).

Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint src/players src/documents` → exit 0.

- [x] **Step 1.3: Commit**

`git -C $WT status -s` → solo `players.ts`, `players.test.ts`, `documents.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-n-player-photo-refresh.md src/players/players.ts src/players/players.test.ts src/documents/documents.ts
```

```bash
git -C $WT commit -m "fix: detect a zero-row photo_path update on player photo upload and removal (#119)" -m "RLS filters the players row instead of raising, so a forbidden photo write looked like a success. The photo writes now select the id back, report zero rows as a permission error and, for a new photo, remove the object just uploaded, as uploadDocument does." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Guardar una edición refresca la ficha (#130)

**Files:**
- Modify: `src/players/PlayerFormPage.test.tsx` (test `saving an edit keeps the same page instance and shows the toast` l.286–293; 2 tests nuevos después de él)
- Modify: `src/players/PlayerFormPage.tsx` (`refreshRow` nuevo antes de `handleRetry`; `handleSubmit` l.177; `handlePhotoChanged` l.196–205; `handleTeamChange` l.217–222)

- [ ] **Step 2.1: Escribir los tests (rojo)**

En `src/players/PlayerFormPage.test.tsx`, reemplaza el test `saving an edit keeps the same page instance and shows the toast` completo por estos tres:

```tsx
test('saving an edit keeps the same page instance and shows the toast', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  expect(screen.getByDisplayValue('Ana Ruiz')).toBeInTheDocument()
})

test('saving an edit refetches the player so the category and the team selector follow the saved row', async () => {
  const refreshed = deferred<PlayerRow>()
  mocks.fetchPlayer.mockResolvedValueOnce(ana).mockReturnValueOnce(refreshed.promise)
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await waitFor(() => expect(screen.getByLabelText('Equipo')).toBeEnabled())
  const form = within(screen.getByRole('button', { name: 'Guardar' }).closest('form')!)
  await user.selectOptions(form.getByRole('combobox', { name: 'Estatus' }), 'baja')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  const name = screen.getByLabelText(/Nombre completo/)
  await user.clear(name)
  await user.type(name, 'Ana María Ruiz')
  await act(async () => {
    refreshed.resolve({ ...ana, status: 'baja', category_id: 'cat2', category_name: 'Infantil Menor', category_year: 2 })
  })
  expect(await screen.findByText(/Infantil Menor \(2do\)/)).toBeInTheDocument()
  expect(screen.getByLabelText('Equipo')).toBeDisabled()
  expect(screen.getByText('Jugador de baja: no asignable.')).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('Ana María Ruiz')
  expect(form.getByRole('combobox', { name: 'Estatus' })).toHaveValue('baja')
  expect(mocks.fetchPlayer).toHaveBeenNthCalledWith(2, 'p1')
})

test('a failed refresh after saving an edit keeps the toast and shows an error-severity message', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  mocks.fetchPlayer.mockRejectedValueOnce(new Error('boom'))
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  const msg = await screen.findByText('Error: no se pudo actualizar la vista. Recarga la página.')
  expect(msg.closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorError')
  expect(screen.getByDisplayValue('Ana Ruiz')).toBeInTheDocument()
})
```

(El `Estatus` se busca dentro del `<form>` porque la sección de Documentos tiene un select "Estatus" por documento.)

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected (verificado por el planner): FAIL en los 3 tests de arriba — `saving an edit keeps the same page instance…` (`expected "vi.fn()" to be called 2 times, but got 1 times`), `saving an edit refetches the player…` (`Unable to find an element with the text: /Infantil Menor \(2do\)/`), `a failed refresh after saving an edit…` (`Unable to find an element with the text: Error: no se pudo actualizar la vista…`) — **más** `edit mode loads and shows the documents section`, que falla solo en el rojo porque el `mockRejectedValueOnce` que el test anterior no consumió se queda en la cola de `fetchPlayer` (`vi.clearAllMocks` no vacía las respuestas `*Once`). Desaparece en verde, cuando el refresco sí lo consume. El resto pasa.

- [ ] **Step 2.2: Implementar `refreshRow` y usarlo**

En `src/players/PlayerFormPage.tsx`:

1. Justo antes de `  function handleRetry() {` agrega:

```tsx
  // only the row is replaced: typed values stay, while category and team rules follow the saved data
  async function refreshRow(playerId: string) {
    try {
      const refreshed = await fetchPlayer(playerId)
      if (refreshed) setRow(refreshed)
    } catch {
      setMessage('Error: no se pudo actualizar la vista. Recarga la página.')
    }
  }

```

2. En `handleSubmit`, rama `editing`, después de `      showToast('Cambios guardados')` agrega `      await refreshRow(id!)`.
3. En `handlePhotoChanged`, reemplaza el bloque `try { const refreshed = await fetchPlayer(row.id) … } catch { … }` por `    await refreshRow(row.id)`.
4. En `handleTeamChange`, reemplaza el mismo bloque `try … catch` del final por `    await refreshRow(row.id)`.

Nunca llames `setValues` desde `refreshRow`.

Comprobación: `grep -c "fetchPlayer(" src/players/PlayerFormPage.tsx` → `2` (el efecto de carga y `refreshRow`). `grep -c "no se pudo actualizar la vista" src/players/PlayerFormPage.tsx` → `1`.

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: 36 tests PASS (incluidos `a photo upload refetches the player, keeps typed edits…`, `a failed refresh after changing team…` y `an in-flight team change from one player never lands on the next player's page`, sin tocarlos).

- [ ] **Step 2.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 5` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 2.4: Commit**

`git -C $WT status -s` → solo `PlayerFormPage.tsx`, `PlayerFormPage.test.tsx` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-n-player-photo-refresh.md src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
```

```bash
git -C $WT commit -m "fix: refetch the player after saving an edit so category and team follow it (#130)" -m "The page kept the row fetched on load, so a new birth date or a baja left the category text and the Equipo selector stale until a reload. Saving now reads the row back, like the photo and team changes do, and only replaces the row, never the values being typed." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, las salidas de los rojos (1.1, 2.1, señalando el fallo de arrastre esperado), las comprobaciones `grep` de 1.2 y 2.2, y las tres salidas verdes del Step 2.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #119` y `Closes #130`. El cuerpo menciona que `NO_PERMISSION_MESSAGE` se exportó desde `documents.ts` (única línea fuera de `src/players/`) y que `updatePlayer` queda fuera (ver Discrepancias).

- [ ] **O2. Navegador** (Playwright, sesión admin persistente, dev server en `http://localhost:5173`; desktop 1280×800 y móvil 390×844). Con el jugador de prueba de la sesión de la ola 1 (spec §3: lo crea y lo borra el orquestador; tutor y datos ficticios, consentimientos de imagen y aviso de privacidad en `fisico` para poder subir foto):
  1. **Categoría tras guardar (#130):** en la ficha, cambia la fecha de nacimiento a una de otra categoría → Guardar. Sin recargar, la línea `Categoría: …` muestra la nueva y el selector de Equipo lista los equipos de esa categoría.
  2. **Baja tras guardar (#130):** cambia Estatus a Baja → Guardar. Sin recargar, Equipo queda deshabilitado con `Jugador de baja: no asignable.`. Vuelve a Activo → Guardar → se habilita de nuevo.
  3. **No pisa lo tecleado:** Guardar e inmediatamente escribe en "Nombre completo"; el texto se queda tras el refresco (en red lenta: DevTools/`page.route` con 1–2 s de retraso sobre las lecturas de `players_with_category`).
  4. **Foto (#119, camino feliz):** subir una foto → aparece y `Quitar` se habilita; quitarla → desaparece. El caso de cero filas no se reproduce en vivo (exige quitarse permisos); lo cubren los tests de Task 1.
  5. **390 px:** la ficha no tiene scroll horizontal (`document.documentElement.scrollWidth <= 390`), el toast `Cambios guardados` cabe y el aviso de error (si aparece) no desborda.
  6. Sin errores en la consola.
  7. **Limpieza:** quitar la foto si quedó, y borrar el jugador de prueba y sus objetos con el procedimiento de la ola 1; comprobar que no quedan objetos en `player-files/<tenant>/<id>/`.

---

## Discrepancias

- **`documents.ts` fuera de la lista del spec §1.** El spec nombra `src/players/players.ts` y `PlayerFormPage*`. Para no duplicar el texto de permiso, `NO_PERMISSION_MESSAGE` se exporta desde `documents.ts` (que `players.ts` ya importa). Es una sola palabra y ningún otro lote de L–P toca ese archivo.
- **`updatePlayer` también actualiza sin `.select('id')`.** Un guardado que RLS filtra se vería como éxito (y ahora, además, la ficha se refrescaría con la fila sin cambios). No está en #119 ni #130; se propone como issue nuevo en vez de ampliar el lote.
- **Quitar foto con cero filas.** `removePlayerPhoto` borra primero el objeto y luego limpia `photo_path` (orden elegido antes, para no dejar un archivo sin referencia). Si el update diera cero filas, el objeto ya no existe y `photo_path` sigue apuntando a él. En la práctica la política de Storage niega el borrado al mismo usuario que la de `players` niega el update, así que se corta antes; el lote solo hace que ese caso diga error en vez de éxito, sin reordenar.
- **Refresco tras guardar, `#57.3`.** El spec pide "sin pisar lo que el usuario está escribiendo". `refreshRow` solo hace `setRow`; los valores del formulario (`values`) no se tocan, igual que en el refresco de la foto. El test de Task 2 lo fija con el refresco en vuelo.
