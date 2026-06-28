import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null })
})

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: ['/login'] },
  )
  return render(<RouterProvider router={router} />)
}

test('validates that both fields are required', async () => {
  const user = userEvent.setup()
  renderLogin()
  // bypass native required by typing only email, then submit
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('obligatorios')
  expect(mocks.signInWithPassword).not.toHaveBeenCalled()
})

test('shows an error on invalid credentials', async () => {
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'bad' } })
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.type(screen.getByLabelText('Contraseña'), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('inválidas')
})

test('navigates home on success', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.type(screen.getByLabelText('Contraseña'), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
})
