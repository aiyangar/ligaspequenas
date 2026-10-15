import { supabase } from '../lib/supabase'

export type PaymentConcept = 'inscripcion' | 'mensualidad' | 'uniforme' | 'otro'
export type PaymentMethod = 'efectivo' | 'transferencia'
export type PaymentStatus = 'pagado' | 'pendiente' | 'parcial'

export interface PaymentRow {
  id: string
  tenant_id: string
  player_id: string
  concept: PaymentConcept
  concept_note: string | null
  amount: number
  payment_date: string
  method: PaymentMethod
  status: PaymentStatus
  created_at: string
  updated_at: string
}

export interface PaymentFormValues {
  concept: PaymentConcept
  concept_note: string
  amount: string
  payment_date: string
  method: PaymentMethod
  status: PaymentStatus
}

export type PaymentFormErrors = Partial<Record<keyof PaymentFormValues, string>>

export interface MutationResult {
  ok: boolean
  error?: string
}

export const PAYMENT_CONCEPTS: readonly PaymentConcept[] = ['inscripcion', 'mensualidad', 'uniforme', 'otro']
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['efectivo', 'transferencia']
export const PAYMENT_STATUSES: readonly PaymentStatus[] = ['pagado', 'pendiente', 'parcial']

export const CONCEPT_LABELS: Record<PaymentConcept, string> = {
  inscripcion: 'Inscripción',
  mensualidad: 'Mensualidad',
  uniforme: 'Uniforme',
  otro: 'Otro',
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  parcial: 'Parcial',
}

export const PAYMENT_STATUS_COLOR: Record<PaymentStatus, 'success' | 'warning' | 'default'> = {
  pagado: 'success',
  parcial: 'warning',
  pendiente: 'default',
}

const PAYMENT_COLUMNS =
  'id, tenant_id, player_id, concept, concept_note, amount, payment_date, method, status, created_at, updated_at'
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/
const NOT_FOUND_MESSAGE = 'No se encontró el pago o no tienes permiso.'
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function emptyPayment(today: string = localToday()): PaymentFormValues {
  return {
    concept: 'inscripcion',
    concept_note: '',
    amount: '',
    payment_date: today,
    method: 'efectivo',
    status: 'pagado',
  }
}

export function paymentToValues(row: PaymentRow): PaymentFormValues {
  return {
    concept: row.concept,
    concept_note: row.concept_note ?? '',
    amount: String(row.amount),
    payment_date: row.payment_date,
    method: row.method,
    status: row.status,
  }
}

export function formatPaymentDate(date: string): string {
  // new Date('YYYY-MM-DD') is UTC midnight and shows the previous day in Monterrey
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

export function normalizeAmount(raw: string): string {
  return raw.trim().replace(',', '.')
}

export function validatePayment(values: PaymentFormValues): PaymentFormErrors {
  const errors: PaymentFormErrors = {}
  if (values.concept === 'otro' && values.concept_note.trim() === '') {
    errors.concept_note = 'Describe el concepto.'
  }
  const amount = normalizeAmount(values.amount)
  if (!AMOUNT_PATTERN.test(amount) || Number(amount) <= 0) {
    errors.amount = 'Ingresa un monto mayor a 0 con hasta 2 decimales.'
  }
  if (values.payment_date === '') errors.payment_date = 'Ingresa la fecha.'
  return errors
}

export function paymentText(row: Pick<PaymentRow, 'concept' | 'concept_note'>): string {
  const label = CONCEPT_LABELS[row.concept]
  return row.concept_note ? `${label} — ${row.concept_note}` : label
}

export function formatMoney(amount: number): string {
  return money.format(amount)
}

export function paymentErrorMessage(message: string): string {
  if (/row-level security|unauthorized|403/i.test(message)) return 'No tienes permiso para esta acción.'
  return message
}

function normalizeRow(row: PaymentRow): PaymentRow {
  return { ...row, amount: Number(row.amount) }
}

function toRecord(values: PaymentFormValues) {
  return {
    concept: values.concept,
    concept_note: values.concept_note.trim() || null,
    amount: Number(normalizeAmount(values.amount)),
    payment_date: values.payment_date,
    method: values.method,
    status: values.status,
  }
}

export async function fetchPlayerPayments(playerId: string): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('player_id', playerId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data as PaymentRow[] | null) ?? []).map(normalizeRow)
}

export async function createPayment(
  playerId: string,
  tenantId: string,
  values: PaymentFormValues,
): Promise<MutationResult> {
  const { error } = await supabase
    .from('payments')
    .insert({ ...toRecord(values), player_id: playerId, tenant_id: tenantId })
  if (error) return { ok: false, error: paymentErrorMessage(error.message) }
  return { ok: true }
}

// RLS filters update/delete targets silently, so zero returned rows means nothing changed
export async function updatePayment(id: string, values: PaymentFormValues): Promise<MutationResult> {
  const { data, error } = await supabase.from('payments').update(toRecord(values)).eq('id', id).select('id')
  if (error) return { ok: false, error: paymentErrorMessage(error.message) }
  if (!data || data.length === 0) return { ok: false, error: NOT_FOUND_MESSAGE }
  return { ok: true }
}

export async function deletePayment(id: string): Promise<MutationResult> {
  const { data, error } = await supabase.from('payments').delete().eq('id', id).select('id')
  if (error) return { ok: false, error: paymentErrorMessage(error.message) }
  if (!data || data.length === 0) return { ok: false, error: NOT_FOUND_MESSAGE }
  return { ok: true }
}
