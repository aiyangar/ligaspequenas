import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TeamDetailPage } from './TeamDetailPage'
import type { PlayerRow } from '../players/players'

const mocks = vi.hoisted(() => ({
  fetchTeam: vi.fn(), fetchRoster: vi.fn(), assignPlayer: vi.fn(), movePlayer: vi.fn(),
  removeFromRoster: vi.fn(), deleteTeam: vi.fn(), fetchEligiblePlayers: vi.fn(), useTenant: vi.fn(),
}))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return {
    ...actual, fetchTeam: mocks.fetchTeam, fetchRoster: mocks.fetchRoster,
    assignPlayer: mocks.assignPlayer, movePlayer: mocks.movePlayer,
    removeFromRoster: mocks.removeFromRoster, deleteTeam: mocks.deleteTeam,
    fetchEligiblePlayers: mocks.fetchEligiblePlayers,
  }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function p(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Roster', birth_date: '2015-06-10', curp: null,
    photo_path: null, status: 'activo', enrollment_date: '', tutor_name: 'T', tutor_whatsapp: '0',
    tutor_email: null, emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null, created_at: '', updated_at: '',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: 'team9', team_name: 'MTY AC Rojo',
    payment_state: 'sin_pagos', docs_delivered: 0, ...over,
  }
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/equipos/:id', element: <TeamDetailPage /> },
      { path: '/equipos', element: <div>lista</div> },
      { path: '/equipos/:id/editar', element: <div>editar</div> },
    ],
    { initialEntries: ['/equipos/team9'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchTeam.mockResolvedValue({
    id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: 'Luis', color: 'Rojo', created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 1,
  })
  mocks.fetchRoster.mockResolvedValue([p({ id: 'p1', full_name: 'Ana Roster' })])
  mocks.fetchEligiblePlayers.mockResolvedValue([])
  mocks.assignPlayer.mockResolvedValue({ ok: true })
  mocks.movePlayer.mockResolvedValue({ ok: true })
  mocks.removeFromRoster.mockResolvedValue({ ok: true })
  mocks.deleteTeam.mockResolvedValue({ ok: true })
})

test('shows team header and its roster', async () => {
  renderPage()
  expect(await screen.findByRole('heading', { name: /MTY AC Rojo/ })).toBeInTheDocument()
  expect(screen.getByText('Ana Roster')).toBeInTheDocument()
})

test('admin sees Editar and Eliminar actions', async () => {
  renderPage()
  await screen.findByText('Ana Roster')
  expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/equipos/team9/editar')
  expect(screen.getByRole('button', { name: 'Eliminar equipo' })).toBeInTheDocument()
})

test('removing a roster player calls removeFromRoster and refreshes', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  await waitFor(() => expect(mocks.removeFromRoster).toHaveBeenCalledWith('p1', 's1'))
})

test('readonly hides mutating actions', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'L', tenantId: 't1' })
  renderPage()
  await screen.findByText('Ana Roster')
  expect(screen.queryByRole('button', { name: 'Eliminar equipo' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Añadir jugador' })).not.toBeInTheDocument()
})

test('a failed load offers Reintentar and retrying shows the team', async () => {
  mocks.fetchTeam.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('heading', { name: /MTY AC Rojo/ })).toBeInTheDocument()
})

test('a failed refresh after a mutation shows an error without losing the page', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.fetchRoster.mockRejectedValueOnce(new Error('boom'))
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  expect(await screen.findByText('No se pudo actualizar la vista. Recarga la página.')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('heading', { name: /MTY AC Rojo/ })).toBeInTheDocument()
})

test('a missing team shows not-found with a link back to Equipos', async () => {
  mocks.fetchTeam.mockResolvedValue(null)
  renderPage()
  expect(await screen.findByText('Equipo no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Equipos' })).toHaveAttribute('href', '/equipos')
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
})

test('a failed removal keeps its error when the reload also fails', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.removeFromRoster.mockResolvedValue({ ok: false, error: 'RLS denied' })
  mocks.fetchRoster.mockRejectedValue(new Error('boom'))
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  expect(await screen.findByText('RLS denied')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.fetchRoster).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('No se pudo actualizar la vista. Recarga la página.')).not.toBeInTheDocument()
})

test('a failed removal shows its error and still reloads a concurrently changed roster', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  mocks.removeFromRoster.mockResolvedValue({ ok: false, error: 'duplicate key' })
  mocks.fetchRoster.mockResolvedValue([p({ id: 'p2', full_name: 'Beto Roster' })])
  await user.click(screen.getByRole('button', { name: /Quitar/ }))
  await user.click(screen.getByRole('button', { name: 'Quitar del equipo' }))
  expect(await screen.findByText('duplicate key')).toBeInTheDocument()
  expect(await screen.findByText('Beto Roster')).toBeInTheDocument()
  expect(screen.queryByText('Ana Roster')).not.toBeInTheDocument()
  expect(screen.queryByText('No se pudo actualizar la vista. Recarga la página.')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('a failed assign shows its error, closes the dialog and still reloads', async () => {
  mocks.fetchEligiblePlayers.mockResolvedValue([p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null })])
  mocks.assignPlayer.mockResolvedValue({ ok: false, error: 'RLS denied' })
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Roster')
  await user.click(screen.getByRole('button', { name: 'Añadir jugador' }))
  await user.click(await screen.findByText('Free Agent'))
  expect(await screen.findByText('RLS denied')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(mocks.fetchRoster).toHaveBeenCalledTimes(2)
})
