# Lote C — Endurecer la sección de Documentos (#50 #51 #52 #53 #54.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en el PR de docs del barrido **antes** de despachar. El implementer los lee desde su worktree (cortado de `origin/develop`) y marca `- [x]` en su copia del plan al terminar cada paso.

**Goal:** La sección de Documentos deja de mostrar un consentimiento viejo tras un fallo parcial (#50, parte de la sección), bloquea todas las filas mientras una guarda (#51), sus tests de guardia y de `Ver` prueban de verdad lo que dicen (#52), la capa de datos tiene los casos del spec que faltaban (#53) y deja de tratar como permiso cualquier mensaje con "403" o un update que RLS filtró a cero filas (#54 nit 3).

**Architecture:** Todo vive en `src/documents/`. `updateDocument` pide `.select('id')` y devuelve un mensaje ya traducido o `null`; cero filas es "No tienes permiso para esta acción.". `documentErrorMessage` usa `\b403\b`. `PlayerDocumentsSection` gana una prop opcional `onReload` que llama (y espera) tras un fallo, y deshabilita todas las filas mientras `busyId !== null`. La página (`PlayerFormPage`, lote D) conecta `onReload` en una tarea de D que corre después de que este lote se mergee.

**Tech Stack:** React 19 / MUI 9 / `@supabase/supabase-js` 2.108 / Vitest 4 + Testing Library / TypeScript (`tsc -b`) / ESLint / pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§2, §4 y §5). El detalle de cada issue: `gh issue view <n> --repo aiyangar/ligaspequenas`.

## Global Constraints

- Rama `fix/documents-section-hardening`, worktree `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/documents-section-hardening` (lo crea el orquestador desde `origin/develop`). En este plan `$WT` es esa ruta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- **Archivos que este lote puede tocar (y ningún otro):** `src/documents/documents.ts`, `src/documents/documents.test.ts`, `src/documents/PlayerDocumentsSection.tsx`, `src/documents/PlayerDocumentsSection.test.tsx` y este plan. Lotes D y E corren en paralelo: D es dueño de `src/players/PlayerFormPage*`, `src/players/PlayerPhoto*` y `src/players/players.test.ts`; E de `src/players/PlayersPage*`, `src/players/playersSheet*` y `src/lib/fetchAllRows*`. No los toques.
- Git: siempre `git -C $WT …`, un comando git por llamada. Nunca `CLAUDE_GIT_OVERRIDE`. Sin push, PR ni merge: tu parte termina en commits + reporte. Nunca toques el checkout principal (`/Users/arturoortiz/Proyectos/Personales/ligaspequenas`). Sin Supabase MCP ni base de datos.
- Código, identificadores, comentarios y commits en inglés. Sin comentarios salvo una línea corta con el *por qué*. Cada mensaje de commit termina con la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. Cada `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Cierre: `pnpm exec vitest run`, `pnpm exec tsc -b` y `pnpm lint` en verde. Conteos como delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Con `origin/develop` al 2026-11-18 (`24c14a4`) el baseline es **45 archivos / 449 tests**; si el tuyo difiere, usa el tuyo.
- **Tests que ya pasan (cobertura).** #52 y #53 agregan o reescriben tests sobre código que ya funciona: no tienen rojo. Su prueba es una **mutación**: rompes el código a propósito como dice el paso, ves el test fallar, y **restauras** con `git -C $WT checkout -- <archivo>`. Nunca se commitea una mutación.
- PR (lo abre el orquestador): `Closes #51`, `Closes #52`, `Closes #53`, `Refs #50`, `Refs #54`. #50 y #54 los cierra el PR del lote D, que conecta `onReload` en la página y resuelve los nits 1–2 de #54.

## Review Focus

