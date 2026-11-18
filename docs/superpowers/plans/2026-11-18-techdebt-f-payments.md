# Lote F — Pagos: accesibilidad y tests (#66, #67, #68, #72, #74) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Cerrar los cinco follow-ups de pagos: la confirmación de borrado ya no se queda sin título mientras se cierra (#66), los botones Editar/Borrar de cada pago tienen un nombre accesible distinto (#67), un test fija la validación de fecha vacía en `PaymentDialog` (#68), el link de cada jugador en Quién debe se anuncia con su nombre y el desglose va como descripción (#72), y un test fija el estado "Cargando…" de Quién debe (#74).

**Architecture:** Solo frontend, solo `src/payments/*`. `PlayerPaymentsSection` separa "qué pago se va a borrar" (`confirm`) de "el diálogo está abierto" (`confirmOpen`) y limpia `confirm` en `slotProps.transition.onExited`, el mismo patrón que `AddPlayerDialog`. Los botones por fila llevan `aria-label` con el texto del pago. En `DebtorsPage`, `PlayerLink` pone `aria-label={player.full_name}` y `aria-describedby` apuntando a la categoría y, si hay, al desglose de cargos (envuelto en un `<div>` sin estilos). Sin cambios de base de datos, de API ni visuales.

**Tech Stack:** React 19.2, MUI 9, react-router-dom 7, Vitest 4.1.9 + Testing Library + user-event 14, TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§2 decisión del owner sobre #72, §4 lote F, §5 restricciones de UI).

## Global Constraints

