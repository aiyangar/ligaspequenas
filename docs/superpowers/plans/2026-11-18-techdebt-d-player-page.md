# Lote D — Pulido de la ficha del jugador (#54.1 #54.2 #57 #58 #61 #62 #35 y la parte de página de #50) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en el PR de docs del barrido **antes** de despachar. El implementer los lee desde su worktree y marca `- [x]` en su copia del plan al terminar cada paso.

**Goal:** En la ficha del jugador, el formulario y su Guardar van primero y Equipo, Foto, Documentos y Pagos van debajo como controles y secciones que guardan solos (#54.1); hay un solo Snackbar, y un toast que reemplaza a otro dura sus 4 s completos (#54.2); el aviso de éxito no reaparece al recargar (#61); al quitar la foto la imagen firmada se suelta antes del refetch (#62); la foto muestra un spinner mientras guarda (#58.2) y pide recargar los documentos si falla (#50, foto); la página recarga los documentos cuando un cambio de documento falla (#50, página); y los tests fijan la guardia de la foto, el re-firmado, el cableado de la página, la traducción de errores de Storage y el cambio de equipo en vuelo (#57, #58.1, #35).

**Architecture:** `PlayerFormPage` deja de ser un `<form>` entero: un `Box` con `Stack` contiene el `h1`, el `<form>` (campos, mensaje, Guardar) y después, fuera del form, el select de Equipo y tres secciones: Foto (sección nueva con `h2` "Foto" que envuelve a `PlayerPhoto`), Documentos y Pagos. Un único estado `toast` alimenta el único Snackbar, con `key={toastKey}` (un contador que sube en cada `showToast`) para que un mensaje nuevo remonte el Snackbar y reinicie su `autoHideDuration`; el flash del alta se lee una vez en el `useState` inicial (la instancia es nueva por `key={id}`) y se borra del historial con `navigate(pathname, { replace: true, state: null })`; guardar una edición ya no navega, solo muestra el toast. `PlayerPhoto` gana `onReload?`, un `CircularProgress` mientras `busy` y limpia `url` en cuanto `removePlayerPhoto` responde `ok`.

**Tech Stack:** React 19 / React Router 7 (`createMemoryRouter` en tests) / MUI 9 / Vitest 4 + Testing Library / TypeScript (`tsc -b`) / ESLint / pnpm; Playwright (orquestador).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§2 fila #54.1, §3 #35 y #62, §4, §5). Detalle por issue: `gh issue view <n> --repo aiyangar/ligaspequenas`.

## Global Constraints

- Rama `fix/player-page-polish`, worktree `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-page-polish` (lo crea el orquestador desde `origin/develop`). En este plan `$WT` es esa ruta. Primera acción: `pnpm install --frozen-lockfile`. Los tests no necesitan `.env`.
- **Archivos que este lote puede tocar (y ningún otro):** `src/players/PlayerFormPage.tsx`, `src/players/PlayerFormPage.test.tsx`, `src/players/PlayerPhoto.tsx`, `src/players/PlayerPhoto.test.tsx`, `src/players/players.test.ts` y este plan. Lote C (en paralelo) es dueño de `src/documents/*`; lote E de `src/players/PlayersPage*`, `src/players/playersSheet*` y `src/lib/fetchAllRows*`. `src/players/players.ts` no se toca.
- **Task 8 depende del lote C.** Pasa `onReload` a `PlayerDocumentsSection`, prop que crea C. Tasks 0–7 no dependen de C. Al llegar a Task 8, si `git -C $WT log origin/develop --oneline --grep "#50"` (después de `git -C $WT fetch origin`) no muestra el commit de C `fix: let the documents section reload its rows after a failed change (#50)`, **detente y reporta**: el orquestador te avisa cuando C esté en `develop`.
- Git: siempre `git -C $WT …`, un comando git por llamada. Nunca `CLAUDE_GIT_OVERRIDE`. Sin push, PR ni merge. Nunca toques el checkout principal. Sin Supabase MCP ni base de datos.
- Código, identificadores, comentarios y commits en inglés. Sin comentarios salvo una línea corta con el *por qué*. Cada commit termina con `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. Cada `git add` incluye este plan.
- Cierre: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint` en verde. Conteos como delta sobre `B_files`/`B_tests` del Step 0 (con `origin/develop` en `24c14a4`: **45 / 449**).
- **Tests de cobertura** (#57, #58.1, #35 y el reemplazo del test de cableado): pasan con el código actual. Su prueba es la **mutación** que indica cada paso; después restauras con `git -C $WT checkout -- <archivo>` y nunca commiteas la mutación. Todas las mutaciones de este plan se verificaron al planear (el test nuevo falla, y en #52/#57.3 el test viejo pasaba).
- PR (lo abre el orquestador): `Closes #50`, `Closes #54`, `Closes #57`, `Closes #58`, `Closes #61`, `Closes #62`, `Closes #35`.

## Orden exacto de la ficha (decisión del owner, spec §2)

Layout actual (`PlayerFormPage.tsx` l.237–343, todo dentro de un `<form>`): `h1` → Foto → campos de `PlayerForm` → Equipo → Documentos → Pagos → mensaje → Guardar, y dos Snackbars.

Layout nuevo, de arriba abajo:
1. `h1` "Jugador" / "Nuevo jugador" (fuera del form).
2. `<form>`: campos de `PlayerForm` → mensaje (`Alert`) → **Guardar**.
3. **Equipo** (select o su `LoadError`), fuera del form — solo edición. Guarda al cambiar (decisión del owner del 2026-11-18, revisión del plan).
4. Sección **Foto** (`h2` "Foto" + avatar y botones) — solo edición.
5. Sección **Documentos** (o su `LoadError`) — solo edición.
6. Sección **Pagos** — solo edición.
7. Un único Snackbar.

El `Alert` de mensaje se queda en el form, encima de Guardar: también muestra los errores de Equipo y del refresco tras la foto (comportamiento de hoy).

## Review Focus

- **Flash del alta (#61):** el toast "Jugador creado" se ve una vez y el historial queda con `state: null` (test de Task 6). Al recargar no hay flash que leer. En `StrictMode` (dev) el efecto corre dos veces: el segundo `navigate(replace)` es inocuo.
- **Guardar una edición ya no navega:** antes empujaba una entrada nueva al historial con el flash (Back volvía a la misma ficha). Ahora solo muestra el toast; `fetchPlayer` sigue llamándose una sola vez (test existente `saving an edit keeps the same page instance…`).
- **Un solo Snackbar (#54.2):** un toast nuevo reemplaza al anterior en vez de apilarse, y gracias al `key` dura sus 4 s completos (el `useSnackbar` de MUI 9 solo reinicia el temporizador cuando cambian `open` o `autoHideDuration`). Tests de Task 6; el del temporizador falla sin el `key` (verificado).
- **Foto quitada (#62):** la imagen firmada desaparece en cuanto `removePlayerPhoto` responde `ok`, antes del refetch del padre (test de Task 3). La hipótesis del 400 no está probada (ver Discrepancias); la verificación en navegador lo confirma o lo descarta.
- **Recarga tras fallo (#50):** foto y documentos llaman `refreshDocuments` tras un fallo, sin toast de éxito; si la recarga misma falla, la sección cae al `LoadError` de documentos (comportamiento existente de `refreshDocuments`).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 1:** `git -C $WT branch --show-current` → `fix/player-page-polish`; `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 2:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests`.

---

## Task 1: Tests de la foto que fijan guardia, re-firmado y errores de Storage (#57.1, #57.2, #58.1)

**Files:**
- Modify: `src/players/PlayerPhoto.test.tsx`
- Modify: `src/players/players.test.ts`

- [x] **Step 1: Agregar los tests de `PlayerPhoto`**

Cambia el import a `import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'`. Al final del archivo agrega:

```ts
test('a second photo while the first is still saving or reloading is ignored', async () => {
  let finishReload!: () => void
  const onChanged = vi.fn(() => new Promise<void>((r) => { finishReload = r }))
  render(<PlayerPhoto player={base} canEdit consentGranted onChanged={onChanged} />)
  const input = screen.getByLabelText('Subir foto', { selector: 'input' })
  const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  // fireEvent, not user.upload: user-event skips a disabled input, which would hide a missing guard
  fireEvent.change(input, { target: { files: [f] } })
  fireEvent.change(input, { target: { files: [f] } })
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  fireEvent.change(input, { target: { files: [f] } })
  expect(mocks.uploadPlayerPhoto).toHaveBeenCalledTimes(1)
  await act(async () => finishReload())
})

test('a replaced photo (same path, new updated_at) is signed again', async () => {
  mocks.getSignedFileUrl.mockResolvedValueOnce('https://signed/v1').mockResolvedValueOnce('https://signed/v2')
  const player = { ...base, photo_path: 't1/p1/photo', updated_at: 'u1' }
  const { rerender } = render(<PlayerPhoto player={player} canEdit consentGranted onChanged={vi.fn()} />)
  expect(await screen.findByRole('img', { name: 'Foto de Ana Ruiz' })).toHaveAttribute('src', 'https://signed/v1')
  rerender(<PlayerPhoto player={{ ...player, updated_at: 'u2' }} canEdit consentGranted onChanged={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('img', { name: 'Foto de Ana Ruiz' })).toHaveAttribute('src', 'https://signed/v2'))
  expect(mocks.getSignedFileUrl).toHaveBeenCalledTimes(2)
})
```

- [x] **Step 2: Agregar el test de `uploadPlayerPhoto`**

Al final de `src/players/players.test.ts` agrega:

```ts
test('uploadPlayerPhoto maps a Storage RLS rejection to the consent message when consent is missing', async () => {
  mocks.upload.mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy' } })
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, photo('image/jpeg', 1), false)
  expect(res).toEqual({ ok: false, error: 'Primero registra el consentimiento de imagen y el aviso de privacidad.' })
  expect(mocks.update).not.toHaveBeenCalled()
})
```

- [x] **Step 3: Verificar que pasan**

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx src/players/players.test.ts` → todo PASS (3 tests más; cobertura, sin rojo).

- [x] **Step 4: Mutaciones** (cada una: aplicar → correr → ver FAIL → restaurar con `git -C $WT checkout -- <archivo>`)

1. `src/players/PlayerPhoto.tsx`: borra `    if (inFlight.current) return`. Run `pnpm exec vitest run src/players/PlayerPhoto.test.tsx -t "second photo"` → FAIL.
2. `src/players/PlayerPhoto.tsx`: cambia `await onChanged('Foto actualizada')` por `void onChanged('Foto actualizada')`. Mismo comando → FAIL (el tercer `change` sube otra vez).
3. `src/players/PlayerPhoto.tsx`: cambia `` `${player.photo_path}@${player.updated_at}` `` por `player.photo_path`. Run `… -t "signed again"` → FAIL.
4. `src/players/players.ts`: en `uploadPlayerPhoto`, cambia `documentErrorMessage(uploaded.error.message, { consentGranted })` por `documentErrorMessage(uploaded.error.message)`. Run `pnpm exec vitest run src/players/players.test.ts -t "Storage RLS"` → FAIL.

- [x] **Step 5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerPhoto.test.tsx src/players/players.test.ts
git -C $WT commit -m "test: pin the photo in-flight guard, re-signing and Storage error mapping (#57, #58)" -m "Removing the guard, the await before onChanged, updated_at from the signed-URL key or the consent flag in uploadPlayerPhoto's error translation failed no test." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Spinner mientras la foto guarda (#58.2)

**Files:**
- Modify: `src/players/PlayerPhoto.test.tsx`
- Modify: `src/players/PlayerPhoto.tsx`

- [x] **Step 1: Test (rojo)**

```ts
test('a spinner shows while the photo is saving', async () => {
  let resolve!: (v: { ok: boolean }) => void
  mocks.uploadPlayerPhoto.mockReturnValueOnce(new Promise((r) => { resolve = r }))
  renderPhoto()
  expect(screen.queryByLabelText('Guardando')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Subir foto', { selector: 'input' }), {
    target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
  })
  expect(screen.getByLabelText('Guardando')).toBeInTheDocument()
  await act(async () => resolve({ ok: true }))
  expect(screen.queryByLabelText('Guardando')).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx -t spinner` → FAIL (no hay "Guardando").

- [x] **Step 2: Implementar**

En `PlayerPhoto.tsx` importa `import CircularProgress from '@mui/material/CircularProgress'`. En el `Stack direction="row" spacing={1}` de los botones agrega `sx={{ alignItems: 'center' }}` y, como último hijo (después del botón Quitar), `{busy && <CircularProgress size={20} aria-label="Guardando" />}` (mismo texto que el spinner de las filas de documentos).

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx` → todo PASS.

- [x] **Step 3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerPhoto.tsx src/players/PlayerPhoto.test.tsx
git -C $WT commit -m "feat: show a spinner while the player photo saves (#58)" -m "A photo of up to 5 MB can take seconds on a slow mobile network, and only the disabled buttons hinted that something was happening." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 3: Soltar la URL firmada al quitar la foto (#62)

**Files:**
- Modify: `src/players/PlayerPhoto.test.tsx`
- Modify: `src/players/PlayerPhoto.tsx`

- [x] **Step 1: Test (rojo)**

```ts
test('removing the photo drops the signed image before the parent reloads the player', async () => {
  let finishReload!: () => void
  const onChanged = vi.fn(() => new Promise<void>((r) => { finishReload = r }))
  const user = userEvent.setup()
  render(<PlayerPhoto player={{ ...base, photo_path: 't1/p1/photo' }} canEdit consentGranted onChanged={onChanged} />)
  await screen.findByRole('img', { name: 'Foto de Ana Ruiz' })
  await user.click(screen.getByRole('button', { name: 'Quitar' }))
  await user.click(await screen.findByRole('button', { name: 'Quitar foto' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Foto actualizada'))
  expect(screen.queryByRole('img', { name: 'Foto de Ana Ruiz' })).not.toBeInTheDocument()
  expect(screen.getByText('AR')).toBeInTheDocument()
  await act(async () => finishReload())
})
```

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx -t "drops the signed image"` → FAIL (la imagen sigue mientras el padre no recarga).

- [x] **Step 2: Implementar**

Reemplaza `handleRemove` por:

```ts
  function handleRemove() {
    setConfirmOpen(false)
    void run(async () => {
      const res = await removePlayerPhoto(player)
      // drop the signed URL now: until the page refetches, the img would point at a deleted object
      if (res.ok) setUrl(null)
      return res
    })
  }
```

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx` → todo PASS.

- [x] **Step 3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerPhoto.tsx src/players/PlayerPhoto.test.tsx
git -C $WT commit -m "fix: drop the signed photo URL as soon as the photo is removed (#62)" -m "Until the parent refetched the player, the avatar kept the signed URL of an object that no longer existed, the likely source of a one-off 400 after removing a photo." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: La foto pide recargar los documentos tras un fallo (#50, foto)

**Files:**
- Modify: `src/players/PlayerPhoto.test.tsx`, `src/players/PlayerPhoto.tsx`
- Modify: `src/players/PlayerFormPage.test.tsx`, `src/players/PlayerFormPage.tsx`

**Interfaces:**
- Produces: `PlayerPhotoProps.onReload?: () => Promise<void> | void`, llamada (y esperada) tras un `res.ok === false`, sin toast.

- [x] **Step 1: Test del componente (rojo)**

```ts
test('a failed photo change asks the page to reload, with no success toast', async () => {
  mocks.uploadPlayerPhoto.mockResolvedValueOnce({ ok: false, error: 'No tienes permiso para esta acción.' })
  const onReload = vi.fn()
  const user = userEvent.setup()
  const { onChanged } = renderPhoto({ onReload })
  await user.upload(screen.getByLabelText('Subir foto', { selector: 'input' }), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para esta acción.')
  expect(onReload).toHaveBeenCalledTimes(1)
  expect(onChanged).not.toHaveBeenCalled()
})
```

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx -t "asks the page to reload"` → FAIL (`onReload` no se llama).

- [x] **Step 2: Implementar en `PlayerPhoto.tsx`**

Agrega `onReload?: () => Promise<void> | void` a `PlayerPhotoProps` (después de `onChanged`) y desestructúralo. En `run` reemplaza:

```ts
      if (res.ok) await onChanged('Foto actualizada')
      else setError(res.error ?? 'No se pudo actualizar la foto.')
```

por:

```ts
      if (res.ok) {
        await onChanged('Foto actualizada')
      } else {
        setError(res.error ?? 'No se pudo actualizar la foto.')
        // the consent shown may be stale, so let the page reload it
        await onReload?.()
      }
```

Run: `pnpm exec vitest run src/players/PlayerPhoto.test.tsx` → todo PASS.

- [x] **Step 3: Test de la página (rojo)**

En `PlayerFormPage.test.tsx`, al final:

```ts
test('a failed photo upload reloads the documents so a stale consent is corrected', async () => {
  mocks.fetchPlayerDocuments.mockResolvedValueOnce(
    seededDocs().map((d) => (d.doc_type === 'image_consent' || d.doc_type === 'privacy_notice' ? { ...d, status: 'fisico' as const } : d)),
  )
  mocks.uploadPlayerPhoto.mockResolvedValueOnce({ ok: false, error: 'No tienes permiso para esta acción.' })
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const input = await screen.findByLabelText('Subir foto', { selector: 'input' })
  await waitFor(() => expect(input).toBeEnabled())
  await user.upload(input, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByText('No tienes permiso para esta acción.')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByLabelText('Subir foto', { selector: 'input' })).toBeDisabled())
  expect(screen.getByText('Requiere consentimiento de imagen y aviso de privacidad')).toBeInTheDocument()
})
```

(La primera carga dice que hay consentimiento; la recarga, con el mock por defecto `seededDocs()`, dice que no: así se ve el consentimiento corregido.)

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx -t "stale consent"` → FAIL (`fetchPlayerDocuments` se llama una sola vez).

- [x] **Step 4: Conectar en la página**

En `PlayerFormPage.tsx`, en `<PlayerPhoto … />` agrega `onReload={refreshDocuments}`.

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx` → todo PASS.

- [x] **Step 5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerPhoto.tsx src/players/PlayerPhoto.test.tsx src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C $WT commit -m "fix: reload the documents after a failed photo change (#50)" -m "With a stale consent the photo upload hit a Storage 403 and kept offering the upload. The page now reloads the documents, so the consent lock and its hint come back." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 5: Formulario y Guardar primero; Equipo, Foto, Documentos y Pagos fuera del form (#54.1)

**Files:**
- Modify: `src/players/PlayerFormPage.test.tsx`
- Modify: `src/players/PlayerFormPage.tsx`

- [x] **Step 1: Test (rojo)**

Después de `seededDocs()` agrega el helper:

```ts
function follows(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
}
```

Al final del archivo:

```ts
test('the form and its Guardar come first; Equipo, Foto, Documentos and Pagos follow outside the form', async () => {
  renderAt('/jugadores/p1')
  const documentsHeading = await screen.findByRole('heading', { name: 'Documentos' })
  const save = screen.getByRole('button', { name: 'Guardar' })
  const photoHeading = screen.getByRole('heading', { name: 'Foto' })
  const paymentsHeading = screen.getByRole('heading', { name: 'Pagos' })
  const team = await screen.findByLabelText('Equipo')
  expect(save.closest('form')).not.toBeNull()
  for (const el of [team, photoHeading, documentsHeading, paymentsHeading]) expect(el.closest('form')).toBeNull()
  expect(screen.getByLabelText('Subir foto', { selector: 'input' }).closest('form')).toBeNull()
  expect(follows(save, team)).toBe(true)
  expect(follows(team, photoHeading)).toBe(true)
  expect(follows(photoHeading, documentsHeading)).toBe(true)
  expect(follows(documentsHeading, paymentsHeading)).toBe(true)
})
```

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx -t "come first"` → FAIL (no hay heading "Foto").

- [x] **Step 2: Reestructurar el JSX**

Reemplaza el `return (` final de `PlayerFormContent` (desde `<Box component="form" …>` hasta el cierre `</Box>` que va antes de los Snackbars) para que quede así; **los Snackbars no cambian en esta tarea** (siguen después del `</Stack>` y antes del `</Box>` exterior, como hoy):

```tsx
  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          {editing ? 'Jugador' : 'Nuevo jugador'}
        </Typography>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <PlayerForm values={values} onChange={setValues} disabled={!canEdit} categoryText={categoryText} />
            {/* the message Alert block, unchanged */}
            {/* the canEdit && Guardar Button block, unchanged */}
          </Stack>
        </Box>
        {/* the Equipo block (editing && row && (teamsLoadError ? LoadError : TextField select …)), unchanged, now outside the form */}
        {editing && row && (
          <Box component="section" aria-labelledby="photo-heading">
            <Typography id="photo-heading" variant="h6" component="h2" gutterBottom>
              Foto
            </Typography>
            <PlayerPhoto
              player={row}
              canEdit={canEdit}
              consentGranted={documents !== null && consentGranted(documents)}
              onChanged={handlePhotoChanged}
              onReload={refreshDocuments}
            />
          </Box>
        )}
        {/* the Documentos block (docsLoadError ? LoadError : documents && PlayerDocumentsSection …), unchanged */}
        {/* the PlayerPaymentsSection block, unchanged */}
      </Stack>
      {/* the two Snackbars, unchanged (Task 6 merges them) */}
    </Box>
  )
```

Los comentarios `{/* … */}` de arriba son marcadores para este plan: pon en su lugar los bloques existentes **tal cual** (mismo código, solo reindentado) y no dejes esos comentarios en el archivo. El `h1` pierde `gutterBottom` (el `Stack spacing={3}` da el aire).

Borra el test `registering a payment never submits the player form`: con Pagos fuera del form es trivialmente cierto, y lo que protegía (que Pagos no esté dentro del form) ya lo fija el test de layout de arriba (`paymentsHeading.closest('form')` es `null`). El conteo de la tarea queda en 0 (+1 −1).

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx` → todo PASS. (Verificado al planear: el test de cambio de equipo existente y el de #35 de Task 7 siguen pasando con Equipo fuera del form.)

- [x] **Step 3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C $WT commit -m "fix: put the player form and Guardar first, then the self-saving controls (#54)" -m "Team, photo, documents and payments save on their own but sat inside the player form above Guardar, suggesting Guardar saved them and pushing it below six document rows on mobile. They now follow the form, with a Foto heading for the photo." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 6: Un solo Snackbar y flash que no reaparece al recargar (#54.2, #61)

**Files:**
- Modify: `src/players/PlayerFormPage.test.tsx`
- Modify: `src/players/PlayerFormPage.tsx`

- [x] **Step 1: Tests (rojo)**

```ts
test('a document change right after saving replaces the toast instead of stacking a second one', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  await user.selectOptions(within(curp).getByRole('combobox'), 'fisico')
  expect(await screen.findByText('Documento actualizado')).toBeInTheDocument()
  expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
})

test('the create flash is dropped from history once shown, so a reload does not repeat it', async () => {
  const user = userEvent.setup()
  const router = renderAt('/jugadores/nuevo')
  await user.type(screen.getByLabelText(/Nombre completo/), 'Nuevo Jugador')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '2015-06-10')
  await user.type(screen.getByLabelText(/Nombre del tutor/), 'Tutor')
  await user.type(screen.getByLabelText(/WhatsApp del tutor/), '8110000000')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Jugador creado')).toBeInTheDocument()
  await waitFor(() => expect(router.state.location.state).toBeNull())
  expect(router.state.location.pathname).toBe('/jugadores/newid')
  expect(screen.getByText('Jugador creado')).toBeInTheDocument()
})

test('saving an edit shows the toast without leaving a flash in history', async () => {
  const user = userEvent.setup()
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  expect(router.state.location.state).toBeNull()
  expect(router.state.location.pathname).toBe('/jugadores/p1')
})
```

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx`
Expected: FAIL en estos 3 (dos Snackbars a la vez; `location.state` sigue con `{ flash }`); el resto pasa.

- [x] **Step 2: Implementar**

1. Arriba de `export function PlayerFormPage()` agrega:

```ts
function flashOf(state: unknown): string | null {
  return (state as { flash?: string } | null)?.flash ?? null
}
```

2. Reemplaza la línea de comentario y el `useState` de `dismissedFlashKey` por:

```ts
  // the create flow lands on a fresh instance (keyed by id), so its flash is read once here
  const [toast, setToast] = useState<string | null>(() => flashOf(location.state))
  const hasFlash = flashOf(location.state) !== null

  useEffect(() => {
    // history state survives a reload, so drop the flash once the toast holds it
    if (hasFlash) void navigate(location.pathname, { replace: true, state: null })
  }, [hasFlash, location.pathname, navigate])
```

3. Borra la otra declaración `const [toast, setToast] = useState<string | null>(null)` (la que está junto a los estados de documentos) y el bloque de comentario + `flash` + `showFlash` (hoy l.150–154).
4. En `handleSubmit`, rama de edición: reemplaza `void navigate(`/jugadores/${id!}`, { state: { flash: 'Cambios guardados' } })` por `showToast('Cambios guardados')`. La rama de alta no cambia (sigue navegando con `state: { flash: 'Jugador creado' }`).
5. Borra el Snackbar del flash (el que usa `showFlash` / `setDismissedFlashKey`); queda solo:

```tsx
      <Snackbar
        key={toastKey}
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
```

6. Junto al `useState` de `toast` agrega el contador y súbelo en `showToast`:

```ts
  // a new key per message remounts the Snackbar, so a replacing toast gets its full autoHideDuration
  const [toastKey, setToastKey] = useState(0)
```

```ts
  function showToast(text: string) {
    setToastKey((k) => k + 1)
    setToast(text)
  }
```

(Cerrar el toast no cambia el `key`, así que la transición de salida sigue igual.)

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx` → todo PASS (incluye `creating shows…`, `editing shows…` y `saving an edit keeps the same page instance…`). `pnpm lint` → exit 0 (el efecto no llama `setState`, así que `react-hooks/set-state-in-effect` no aplica).

- [x] **Step 3: Test del temporizador del toast que reemplaza a otro, y su mutación**

Agrega `fireEvent` al import de Testing Library (`import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'`) y `onTestFinished` al de Vitest (`import { beforeEach, expect, onTestFinished, vi } from 'vitest'`). Al final del archivo:

```ts
test('a toast that replaces another gets its own full display time', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => { vi.useRealTimers() })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(3000))
  // fireEvent, not a click: a click elsewhere is a Snackbar clickaway, which closes and reopens it anyway
  fireEvent.change(within(curp).getByRole('combobox'), { target: { value: 'fisico' } })
  expect(await screen.findByText('Documento actualizado')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByText('Documento actualizado')).toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx -t "full display time"` → PASS.
La mutación de este test va **después** del commit (Step 5), para poder restaurar con `checkout`.

- [x] **Step 4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C $WT commit -m "fix: one toast for the player page and no flash after a reload (#54, #61)" -m "The flash and the section toast were two Snackbars at the same anchor and stacked; each message now remounts the single Snackbar so a replacing toast gets its full time. The flash also rode history state, which survives a reload, so Jugador creado reappeared. The page now keeps one toast, reads the create flash once and replaces the history entry without it; saving an edit just shows the toast." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

- [ ] **Step 5: Mutación del `key`**

Borra la línea `        key={toastKey}` del Snackbar. Run `pnpm exec vitest run src/players/PlayerFormPage.test.tsx -t "full display time"` → FAIL (el toast nuevo se cierra a los 4 s del primero; verificado al planear). Restaura: `git -C $WT checkout -- src/players/PlayerFormPage.tsx`.

---

## Task 7: Cableado de la foto en la página y cambio de equipo en vuelo (#57.3, #35)

**Files:**
- Modify: `src/players/PlayerFormPage.test.tsx`

- [ ] **Step 1: Mockear `getSignedFileUrl` en la página**

En `mocks` agrega `getSignedFileUrl: vi.fn(),` (después de `uploadPlayerPhoto`). El mock de `'../documents/documents'` pasa a devolver:

```ts
  return {
    ...actual,
    fetchPlayerDocuments: mocks.fetchPlayerDocuments, setDocumentStatus: mocks.setDocumentStatus,
    getSignedFileUrl: mocks.getSignedFileUrl,
  }
```

En `beforeEach` agrega `mocks.getSignedFileUrl.mockResolvedValue('https://signed/photo')`. (Sin esto, una fila con `photo_path` llamaría al cliente real de Supabase.)

- [ ] **Step 2: Reemplazar el test de cableado de la foto (#57.3)**

Reemplaza el test `a photo upload refetches the player and shows a toast` completo por:

```ts
test('a photo upload refetches the player, keeps typed edits and locks Pendiente on the consents', async () => {
  mocks.fetchPlayerDocuments.mockResolvedValue(
    seededDocs().map((d) => (d.doc_type === 'image_consent' || d.doc_type === 'privacy_notice' ? { ...d, status: 'fisico' as const } : d)),
  )
  mocks.fetchPlayer.mockResolvedValueOnce(ana).mockResolvedValueOnce({ ...ana, photo_path: 'tenant-1/p1/photo', updated_at: 'u2' })
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const input = await screen.findByLabelText('Subir foto', { selector: 'input' })
  await waitFor(() => expect(input).toBeEnabled())
  const name = screen.getByLabelText(/Nombre completo/)
  await user.clear(name)
  await user.type(name, 'Ana María Ruiz')
  await user.upload(input, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByText('Foto actualizada')).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Quitar' })).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('Ana María Ruiz')
  const consent = within(screen.getByRole('listitem', { name: 'Consentimiento de imagen' })).getByRole('combobox')
  expect(within(consent).getByRole('option', { name: 'Pendiente' })).toBeDisabled()
  expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 3: Agregar el test de cambio de equipo en vuelo (#35)**

```ts
test("an in-flight team change from one player never lands on the next player's page", async () => {
  const assign = deferred<{ ok: boolean }>()
  mocks.assignPlayer.mockReturnValueOnce(assign.promise)
  let assigned = false
  mocks.fetchPlayer.mockImplementation((id: string) =>
    Promise.resolve(
      id === 'p2'
        ? { ...ana, id: 'p2', full_name: 'Beto Gómez' }
        : assigned ? { ...ana, team_id: 'team9', team_name: 'MTY AC Rojo' } : ana,
    ),
  )
  const user = userEvent.setup()
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.selectOptions(await screen.findByLabelText('Equipo'), 'team9')
  await waitFor(() => expect(mocks.assignPlayer).toHaveBeenCalledTimes(1))
  await act(() => router.navigate('/jugadores/p2'))
  expect(await screen.findByDisplayValue('Beto Gómez')).toBeInTheDocument()
  assigned = true
  await act(async () => assign.resolve({ ok: true }))
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(3))
  await act(async () => {})
  expect(await screen.findByLabelText('Equipo')).toHaveValue('')
  expect(screen.getByDisplayValue('Beto Gómez')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
```

(`deferred` ya existe en el archivo. La tercera llamada a `fetchPlayer` es el refresco de Ana que hace la instancia vieja tras el `assign`; con el remount por `key` cae en una instancia desmontada.)

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx` → todo PASS (cobertura, sin rojo).

- [ ] **Step 5: Mutaciones** (aplicar → FAIL → `git -C $WT checkout -- src/players/PlayerFormPage.tsx`)

1. En `PlayerFormPage`, `return <PlayerFormContent key={id ?? 'new'} id={id} />` → `return <PlayerFormContent id={id} />`. Run `pnpm exec vitest run src/players/PlayerFormPage.test.tsx -t "in-flight team change"` → FAIL (Equipo muestra `team9` en la ficha de Beto).
2. En `handlePhotoChanged`, `if (refreshed) setRow(refreshed)` → `if (refreshed) { setRow(refreshed); setValues(rowToValues(refreshed)) }`. Run `… -t "keeps typed edits"` → FAIL (se pierde lo tecleado).
3. En `handlePhotoChanged`, `if (refreshed) setRow(refreshed)` → `void refreshed`. Mismo comando → FAIL (no aparece "Quitar"). El test viejo pasaba con esta mutación.

- [ ] **Step 6: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerFormPage.test.tsx
git -C $WT commit -m "test: pin the photo page wiring and the in-flight team change across players (#57, #35)" -m "The wiring test only proved fetchPlayer ran twice, and the guarantee that a team change for one player cannot land on the next player's page rested on reasoning about the remount key." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

- [ ] **Step 7: Suite completa, tipos y lint (antes de Task 8)**

Run: `pnpm exec vitest run` → `B_files` archivos, `B_tests + 12` tests (Task 1: 3; Task 2: 1; Task 3: 1; Task 4: 2; Task 5: +1 −1 = 0; Task 6: 4; Task 7: 1), todo verde (esperado 45 / 461 si la base es `24c14a4`; si E u otro lote ya se mergeó en tu base, el esperado es `B_tests + 12`). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

---

## Task 8: La página recarga los documentos tras un fallo (#50, página) — **requiere lote C en `develop`**

**Files:**
- Modify: `src/players/PlayerFormPage.test.tsx`
- Modify: `src/players/PlayerFormPage.tsx`

**Interfaces:**
- Consumes: `PlayerDocumentsSectionProps.onReload?: () => Promise<void> | void` (lote C, Task 5).

- [ ] **Step 1: Traer el lote C**

`git -C $WT fetch origin`; `git -C $WT log origin/develop --oneline --grep "#50"` debe mostrar `fix: let the documents section reload its rows after a failed change (#50)`. Si no, **detente y reporta**. Si está: `git -C $WT rebase origin/develop` (tus commits no tocan archivos de C: no hay conflictos). Si el hook de git bloquea el rebase, detente y reporta. Después: `pnpm exec vitest run` y anota `B2_files`/`B2_tests`. Usa **siempre los conteos medidos**: si solo entró C, el esperado es 45 / 469 (461 + 8 de C); si E (u otro lote) se mergeó antes, la base sube (E suma +1 archivo y +7 tests) y los números absolutos de este plan ya no aplican: vale `B2_tests + 1` en el Step 3.

- [ ] **Step 2: Test (rojo)**

```ts
test('a failed document change reloads the documents without a success toast', async () => {
  mocks.setDocumentStatus.mockResolvedValueOnce({ ok: false, error: 'No se pudo eliminar el archivo.' })
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  await user.selectOptions(within(curp).getByRole('combobox'), 'fisico')
  expect(await screen.findByText('No se pudo eliminar el archivo.')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Documento actualizado')).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/players/PlayerFormPage.test.tsx -t "failed document change"` → FAIL (`fetchPlayerDocuments` una sola vez).

- [ ] **Step 3: Conectar**

En `<PlayerDocumentsSection … />` agrega `onReload={refreshDocuments}` después del `onChanged`.

Run: `pnpm exec vitest run` → `B2_files` archivos, `B2_tests + 1` tests, todo verde (con solo C en la base, 45 / 470). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-d-player-page.md src/players/PlayerFormPage.tsx src/players/PlayerFormPage.test.tsx
git -C $WT commit -m "fix: reload the player's documents when a document change fails (#50)" -m "A consent update can land before its file removal fails; without a reload the page kept the stale consent, leaving the upload buttons enabled and reporting Storage rejections as a permission error." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** SHAs, `B_files`/`B_tests`, `B2_*` y conteos finales; salida de cada rojo (Tasks 2–6 y 8), de cada mutación (Tasks 1, 6 y 7) y de cada verde.

---

## Verificación en navegador (orquestador, después de la revisión limpia)

Dev server en `$WT`, sesión admin persistente de Playwright. **Nunca se toca al jugador real.** Todo se hace sobre un jugador de prueba que crea el orquestador y que borra al final.

- [ ] **Baseline antes:** con la baseline query del spec §5, anota: 1 tenant, 3 profiles, 3 users, 1 jugador, 6 documentos, 0 pagos, 1 objeto en `player-files`.
- [ ] **Alta y flash al recargar (#61):** en `/jugadores/nuevo` crea el jugador de prueba por la UI con un nombre único (p. ej. `ZZ Prueba D <fecha-hora>`) → aparece el toast "Jugador creado" → `history.state?.usr` es `null`/`undefined` (React Router guarda el `state` en `usr`) → F5 → **no** aparece ningún toast. Anota el id (de la URL) y el nombre exacto.
- [ ] **Preparar:** en la ficha del jugador de prueba pon "Consentimiento de imagen" y "Aviso de privacidad" en Físico.
- [ ] **Layout escritorio (1280×800):** de arriba abajo: `h1` Jugador → campos → Guardar → Equipo → `h2` Foto → `h2` Documentos → `h2` Pagos. `document.querySelector('form').contains(document.querySelector('[id="documents-heading"]'))` → `false`, y lo mismo para el select de Equipo (`document.querySelector('form').contains(<select de Equipo>)` → `false`).
- [ ] **Layout móvil (390×844):** mismo orden; `document.documentElement.scrollWidth <= 390` (sin scroll horizontal). Captura de ambos tamaños para el PR.
- [ ] **Un solo toast (#54.2):** Guardar (sin cambiar campos) → "Cambios guardados"; antes de 4 s cambia un documento no de consentimiento de Pendiente a Físico **con `locator.selectOption` o con el teclado, no con clic** (un clic fuera del Snackbar es un clickaway y lo cierra, lo que falsearía la prueba) → solo hay un `.MuiSnackbar-root` en el DOM, dice "Documento actualizado" y sigue visible ~4 s después del cambio (no se cierra a los 4 s del primero).
- [ ] **Foto sin 400 (#62):** con `page.on('response')` y `page.on('console')` registrando toda respuesta `>= 400` y todo `console.error`: sube una imagen JPG pequeña → aparece; Quitar → Quitar foto → el avatar pasa a iniciales **en cuanto** termina el borrado; espera 3 s y recarga. Esperado: ninguna respuesta `>= 400` ni "Failed to load resource" en todo el ciclo. Si aparece un 400, anota la URL exacta (ver Discrepancias).
- [ ] **Limpieza:** si quedó algún objeto en `player-files` bajo `<tenant>/<id del jugador de prueba>/`, bórralo por la API de Storage. Después, como `postgres` por MCP: `delete from public.players where id = '<id>' and full_name = '<nombre exacto>';` (debe borrar 1 fila; documentos y demás caen por `on delete cascade`).
- [ ] **Baseline después:** la misma query devuelve 1 tenant, 3 profiles, 3 users, 1 jugador, 6 documentos, 0 pagos, 1 objeto.

## Discrepancias

- **#50 cruza C y D.** El issue pide arreglar documentos y foto juntos. La sección de documentos es de C (crea `onReload`), la foto y la página son de D. Para que C y D corran en paralelo sin tocar los mismos archivos, `onReload` es opcional y D la conecta en Task 8, que espera el merge de C (rebase de una rama local sin push; sin conflictos porque los archivos son disjuntos). Si el orquestador prefiere no rebasear, alternativa: abrir el PR de D sin Task 8 y hacer Task 8 como un PR chico después; en ese caso el PR de D lleva `Refs #50` y el de Task 8 `Closes #50`.
- **#62: la hipótesis no está demostrada.** Mientras el `src` no cambia, el navegador no vuelve a pedir la imagen, así que el 400 pudo venir de otro lado (p. ej. el `list()` de `removeFile` cuando `remove()` devuelve vacío, que es un POST a Storage). El spec §3 manda aplicar la hipótesis y verificar en navegador; la verificación registra la URL de cualquier respuesta `>= 400` para cerrar la duda con evidencia.
- **El flash viaja igual en Equipos.** `TeamFormPage` (l.88 y l.97) navega con `state: { flash }` del mismo modo, así que #61 probablemente también pasa en `/equipos/:id`. No es de este lote ni está en ningún issue: el orquestador puede registrarlo como issue nuevo.
- **#61 cambia el guardado de una edición:** ya no navega a la misma URL (que dejaba una entrada duplicada en el historial); solo muestra el toast. El test existente que fija que no hay remount sigue pasando.

## Preguntas abiertas

- El mensaje de error de "no se pudo actualizar la vista" tras cambiar la foto sigue saliendo en el `Alert` del form (encima de Guardar), lejos de la sección Foto. No cambia comportamiento; se puede pulir en otro issue.
