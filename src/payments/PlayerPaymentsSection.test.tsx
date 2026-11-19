import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { PlayerPaymentsSection } from './PlayerPaymentsSection'
import type { PaymentRow } from './payments'

const mocks = vi.hoisted(() => ({
  fetchPlayerPayments: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  deletePayment: vi.fn(),
}))
vi.mock('./payments', async (importActual) => {
  const actual = await importActual<typeof import('./payments')>()
  return {
    ...actual,
    fetchPlayerPayments: mocks.fetchPlayerPayments,
    createPayment: mocks.createPayment,
    updatePayment: mocks.updatePayment,
    deletePayment: mocks.deletePayment,
  }
})

function row(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay1', tenant_id: 't1', player_id: 'p1', concept: 'inscripcion', concept_note: null,
    amount: 500, payment_date: '2026-10-04', method: 'efectivo', status: 'pagado',
    created_at: '', updated_at: '', ...over,
  }
}

const parcial = row({
  id: 'pay1', concept: 'mensualidad', concept_note: 'Octubre', amount: 150.5,
  payment_date: '2026-10-04', method: 'transferencia', status: 'parcial',
})
const pagado = row({ id: 'pay2', amount: 1500, payment_date: '2026-09-01' })

function renderSection(canEdit = true) {
  const onChanged = vi.fn()
  render(<PlayerPaymentsSection playerId="p1" tenantId="t1" canEdit={canEdit} onChanged={onChanged} />)
  return { onChanged }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchPlayerPayments.mockResolvedValue([parcial, pagado])
  mocks.createPayment.mockResolvedValue({ ok: true })
  mocks.updatePayment.mockResolvedValue({ ok: true })
  mocks.deletePayment.mockResolvedValue({ ok: true })
})

test('lists payments in server order with money, date, method and status chip', async () => {
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  expect(screen.getByRole('heading', { name: 'Pagos' })).toBeInTheDocument()
  expect(within(item).getByText('$150.50 · 04/10/2026 · Transferencia')).toBeInTheDocument()
  expect(within(item).getByText('Parcial')).toBeInTheDocument()
  expect(screen.getByRole('listitem', { name: 'Inscripción' })).toHaveTextContent('$1,500.00 · 01/09/2026 · Efectivo')
  expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
    'Mensualidad — Octubre',
    'Inscripción',
  ])
  expect(mocks.fetchPlayerPayments).toHaveBeenCalledWith('p1')
})

test('shows an empty state', async () => {
  mocks.fetchPlayerPayments.mockResolvedValueOnce([])
  renderSection()
  expect(await screen.findByText('Sin pagos registrados.')).toBeInTheDocument()
})

test('readonly sees the list without any action', async () => {
  renderSection(false)
  await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('admin sees Registrar pago and per-row Editar and Borrar named after the payment', async () => {
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument()
  expect(within(item).getByRole('button', { name: 'Editar Mensualidad — Octubre · $150.50 · 04/10/2026' })).toHaveTextContent('Editar')
  expect(within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre · $150.50 · 04/10/2026' })).toHaveTextContent('Borrar')
  const other = screen.getByRole('listitem', { name: 'Inscripción' })
  expect(within(other).getByRole('button', { name: 'Editar Inscripción · $1,500.00 · 01/09/2026' })).toBeInTheDocument()
  expect(within(other).getByRole('button', { name: 'Borrar Inscripción · $1,500.00 · 01/09/2026' })).toBeInTheDocument()
})

test('a failed load shows LoadError and Reintentar reloads', async () => {
  mocks.fetchPlayerPayments.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderSection()
  expect(await screen.findByText('No se pudieron cargar los pagos.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })).toBeInTheDocument()
  expect(mocks.fetchPlayerPayments).toHaveBeenCalledTimes(2)
})

test('registering a payment creates it, reloads and reports', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderSection()
  await user.click(await screen.findByRole('button', { name: 'Registrar pago' }))
  const dialog = await screen.findByRole('dialog', { name: 'Registrar pago' })
  await user.type(within(dialog).getByLabelText('Monto'), '200')
  await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(mocks.createPayment).toHaveBeenCalledWith('p1', 't1', expect.objectContaining({ amount: '200', concept: 'inscripcion' })),
  )
  expect(onChanged).toHaveBeenCalledWith('Pago registrado')
  await waitFor(() => expect(mocks.fetchPlayerPayments).toHaveBeenCalledTimes(2))
})

test('editing settles a partial payment', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: 'Editar Mensualidad — Octubre · $150.50 · 04/10/2026' }))
  const dialog = await screen.findByRole('dialog', { name: 'Editar pago' })
  const amount = within(dialog).getByLabelText('Monto')
  expect(amount).toHaveValue('150.5')
  await user.clear(amount)
  await user.type(amount, '300')
  await user.selectOptions(within(dialog).getByLabelText('Estatus'), 'pagado')
  await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(mocks.updatePayment).toHaveBeenCalledWith('pay1', expect.objectContaining({ amount: '300', status: 'pagado', concept_note: 'Octubre' })),
  )
  expect(onChanged).toHaveBeenCalledWith('Pago actualizado')
  await waitFor(() => expect(mocks.fetchPlayerPayments).toHaveBeenCalledTimes(2))
})

