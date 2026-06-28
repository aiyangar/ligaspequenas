import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('./AuthContext', () => ({ useAuth: mocks.useAuth }))

beforeEach(() => vi.clearAllMocks())

function renderGuard() {
  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [{ path: '/', element: <h1>Protected</h1> }],
      },
      { path: '/login', element: <h1>Login</h1> },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows a loading line while auth resolves', () => {
  mocks.useAuth.mockReturnValue({ session: null, loading: true })
  renderGuard()
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
})

test('redirects to /login when there is no session', () => {
  mocks.useAuth.mockReturnValue({ session: null, loading: false })
  renderGuard()
  expect(screen.getByText('Login')).toBeInTheDocument()
  expect(screen.queryByText('Protected')).not.toBeInTheDocument()
})

test('renders the protected outlet when authenticated', () => {
  mocks.useAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
  renderGuard()
  expect(screen.getByText('Protected')).toBeInTheDocument()
})
