import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import {
  CONCEPT_LABELS,
  METHOD_LABELS,
  PAYMENT_CONCEPTS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  emptyPayment,
  paymentToValues,
  validatePayment,
} from './payments'
import type {
  MutationResult,
  PaymentConcept,
  PaymentFormErrors,
  PaymentFormValues,
  PaymentMethod,
  PaymentRow,
  PaymentStatus,
} from './payments'

export interface PaymentDialogProps {
  open: boolean
  payment: PaymentRow | null
  onSave: (values: PaymentFormValues) => Promise<MutationResult>
  onClose: () => void
}

const NATIVE_SELECT = { select: { native: true }, inputLabel: { shrink: true } }

export function PaymentDialog({ open, payment, onSave, onClose }: PaymentDialogProps) {
  const [values, setValues] = useState<PaymentFormValues>(() =>
    payment ? paymentToValues(payment) : emptyPayment(),
  )
  const [errors, setErrors] = useState<PaymentFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // synchronous guard: `saving` only disables the button after a re-render
  const inFlight = useRef(false)

  function update<K extends keyof PaymentFormValues>(key: K, value: PaymentFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSave() {
    if (inFlight.current) return
    const found = validatePayment(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    inFlight.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const res = await onSave(values)
      if (res.ok) onClose()
      else setSaveError(res.error ?? 'No se pudo guardar el pago.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="payment-dialog-title"
    >
      <DialogTitle id="payment-dialog-title">{payment ? 'Editar pago' : 'Registrar pago'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Concepto"
            value={values.concept}
            onChange={(e) => update('concept', e.target.value as PaymentConcept)}
            slotProps={NATIVE_SELECT}
          >
            {PAYMENT_CONCEPTS.map((c) => (
              <option key={c} value={c}>
                {CONCEPT_LABELS[c]}
              </option>
            ))}
          </TextField>
          <TextField
            label="Detalle"
            value={values.concept_note}
            onChange={(e) => update('concept_note', e.target.value)}
            required={values.concept === 'otro'}
            error={Boolean(errors.concept_note)}
            helperText={errors.concept_note ?? 'Obligatorio cuando el concepto es Otro'}
          />
          <TextField
            label="Monto"
            type="text"
            value={values.amount}
            onChange={(e) => update('amount', e.target.value)}
            error={Boolean(errors.amount)}
            helperText={errors.amount ?? 'Lo pagado hasta hoy en este concepto'}
            slotProps={{
              htmlInput: { inputMode: 'decimal' },
              input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
            }}
          />
          <TextField
            label="Fecha"
            type="date"
            value={values.payment_date}
            onChange={(e) => update('payment_date', e.target.value)}
            error={Boolean(errors.payment_date)}
            helperText={errors.payment_date}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label="Método"
            value={values.method}
            onChange={(e) => update('method', e.target.value as PaymentMethod)}
            slotProps={NATIVE_SELECT}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </TextField>
          <TextField
            select
            label="Estatus"
            value={values.status}
            onChange={(e) => update('status', e.target.value as PaymentStatus)}
            slotProps={NATIVE_SELECT}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </TextField>
        </Stack>
        {saveError && (
          <Alert role="alert" severity="error" sx={{ mt: 2 }}>
            {saveError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
