import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { PlayerForm } from './PlayerForm'
import {
  fetchPlayer,
  createPlayer,
  updatePlayer,
  emptyPlayer,
  rowToValues,
  playerCategoryText,
} from './players'
import type { PlayerFormValues, PlayerRow } from './players'

export function PlayerFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { role, tenantId } = useTenant()
  const editing = Boolean(id)
  const canEdit = isAdmin(role)

  const [values, setValues] = useState<PlayerFormValues>(emptyPlayer())
  const [row, setRow] = useState<PlayerRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Dismissed by navigation key so a fresh save (new key) re-shows the toast.
  const [dismissedFlashKey, setDismissedFlashKey] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    void fetchPlayer(id).then((r) => {
      if (!active || !r) return
      setRow(r)
      setValues(rowToValues(r))
    })
    return () => {
      active = false
    }
  }, [id])

  // Success confirmation rides along the post-save navigation as router state,
  // so the toast shows on the destination instead of a browser alert. Derived
  // (not copied into state via an effect) to avoid a synchronous setState-in-effect.
  const flash = (location.state as { flash?: string } | null)?.flash ?? null
  const showFlash = flash !== null && location.key !== dismissedFlashKey

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!tenantId) {
      setMessage('Error: no hay tenant activo')
      return
    }
    setSubmitting(true)
    if (editing) {
      const result = await updatePlayer(id!, values)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      void navigate(`/jugadores/${id!}`, { state: { flash: 'Cambios guardados' } })
    } else {
      const result = await createPlayer(values, tenantId)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      void navigate(`/jugadores/${result.id!}`, { state: { flash: 'Jugador creado' } })
    }
  }

  const categoryText = row ? playerCategoryText(row) : undefined

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1" gutterBottom>
          {editing ? 'Jugador' : 'Nuevo jugador'}
        </Typography>
        <PlayerForm values={values} onChange={setValues} disabled={!canEdit} categoryText={categoryText} />
        {message && (
          <Alert role="alert" severity={message.startsWith('Error') ? 'error' : 'success'} sx={{ mt: 1 }}>
            {message}
          </Alert>
        )}
        {canEdit && (
          <Button type="submit" variant="contained" disabled={submitting}>
            Guardar
          </Button>
        )}
      </Stack>
      <Snackbar
        open={showFlash}
        autoHideDuration={4000}
        onClose={() => setDismissedFlashKey(location.key)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setDismissedFlashKey(location.key)}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {flash}
        </Alert>
      </Snackbar>
    </Box>
  )
}
