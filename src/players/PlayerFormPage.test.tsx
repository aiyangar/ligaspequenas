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
  fetchTeams: vi.fn(),
  fetchActiveSeason: vi.fn(),
  assignPlayer: vi.fn(),
  movePlayer: vi.fn(),
  removeFromRoster: vi.fn(),
}))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, fetchPlayer: mocks.fetchPlayer, createPlayer: mocks.createPlayer, updatePlayer: mocks.updatePlayer }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))
vi.mock('../teams/teams', async (importActual) => {
  const actual = await importActual<typeof import('../teams/teams')>()
  return {
    ...actual,
    fetchTeams: mocks.fetchTeams, fetchActiveSeason: mocks.fetchActiveSeason,
    assignPlayer: mocks.assignPlayer, movePlayer: mocks.movePlayer, removeFromRoster: mocks.removeFromRoster,
  }
})

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
    category_id: 'cat1', team_id: null, team_name: null,
  })
  mocks.fetchTeams.mockResolvedValue([
    { id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
      coach: null, color: null, created_at: '', updated_at: '', category_name: 'Infantil Mayor',
      division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 0 },
  ])
  mocks.fetchActiveSeason.mockResolvedValue({ id: 's1', tenant_id: 't1', name: '2026-2027', cutoff_date: '2027-04-30', is_active: true })
  mocks.assignPlayer.mockResolvedValue({ ok: true })
  mocks.movePlayer.mockResolvedValue({ ok: true })
  mocks.removeFromRoster.mockResolvedValue({ ok: true })
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

test('creating shows an in-app success confirmation', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/nuevo')
  await user.type(screen.getByLabelText(/Nombre completo/), 'Nuevo Jugador')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '2015-06-10')
  await user.type(screen.getByLabelText(/Nombre del tutor/), 'Tutor')
  await user.type(screen.getByLabelText(/WhatsApp del tutor/), '8110000000')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Jugador creado')).toBeInTheDocument()
})

test('editing shows an in-app success confirmation', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
})

test('edit mode shows a team selector with category teams and assigns on change', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.selectOptions(await screen.findByLabelText('Equipo'), 'team9')
  await waitFor(() => expect(mocks.assignPlayer).toHaveBeenCalledWith('team9', 'p1', 'tenant-1', 's1'))
})

test('create mode does not render the team selector', async () => {
  renderAt('/jugadores/nuevo')
  await screen.findByLabelText(/Nombre completo/)
  expect(screen.queryByLabelText('Equipo')).not.toBeInTheDocument()
})

test('readonly sees the team selector disabled with a read-only hint', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 'tenant-1' })
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  expect(await screen.findByLabelText('Equipo')).toBeDisabled()
  expect(screen.getByText('Solo lectura: solo un administrador puede cambiar el equipo.')).toBeInTheDocument()
})

test('without an active tenant the team selector is disabled with a hint', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: null })
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  expect(await screen.findByLabelText('Equipo')).toBeDisabled()
  expect(screen.getByText('No hay liga activa.')).toBeInTheDocument()
})

test('a failed player load offers Reintentar and retrying shows the form', async () => {
  mocks.fetchPlayer.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeInTheDocument()
})

test('a failed teams load keeps the form and retries only the teams', async () => {
  mocks.fetchTeams.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  expect(await screen.findByDisplayValue('Ana Ruiz')).toBeInTheDocument()
  expect(await screen.findByText('No se pudieron cargar los equipos.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByLabelText('Equipo')).toBeInTheDocument()
  expect(mocks.fetchTeams).toHaveBeenCalledTimes(2)
  expect(mocks.fetchPlayer).toHaveBeenCalledTimes(1)
})

test('a failed refresh after changing team shows an error-severity message', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  mocks.fetchPlayer.mockRejectedValueOnce(new Error('boom'))
  await user.selectOptions(await screen.findByLabelText('Equipo'), 'team9')
  const msg = await screen.findByText('Error: no se pudo actualizar la vista. Recarga la página.')
  expect(msg.closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorError')
})