- **`.select('id')` contra RLS real:** un admin que actualiza un documento debe recibir su fila de vuelta (si no, toda actualización diría "No tienes permiso"). Los tests mockean Supabase; lo confirma la verificación en navegador del orquestador al final.
- **Fallo parcial de consentimiento (#50):** `setDocumentStatus` sobre un consentimiento digital actualiza y después borra el archivo; si el borrado falla devuelve `ok: false` con el update ya hecho (Task 1), y la sección recarga las filas sin toast de éxito y sigue ocupada hasta que la recarga termina (Task 5).
- **`\b403\b`:** "403 Forbidden" y "status 403" siguen siendo permiso; "14030 bytes" o un id `9f403a2c` ya no (Task 2).
- **Guardia síncrona:** el test reescrito de doble subida falla si se quita `inFlight` (Task 3, mutación). Con #51, las demás filas se deshabilitan en el re-render, pero la guardia sigue siendo la única defensa dentro del mismo tick.

---

## Task 0: Preparar y medir el baseline

- [x] **Step 1:** `git -C $WT branch --show-current` → `fix/documents-section-hardening`; `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 2:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado 45 / 449).

---

## Task 1: Casos de la capa de datos que faltaban (#53)

**Files:**
- Modify: `src/documents/documents.test.ts`

- [x] **Step 1: Agregar los tres tests**

Después del test `documentErrorMessage translates by prefix` agrega:

```ts
test('documentErrorMessage treats Unauthorized and a 403 status as a permission error', () => {
  expect(documentErrorMessage('Unauthorized')).toBe('No tienes permiso para esta acción.')
  expect(documentErrorMessage('Request failed with status 403')).toBe('No tienes permiso para esta acción.')
  expect(documentErrorMessage('403 Forbidden', { consentGranted: false })).toBe(CONSENT_REQUIRED_MESSAGE)
})
```

Antes del test `removeFile with an empty result fails when the object still exists` agrega:

```ts
test('removeFile with an empty result reports a list error', async () => {
  mocks.remove.mockResolvedValueOnce({ data: [], error: null })
  mocks.list.mockResolvedValueOnce({ data: null, error: { message: 'network down' } })
  expect(await removeFile('t1/p1/curp')).toEqual({ ok: false, error: 'network down' })
})
```

Antes del test `a rejected consent revocation keeps the file` agrega:

```ts
test('a consent row whose file removal fails after the update reports the failure', async () => {
  mocks.remove.mockResolvedValueOnce({ data: null, error: { message: 'network down' } })
  const consent = doc({ doc_type: 'image_consent', status: 'digital', file_path: 't1/p1/image_consent' })
  expect(await setDocumentStatus(consent, 'fisico')).toEqual({ ok: false, error: 'network down' })
  expect(mocks.update).toHaveBeenCalledWith({ status: 'fisico', file_path: null })
  expect(mocks.remove).toHaveBeenCalledWith(['t1/p1/image_consent'])
  expect(mocks.updateEq.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0])
})
```

- [x] **Step 2: Verificar que pasan**

Run: `pnpm exec vitest run src/documents/documents.test.ts`
Expected: PASS, 3 tests más que antes (cobertura sobre código existente, sin rojo).

- [x] **Step 3: Mutación del test de `list()`**

En `src/documents/documents.ts` (`removeFile`) cambia `if (listed.error) return { ok: false, error: documentErrorMessage(listed.error.message) }` por `if (listed.error) return { ok: true }`.
Run: `pnpm exec vitest run src/documents/documents.test.ts -t "reports a list error"` → FAIL.
Restaura: `git -C $WT checkout -- src/documents/documents.ts`.

- [x] **Step 4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-c-documents.md src/documents/documents.test.ts
git -C $WT commit -m "test: cover the missing documents data-layer cases (#53)" -m "removeFile with a failing list(), a consent row whose file removal fails after the update, and the Unauthorized/403 branches of documentErrorMessage were not pinned by any test." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: `403` acotado y update filtrado por RLS (#54 nit 3)

**Files:**
- Modify: `src/documents/documents.test.ts`
- Modify: `src/documents/documents.ts`

- [x] **Step 1: Cambiar el mock de update a `update().eq().select()`**

En `mocks` agrega `updateSelect: vi.fn(),` (después de `updateEq: vi.fn(),`). En `beforeEach` reemplaza:

```ts
  mocks.updateEq.mockImplementation(async () => {
    mocks.calls.push('update')
    return { error: null }
  })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
```

por:

```ts
  mocks.updateSelect.mockImplementation(async () => {
    mocks.calls.push('update')
    return { data: [{ id: 'd1' }], error: null }
  })
  mocks.updateEq.mockReturnValue({ select: mocks.updateSelect })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