- Rama `fix/payments-a11y-tests`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/payments-a11y-tests` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Archivos permitidos** (solo estos): `src/payments/PlayerPaymentsSection.tsx`, `src/payments/PlayerPaymentsSection.test.tsx`, `src/payments/PaymentDialog.test.tsx`, `src/payments/DebtorsPage.tsx`, `src/payments/DebtorsPage.test.tsx` y este plan. En `DebtorsPage.tsx` **no** cambies el markup de lista (`<List>`, `<li>`, `ListItem`): eso es #71, lote H, ola 2.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `24c14a4`: **45 archivos, 449 tests**. Este lote agrega **0 archivos y +5 tests**.

## Review Focus

- **El diálogo de confirmación conserva su título y su nombre accesible mientras se cierra** (Cancelar, Escape, borrado exitoso y borrado fallido): fijado en Task 2.
- **Doble click en Borrar sigue borrando una sola vez** con el nuevo `confirmOpen`: el test existente `a double click on Borrar deletes once` sigue verde.
- **"Visualmente no cambia nada" en Quién debe (decisión del owner #72):** solo atributos ARIA y un `<div>` sin estilos alrededor del desglose. El orquestador lo confirma en navegador.
- **El link no pierde la categoría para lectores de pantalla:** pasa del nombre a la descripción (`aria-describedby` apunta a la categoría y al desglose).

---

## Task 0: Preparar y medir el baseline

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `fix/payments-a11y-tests`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [ ] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 45 y 449, todo verde).

---

## Task 1: Nombres accesibles distintos para Editar/Borrar por pago (#67)

**Files:**
- Modify: `src/payments/PlayerPaymentsSection.test.tsx` (tests l.78–84, 110–176)
- Modify: `src/payments/PlayerPaymentsSection.tsx` (botones l.148–153)

El texto visible sigue siendo "Editar"/"Borrar"; el `aria-label` empieza con ese mismo texto (WCAG 2.5.3, *label in name*) y agrega `paymentText(p)`. El botón **Borrar del diálogo** de confirmación no cambia (se busca con `within(dialog)`).

- [ ] **Step 1.1: Actualizar los tests (rojo)**

En `src/payments/PlayerPaymentsSection.test.tsx`, reemplaza el test `admin sees Registrar pago and per-row Editar and Borrar` completo por:

```tsx
test('admin sees Registrar pago and per-row Editar and Borrar named after the payment', async () => {
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument()
  expect(within(item).getByRole('button', { name: 'Editar Mensualidad — Octubre' })).toHaveTextContent('Editar')
  expect(within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre' })).toHaveTextContent('Borrar')
  const other = screen.getByRole('listitem', { name: 'Inscripción' })
  expect(within(other).getByRole('button', { name: 'Editar Inscripción' })).toBeInTheDocument()
  expect(within(other).getByRole('button', { name: 'Borrar Inscripción' })).toBeInTheDocument()
})
```

Y en el resto del archivo cambia los nombres de los botones **de fila** (los que se buscan con `within(item)`), sin tocar los `within(dialog)`:

- `within(item).getByRole('button', { name: 'Editar' })` → `within(item).getByRole('button', { name: 'Editar Mensualidad — Octubre' })` (1 vez, en `editing settles a partial payment`).
- `within(item).getByRole('button', { name: 'Borrar' })` → `within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre' })` (4 veces: `Cancelar in the delete confirmation deletes nothing`, `confirming the delete removes it, reloads and reports`, `a failed delete shows an inline alert and closes the confirmation`, `a double click on Borrar deletes once`).

Comprobación: `grep -n "within(item).getByRole('button', { name: '\(Editar\|Borrar\)' })" src/payments/PlayerPaymentsSection.test.tsx` → sin salida.

Run: `pnpm exec vitest run src/payments/PlayerPaymentsSection.test.tsx`
Expected: FAIL en 6 tests (`admin sees … named after the payment`, `editing settles a partial payment`, `Cancelar in the delete confirmation deletes nothing`, `confirming the delete removes it, reloads and reports`, `a failed delete shows an inline alert and closes the confirmation`, `a double click on Borrar deletes once`) con `Unable to find an accessible element with the role "button" and name "Editar Mensualidad — Octubre"` / `"Borrar Mensualidad — Octubre"`; 5 pasan.

- [ ] **Step 1.2: Implementar**

En `src/payments/PlayerPaymentsSection.tsx`, reemplaza:

```tsx
                  <Button size="small" onClick={() => openDialog(p)}>
                    Editar
                  </Button>
                  <Button size="small" color="error" onClick={() => setConfirm(p)}>
                    Borrar
                  </Button>
```

por:

```tsx
                  <Button size="small" onClick={() => openDialog(p)} aria-label={`Editar ${paymentText(p)}`}>
                    Editar
                  </Button>
                  <Button size="small" color="error" onClick={() => setConfirm(p)} aria-label={`Borrar ${paymentText(p)}`}>
                    Borrar
                  </Button>
```

Run: `pnpm exec vitest run src/payments/PlayerPaymentsSection.test.tsx`
Expected: 11 tests PASS.

- [ ] **Step 1.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-f-payments.md src/payments/PlayerPaymentsSection.tsx src/payments/PlayerPaymentsSection.test.tsx
```

```bash
git -C $WT commit -m "fix: name each payment's Editar and Borrar buttons after the payment (#67)" -m "Every row announced the same two names, so a screen reader's button list showed N identical entries. The aria-label keeps the visible word first and adds the payment text." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: La confirmación de borrado conserva su título al cerrarse (#66)

**Files:**
- Modify: `src/payments/PlayerPaymentsSection.test.tsx` (test nuevo al final)
- Modify: `src/payments/PlayerPaymentsSection.tsx` (estado l.43, `handleDelete` l.92–110, botón Borrar de fila, `<Dialog>` l.169–187)

Hoy `open={confirm !== null}` y el título es `confirm ? … : ''`: al cerrar, `confirm` pasa a `null` antes de la transición de salida de MUI y el diálogo que se desvanece queda con título (y nombre accesible) vacío.

- [ ] **Step 2.1: Escribir el test (rojo)**

Agrega al final de `src/payments/PlayerPaymentsSection.test.tsx`:

```tsx
test('the delete confirmation keeps its title while it closes', async () => {
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre' }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(dialog).toBeInTheDocument()
  expect(dialog).toHaveAccessibleName('¿Borrar el pago de Mensualidad — Octubre?')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
```

(`expect(dialog).toBeInTheDocument()` prueba que la salida está en curso: el diálogo sigue montado durante el fade.)

Run: `pnpm exec vitest run src/payments/PlayerPaymentsSection.test.tsx`
Expected: FAIL solo en `the delete confirmation keeps its title while it closes`, en `toHaveAccessibleName` (`Expected element to have accessible name: ¿Borrar el pago de Mensualidad — Octubre?` / `Received:` vacío); 11 pasan.

- [ ] **Step 2.2: Implementar**

En `src/payments/PlayerPaymentsSection.tsx`:

1. Debajo de `const [confirm, setConfirm] = useState<PaymentRow | null>(null)` agrega:

```tsx
  const [confirmOpen, setConfirmOpen] = useState(false)
```

2. Justo antes de `async function handleDelete() {` agrega:

```tsx
  function openConfirm(payment: PaymentRow) {
    setConfirm(payment)
    setConfirmOpen(true)
  }

```

3. En `handleDelete`, cambia `setConfirm(null)` (la línea después de `await deletePayment(confirm.id)`) por `setConfirmOpen(false)`.

4. En el botón Borrar de fila, cambia `onClick={() => setConfirm(p)}` por `onClick={() => openConfirm(p)}`.

5. Reemplaza el `<Dialog …>` de confirmación hasta el botón Cancelar:

```tsx
      <Dialog
        open={confirm !== null}
        onClose={() => {
          if (!deleting) setConfirm(null)
        }}
        aria-labelledby="delete-payment-title"
      >
        <DialogTitle id="delete-payment-title">
          {confirm ? `¿Borrar el pago de ${paymentText(confirm)}?` : ''}
        </DialogTitle>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={deleting}>
```

por:

```tsx
      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!deleting) setConfirmOpen(false)
        }}
        aria-labelledby="delete-payment-title"
        slotProps={{ transition: { onExited: () => setConfirm(null) } }}
      >
        <DialogTitle id="delete-payment-title">
          {confirm ? `¿Borrar el pago de ${paymentText(confirm)}?` : ''}
        </DialogTitle>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={deleting}>
```

El guard `if (!confirm || deleteInFlight.current) return` de `handleDelete` no cambia.

Comprobación: `grep -n "setConfirm(null)" src/payments/PlayerPaymentsSection.tsx` → una sola línea (la de `onExited`).

Run: `pnpm exec vitest run src/payments/PlayerPaymentsSection.test.tsx`
Expected: 12 tests PASS.

- [ ] **Step 2.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-f-payments.md src/payments/PlayerPaymentsSection.tsx src/payments/PlayerPaymentsSection.test.tsx
```

```bash
git -C $WT commit -m "fix: keep the payment delete confirmation titled while it closes (#66)" -m "The row was cleared before MUI's exit transition, so the fading dialog had an empty title and accessible name. A separate confirmOpen flag closes it and the row is cleared on onExited." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 3: Test de fecha vacía en `PaymentDialog` (#68)

**Files:**
- Modify: `src/payments/PaymentDialog.test.tsx` (test nuevo al final)

La validación ya existe (`validatePayment`, `src/payments/payments.ts:121`, `if (values.payment_date === '') errors.payment_date = 'Ingresa la fecha.'`). El test es de caracterización, así que pasa al primer intento; el rojo se demuestra con una mutación temporal.

- [ ] **Step 3.1: Escribir el test**

Agrega al final de `src/payments/PaymentDialog.test.tsx`:

```tsx
test('an empty date blocks the save', async () => {
  const user = userEvent.setup()
  renderDialog()
  await user.type(screen.getByLabelText('Monto'), '200')
  await user.clear(screen.getByLabelText('Fecha'))
  expect(screen.getByLabelText('Fecha')).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(screen.getByText('Ingresa la fecha.')).toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()
})
```

Run: `pnpm exec vitest run src/payments/PaymentDialog.test.tsx`
Expected: 10 tests PASS.

- [ ] **Step 3.2: Mutación (rojo demostrado)**

Borra temporalmente la línea `  if (values.payment_date === '') errors.payment_date = 'Ingresa la fecha.'` de `src/payments/payments.ts`.

Run: `pnpm exec vitest run src/payments/PaymentDialog.test.tsx`
Expected: FAIL solo en `an empty date blocks the save` (no encuentra `Ingresa la fecha.`).

Restaura: `git -C $WT checkout -- src/payments/payments.ts`, y `git -C $WT diff --stat -- src/payments/payments.ts` → vacío. Vuelve a correr el archivo → 10 PASS.

- [ ] **Step 3.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-f-payments.md src/payments/PaymentDialog.test.tsx
```

```bash
git -C $WT commit -m "test: pin the empty-date validation of the payment dialog (#68)" -m "The dialog is not a form, so required on Fecha is only visual; the test makes sure an empty date never reaches onSave." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 4: El link del deudor se anuncia con el nombre del jugador (#72)

**Files:**
- Modify: `src/payments/DebtorsPage.test.tsx` (2 tests nuevos al final)
- Modify: `src/payments/DebtorsPage.tsx` (import l.1, `PlayerLink` l.44–51)

Decisión del owner (spec §2): `aria-label` = nombre del jugador, el desglose en `aria-describedby`, sin cambio visual. Como `aria-label` reemplaza todo el contenido del link, la categoría también sale del nombre; por eso la descripción apunta a la categoría **y** al desglose. Se aplica a todos los links de la página (los de Sin pagos y Al corriente quedan con nombre = jugador y descripción = categoría). No toques `GroupSection`, `<List>` ni el resto del markup de lista (#71, lote H).

- [ ] **Step 4.1: Escribir los tests (rojo)**

Agrega al final de `src/payments/DebtorsPage.test.tsx`:

```tsx
test('a debtor link is named by the player and described by the category and the open charges', async () => {
  renderPage()
  const region = await screen.findByRole('region', { name: 'Con adeudo (1)' })
  const link = within(region).getByRole('link', { name: 'Ana Ruiz' })
  expect(link).toHaveAccessibleDescription('Infantil Mayor (1ro) Mensualidad — Octubre · $200.00 Parcial')
})

test('a link without open charges is named by the player and described by the category', async () => {
  renderPage()
  const region = await screen.findByRole('region', { name: 'Sin pagos (1)' })
  expect(within(region).getByRole('link', { name: 'Beto Gómez' })).toHaveAccessibleDescription('Infantil Mayor (1ro)')
})
```

Run: `pnpm exec vitest run src/payments/DebtorsPage.test.tsx`
Expected: FAIL en los 2 tests nuevos con `Unable to find an accessible element with the role "link" and name "Ana Ruiz"` (y `"Beto Gómez"`); los 8 existentes pasan.

- [ ] **Step 4.2: Implementar**

En `src/payments/DebtorsPage.tsx`:

1. Cambia `import { useEffect, useState } from 'react'` por `import { useEffect, useId, useState } from 'react'`.
2. Reemplaza `PlayerLink` completo por:

```tsx
function PlayerLink({ player, children }: { player: PlayerRow; children?: ReactNode }) {
  const id = useId()
  const categoryId = `${id}-category`
  const chargesId = `${id}-charges`
  return (
    <ListItemButton
      component={RouterLink}
      to={`/jugadores/${player.id}`}
      divider
      sx={{ display: 'block' }}
      aria-label={player.full_name}
      aria-describedby={children ? `${categoryId} ${chargesId}` : categoryId}
    >
      <ListItemText
        primary={player.full_name}
        secondary={playerCategoryText(player)}
        slotProps={{ secondary: { id: categoryId } }}
      />
      {children && <div id={chargesId}>{children}</div>}
    </ListItemButton>
  )
}
```

El `<div>` no lleva estilos: el `Stack` del desglose sigue siendo su único hijo, con su `mb: 1`, así que el layout no cambia. Los llamadores de `PlayerLink` no cambian.

Run: `pnpm exec vitest run src/payments/DebtorsPage.test.tsx`
Expected: 10 tests PASS (incluido `tapping a player opens the player detail`, que busca `/Beto Gómez/`).

- [ ] **Step 4.3: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-f-payments.md src/payments/DebtorsPage.tsx src/payments/DebtorsPage.test.tsx
```

```bash
git -C $WT commit -m "fix: announce Quién debe links by the player's name, breakdown as description (#72)" -m "The whole breakdown sat inside the link name, which was long for screen readers. Per the owner's decision the name is the player and the category plus open charges go in aria-describedby; nothing changes visually." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 5: Test del estado "Cargando…" de Quién debe (#74)

**Files:**
- Modify: `src/payments/DebtorsPage.test.tsx` (test nuevo al final)

El issue tiene dos puntos. (1) Falta un test de "Cargando…": se agrega aquí. (2) El test `admin and readonly see the same read-only page` pasa trivialmente porque `DebtorsPage` no lee `TenantContext`; el issue dice explícitamente "no change needed" (es una guarda contra acoplar el rol en el futuro). Se deja tal cual y el PR lo cita al cerrar #74.

- [ ] **Step 5.1: Escribir el test**

Agrega al final de `src/payments/DebtorsPage.test.tsx`:

```tsx
test('shows Cargando… while the three reads are pending', async () => {
  mocks.fetchPlayers.mockReturnValue(new Promise(() => {}))
  mocks.fetchPaymentStatuses.mockReturnValue(new Promise(() => {}))
  mocks.fetchOutstandingPayments.mockReturnValue(new Promise(() => {}))
  renderPage()
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
})
```

Run: `pnpm exec vitest run src/payments/DebtorsPage.test.tsx`
Expected: 11 tests PASS.

- [ ] **Step 5.2: Mutación (rojo demostrado)**

En `src/payments/DebtorsPage.tsx` cambia temporalmente `<Typography sx={{ mt: 2 }}>Cargando…</Typography>` por `<Typography sx={{ mt: 2 }}>Cargando</Typography>`.

Run: `pnpm exec vitest run src/payments/DebtorsPage.test.tsx`
Expected: FAIL solo en `shows Cargando… while the three reads are pending`.

Restaura el texto exacto `Cargando…` (con la elipsis `…`, U+2026). `git -C $WT diff -- src/payments/DebtorsPage.tsx` debe mostrar solo los cambios de Task 4. Vuelve a correr → 11 PASS.

- [ ] **Step 5.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 5` tests (1 de Task 2, 1 de Task 3, 2 de Task 4, 1 de Task 5), todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 5.4: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-f-payments.md src/payments/DebtorsPage.test.tsx
```

```bash
git -C $WT commit -m "test: pin the Cargando… state of Quién debe (#74)" -m "Keeps the three reads pending and asserts the loading copy and that no group renders yet. The role test stays as the guard the payments plan intended." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 5 SHAs, `B_files`/`B_tests` y conteos finales, salidas de los rojos (1.1, 2.1, 4.1) y de las mutaciones (3.2, 5.2), y las tres salidas verdes del Step 5.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- PR a `develop` con `Closes #66`, `Closes #67`, `Closes #68`, `Closes #72`, `Closes #74`. En el cuerpo, para #74: el punto 2 del issue no pide cambio ("no change needed"); se cierra con el test del punto 1.
- **Verificación en navegador** (Playwright, sesión admin persistente, dev server en `http://localhost:5173`; desktop y 390 px):
  1. **Quién debe** (`/quien-debe`): la página se ve igual que antes del cambio (comparar con una captura previa al merge si está disponible): nombre, categoría, desglose y chip en las mismas posiciones. En el árbol de accesibilidad (`page.accessibility.snapshot()` o `getByRole('link', { name: <nombre del jugador> })`), cada link se llama exactamente como el jugador. Con la data de hoy (1 jugador, 0 pagos) el jugador aparece en Sin pagos, así que solo se ve el caso sin desglose; el de Con adeudo queda cubierto por el test de Task 4.
  2. **Ficha del jugador → Pagos**: con 0 pagos no hay filas. No registres pagos en la base viva para esta verificación salvo que el owner lo autorice; los botones por fila y la confirmación quedan cubiertos por los tests de Tasks 1 y 2.

---

## Discrepancias

- **#66 propone dos alternativas** ("keep a separate `confirmOpen` boolean … or clear it in `slotProps.transition.onExited`"). El plan usa las dos juntas: `confirmOpen` controla `open` y `onExited` limpia la fila. Es el mismo patrón que `AddPlayerDialog.tsx:69-75,90`.
- **#72 en todos los links, no solo en los de Con adeudo:** con `aria-label` solo en los deudores, los links de Sin pagos y Al corriente seguirían llamándose "Nombre Categoría" y la página quedaría inconsistente. Todos pasan a nombre = jugador, descripción = categoría (+ desglose si hay).
- **#68 y #74 son tests de caracterización:** el comportamiento ya existe, así que no hay rojo natural. Se demuestra con una mutación temporal que se revierte (Steps 3.2 y 5.2).
- **Línea de #67:** el issue cita `PlayerPaymentsSection.tsx:148-153`; en `origin/develop` (`24c14a4`) los botones siguen en esas líneas. Sin cambios.
