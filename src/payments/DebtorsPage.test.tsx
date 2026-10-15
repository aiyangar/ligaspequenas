import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { DebtorsPage } from './DebtorsPage'
import { TenantContext } from '../tenant/TenantContext'
import type { Role } from '../tenant/TenantContext'
import type { PlayerRow } from '../players/players'
import type { PaymentRow, PaymentStatusRow } from './payments'

const mocks = vi.hoisted(() => ({
  fetchPlayers: vi.fn(),
  fetchPaymentStatuses: vi.fn(),
  fetchOutstandingPayments: vi.fn(),
}))
vi.mock('../players/players', async (importActual) => {
  const actual = await importActual<typeof import('../players/players')>()
  return { ...actual, fetchPlayers: mocks.fetchPlayers }
})
vi.mock('./payments', async (importActual) => {
  const actual = await importActual<typeof import('./payments')>()
  return {
    ...actual,
    fetchPaymentStatuses: mocks.fetchPaymentStatuses,
    fetchOutstandingPayments: mocks.fetchOutstandingPayments,
  }
})

function player(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10', curp: null,
    photo_path: null, status: 'activo', enrollment_date: '2026-07-01', tutor_name: 'T',
    tutor_whatsapp: '0', tutor_email: null, emergency_contact_name: null,
    emergency_contact_phone: null, affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '', updated_at: '', edad_liga: 11, division: 'Infantil',
    category_name: 'Infantil Mayor', category_year: 1, category_id: 'cat1',
    team_id: null, team_name: null, ...over,
  }
}

function payment(over: Partial<PaymentRow>): PaymentRow {
  return {
    id: 'x1', tenant_id: 't1', player_id: 'p1', concept: 'inscripcion', concept_note: null,
    amount: 500, payment_date: '2026-10-04', method: 'efectivo', status: 'pendiente',
    created_at: '', updated_at: '', ...over,
  }
}

function state(player_id: string, payment_state: PaymentStatusRow['payment_state']): PaymentStatusRow {
  return { player_id, tenant_id: 't1', payment_state }
}

function renderPage(role: Role = 'admin') {
  const router = createMemoryRouter(
    [
      { path: '/quien-debe', element: <DebtorsPage /> },
      { path: '/jugadores/:id', element: <div>detalle</div> },
    ],
    { initialEntries: ['/quien-debe'] },
  )
  return render(
    <TenantContext.Provider value={{ status: 'ready', role, fullName: 'X', tenantId: 't1' }}>
      <RouterProvider router={router} />
    </TenantContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchPlayers.mockResolvedValue([
    player({ id: 'p1', full_name: 'Ana Ruiz' }),
    player({ id: 'p2', full_name: 'Beto Gómez' }),
    player({ id: 'p3', full_name: 'Carla Díaz' }),
    player({ id: 'p4', full_name: 'Dani Leal', status: 'baja' }),
  ])
  mocks.fetchPaymentStatuses.mockResolvedValue([
    state('p1', 'con_adeudo'), state('p2', 'sin_pagos'), state('p3', 'al_corriente'), state('p4', 'con_adeudo'),
  ])
  mocks.fetchOutstandingPayments.mockResolvedValue([
    payment({ id: 'x1', player_id: 'p1', concept: 'mensualidad', concept_note: 'Octubre', amount: 200, status: 'parcial' }),
    payment({ id: 'x2', player_id: 'p4' }),
  ])
})

test('shows the three groups in order with their counts', async () => {
  renderPage()
  expect(await screen.findByRole('heading', { name: 'Con adeudo (1)' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Quién debe' })).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    'Con adeudo (1)',
    'Sin pagos (1)',
    'Al corriente (1)',
  ])
  expect(within(screen.getByRole('region', { name: 'Sin pagos (1)' })).getByText('Beto Gómez')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Al corriente (1)' })).getByText('Carla Díaz')).toBeInTheDocument()
})

test('a baja player never appears', async () => {
  renderPage()
  await screen.findByRole('heading', { name: 'Con adeudo (1)' })
  expect(screen.queryByText('Dani Leal')).not.toBeInTheDocument()
})

test('a debtor shows the category and each open charge', async () => {
  renderPage()
  const region = await screen.findByRole('region', { name: 'Con adeudo (1)' })
  expect(within(region).getByText('Ana Ruiz')).toBeInTheDocument()
  expect(within(region).getByText('Infantil Mayor (1ro)')).toBeInTheDocument()
  expect(within(region).getByText('Mensualidad — Octubre · $200.00')).toBeInTheDocument()
  expect(within(region).getByText('Parcial')).toBeInTheDocument()
})

test('tapping a player opens the player detail', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('link', { name: /Beto Gómez/ }))
  expect(await screen.findByText('detalle')).toBeInTheDocument()
})

test('empty groups say so', async () => {
  mocks.fetchPaymentStatuses.mockResolvedValueOnce([state('p1', 'al_corriente'), state('p2', 'al_corriente'), state('p3', 'al_corriente')])
  mocks.fetchOutstandingPayments.mockResolvedValueOnce([])
  renderPage()
  const debtors = await screen.findByRole('region', { name: 'Con adeudo (0)' })
  expect(within(debtors).getByText('Nadie en este grupo.')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Sin pagos (0)' })).getByText('Nadie en este grupo.')).toBeInTheDocument()
})

test('no active players shows a single message', async () => {
  mocks.fetchPlayers.mockResolvedValueOnce([player({ id: 'p4', status: 'baja' })])
  renderPage()
  expect(await screen.findByText('No hay jugadores activos.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
})

test('a failed load shows LoadError and Reintentar reloads', async () => {
  mocks.fetchOutstandingPayments.mockRejectedValueOnce(new Error('boom'))
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('heading', { name: 'Con adeudo (1)' })).toBeInTheDocument()
  await waitFor(() => expect(mocks.fetchPlayers).toHaveBeenCalledTimes(2))
})

test('admin and readonly see the same read-only page', async () => {
  const { unmount } = renderPage('admin')
  await screen.findByRole('heading', { name: 'Con adeudo (1)' })
  const adminText = document.body.textContent
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  unmount()
  renderPage('readonly')
  await screen.findByRole('heading', { name: 'Con adeudo (1)' })
  expect(document.body.textContent).toBe(adminText)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
