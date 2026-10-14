import { act, fireEvent, render, screen } from '@testing-library/react'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

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

test('still shows the neutral message when the request resolves with an error (anti-enumeration)', async () => {
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: { message: 'Signups not allowed for otp' } })
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
})

test('a second submit while the link is being sent does not send it again', async () => {
  const pending = deferred<{ data: object; error: null }>()
  mocks.signInWithOtp.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  const form = screen.getByRole('button', { name: 'Enviar enlace de acceso' }).closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve({ data: {}, error: null })
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
})

test('the link can be sent again once the previous send finished', async () => {
  const pending = deferred<{ data: object; error: null }>()
  mocks.signInWithOtp.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  const form = screen.getByRole('button', { name: 'Enviar enlace de acceso' }).closest('form')!
  fireEvent.submit(form)
  await act(async () => {
    pending.resolve({ data: {}, error: null })
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
  fireEvent.submit(form)
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2)
})

test('an invalid email does not block the next valid submit', async () => {
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
  await user.clear(screen.getByLabelText('Correo'))
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1)
})

test('the link can be sent again after a failed send', async () => {
  mocks.signInWithOtp.mockRejectedValue(new Error('network'))
  const user = userEvent.setup()
  renderLogin()
  await user.type(screen.getByLabelText('Correo'), 'a@b.com')
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByText('No se pudo enviar el enlace. Intenta de nuevo.')).toBeInTheDocument()
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  await user.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Si tu correo tiene acceso')
  expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2)
})
