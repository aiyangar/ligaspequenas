import { render, screen } from '@testing-library/react'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TeamsPage } from './TeamsPage'
import type { TeamRow } from './teams'

const mocks = vi.hoisted(() => ({ fetchTeams: vi.fn(), useTenant: vi.fn() }))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return { ...actual, fetchTeams: mocks.fetchTeams }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function team(over: Partial<TeamRow>): TeamRow {
  return {
    id: 't1', tenant_id: 'tn', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: 'Luis', color: 'Rojo', created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 2, ...over,
  }
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/equipos', element: <TeamsPage /> },
      { path: '/equipos/nuevo', element: <div>nuevo</div> },
      { path: '/equipos/:id', element: <div>detalle</div> },
    ],
    { initialEntries: ['/equipos'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchTeams.mockResolvedValue([
    team({ id: 't1', name: 'MTY AC Rojo', category_name: 'Infantil Mayor', player_count: 2 }),
    team({ id: 't2', name: 'MTY AC Azul', category_name: 'Infantil Mayor', player_count: 1 }),
  ])
})

test('lists teams grouped under their category with player count', async () => {
  renderPage()
  expect(await screen.findByText('MTY AC Rojo')).toBeInTheDocument()
  expect(screen.getByText('MTY AC Azul')).toBeInTheDocument()
  expect(screen.getAllByText('Infantil Mayor').length).toBeGreaterThan(0)
  expect(screen.getByText(/2 jugadores/)).toBeInTheDocument()
})

test('admin sees the "Nuevo equipo" button', async () => {
  renderPage()
  await screen.findByText('MTY AC Rojo')
  expect(screen.getByRole('link', { name: 'Nuevo equipo' })).toHaveAttribute('href', '/equipos/nuevo')
})

test('empty active season shows an explanatory state', async () => {
  mocks.fetchTeams.mockResolvedValue([])
  renderPage()
  expect(await screen.findByText(/No hay equipos/)).toBeInTheDocument()
})
