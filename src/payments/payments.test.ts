import { beforeEach, expect, vi } from 'vitest'
import {
  localToday, emptyPayment, paymentToValues, formatPaymentDate, normalizeAmount, validatePayment,
  paymentText, formatMoney, paymentErrorMessage, fetchPlayerPayments, createPayment, updatePayment,
  deletePayment,
} from './payments'
import type { PaymentFormValues, PaymentRow } from './payments'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  calls: [] as Array<[string, unknown[]]>,
  result: { data: null as unknown, error: null as { message: string } | null },
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

function query() {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order']) {
    q[m] = (...args: unknown[]) => {
      mocks.calls.push([m, args])
      return q
    }
  }
  q.then = (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
    Promise.resolve(mocks.result).then(onOk, onErr)
  return q
}

function respond(data: unknown, error: { message: string } | null = null) {
  mocks.result = { data, error }
}

function called(method: string) {
  return mocks.calls.filter(([m]) => m === method).map(([, args]) => args)
}

function row(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay1', tenant_id: 't1', player_id: 'p1', concept: 'inscripcion', concept_note: null,
    amount: 500, payment_date: '2026-10-04', method: 'efectivo', status: 'pagado',
    created_at: '', updated_at: '', ...over,
  }
}

function values(over: Partial<PaymentFormValues> = {}): PaymentFormValues {
  return { ...emptyPayment('2026-10-04'), amount: '150', ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  respond([])
  mocks.from.mockImplementation(() => query())
})

test('tests run in America/Monterrey', () => {
  // guards the localToday test: without TZ from vite.config it would pass or fail by machine
  expect(new Date('2026-10-14T23:30:00-06:00').getHours()).toBe(23)
})

test('localToday uses the local calendar day, not UTC', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-10-14T23:30:00-06:00'))
    expect(localToday()).toBe('2026-10-14')
  } finally {
    vi.useRealTimers()
  }
})

test('emptyPayment defaults to inscripción, efectivo, pagado and the given day', () => {
  expect(emptyPayment('2026-10-04')).toEqual({
    concept: 'inscripcion', concept_note: '', amount: '', payment_date: '2026-10-04',
    method: 'efectivo', status: 'pagado',
  })
})

test('paymentToValues turns the amount into text and a null note into empty', () => {
  expect(paymentToValues(row({ amount: 150.5, concept_note: null, status: 'parcial' }))).toEqual({
    concept: 'inscripcion', concept_note: '', amount: '150.5', payment_date: '2026-10-04',
    method: 'efectivo', status: 'parcial',
  })
})

test('formatPaymentDate splits the ISO date without shifting the day', () => {
  expect(formatPaymentDate('2026-10-04')).toBe('04/10/2026')
})

test('normalizeAmount trims and turns a decimal comma into a dot', () => {
  expect(normalizeAmount('  150,50 ')).toBe('150.50')
})

test('validatePayment requires the note only for otro', () => {
  expect(validatePayment(values({ concept: 'otro', concept_note: '  ' }))).toEqual({ concept_note: 'Describe el concepto.' })
  expect(validatePayment(values({ concept: 'otro', concept_note: 'Torneo' }))).toEqual({})
  expect(validatePayment(values({ concept: 'mensualidad', concept_note: '' }))).toEqual({})
})

test('validatePayment rejects malformed or non-positive amounts', () => {
  for (const amount of ['1e3', '0x10', '  ', '', '0', '0.00', '1.234', '100000000', '-5', 'abc', '1,000.50']) {
    expect(validatePayment(values({ amount })), amount).toEqual({
      amount: 'Ingresa un monto mayor a 0 con hasta 2 decimales.',
    })
  }
})

test('validatePayment accepts plain, decimal and comma amounts', () => {
  for (const amount of ['150', '150.5', '150,50', '99999999.99', '0.01']) {
    expect(validatePayment(values({ amount })), amount).toEqual({})
  }
})

