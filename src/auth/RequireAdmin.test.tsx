import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RequireAdmin } from './RequireAdmin'

const mocks = vi.hoisted(() => ({ useTenant: vi.fn() }))
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

beforeEach(() => vi.clearAllMocks())

function renderGuard() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <h1>Home</h1> },
      {
        element: <RequireAdmin />,
        children: [{ path: '/usuarios', element: <h1>Usuarios</h1> }],
      },
    ],
    { initialEntries: ['/usuarios'] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows a loading line while the tenant resolves', () => {
  mocks.useTenant.mockReturnValue({ role: null, status: 'loading' })
  renderGuard()
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
})

test('redirects non-admins home', () => {
  mocks.useTenant.mockReturnValue({ role: 'readonly', status: 'ready' })
  renderGuard()
  expect(screen.getByText('Home')).toBeInTheDocument()
  expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
})

test('renders the admin outlet for admins', () => {
  mocks.useTenant.mockReturnValue({ role: 'admin', status: 'ready' })
  renderGuard()
  expect(screen.getByText('Usuarios')).toBeInTheDocument()
})
