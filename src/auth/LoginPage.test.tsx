import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({ signInWithOtp: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: mocks.signInWithOtp } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null })
})

function renderLogin() {
  const router = createMemoryRouter(
    [{ path: '/login', element: <LoginPage /> }],
    { initialEntries: ['/login'] },
  )
  return render(<RouterProvider router={router} />)
}

test('requires an email before sending', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('correo válido')
  expect(mocks.signInWithOtp).not.toHaveBeenCalled()
})

test('sends a magic link with shouldCreateUser false and the callback redirect', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(mocks.signInWithOtp).toHaveBeenCalledWith({
    email: 'a@b.com',
    options: {
      shouldCreateUser: false,
      emailRedirectTo: expect.stringMatching(/\/auth\/callback$/),
    },
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
})

test('renders no password field', () => {
  renderLogin()
  expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
})

test('shows a generic error if sending throws', async () => {
  mocks.signInWithOtp.mockRejectedValue(new Error('network'))
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar')
})
