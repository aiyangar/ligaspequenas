import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from './AppLayout'

const mocks = vi.hoisted(() => ({ useTenant: vi.fn(), signOut: vi.fn() }))
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signOut.mockResolvedValue({ error: null })
})

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [{ index: true, element: <p>contenido</p> }],
      },
      { path: '/login', element: <h1>Login</h1> },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

test('hides the Usuarios link for readonly users', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Beto' })
  renderLayout()
  expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Jugadores' })).toBeInTheDocument()
})

test('shows the Usuarios link for admins', () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  renderLayout()
  expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument()
})

test('shows the no-access screen when the user has no profile', () => {
  mocks.useTenant.mockReturnValue({ status: 'no-profile', role: null, fullName: null })
  renderLayout()
  expect(screen.getByText(/no tiene acceso/i)).toBeInTheDocument()
})

test('shows an error screen when profile loading fails', () => {
  mocks.useTenant.mockReturnValue({ status: 'error', role: null, fullName: null })
  renderLayout()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
})

test('logging out signs out and redirects to /login', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Ana' })
  const user = userEvent.setup()
  renderLayout()
  await user.click(screen.getByRole('button', { name: 'Salir' }))
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('Login')).toBeInTheDocument()
})