test('Cancelar in the delete confirmation deletes nothing', async () => {
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre · $150.50 · 04/10/2026' }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(mocks.deletePayment).not.toHaveBeenCalled()
})

test('confirming the delete removes it, reloads and reports', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre · $150.50 · 04/10/2026' }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  await user.click(within(dialog).getByRole('button', { name: 'Borrar' }))
  await waitFor(() => expect(mocks.deletePayment).toHaveBeenCalledWith('pay1'))
  expect(onChanged).toHaveBeenCalledWith('Pago eliminado')
  await waitFor(() => expect(mocks.fetchPlayerPayments).toHaveBeenCalledTimes(2))
})

test('a failed delete shows an inline alert and closes the confirmation', async () => {
  mocks.deletePayment.mockResolvedValueOnce({ ok: false, error: 'No se encontró el pago o no tienes permiso.' })
  const user = userEvent.setup()
  const { onChanged } = renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre · $150.50 · 04/10/2026' }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  await user.click(within(dialog).getByRole('button', { name: 'Borrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el pago o no tienes permiso.')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(onChanged).not.toHaveBeenCalled()
})

test('a double click on Borrar deletes once', async () => {
  mocks.deletePayment.mockReturnValueOnce(new Promise(() => {}))
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: 'Borrar Mensualidad — Octubre · $150.50 · 04/10/2026' }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  const confirm = within(dialog).getByRole('button', { name: 'Borrar' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  await waitFor(() => expect(mocks.deletePayment).toHaveBeenCalledTimes(1))
  expect(confirm).toBeDisabled()
})

test('two payments with the same concept get different button names', async () => {
  mocks.fetchPlayerPayments.mockResolvedValueOnce([
    row({ id: 'a', concept: 'mensualidad', concept_note: 'Octubre', amount: 200, payment_date: '2026-10-01' }),
    row({ id: 'b', concept: 'mensualidad', concept_note: 'Octubre', amount: 100, payment_date: '2026-10-15' }),
  ])
  renderSection()
  await screen.findAllByRole('listitem', { name: 'Mensualidad — Octubre' })
  expect(screen.getAllByRole('button', { name: /^Editar / }).map((b) => b.getAttribute('aria-label'))).toEqual([
    'Editar Mensualidad — Octubre · $200.00 · 01/10/2026',
    'Editar Mensualidad — Octubre · $100.00 · 15/10/2026',
  ])
})

test('the delete confirmation keeps its title while it closes after Cancelar', async () => {
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: /^Borrar / }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(dialog).toBeInTheDocument()
  expect(dialog).toHaveAccessibleName('¿Borrar el pago de Mensualidad — Octubre?')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('the delete confirmation keeps its title while it closes after a successful delete', async () => {
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: /^Borrar / }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  await user.click(within(dialog).getByRole('button', { name: 'Borrar' }))
  await waitFor(() => expect(mocks.deletePayment).toHaveBeenCalledWith('pay1'))
  expect(dialog).toBeInTheDocument()
  expect(dialog).toHaveAccessibleName('¿Borrar el pago de Mensualidad — Octubre?')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('Borrar during the fade after Cancelar does not delete', async () => {
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: /^Borrar / }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  const confirm = within(dialog).getByRole('button', { name: 'Borrar' })
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(dialog).toBeInTheDocument()
  fireEvent.click(confirm)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.deletePayment).not.toHaveBeenCalled()
})

test('a click during the fade after a successful delete does not delete again', async () => {
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: /^Borrar / }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  const confirm = within(dialog).getByRole('button', { name: 'Borrar' })
  await user.click(confirm)
  await waitFor(() => expect(mocks.deletePayment).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(confirm).toBeEnabled())
  expect(dialog).toBeInTheDocument()
  fireEvent.click(confirm)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.deletePayment).toHaveBeenCalledTimes(1)
})

test('closing the delete confirmation with Escape keeps its title and blocks Borrar during the fade', async () => {
  const user = userEvent.setup()
  renderSection()
  const item = await screen.findByRole('listitem', { name: 'Mensualidad — Octubre' })
  await user.click(within(item).getByRole('button', { name: /^Borrar / }))
  const dialog = await screen.findByRole('dialog', { name: '¿Borrar el pago de Mensualidad — Octubre?' })
  const confirm = within(dialog).getByRole('button', { name: 'Borrar' })
  await user.keyboard('{Escape}')
  expect(dialog).toBeInTheDocument()
  expect(dialog).toHaveAccessibleName('¿Borrar el pago de Mensualidad — Octubre?')
  fireEvent.click(confirm)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.deletePayment).not.toHaveBeenCalled()
})
