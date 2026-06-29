import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [ready, setReady] = useState(false)

  const hasLinkError = useMemo(() => {
    const hash = location.hash.replace(/^#/, '')
    const search = location.search.replace(/^\?/, '')
    const params = new URLSearchParams(`${hash}&${search}`)
    return params.has('error') || params.has('error_code') || params.has('error_description')
  }, [location.hash, location.search])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(!!session)
    })
    void supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (ready) void navigate('/', { replace: true })
  }, [ready, navigate])

  if (!ready && hasLinkError) {
    return (
      <Box sx={{ maxWidth: 360, mx: 'auto', mt: 8, px: 2 }}>
        <Stack spacing={2}>
          <Alert severity="error">El enlace no es válido o expiró</Alert>
          <Link component={RouterLink} to="/login">Volver a iniciar sesión</Link>
        </Stack>
      </Box>
    )
  }

  return <Typography sx={{ p: 2 }}>Iniciando sesión…</Typography>
}
