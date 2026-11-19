import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { UsersPage } from './UsersPage'

const mocks = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  updateSelect: vi.fn(),
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
  mocks.updateSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  mocks.eq.mockReturnValue({ select: mocks.updateSelect })
  mocks.update.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
})

async function fillInvite(user: ReturnType<typeof userEvent.setup>, email: string, fullName: string) {
  await user.type(screen.getByPlaceholderText('Correo'), email)
  await user.type(screen.getByPlaceholderText('Nombre completo'), fullName)
}

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
  await fillInvite(user, 'nuevo@b.com', 'Nuevo')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(mocks.inviteUser).toHaveBeenCalledWith({
    email: 'nuevo@b.com',
    fullName: 'Nuevo',
    role: 'readonly',
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Usuario creado, se le envió un enlace de acceso')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a known invite error shows its friendly message as an alert, without an Error: prefix', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false, error: 'email_exists' })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'dup@b.com', 'Dup')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^Ese correo ya está registrado$/)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('an unknown invite error shows a generic alert that keeps the code', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false, error: 'internal_error' })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'x@b.com', 'X')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo enviar la invitación \(internal_error\)\.$/)
})

test('an invite error without a code shows the generic alert alone', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'x@b.com', 'X')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo enviar la invitación\.$/)
})

test('an invite error that is not a code shows the generic alert without the text', async () => {
  mocks.inviteUser.mockResolvedValue({ ok: false, error: 'Edge Function returned a non-2xx status code' })
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  await fillInvite(user, 'x@b.com', 'X')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo enviar la invitación\.$/)
})

test('the invitation role is an MUI select, not a native one', async () => {
  const user = userEvent.setup()
  const { container } = render(<UsersPage />)
  await screen.findByText(/Ana/)
  expect(container.querySelector('select')).toBeNull()
  await user.click(screen.getByRole('combobox', { name: 'Rol de la invitación' }))
  await user.click(await screen.findByRole('option', { name: 'Administrador' }))
  await fillInvite(user, 'jefe@b.com', 'Jefe')
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
  expect(mocks.updateSelect).toHaveBeenCalledWith('id')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a failed role change shows an alert and keeps the previous role', async () => {
  mocks.updateSelect.mockResolvedValue({ data: null, error: { message: 'RLS denied' } })
  const user = userEvent.setup()
  render(<UsersPage />)
  await user.click(await screen.findByRole('combobox', { name: 'Rol de Ana' }))
  await user.click(await screen.findByRole('option', { name: 'Solo lectura' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No se pudo cambiar el rol\.$/)
  expect(screen.getByRole('combobox', { name: 'Rol de Ana' })).toHaveTextContent('Administrador')
})

test('a role change that RLS filters out (zero rows) shows a permission alert and keeps the previous role', async () => {
  mocks.updateSelect.mockResolvedValue({ data: [], error: null })
  const user = userEvent.setup()
  render(<UsersPage />)
  await user.click(await screen.findByRole('combobox', { name: 'Rol de Ana' }))
  await user.click(await screen.findByRole('option', { name: 'Solo lectura' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No tienes permiso para esta acción\.$/)
  expect(screen.getByRole('combobox', { name: 'Rol de Ana' })).toHaveTextContent('Administrador')
  expect(mocks.select).toHaveBeenCalledTimes(1)
})

test('a failed list load shows LoadError and Reintentar reloads', async () => {
  mocks.select.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  const user = userEvent.setup()
  render(<UsersPage />)
  expect(await screen.findByText('No se pudieron cargar los usuarios.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText(/Ana/)).toBeInTheDocument()
  expect(screen.queryByText('No se pudieron cargar los usuarios.')).not.toBeInTheDocument()
  expect(mocks.select).toHaveBeenCalledTimes(2)
})

test('a failed reload after inviting keeps the success message and offers Reintentar', async () => {
  const user = userEvent.setup()
  render(<UsersPage />)
  await screen.findByText(/Ana/)
  mocks.select.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  await fillInvite(user, 'nuevo@b.com', 'Nuevo')
  await user.click(screen.getByRole('button', { name: 'Invitar' }))
  expect(await screen.findByText('No se pudieron cargar los usuarios.')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Usuario creado, se le envió un enlace de acceso')
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
})
