import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TeamFormPage } from './TeamFormPage'

const mocks = vi.hoisted(() => ({
  fetchTeam: vi.fn(), fetchCategories: vi.fn(), fetchActiveSeason: vi.fn(),
  createTeam: vi.fn(), updateTeam: vi.fn(), useTenant: vi.fn(),
}))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return { ...actual, fetchTeam: mocks.fetchTeam, fetchCategories: mocks.fetchCategories, fetchActiveSeason: mocks.fetchActiveSeason, createTeam: mocks.createTeam, updateTeam: mocks.updateTeam }
})
vi.mock('../tenant/TenantContext', () => ({ useTenant: mocks.useTenant }))

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/equipos/nuevo', element: <TeamFormPage /> },
      { path: '/equipos/:id/editar', element: <TeamFormPage /> },
      { path: '/equipos/:id', element: <div>detalle</div> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 't1' })
  mocks.fetchCategories.mockResolvedValue([{ id: 'cat1', name: 'Infantil Mayor', division: 'Infantil', sort_order: 5 }])
  mocks.fetchActiveSeason.mockResolvedValue({ id: 's1', tenant_id: 't1', name: '2026-2027', cutoff_date: '2027-04-30', is_active: true })
  mocks.createTeam.mockResolvedValue({ ok: true, id: 'newteam' })
  mocks.updateTeam.mockResolvedValue({ ok: true })
  mocks.fetchTeam.mockResolvedValue({
    id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: null, color: null, created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 0,
  })
})

test('create mode submits createTeam with tenant and active season id', async () => {
  const user = userEvent.setup()
  renderAt('/equipos/nuevo')
  await screen.findByLabelText(/Nombre/)
  await user.type(screen.getByLabelText(/Nombre/), 'MTY AC Rojo')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(mocks.createTeam).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MTY AC Rojo', category_id: 'cat1' }),
      't1',
      's1',
    ),
  )
})

test('edit mode loads the team and locks category when roster is non-empty', async () => {
  mocks.fetchTeam.mockResolvedValue({
    id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
    coach: null, color: null, created_at: '', updated_at: '', category_name: 'Infantil Mayor',
    division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 3,
  })
  renderAt('/equipos/team9/editar')
  expect(await screen.findByDisplayValue('MTY AC Rojo')).toBeInTheDocument()
  expect(screen.getByLabelText(/Categoría/)).toBeDisabled()
})

test('create mode with no active season blocks the form', async () => {
  mocks.fetchActiveSeason.mockResolvedValue(null)
  renderAt('/equipos/nuevo')
  expect(await screen.findByText(/No hay temporada activa/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})

test('a failed load offers Reintentar and retrying shows the form', async () => {
  mocks.fetchCategories.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/equipos/nuevo')
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
})

test('editing a missing team shows not-found instead of a blank form', async () => {
  mocks.fetchTeam.mockResolvedValue(null)
  renderAt('/equipos/missing/editar')
  expect(await screen.findByText('Equipo no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Equipos' })).toHaveAttribute('href', '/equipos')
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})
