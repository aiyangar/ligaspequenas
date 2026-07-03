import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { PlayerFormPage } from './PlayerFormPage'

const mocks = vi.hoisted(() => ({
  fetchPlayer: vi.fn(),
  createPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  useTenant: vi.fn(),
}))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, fetchPlayer: mocks.fetchPlayer, createPlayer: mocks.createPlayer, updatePlayer: mocks.updatePlayer }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/jugadores/nuevo', element: <PlayerFormPage /> },
      { path: '/jugadores/:id', element: <PlayerFormPage /> },
      { path: '/', element: <div>lista</div> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 'tenant-1' })
  mocks.createPlayer.mockResolvedValue({ ok: true, id: 'newid' })
  mocks.updatePlayer.mockResolvedValue({ ok: true })
  mocks.fetchPlayer.mockResolvedValue({
    id: 'p1', tenant_id: 'tenant-1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis', tutor_whatsapp: '811', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '', updated_at: '', edad_liga: 11, division: 'Infantil',
    category_name: 'Infantil Mayor', category_year: 1,
  })
})

test('create mode submits createPlayer with the tenant id', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/nuevo')
  await user.type(screen.getByLabelText(/Nombre completo/), 'Nuevo Jugador')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '2015-06-10')
  await user.type(screen.getByLabelText(/Nombre del tutor/), 'Tutor')
  await user.type(screen.getByLabelText(/WhatsApp del tutor/), '8110000000')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(mocks.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Nuevo Jugador' }),
      'tenant-1',
    ),
  )
})

test('edit mode loads the player and shows its category', async () => {
  renderAt('/jugadores/p1')
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeInTheDocument()
  expect(mocks.fetchPlayer).toHaveBeenCalledWith('p1')
  expect(screen.getByText(/Infantil Mayor \(1ro\)/)).toBeInTheDocument()
})

test('readonly role sees disabled fields and no Guardar button', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 'tenant-1' })
  renderAt('/jugadores/p1')
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})

test('a failed save surfaces the error', async () => {
  mocks.createPlayer.mockResolvedValue({ ok: false, error: 'permission denied' })
  const user = userEvent.setup()
  renderAt('/jugadores/nuevo')
  await user.type(screen.getByLabelText(/Nombre completo/), 'X')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '2015-06-10')
  await user.type(screen.getByLabelText(/Nombre del tutor/), 'T')
  await user.type(screen.getByLabelText(/WhatsApp del tutor/), '0')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
})
