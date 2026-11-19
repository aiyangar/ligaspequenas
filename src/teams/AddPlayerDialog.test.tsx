import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { AddPlayerDialog } from './AddPlayerDialog'
import type { PlayerRow } from '../players/players'

const mocks = vi.hoisted(() => ({ fetchEligiblePlayers: vi.fn() }))
vi.mock('./teams', async (importActual) => {
  const actual = await importActual<typeof import('./teams')>()
  return { ...actual, fetchEligiblePlayers: mocks.fetchEligiblePlayers }
})

function p(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana', birth_date: '2015-06-10', curp: null,
    photo_path: null, status: 'activo', enrollment_date: '', tutor_name: 'T', tutor_whatsapp: '0',
    tutor_email: null, emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null, created_at: '', updated_at: '',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: null, team_name: null,
    payment_state: 'sin_pagos', docs_delivered: 0, ...over,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchEligiblePlayers.mockResolvedValue([
    p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null }),
    p({ id: 'inB', full_name: 'Otro Equipo', team_id: 'B', team_name: 'MTY AC Azul' }),
  ])
})

test('free agents assign directly on click', async () => {
  const onAssign = vi.fn()
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={onAssign} onMove={vi.fn()} onClose={vi.fn()} />)
  await user.click(await screen.findByText('Free Agent'))
  expect(onAssign).toHaveBeenCalledWith('free')
})

test('clicking a player in another team asks for confirmation before moving', async () => {
  const onMove = vi.fn()
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={onMove} onClose={vi.fn()} />)
  await user.click(await screen.findByText('Otro Equipo'))
  expect(onMove).not.toHaveBeenCalled()
  expect(await screen.findByText(/Se moverá de MTY AC Azul/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Mover' }))
  await waitFor(() => expect(onMove).toHaveBeenCalledWith('inB', 'MTY AC Azul'))
})

test('search narrows the eligible list', async () => {
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={vi.fn()} onClose={vi.fn()} />)
  await screen.findByText('Free Agent')
  await user.type(screen.getByLabelText(/Buscar/), 'otro')
  await waitFor(() => expect(screen.queryByText('Free Agent')).not.toBeInTheDocument())
  expect(screen.getByText('Otro Equipo')).toBeInTheDocument()
})

test('a failed load offers Reintentar inside the dialog', async () => {
  mocks.fetchEligiblePlayers.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={vi.fn()} onClose={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
})

test('reopening after a failed load shows the list without a stale error', async () => {
  mocks.fetchEligiblePlayers.mockRejectedValueOnce(new Error('boom'))
  const props = { categoryId: 'cat1', teamId: 'A', onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open {...props} />)
  await screen.findByRole('button', { name: 'Reintentar' })
  rerender(<AddPlayerDialog open={false} {...props} />)
  rerender(<AddPlayerDialog open {...props} />)
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
})

test('closing with Cerrar after a failed load reopens in Cargando… without the stale error', async () => {
  mocks.fetchEligiblePlayers.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  const props = { categoryId: 'cat1', teamId: 'A', onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open {...props} />)
  await screen.findByRole('button', { name: 'Reintentar' })
  await user.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(props.onClose).toHaveBeenCalledTimes(1)
  rerender(<AddPlayerDialog open={false} {...props} />)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  rerender(<AddPlayerDialog open {...props} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  await act(async () => {
    rows.resolve([p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null })])
  })
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
})

test('reopening after the parent closes it shows Cargando… instead of the previous list', async () => {
  const props = { categoryId: 'cat1', teamId: 'A', onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open {...props} />)
  await screen.findByText('Free Agent')
  rerender(<AddPlayerDialog open={false} {...props} />)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  rerender(<AddPlayerDialog open {...props} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByText('Free Agent')).not.toBeInTheDocument()
  await act(async () => {
    rows.resolve([p({ id: 'new', full_name: 'Nuevo Agente', team_id: null, team_name: null })])
  })
  expect(await screen.findByText('Nuevo Agente')).toBeInTheDocument()
})

test('the first load shows Cargando… instead of the empty-list message', async () => {
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByText('No hay jugadores elegibles.')).not.toBeInTheDocument()
  await act(async () => {
    rows.resolve([p({ id: 'free', full_name: 'Free Agent', team_id: null, team_name: null })])
  })
  expect(await screen.findByText('Free Agent')).toBeInTheDocument()
})

test('switching team or category while open shows Cargando… instead of the previous list', async () => {
  const props = { onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open categoryId="cat1" teamId="A" {...props} />)
  await screen.findByText('Free Agent')
  const rows = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValue(rows.promise)
  rerender(<AddPlayerDialog open categoryId="cat2" teamId="B" {...props} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByText('Free Agent')).not.toBeInTheDocument()
  expect(mocks.fetchEligiblePlayers).toHaveBeenLastCalledWith('cat2', 'B')
  await act(async () => {
    rows.resolve([p({ id: 'other', full_name: 'Carla Nueva', team_id: null, team_name: null, category_id: 'cat2' })])
  })
  expect(await screen.findByText('Carla Nueva')).toBeInTheDocument()
  expect(screen.queryByText('Free Agent')).not.toBeInTheDocument()
})

test('a late response for the previous source does not replace Cargando… for the new one', async () => {
  const first = deferred<PlayerRow[]>()
  const second = deferred<PlayerRow[]>()
  mocks.fetchEligiblePlayers.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const props = { onAssign: vi.fn(), onMove: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AddPlayerDialog open categoryId="cat1" teamId="A" {...props} />)
  expect(await screen.findByText('Cargando…')).toBeInTheDocument()
  rerender(<AddPlayerDialog open categoryId="cat2" teamId="B" {...props} />)
  await act(async () => {
    first.resolve([p({ id: 'old', full_name: 'Viejo Agente', team_id: null, team_name: null })])
  })
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByText('Viejo Agente')).not.toBeInTheDocument()
  await act(async () => {
    second.resolve([p({ id: 'new', full_name: 'Nuevo Agente', team_id: null, team_name: null, category_id: 'cat2' })])
  })
  expect(await screen.findByText('Nuevo Agente')).toBeInTheDocument()
  expect(screen.queryByText('Viejo Agente')).not.toBeInTheDocument()
})

test('each eligible player button sits inside its own list item', async () => {
  render(<AddPlayerDialog open categoryId="cat1" teamId="A" onAssign={vi.fn()} onMove={vi.fn()} onClose={vi.fn()} />)
  await screen.findByText('Free Agent')
  for (const name of [/Free Agent/, /Otro Equipo/]) {
    const button = screen.getByRole('button', { name })
    expect(button.parentElement?.tagName).toBe('LI')
    expect(button.parentElement?.parentElement?.tagName).toBe('UL')
  }
})
