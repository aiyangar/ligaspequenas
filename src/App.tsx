import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { TenantProvider } from './tenant/TenantContext'
import { router } from './app/routes'

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <RouterProvider router={router} />
      </TenantProvider>
    </AuthProvider>
  )
}
