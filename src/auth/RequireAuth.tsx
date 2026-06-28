import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Typography from '@mui/material/Typography'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Typography sx={{ p: 2 }}>Cargando…</Typography>
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