```

En los tests `a rejected consent revocation keeps the file`, `uploadDocument rolls back the object when the update fails on a new upload` y `uploadDocument does not roll back a replacement`, cambia `mocks.updateEq.mockResolvedValueOnce({ error: X })` por `mocks.updateSelect.mockResolvedValueOnce({ data: null, error: X })` (mismo `X` en cada uno).

- [x] **Step 2: Agregar los tests nuevos**

En `setDocumentStatus on a non-digital row only updates`, después de `expect(mocks.updateEq).toHaveBeenCalledWith('id', 'd1')` agrega `expect(mocks.updateSelect).toHaveBeenCalledWith('id')`. Después de ese test agrega:

```ts
test('an update that RLS filters down to zero rows is a permission error, not a silent success', async () => {
  mocks.updateSelect.mockResolvedValueOnce({ data: [], error: null })
  expect(await setDocumentStatus(doc(), 'fisico')).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
})
```

Antes de `uploadDocument does not roll back a replacement` agrega:

```ts
test('uploadDocument rolls back a new upload whose update matched zero rows', async () => {
  mocks.updateSelect.mockResolvedValueOnce({ data: [], error: null })
  const res = await uploadDocument(doc(), file('application/pdf', 100), true)
  expect(res).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
  expect(mocks.remove).toHaveBeenCalledWith(['t1/p1/curp'])
})
```

Después de `documentErrorMessage treats Unauthorized and a 403 status as a permission error` agrega:

```ts
test('documentErrorMessage does not read 403 inside a longer number or id', () => {
  expect(documentErrorMessage('payload of 14030 bytes rejected')).toBe('payload of 14030 bytes rejected')
  expect(documentErrorMessage('object 9f403a2c not found')).toBe('object 9f403a2c not found')
})
```

- [x] **Step 3: Verificar el rojo**

Run: `pnpm exec vitest run src/documents/documents.test.ts`
Expected: FAIL en 10 tests (verificado al planear: 10 failed / 19 passed): `does not read 403 inside…` (devuelve "No tienes permiso…"), los dos de cero filas, y 7 que pasan por `updateDocument` (`non-digital row only updates`, `digital non-consent row…`, `digital consent row…`, `a rejected consent revocation…`, `upserts to the fixed path…`, `rolls back the object…`, `does not roll back a replacement`) porque el código actual espera que `eq()` resuelva y recibe `{ select }`. `a consent row whose file removal fails…` sigue pasando (su resultado lo decide el `remove`). El resto pasa.

- [x] **Step 4: Implementar en `src/documents/documents.ts`**

Después de `CONSENT_REQUIRED_MESSAGE` agrega:

```ts
const NO_PERMISSION_MESSAGE = 'No tienes permiso para esta acción.'
```

En `documentErrorMessage` reemplaza el bloque de permisos por:

```ts
  if (/row-level security|unauthorized|\b403\b/i.test(message)) {
    return opts.consentGranted === false ? CONSENT_REQUIRED_MESSAGE : NO_PERMISSION_MESSAGE
  }
```

Reemplaza `updateDocument` por:

```ts
async function updateDocument(
  id: string,
  values: { status: DocumentStatus; file_path: string | null },
  opts: { consentGranted?: boolean } = {},
): Promise<string | null> {
  const { data, error } = await supabase.from('documents').update(values).eq('id', id).select('id')
  if (error) return documentErrorMessage(error.message, opts)
  // RLS filters the row instead of raising, so a forbidden update looks like a success on zero rows
  if (!data || data.length === 0) return NO_PERMISSION_MESSAGE
  return null
}
```

Reemplaza el cuerpo de `setDocumentStatus` después de `const values = { status, file_path: null }` por:

```ts
  if (doc.status !== 'digital' || !doc.file_path) {
    const error = await updateDocument(doc.id, values)
    return error ? { ok: false, error } : { ok: true }
  }
  if (isConsentType(doc.doc_type)) {
    // the server may reject a revocation, so the signed consent is only deleted after it accepts
    const error = await updateDocument(doc.id, values)
    if (error) return { ok: false, error }
    return removeFile(doc.file_path)
  }
  const removed = await removeFile(doc.file_path)
  if (!removed.ok) return removed
  const error = await updateDocument(doc.id, values)
  return error ? { ok: false, error } : { ok: true }
```

En `uploadDocument` reemplaza desde `const { error } = await updateDocument(...)` hasta el `return { ok: true }` final por:

```ts
  const error = await updateDocument(doc.id, { status: 'digital', file_path: path }, { consentGranted })
  if (error) {
    if (doc.status !== 'digital') await removeFile(path)
    return { ok: false, error }
  }
  return { ok: true }
