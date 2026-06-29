import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthCallbackPage } from './AuthCallbackPage'

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
    },
  },
}))

const TOKEN_ENTRY = '/auth/callback#access_token=abc&refresh_token=def&type=magiclink'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
})

function renderCallback(entry = TOKEN_ENTRY) {
  const router = createMemoryRouter(
    [
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/login', element: <h1>Login</h1> },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: [entry] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows a signing-in message while the link token is being processed', async () => {
  renderCallback()
  expect(await screen.findByText('Iniciando sesión…')).toBeInTheDocument()
})

test('navigates home when a session appears via SIGNED_IN', async () => {
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  renderCallback()
  expect(await screen.findByText('Iniciando sesión…')).toBeInTheDocument()
  await act(async () => {
    captured!('SIGNED_IN', { user: { id: 'u1' } })
  })
  await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
})

test('shows an error when the magic link is invalid or expired', async () => {
  renderCallback(
    '/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  )
  expect(await screen.findByText('El enlace no es válido o expiró')).toBeInTheDocument()
})

test('shows an error on a bare callback visit with no token', async () => {
  renderCallback('/auth/callback')
  expect(await screen.findByText('El enlace no es válido o expiró')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toBeInTheDocument()
})
