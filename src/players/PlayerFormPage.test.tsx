import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, onTestFinished, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { PlayerFormPage } from './PlayerFormPage'
import type { PlayerRow } from './players'
import { DOCUMENT_TYPES } from '../documents/documents'
import type { DocumentRow } from '../documents/documents'

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
  fetchPlayerDocuments: vi.fn(),
  setDocumentStatus: vi.fn(),
  uploadPlayerPhoto: vi.fn(),
  getSignedFileUrl: vi.fn(),
  fetchPlayerPayments: vi.fn(),
  createPayment: vi.fn(),
}))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return {
    ...actual,
    fetchPlayer: mocks.fetchPlayer, createPlayer: mocks.createPlayer, updatePlayer: mocks.updatePlayer,
    uploadPlayerPhoto: mocks.uploadPlayerPhoto,
  }
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

vi.mock('../documents/documents', async (importActual) => {
  const actual = await importActual<typeof import('../documents/documents')>()
  return {
    ...actual,
    fetchPlayerDocuments: mocks.fetchPlayerDocuments, setDocumentStatus: mocks.setDocumentStatus,
    getSignedFileUrl: mocks.getSignedFileUrl,
  }
})
vi.mock('../payments/payments', async (importActual) => {
  const actual = await importActual<typeof import('../payments/payments')>()
  return { ...actual, fetchPlayerPayments: mocks.fetchPlayerPayments, createPayment: mocks.createPayment }
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
  render(<RouterProvider router={router} />)
  return router
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const ana: PlayerRow = {
  id: 'p1', tenant_id: 'tenant-1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
  curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
  tutor_name: 'Luis', tutor_whatsapp: '811', tutor_email: null,
  emergency_contact_name: null, emergency_contact_phone: null,
  affiliation_status: 'pendiente', affiliation_date: null,
  created_at: '', updated_at: '', edad_liga: 11, division: 'Infantil',
  category_name: 'Infantil Mayor', category_year: 1,
  category_id: 'cat1', team_id: null, team_name: null,
  payment_state: 'sin_pagos', docs_delivered: 0,
}

function seededDocs(): DocumentRow[] {
  return DOCUMENT_TYPES.map((t, i) => ({
    id: `d${i}`, tenant_id: 'tenant-1', player_id: 'p1', doc_type: t, status: 'pendiente',
    file_path: null, updated_at: '',
  }))
}

function follows(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
}

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks keeps unconsumed *Once responses, which would leak into the next test
  mocks.fetchPlayer.mockReset()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'admin', fullName: 'Admin', tenantId: 'tenant-1' })
  mocks.createPlayer.mockResolvedValue({ ok: true, id: 'newid' })
  mocks.updatePlayer.mockResolvedValue({ ok: true })
  mocks.fetchPlayer.mockResolvedValue(ana)
  mocks.fetchTeams.mockResolvedValue([
    { id: 'team9', tenant_id: 't1', season_id: 's1', category_id: 'cat1', name: 'MTY AC Rojo',
      coach: null, color: null, created_at: '', updated_at: '', category_name: 'Infantil Mayor',
      division: 'Infantil', category_sort_order: 5, season_is_active: true, player_count: 0 },
  ])
  mocks.fetchActiveSeason.mockResolvedValue({ id: 's1', tenant_id: 't1', name: '2026-2027', cutoff_date: '2027-04-30', is_active: true })
  mocks.assignPlayer.mockResolvedValue({ ok: true })
  mocks.movePlayer.mockResolvedValue({ ok: true })
  mocks.removeFromRoster.mockResolvedValue({ ok: true })
  mocks.fetchPlayerDocuments.mockResolvedValue(seededDocs())
  mocks.setDocumentStatus.mockResolvedValue({ ok: true })
  mocks.uploadPlayerPhoto.mockResolvedValue({ ok: true })
  mocks.getSignedFileUrl.mockResolvedValue('https://signed/photo')
  mocks.fetchPlayerPayments.mockResolvedValue([])
  mocks.createPayment.mockResolvedValue({ ok: true })
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

