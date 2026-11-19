import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
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
  expect(await screen.findByText('Ana')).toBeInTheDocument()
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
  expect(await screen.findByRole('status')).toHaveTextContent('enlace de acceso')
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

test('the invitation role is an MUI select, not a native one', async () => {
  const user = userEvent.setup()
  const { container } = render(<UsersPage />)
  await screen.findByText(/Ana/)
  expect(container.querySelector('select')).toBeNull()
  await user.click(screen.getByRole('combobox', { name: 'Rol de la invitación' }))
  await user.click(await screen.findByRole('option', { name: 'Administrador' }))
  await user.type(screen.getByPlaceholderText('Correo'), 'jefe@b.com')
  await user.type(screen.getByPlaceholderText('Nombre completo'), 'Jefe')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(mocks.inviteUser).toHaveBeenCalledWith({ email: 'jefe@b.com', fullName: 'Jefe', role: 'admin' })
})

test('changes a user role through the MUI select', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  const role = await screen.findByRole('combobox', { name: 'Rol de Ana' })
  expect(role).toHaveTextContent('Administrador')
  await user.click(role)
  await user.click(await screen.findByRole('option', { name: 'Solo lectura' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ role: 'readonly' }))
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
})
