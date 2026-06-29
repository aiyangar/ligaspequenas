import { useState } from 'react'
import type { FormEvent } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError('Ingresa un correo válido')
      return
    }
    setSubmitting(true)
    try {
      // Swallow the returned error on purpose: revealing "that email has no access"
      // would leak which addresses exist. Only a thrown transport failure surfaces.
      await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      setSent(true)
    } catch {
      setError('No se pudo enviar el enlace. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 360, mx: 'auto', mt: 8, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">Iniciar sesión</Typography>
        <TextField
          label="Correo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <Alert severity="error">{error}</Alert>}
        {sent && (
          <Alert role="status" severity="success">
            Si tu correo tiene acceso, te enviamos un enlace.
          </Alert>
        )}
        <Button type="submit" variant="contained" disabled={submitting}>
          Enviar enlace de acceso
        </Button>
      </Stack>
    </Box>
  )
}
