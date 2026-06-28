import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import Alert from '@mui/material/Alert'
import { supabase } from '../lib/supabase'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'

export function AppLayout() {
  const navigate = useNavigate()
  const { status, role, fullName } = useTenant()

  async function handleLogout() {
    await supabase.auth.signOut()
    void navigate('/login', { replace: true })
  }

  if (status === 'loading') return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  if (status === 'no-profile' || status === 'error') {
    const message =
      status === 'no-profile'
        ? 'Tu cuenta aún no tiene acceso. Contacta al administrador.'
        : 'Ocurrió un error al cargar tu perfil.'
    return (
      <Container sx={{ mt: 8, maxWidth: 'sm' }}>
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity={status === 'no-profile' ? 'warning' : 'error'}>{message}</Alert>
          <Button variant="outlined" onClick={handleLogout}>Salir</Button>
        </Stack>
      </Container>
    )
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{fullName}</Typography>
          <Button color="inherit" component={NavLink} to="/">Jugadores</Button>
          <Button color="inherit" component={NavLink} to="/quien-debe">Quién debe</Button>
          {isAdmin(role) && (
            <Button color="inherit" component={NavLink} to="/usuarios">Usuarios</Button>
          )}
          <Button color="inherit" onClick={handleLogout}>Salir</Button>
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  )
}