```

- [x] **Step 5: Verificar el verde**

Run: `pnpm exec vitest run src/documents/documents.test.ts` → todo PASS (3 tests más que al cerrar Task 1).
Run: `pnpm exec vitest run src/players/players.test.ts` → todo PASS (usa `documentErrorMessage` real; "row-level security" sigue mapeando igual).

- [x] **Step 6: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-c-documents.md src/documents/documents.ts src/documents/documents.test.ts
git -C $WT commit -m "fix: detect RLS-filtered document updates and stop matching any 403 substring (#54)" -m "A non-admin update that RLS filters returned no error and zero rows, so it looked like a success; updateDocument now selects the id back and reports a permission error on zero rows. The permission regex only matches 403 as a whole word." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 3: Tests de guardia y de `Ver` que prueban lo que dicen (#52)

**Files:**
- Modify: `src/documents/PlayerDocumentsSection.test.tsx`

- [x] **Step 1: Reescribir los dos tests**

En el import de Testing Library agrega `act`: `import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'`.

Reemplaza el test `a second upload while one is in flight is ignored` completo por:

```ts
test('a second upload while one is in flight is ignored', async () => {
  let resolve!: (v: { ok: boolean }) => void
  mocks.uploadDocument.mockReturnValueOnce(new Promise((r) => { resolve = r }))
  renderSection({ documents: docs(granted) })
  const input = within(row('CURP')).getByLabelText('Subir archivo')
  const f = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  // fireEvent, not user.upload: user-event skips a disabled input, which would hide a missing guard
  fireEvent.change(input, { target: { files: [f] } })
  fireEvent.change(input, { target: { files: [f] } })
  expect(mocks.uploadDocument).toHaveBeenCalledTimes(1)
  await act(async () => resolve({ ok: true }))
})
```

Reemplaza el test `Ver opens the tab synchronously, drops the opener and assigns the signed URL` completo por:

```ts
test('Ver opens the tab synchronously, drops the opener and assigns the signed URL', async () => {
  const fakeWin = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
  let sign!: (url: string) => void
  mocks.getSignedFileUrl.mockReturnValueOnce(new Promise<string>((r) => { sign = r }))
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.click(within(row('CURP')).getByRole('button', { name: 'Ver' }))
  expect(open).toHaveBeenCalledWith('', '_blank')
  expect(fakeWin.opener).toBeNull()
  expect(fakeWin.location.href).toBe('')
  await act(async () => sign('https://signed/url'))
  expect(fakeWin.location.href).toBe('https://signed/url')
  expect(mocks.getSignedFileUrl).toHaveBeenCalledWith('t1/p1/curp')
  open.mockRestore()
})
```

- [x] **Step 2: Verificar que pasan**

Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx` → todo PASS (mismo número de tests).

- [x] **Step 3: Mutación (a) — quitar la guardia**

En `src/documents/PlayerDocumentsSection.tsx` borra la línea `    if (inFlight.current) return`.
Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx -t "second upload"` → FAIL (`uploadDocument` llamado 2 veces). (Verificado al planear: el test viejo con `user.upload` seguía pasando con esta mutación.)
Restaura: `git -C $WT checkout -- src/documents/PlayerDocumentsSection.tsx`.

- [x] **Step 4: Mutación (b) — abrir la pestaña después del `await`**

En `handleView`, mueve la firma antes de abrir: reemplaza

```ts
    const w = window.open('', '_blank')
```

por

```ts
    const url = await getSignedFileUrl(doc.file_path)
    const w = window.open('', '_blank')
```