test('a missing player shows not-found with a link back to the list at /', async () => {
  mocks.fetchPlayer.mockResolvedValue(null)
  renderAt('/jugadores/missing')
  expect(await screen.findByText('Jugador no encontrado')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver a Jugadores' })).toHaveAttribute('href', '/')
  expect(screen.queryByLabelText(/Nombre completo/)).not.toBeInTheDocument()
})

test('edit mode shows Cargando… instead of an empty form while loading', async () => {
  mocks.fetchPlayer.mockReturnValue(new Promise(() => {}))
  renderAt('/jugadores/p1')
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByLabelText(/Nombre completo/)).not.toBeInTheDocument()
})

test('navigating to a missing player shows not-found instead of the previous player', async () => {
  mocks.fetchPlayer.mockImplementation((id: string) => Promise.resolve(id === 'p1' ? ana : null))
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await act(() => router.navigate('/jugadores/p2'))
  expect(await screen.findByText('Jugador no encontrado')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Ana Ruiz')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
})

test('navigating to another player shows Cargando… until it loads, not the previous player', async () => {
  const beto = deferred<PlayerRow | null>()
  mocks.fetchPlayer.mockImplementation((id: string) => (id === 'p1' ? Promise.resolve(ana) : beto.promise))
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await act(() => router.navigate('/jugadores/p2'))
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Ana Ruiz')).not.toBeInTheDocument()
  await act(async () => {
    beto.resolve({ ...ana, id: 'p2', full_name: 'Beto Gómez' })
  })
  expect(await screen.findByDisplayValue('Beto Gómez')).toBeInTheDocument()
})

test('saving an edit keeps the same page instance and shows the toast', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  expect(screen.getByDisplayValue('Ana Ruiz')).toBeInTheDocument()
})

test('saving an edit refetches the player so the category and the team selector follow the saved row', async () => {
  const refreshed = deferred<PlayerRow>()
  mocks.fetchPlayer.mockResolvedValueOnce(ana).mockReturnValueOnce(refreshed.promise)
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await waitFor(() => expect(screen.getByLabelText('Equipo')).toBeEnabled())
  const form = within(screen.getByRole('button', { name: 'Guardar' }).closest('form')!)
  await user.selectOptions(form.getByRole('combobox', { name: 'Estatus' }), 'baja')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  const name = screen.getByLabelText(/Nombre completo/)
  await user.clear(name)
  await user.type(name, 'Ana María Ruiz')
  await act(async () => {
    refreshed.resolve({ ...ana, status: 'baja', category_id: 'cat2', category_name: 'Infantil Menor', category_year: 2 })
  })
  expect(await screen.findByText(/Infantil Menor \(2do\)/)).toBeInTheDocument()
  expect(screen.getByLabelText('Equipo')).toBeDisabled()
  expect(screen.getByText('Jugador de baja: no asignable.')).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('Ana María Ruiz')
  expect(form.getByRole('combobox', { name: 'Estatus' })).toHaveValue('baja')
  expect(mocks.fetchPlayer).toHaveBeenNthCalledWith(2, 'p1')
})

test('a failed refresh after saving an edit keeps the toast and shows an error-severity message', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  mocks.fetchPlayer.mockRejectedValueOnce(new Error('boom'))
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  const msg = await screen.findByText('Error: no se pudo actualizar la vista. Recarga la página.')
  expect(msg.closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorError')
  expect(screen.getByDisplayValue('Ana Ruiz')).toBeInTheDocument()
})

test('edit mode loads and shows the documents section', async () => {
  renderAt('/jugadores/p1')
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(mocks.fetchPlayerDocuments).toHaveBeenCalledWith('p1')
  expect(await screen.findAllByRole('listitem')).toHaveLength(6)
})

test('the documents section waits for the documents fetch', async () => {
  let resolveDocs!: (ds: DocumentRow[]) => void
  mocks.fetchPlayerDocuments.mockReturnValueOnce(new Promise((r) => { resolveDocs = r }))
  renderAt('/jugadores/p1')
  expect(await screen.findByLabelText(/Nombre completo/)).toHaveValue('Ana Ruiz')
  expect(screen.queryByRole('heading', { name: 'Documentos' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Para subir la foto o documentos digitales/)).not.toBeInTheDocument()
  resolveDocs(seededDocs())
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
})

test('create mode has no documents section', async () => {
  renderAt('/jugadores/nuevo')
  expect(await screen.findByRole('heading', { name: 'Nuevo jugador' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Documentos' })).not.toBeInTheDocument()
  expect(mocks.fetchPlayerDocuments).not.toHaveBeenCalled()
})

test('a failed documents fetch shows a retry and keeps the form usable', async () => {
  mocks.fetchPlayerDocuments.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  expect(await screen.findByText('No se pudieron cargar los documentos.')).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('Ana Ruiz')
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: /Reintentar/ }))
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2)
})

