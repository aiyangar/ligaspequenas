import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AcceptInvitePage } from './AcceptInvitePage'

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
      updateUser: mocks.updateUser,
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
  mocks.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
})

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/accept-invite', element: <AcceptInvitePage /> },
      { path: '/', element: <h1>Home</h1> },
    ],
    { initialEntries: ['/accept-invite'] },
  )
  return render(<RouterProvider router={router} />)
}

test('shows the password form once the invite session is present', async () => {
  renderPage()
  expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument()
})

test('becomes ready via the SIGNED_IN auth event (implicit-flow token path)', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  renderPage()
  expect(await screen.findByText('Validando invitación…')).toBeInTheDocument()
  await act(async () => {
    captured!('SIGNED_IN', { user: { id: 'u1' } })
  })
  expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument()
})

test('rejects passwords shorter than 8 characters', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.type(await screen.findByLabelText('Nueva contraseña'), 'short')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('8 caracteres')
  expect(mocks.updateUser).not.toHaveBeenCalled()
})

test('sets the password and navigates home', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.type(await screen.findByLabelText('Nueva contraseña'), 'secret12')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'secret12' })
  await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument())
})
