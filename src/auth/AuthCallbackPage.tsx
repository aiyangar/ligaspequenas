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
  const [checked, setChecked] = useState(false)

  const params = useMemo(() => {
    const hash = location.hash.replace(/^#/, '')
    const search = location.search.replace(/^\?/, '')
    return new URLSearchParams(`${hash}&${search}`)
  }, [location.hash, location.search])

  const hasLinkError =
    params.has('error') || params.has('error_code') || params.has('error_description')
  // A real sign-in link carries a token (implicit hash) or a code (PKCE query);
  // its absence once getSession has resolved means there is nothing to wait for.
  const hasAuthToken =
    params.has('access_token') || params.has('refresh_token') || params.has('code')

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true)
    })
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      setChecked(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (ready) void navigate('/', { replace: true })
  }, [ready, navigate])

  if (!ready && (hasLinkError || (checked && !hasAuthToken))) {
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
