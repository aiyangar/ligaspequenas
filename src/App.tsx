import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
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