y `w.location.href = await getSignedFileUrl(doc.file_path)` por `w.location.href = url`.
Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx -t "Ver opens"` → FAIL (`window.open` no se llamó). (El test viejo pasaba con esta mutación.)
Restaura: `git -C $WT checkout -- src/documents/PlayerDocumentsSection.tsx`.

- [x] **Step 5: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-c-documents.md src/documents/PlayerDocumentsSection.test.tsx
git -C $WT commit -m "test: make the documents in-flight guard and Ver tests fail without their code (#52)" -m "The double-upload test passed through user-event skipping a disabled input, and the Ver test passed even if window.open ran after the await. Both now fail when the guard or the synchronous open is removed." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: Todas las filas quietas mientras una guarda (#51)

**Files:**
- Modify: `src/documents/PlayerDocumentsSection.test.tsx`
- Modify: `src/documents/PlayerDocumentsSection.tsx`

- [x] **Step 1: Test (rojo)**

Al final del archivo de tests agrega:

```ts
test('while one row saves, every row is disabled, then all come back', async () => {
  let resolve!: (v: { ok: boolean }) => void
  mocks.uploadDocument.mockReturnValueOnce(new Promise((r) => { resolve = r }))
  renderSection({ documents: docs(granted) })
  fireEvent.change(within(row('CURP')).getByLabelText('Subir archivo'), {
    target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
  })
  const other = row('Acta de nacimiento')
  expect(within(other).getByLabelText('Subir archivo')).toBeDisabled()
  expect(within(other).getByRole('combobox')).toBeDisabled()
  expect(within(other).queryByLabelText('Guardando')).not.toBeInTheDocument()
  expect(within(row('CURP')).getByLabelText('Guardando')).toBeInTheDocument()
  await act(async () => resolve({ ok: true }))
  expect(within(other).getByLabelText('Subir archivo')).toBeEnabled()
  expect(within(other).getByRole('combobox')).toBeEnabled()
})
```

Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx -t "every row is disabled"`
Expected: FAIL — la subida de "Acta de nacimiento" sigue habilitada.

- [x] **Step 2: Implementar**

