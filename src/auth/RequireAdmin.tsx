import { Navigate, Outlet } from 'react-router-dom'
import Typography from '@mui/material/Typography'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'

export function RequireAdmin() {
  const { role, status } = useTenant()
  if (status === 'loading') return <Typography sx={{ p: 2 }}>Cargando…</Typography>
  if (!isAdmin(role)) return <Navigate to="/" replace />
  return <Outlet />
}
