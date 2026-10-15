import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { PaymentDialog } from './PaymentDialog'
import { localToday } from './payments'
import type { MutationResult, PaymentRow } from './payments'

const onSave = vi.fn()
const onClose = vi.fn()

function row(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay1', tenant_id: 't1', player_id: 'p1', concept: 'mensualidad', concept_note: null,
    amount: 150.5, payment_date: '2026-10-04', method: 'transferencia', status: 'parcial',
    created_at: '', updated_at: '', ...over,
  }
}

function renderDialog(payment: PaymentRow | null = null) {
  render(<PaymentDialog open payment={payment} onSave={onSave} onClose={onClose} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  onSave.mockResolvedValue({ ok: true })
})

test('a new payment starts with today, Efectivo, Pagado and Inscripción', () => {
  renderDialog()
  expect(screen.getByRole('heading', { name: 'Registrar pago' })).toBeInTheDocument()
  expect(screen.getByLabelText('Concepto')).toHaveValue('inscripcion')
  expect(screen.getByLabelText('Fecha')).toHaveValue(localToday())
  expect(screen.getByLabelText('Método')).toHaveValue('efectivo')
  expect(screen.getByLabelText('Estatus')).toHaveValue('pagado')
  expect(screen.getByLabelText('Monto')).toHaveValue('')
})

test('Otro without a note is blocked with a field error', async () => {
  const user = userEvent.setup()
  renderDialog()
  await user.selectOptions(screen.getByLabelText('Concepto'), 'otro')
  await user.type(screen.getByLabelText('Monto'), '100')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(screen.getByText('Describe el concepto.')).toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()
})

test('Mensualidad without a note saves with a comma amount and closes', async () => {
  const user = userEvent.setup()
  renderDialog()
  await user.selectOptions(screen.getByLabelText('Concepto'), 'mensualidad')
  await user.type(screen.getByLabelText('Monto'), '150,50')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ concept: 'mensualidad', concept_note: '', amount: '150,50' })),
  )
  expect(onClose).toHaveBeenCalled()
})

test('an invalid amount blocks the save', async () => {
  const user = userEvent.setup()
  renderDialog()
  await user.type(screen.getByLabelText('Monto'), '1e3')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(screen.getByText('Ingresa un monto mayor a 0 con hasta 2 decimales.')).toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()
})

test('edit mode preloads the row', () => {
  renderDialog(row())
  expect(screen.getByRole('heading', { name: 'Editar pago' })).toBeInTheDocument()
  expect(screen.getByLabelText('Monto')).toHaveValue('150.5')
  expect(screen.getByLabelText(/Detalle/)).toHaveValue('')
  expect(screen.getByLabelText('Concepto')).toHaveValue('mensualidad')
  expect(screen.getByLabelText('Estatus')).toHaveValue('parcial')
  expect(screen.getByLabelText('Método')).toHaveValue('transferencia')
  expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-04')
})

test('a failed save keeps the dialog open with the message and the values', async () => {
  onSave.mockResolvedValueOnce({ ok: false, error: 'No tienes permiso para esta acción.' })
  const user = userEvent.setup()
  renderDialog()
  await user.type(screen.getByLabelText('Monto'), '200')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para esta acción.')
  expect(screen.getByLabelText('Monto')).toHaveValue('200')
  expect(onClose).not.toHaveBeenCalled()
})

test('a double click on Guardar saves once', async () => {
  onSave.mockReturnValueOnce(new Promise(() => {}))
  const user = userEvent.setup()
  renderDialog()
  await user.type(screen.getByLabelText('Monto'), '200')
  const save = screen.getByRole('button', { name: 'Guardar' })
  fireEvent.click(save)
  fireEvent.click(save)
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(save).toBeDisabled()
})

test('closing is ignored while a save is in flight and a later failure shows in the open dialog', async () => {
  let finishSave: (res: MutationResult) => void = () => {}
  onSave.mockReturnValueOnce(new Promise<MutationResult>((resolve) => {
    finishSave = resolve
  }))
  const user = userEvent.setup()
  renderDialog()
  await user.type(screen.getByLabelText('Monto'), '200')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  const cancel = screen.getByRole('button', { name: 'Cancelar' })
  await waitFor(() => expect(cancel).toBeDisabled())
  // fireEvent: user-event refuses to click a disabled MUI button (pointer-events: none)
  fireEvent.click(cancel)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  finishSave({ ok: false, error: 'No tienes permiso para esta acción.' })
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para esta acción.')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByLabelText('Monto')).toHaveValue('200')
  expect(onClose).not.toHaveBeenCalled()
})

test('Cancelar closes without saving', async () => {
  const user = userEvent.setup()
  renderDialog()
  await user.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onClose).toHaveBeenCalled()
  expect(onSave).not.toHaveBeenCalled()
})
