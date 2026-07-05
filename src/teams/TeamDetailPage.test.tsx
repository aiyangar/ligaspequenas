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
    category_id: 'cat1', team_id: 'team9', team_name: 'MTY AC Rojo', ...over,
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