En `PlayerDocumentsSection.tsx`, antes de `const granted = consentGranted(documents)` agrega `const anyBusy = busyId !== null`. En la fila: el `TextField` de Estatus pasa de `disabled={busy}` a `disabled={anyBusy}`; el `Button component="label"` y su `<input>` pasan de `disabled={busy || uploadLocked}` a `disabled={anyBusy || uploadLocked}`. El spinner sigue con `busy` (solo en la fila que guarda). `Ver` no cambia (no escribe nada).

Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx` → todo PASS.

- [x] **Step 3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-c-documents.md src/documents/PlayerDocumentsSection.tsx src/documents/PlayerDocumentsSection.test.tsx
git -C $WT commit -m "fix: disable every document row while one is saving (#51)" -m "The in-flight guard is section-wide, so controls on other rows looked enabled but silently dropped the chosen file or snapped the status back." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 5: Recargar las filas tras un fallo (#50, parte de la sección)

**Files:**
- Modify: `src/documents/PlayerDocumentsSection.test.tsx`
- Modify: `src/documents/PlayerDocumentsSection.tsx`

**Interfaces:**
- Produces: `PlayerDocumentsSectionProps.onReload?: () => Promise<void> | void`. Opcional a propósito: `PlayerFormPage` compila igual sin pasarla, y el lote D la conecta (`onReload={refreshDocuments}`) en su Task 8, después del merge de este lote. `onChanged` no cambia de firma.

- [x] **Step 1: Test (rojo)**

Al final del archivo de tests agrega:

```ts
test('a failed change reloads the rows without a success toast and stays busy until then', async () => {
  mocks.setDocumentStatus.mockResolvedValueOnce({ ok: false, error: 'No se pudo eliminar el archivo.' })
  let finishReload!: () => void
  const onReload = vi.fn(() => new Promise<void>((r) => { finishReload = r }))
  const user = userEvent.setup()
  const { onChanged } = renderSection({ documents: docs({ ...granted, image_consent: 'digital' }), onReload })
  await user.selectOptions(within(row('Consentimiento de imagen')).getByRole('combobox'), 'fisico')
  await user.click(await screen.findByRole('button', { name: 'Eliminar archivo' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo eliminar el archivo.')
  await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
  expect(onChanged).not.toHaveBeenCalled()
  const select = within(row('Consentimiento de imagen')).getByRole('combobox')
  expect(select).toBeDisabled()
  await act(async () => finishReload())
  expect(select).toBeEnabled()
  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo eliminar el archivo.')
})
```

Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx -t "reloads the rows"`
Expected: FAIL — `onReload` nunca se llama.

- [x] **Step 2: Implementar**

En `PlayerDocumentsSectionProps` agrega `onReload?: () => Promise<void> | void` después de `onChanged`, y desestructúralo en la firma del componente (`{ documents, canEdit, hasPhoto, onChanged, onReload }`). En `run`, reemplaza:

```ts
      if (res.ok) await onChanged('Documento actualizado')
      else setError(res.error ?? 'No se pudo actualizar el documento.')
```

por:

```ts
      if (res.ok) {
        await onChanged('Documento actualizado')
      } else {
        setError(res.error ?? 'No se pudo actualizar el documento.')
        // part of the change may have landed (e.g. consent updated, file not removed), so reload the rows
        await onReload?.()
      }
```

Run: `pnpm exec vitest run src/documents/PlayerDocumentsSection.test.tsx` → todo PASS.

- [x] **Step 3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 8` tests (Task 1: 3; Task 2: 3; Task 4: 1; Task 5: 1), todo verde (esperado 45 / 457). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [x] **Step 4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-c-documents.md src/documents/PlayerDocumentsSection.tsx src/documents/PlayerDocumentsSection.test.tsx
git -C $WT commit -m "fix: let the documents section reload its rows after a failed change (#50)" -m "A consent update can land before its file removal fails, leaving the section showing a stale consent. The section now calls an optional onReload after any failure, with no success toast, and stays busy until it finishes. The page wiring lands with the player page lote." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** SHAs, `B_files`/`B_tests` y conteos finales, salida de cada rojo (Task 2 Step 3, Task 4 Step 1, Task 5 Step 1), de cada mutación (Task 1 Step 3, Task 3 Steps 3–4) y de cada verde.

---

## Verificación en navegador (orquestador, después de la revisión limpia)

Dev server en el worktree del lote y la sesión admin persistente de Playwright. **Nunca se toca al jugador real**: todo sobre un jugador de prueba que el orquestador crea y borra.

- [ ] **Baseline antes** (query del spec §5): 1 tenant, 3 profiles, 3 users, 1 jugador, 6 documentos, 0 pagos, 1 objeto en `player-files`.
- [ ] **Jugador de prueba:** créalo por la UI (`/jugadores/nuevo`) con un nombre único (p. ej. `ZZ Prueba C <fecha-hora>`); anota id y nombre exacto. Pon sus dos consentimientos en Físico.
- [ ] En su ficha, cambia un documento **no** de consentimiento de Pendiente a Físico: toast "Documento actualizado", el chip pasa a Físico y **no** aparece "No tienes permiso para esta acción." (confirma que `.select('id')` devuelve la fila bajo la RLS real). Regrésalo a Pendiente (mismo resultado).
- [ ] Mientras guarda (con la red en "Slow 3G" si hace falta), los selects y botones de las otras filas se ven deshabilitados (#51).
- [ ] **Limpieza:** si quedó algún objeto en `player-files` bajo `<tenant>/<id>/`, bórralo por la API de Storage. Después, como `postgres` por MCP: `delete from public.players where id = '<id>' and full_name = '<nombre exacto>';` (1 fila; sus documentos caen por `on delete cascade`).
- [ ] **Baseline después:** 1 tenant, 3 profiles, 3 users, 1 jugador, 6 documentos, 0 pagos, 1 objeto.

## Discrepancias

- **#50 se reparte entre C y D.** La recarga vive en la sección (este lote), pero solo sirve cuando la página la conecta, y la página es de D. Cambiar la firma de `onChanged` (la sugerencia del issue) obligaría a editar `PlayerFormPage`, que D reescribe en paralelo. Por eso `onReload` es una prop nueva y opcional: este lote compila solo, y D la conecta en su Task 8, que espera a que este lote esté en `develop`. La parte de la foto de #50 ("fix both together") también va en D (`PlayerPhoto` es de D). Por eso este PR lleva `Refs #50` y el de D `Closes #50`.
- **Zero-row en el `uploadDocument`:** un update a cero filas cuenta como fallo, así que también hace el rollback del objeto recién subido (test `rolls back a new upload whose update matched zero rows`). El issue no lo pedía, pero sin rollback quedaría un objeto huérfano en Storage.
- **Mismo hueco en `players.ts`:** `uploadPlayerPhoto` y `removePlayerPhoto` tampoco detectan un update filtrado a cero filas. No está en ningún issue y `players.ts` no es de este lote: el orquestador puede registrarlo como issue nuevo.
- **Nit opcional de la revisión (recargar también tras un error de validación del cliente): no se aplica.** La validación vive en `uploadDocument` (capa de datos); para distinguirla en la sección habría que duplicar `validateDocumentFile` en `handleFile`. El costo de no hacerlo es una lectura extra de documentos tras elegir un archivo inválido, sin efecto visible.