test('validatePayment requires a date', () => {
  expect(validatePayment(values({ payment_date: '' }))).toEqual({ payment_date: 'Ingresa la fecha.' })
})

test('paymentText appends the note when there is one', () => {
  expect(paymentText({ concept: 'mensualidad', concept_note: 'Octubre' })).toBe('Mensualidad — Octubre')
  expect(paymentText({ concept: 'inscripcion', concept_note: null })).toBe('Inscripción')
})

test('formatMoney uses MXN in es-MX', () => {
  expect(formatMoney(150.5)).toBe('$150.50')
  expect(formatMoney(1500)).toBe('$1,500.00')
})

test('paymentErrorMessage translates RLS rejections only', () => {
  expect(paymentErrorMessage('new row violates row-level security policy for table "payments"')).toBe('No tienes permiso para esta acción.')
  expect(paymentErrorMessage('network down')).toBe('network down')
})

test('fetchPlayerPayments filters by player, orders on the server and normalizes amounts', async () => {
  respond([row({ amount: '150.50' as unknown as number })])
  const rows = await fetchPlayerPayments('p1')
  expect(mocks.from).toHaveBeenCalledWith('payments')
  expect(called('eq')).toEqual([['player_id', 'p1']])
  expect(called('order')).toEqual([
    ['payment_date', { ascending: false }],
    ['created_at', { ascending: false }],
  ])
  expect(rows[0].amount).toBe(150.5)
})

test('fetchPlayerPayments throws on error', async () => {
  respond(null, { message: 'boom' })
  await expect(fetchPlayerPayments('p1')).rejects.toThrow('boom')
})

test('createPayment trims the note, nulls a blank one and sends a numeric amount', async () => {
  expect(await createPayment('p1', 't1', values({ concept: 'mensualidad', concept_note: '  Octubre ', amount: '150,50' }))).toEqual({ ok: true })
  await createPayment('p1', 't1', values({ concept_note: '   ' }))
  expect(called('insert')).toEqual([
    [{ concept: 'mensualidad', concept_note: 'Octubre', amount: 150.5, payment_date: '2026-10-04', method: 'efectivo', status: 'pagado', player_id: 'p1', tenant_id: 't1' }],
    [{ concept: 'inscripcion', concept_note: null, amount: 150, payment_date: '2026-10-04', method: 'efectivo', status: 'pagado', player_id: 'p1', tenant_id: 't1' }],
  ])
})

test('createPayment translates an RLS rejection', async () => {
  respond(null, { message: 'new row violates row-level security policy' })
  expect(await createPayment('p1', 't1', values())).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
})

test('updatePayment sends the normalized values and asks for the id back', async () => {
  respond([{ id: 'pay1' }])
  expect(await updatePayment('pay1', values({ amount: '300', status: 'parcial' }))).toEqual({ ok: true })
  expect(called('update')).toEqual([[{ concept: 'inscripcion', concept_note: null, amount: 300, payment_date: '2026-10-04', method: 'efectivo', status: 'parcial' }]])
  expect(called('eq')).toEqual([['id', 'pay1']])
  expect(called('select')).toEqual([['id']])
})

test('updatePayment with zero rows is an error', async () => {
  respond([])
  expect(await updatePayment('pay1', values())).toEqual({ ok: false, error: 'No se encontró el pago o no tienes permiso.' })
})

test('deletePayment deletes by id and asks for the id back', async () => {
  respond([{ id: 'pay1' }])
  expect(await deletePayment('pay1')).toEqual({ ok: true })
  expect(called('delete')).toHaveLength(1)
  expect(called('eq')).toEqual([['id', 'pay1']])
  expect(called('select')).toEqual([['id']])
})

test('deletePayment with zero rows is an error', async () => {
  respond([])
  expect(await deletePayment('pay1')).toEqual({ ok: false, error: 'No se encontró el pago o no tienes permiso.' })
})

test('deletePayment translates an RLS error', async () => {
  respond(null, { message: 'permission denied: row-level security' })
  expect(await deletePayment('pay1')).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
})