test('a document change reloads the documents and shows a toast', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  mocks.fetchPlayerDocuments.mockResolvedValueOnce(
    seededDocs().map((d) => (d.doc_type === 'curp' ? { ...d, status: 'fisico' as const } : d)),
  )
  await user.selectOptions(within(curp).getByRole('combobox'), 'fisico')
  expect(await screen.findByText('Documento actualizado')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2))
})

test('a photo upload refetches the player, keeps typed edits and locks Pendiente on the consents', async () => {
  mocks.fetchPlayerDocuments.mockResolvedValue(
    seededDocs().map((d) => (d.doc_type === 'image_consent' || d.doc_type === 'privacy_notice' ? { ...d, status: 'fisico' as const } : d)),
  )
  mocks.fetchPlayer.mockResolvedValueOnce(ana).mockResolvedValueOnce({ ...ana, photo_path: 'tenant-1/p1/photo', updated_at: 'u2' })
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const input = await screen.findByLabelText('Subir foto', { selector: 'input' })
  await waitFor(() => expect(input).toBeEnabled())
  const name = screen.getByLabelText(/Nombre completo/)
  await user.clear(name)
  await user.type(name, 'Ana María Ruiz')
  await user.upload(input, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByText('Foto actualizada')).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Quitar' })).toBeInTheDocument()
  expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('Ana María Ruiz')
  const consent = within(screen.getByRole('listitem', { name: 'Consentimiento de imagen' })).getByRole('combobox')
  expect(within(consent).getByRole('option', { name: 'Pendiente' })).toBeDisabled()
  expect(mocks.fetchPlayer).toHaveBeenCalledTimes(2)
})

test('edit mode shows the payments section', async () => {
  renderAt('/jugadores/p1')
  expect(await screen.findByRole('heading', { name: 'Pagos' })).toBeInTheDocument()
  expect(mocks.fetchPlayerPayments).toHaveBeenCalledWith('p1')
})

