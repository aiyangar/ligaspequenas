import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { UsersPage } from './UsersPage'

const mocks = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}))
vi.mock('./inviteUser', () => ({ inviteUser: mocks.inviteUser }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inviteUser.mockResolvedValue({ ok: true })
  mocks.select.mockResolvedValue({
    data: [{ id: 'u1', full_name: 'Ana', role: 'admin' }],
    error: null,
  })
  mocks.eq.mockResolvedValue({ data: null, error: null })
  mocks.update.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
})

test('lists the tenant users', async () => {
  render(<UsersPage />)
  expect(await screen.findByText(/Ana/)).toBeInTheDocument()
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.select).toHaveBeenCalledWith('id, full_name, role')
})

test('invites a user through the inviteUser client', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await user.type(screen.getByPlaceholderText('Correo'), 'nuevo@b.com')
  await user.type(screen.getByPlaceholderText('Nombre completo'), 'Nuevo')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(mocks.inviteUser).toHaveBeenCalledWith({
    email: 'nuevo@b.com',
    fullName: 'Nuevo',
    role: 'readonly',
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Invitación enviada')
})

test('shows a friendly message when the email already exists', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false, error: 'email_exists' })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await user.type(screen.getByPlaceholderText('Correo'), 'dup@b.com')
  await user.type(screen.getByPlaceholderText('Nombre completo'), 'Dup')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('status')).toHaveTextContent('ya está registrado')
})

test('changes a user role through an update', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await user.selectOptions(screen.getByLabelText('Rol de Ana'), 'readonly')
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ role: 'readonly' }))
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
})
