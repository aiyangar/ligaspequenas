import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { LoadError } from '../app/LoadError'
import { PaymentDialog } from './PaymentDialog'
import {
  METHOD_LABELS,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABELS,
  createPayment,
  deletePayment,
  fetchPlayerPayments,
  formatMoney,
  formatPaymentDate,
  paymentText,
  updatePayment,
} from './payments'
import type { MutationResult, PaymentFormValues, PaymentRow } from './payments'

export interface PlayerPaymentsSectionProps {
  playerId: string
  tenantId: string
  canEdit: boolean
  onChanged: (flash: string) => void
}

export function PlayerPaymentsSection({ playerId, tenantId, canEdit, onChanged }: PlayerPaymentsSectionProps) {
  const [payments, setPayments] = useState<PaymentRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)
  const [editing, setEditing] = useState<PaymentRow | null>(null)
  const [confirm, setConfirm] = useState<PaymentRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleteInFlight = useRef(false)

  useEffect(() => {
    let active = true
    void fetchPlayerPayments(playerId)
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setPayments(rows)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [playerId, reloadKey])

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function handleRetry() {
    setLoadError(false)
    reload()
  }

  function openDialog(payment: PaymentRow | null) {
    setEditing(payment)
    // a fresh key remounts the dialog so it starts from this row (or empty) every time
    setDialogKey((k) => k + 1)
    setDialogOpen(true)
  }

  async function handleSave(values: PaymentFormValues): Promise<MutationResult> {
    const res = editing
      ? await updatePayment(editing.id, values)
      : await createPayment(playerId, tenantId, values)
    if (res.ok) {
      setError(null)
      reload()
      onChanged(editing ? 'Pago actualizado' : 'Pago registrado')
    }
    return res
  }

  async function handleDelete() {
    if (!confirm || deleteInFlight.current) return
    deleteInFlight.current = true
    setDeleting(true)
    try {
      const res = await deletePayment(confirm.id)
      setConfirm(null)
      if (res.ok) {
        setError(null)
        reload()
        onChanged('Pago eliminado')
      } else {
        setError(res.error ?? 'No se pudo borrar el pago.')
      }
    } finally {
      deleteInFlight.current = false
      setDeleting(false)
    }
  }

  return (
    <Box component="section" aria-labelledby="payments-heading">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography id="payments-heading" variant="h6" component="h2">
          Pagos
        </Typography>
        {canEdit && (
          <Button variant="outlined" size="small" onClick={() => openDialog(null)}>
            Registrar pago
          </Button>
        )}
      </Stack>
      {error && (
        <Alert role="alert" severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {loadError ? (
        <LoadError message="No se pudieron cargar los pagos." onRetry={handleRetry} />
      ) : payments === null ? (
        <Typography>Cargando pagos…</Typography>
      ) : payments.length === 0 ? (
        <Typography color="text.secondary">Sin pagos registrados.</Typography>
      ) : (
        <List disablePadding>
          {payments.map((p) => (
            <ListItem key={p.id} aria-label={paymentText(p)} divider disableGutters sx={{ display: 'block', py: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography sx={{ flexGrow: 1, minWidth: 160 }}>{paymentText(p)}</Typography>
                <Chip size="small" label={PAYMENT_STATUS_LABELS[p.status]} color={PAYMENT_STATUS_COLOR[p.status]} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {`${formatMoney(p.amount)} · ${formatPaymentDate(p.payment_date)} · ${METHOD_LABELS[p.method]}`}
              </Typography>
              {canEdit && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" onClick={() => openDialog(p)}>
                    Editar
                  </Button>
                  <Button size="small" color="error" onClick={() => setConfirm(p)}>
                    Borrar
                  </Button>
                </Stack>
              )}
            </ListItem>
          ))}
        </List>
      )}
      {canEdit && (
        <PaymentDialog
          key={dialogKey}
          open={dialogOpen}
          payment={editing}
          onSave={handleSave}
          onClose={() => setDialogOpen(false)}
        />
      )}
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
            Cancelar
          </Button>
          <Button color="error" onClick={() => void handleDelete()} disabled={deleting}>
            Borrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