test('create mode has no payments section', async () => {
  renderAt('/jugadores/nuevo')
  expect(await screen.findByRole('heading', { name: 'Nuevo jugador' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Pagos' })).not.toBeInTheDocument()
  expect(mocks.fetchPlayerPayments).not.toHaveBeenCalled()
})

test('a failed photo upload reloads the documents so a stale consent is corrected', async () => {
  mocks.fetchPlayerDocuments.mockResolvedValueOnce(
    seededDocs().map((d) => (d.doc_type === 'image_consent' || d.doc_type === 'privacy_notice' ? { ...d, status: 'fisico' as const } : d)),
  )
  mocks.uploadPlayerPhoto.mockResolvedValueOnce({ ok: false, error: 'No tienes permiso para esta acción.' })
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const input = await screen.findByLabelText('Subir foto', { selector: 'input' })
  await waitFor(() => expect(input).toBeEnabled())
  await user.upload(input, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByText('No tienes permiso para esta acción.')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByLabelText('Subir foto', { selector: 'input' })).toBeDisabled())
  expect(screen.getByText('Requiere consentimiento de imagen y aviso de privacidad')).toBeInTheDocument()
})

test('the form and its Guardar come first; Equipo, Foto, Documentos and Pagos follow outside the form', async () => {
  renderAt('/jugadores/p1')
  const documentsHeading = await screen.findByRole('heading', { name: 'Documentos' })
  const save = screen.getByRole('button', { name: 'Guardar' })
  const photoHeading = screen.getByRole('heading', { name: 'Foto' })
  const paymentsHeading = screen.getByRole('heading', { name: 'Pagos' })
  const team = await screen.findByLabelText('Equipo')
  expect(save.closest('form')).not.toBeNull()
  for (const el of [team, photoHeading, documentsHeading, paymentsHeading]) expect(el.closest('form')).toBeNull()
  expect(screen.getByLabelText('Subir foto', { selector: 'input' }).closest('form')).toBeNull()
  expect(follows(save, team)).toBe(true)
  expect(follows(team, photoHeading)).toBe(true)
  expect(follows(photoHeading, documentsHeading)).toBe(true)
  expect(follows(documentsHeading, paymentsHeading)).toBe(true)
})

test('a document change right after saving replaces the toast instead of stacking a second one', async () => {
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  await user.selectOptions(within(curp).getByRole('combobox'), 'fisico')
  expect(await screen.findByText('Documento actualizado')).toBeInTheDocument()
  expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
})

test('the create flash is dropped from history once shown, so a reload does not repeat it', async () => {
  const user = userEvent.setup()
  const router = renderAt('/jugadores/nuevo')
  await user.type(screen.getByLabelText(/Nombre completo/), 'Nuevo Jugador')
  await user.type(screen.getByLabelText(/Fecha de nacimiento/), '2015-06-10')
  await user.type(screen.getByLabelText(/Nombre del tutor/), 'Tutor')
  await user.type(screen.getByLabelText(/WhatsApp del tutor/), '8110000000')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Jugador creado')).toBeInTheDocument()
  await waitFor(() => expect(router.state.location.state).toBeNull())
  expect(router.state.location.pathname).toBe('/jugadores/newid')
  expect(screen.getByText('Jugador creado')).toBeInTheDocument()
})

test('saving an edit shows the toast without leaving a flash in history', async () => {
  const user = userEvent.setup()
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  expect(router.state.location.state).toBeNull()
  expect(router.state.location.pathname).toBe('/jugadores/p1')
})

test('a toast that replaces another gets its own full display time', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => { vi.useRealTimers() })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(3000))
  // fireEvent, not a click: a click elsewhere is a Snackbar clickaway, which closes and reopens it anyway
  fireEvent.change(within(curp).getByRole('combobox'), { target: { value: 'fisico' } })
  expect(await screen.findByText('Documento actualizado')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByText('Documento actualizado')).toBeInTheDocument()
})

test("an in-flight team change from one player never lands on the next player's page", async () => {
  const assign = deferred<{ ok: boolean }>()
  mocks.assignPlayer.mockReturnValueOnce(assign.promise)
  let assigned = false
  mocks.fetchPlayer.mockImplementation((id: string) =>
    Promise.resolve(
      id === 'p2'
        ? { ...ana, id: 'p2', full_name: 'Beto Gómez' }
        : assigned ? { ...ana, team_id: 'team9', team_name: 'MTY AC Rojo' } : ana,
    ),
  )
  const user = userEvent.setup()
  const router = renderAt('/jugadores/p1')
  await screen.findByDisplayValue('Ana Ruiz')
  await user.selectOptions(await screen.findByLabelText('Equipo'), 'team9')
  await waitFor(() => expect(mocks.assignPlayer).toHaveBeenCalledTimes(1))
  await act(() => router.navigate('/jugadores/p2'))
  expect(await screen.findByDisplayValue('Beto Gómez')).toBeInTheDocument()
  assigned = true
  await act(async () => assign.resolve({ ok: true }))
  await waitFor(() => expect(mocks.fetchPlayer).toHaveBeenCalledTimes(3))
  await act(async () => {})
  expect(await screen.findByLabelText('Equipo')).toHaveValue('')
  expect(screen.getByDisplayValue('Beto Gómez')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a failed document change reloads the documents without a success toast', async () => {
  mocks.setDocumentStatus.mockResolvedValueOnce({ ok: false, error: 'No se pudo eliminar el archivo.' })
  const user = userEvent.setup()
  renderAt('/jugadores/p1')
  const curp = await screen.findByRole('listitem', { name: 'CURP' })
  await user.selectOptions(within(curp).getByRole('combobox'), 'fisico')
  expect(await screen.findByText('No se pudo eliminar el archivo.')).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayerDocuments).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Documento actualizado')).not.toBeInTheDocument()
})
