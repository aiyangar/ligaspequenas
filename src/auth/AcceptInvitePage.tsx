import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { supabase } from '../lib/supabase'

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(!!session)
    })
    void supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError('No se pudo establecer la contraseña')
      return
    }
    void navigate('/', { replace: true })
  }

  if (!ready) return <Typography sx={{ p: 2 }}>Validando invitación…</Typography>

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 360, mx: 'auto', mt: 8, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">Crea tu contraseña</Typography>
        <TextField
          label="Nueva contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={submitting}>Guardar</Button>
      </Stack>
    </Box>
  )
}
