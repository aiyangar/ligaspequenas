import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { PlayersPage } from './PlayersPage'
import type { PlayerRow } from './players'

const mocks = vi.hoisted(() => ({ fetchPlayers: vi.fn(), useTenant: vi.fn() }))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, fetchPlayers: mocks.fetchPlayers }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function player(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis', tutor_whatsapp: '811', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null, created_at: '', updated_at: '',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: null, team_name: null, ...over,
  }
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <PlayersPage /> },
      { path: '/jugadores/nuevo', element: <div>nuevo</div> },
      { path: '/jugadores/:id', element: <div>detalle</div> },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p1', full_name: 'Ana Ruiz', category_name: 'Infantil Mayor', category_year: 1, team_id: 'team9', team_name: 'MTY AC Rojo' }),
    player({ id: 'p2', full_name: 'Beto Gómez', status: 'baja', category_name: null, category_year: null, edad_liga: 25, team_id: null, team_name: null }),
  ])
})

test('lists players with their category label', async () => {
  renderPage()
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  expect(screen.getByText(/Infantil Mayor \(1ro\)/)).toBeInTheDocument()
  expect(screen.getByText(/Fuera de categoría \(edad 25\)/)).toBeInTheDocument()
})

test('search filters the list by name', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.type(screen.getByLabelText('Buscar por nombre'), 'beto')
  await waitFor(() => expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument())
  expect(screen.getByText('Beto Gómez')).toBeInTheDocument()
})

test('status filter narrows to activos', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Beto Gómez')
  await user.selectOptions(screen.getByLabelText('Estatus'), 'activo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})

test('shows the team name for a rostered player', async () => {
  renderPage()
  expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
  // The "· " prefix targets the list item's secondary text, not the filter <option>.
  expect(screen.getByText(/· MTY AC Rojo/)).toBeInTheDocument()
})

test('team filter narrows to a single team', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.selectOptions(screen.getByLabelText('Equipo'), 'MTY AC Rojo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
})

test('admin sees the "Nuevo jugador" button', async () => {
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(screen.getByRole('link', { name: 'Nuevo jugador' })).toHaveAttribute('href', '/jugadores/nuevo')
})

test('readonly does not see the "Nuevo jugador" button', async () => {
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 't1' })
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(screen.queryByRole('link', { name: 'Nuevo jugador' })).not.toBeInTheDocument()
})
