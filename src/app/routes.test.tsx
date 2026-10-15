import { render, screen } from '@testing-library/react'
import { beforeEach, expect, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { routes } from './routes'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useTenant: vi.fn(),
  fetchPlayers: vi.fn(),
  fetchPaymentStatuses: vi.fn(),
  fetchOutstandingPayments: vi.fn(),
}))
vi.mock('../auth/AuthContext', async (importActual) => {
  const actual = await importActual<typeof import('../auth/AuthContext')>()
  return { ...actual, useAuth: mocks.useAuth }
})
vi.mock('../tenant/TenantContext', async (importActual) => {
  const actual = await importActual<typeof import('../tenant/TenantContext')>()
  return { ...actual, useTenant: mocks.useTenant }
})
vi.mock('../players/players', async (importActual) => {
  const actual = await importActual<typeof import('../players/players')>()
  return { ...actual, fetchPlayers: mocks.fetchPlayers }
})
vi.mock('../payments/payments', async (importActual) => {
  const actual = await importActual<typeof import('../payments/payments')>()
  return {
    ...actual,
    fetchPaymentStatuses: mocks.fetchPaymentStatuses,
    fetchOutstandingPayments: mocks.fetchOutstandingPayments,
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useAuth.mockReturnValue({ session: {} as Session, loading: false })
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 't1' })
  mocks.fetchPlayers.mockResolvedValue([])
  mocks.fetchPaymentStatuses.mockResolvedValue([])
  mocks.fetchOutstandingPayments.mockResolvedValue([])
})

test('/quien-debe renders the debtors page for a readonly user', async () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/quien-debe'] })
  render(<RouterProvider router={router} />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Quién debe' })).toBeInTheDocument()
  expect(await screen.findByText('No hay jugadores activos.')).toBeInTheDocument()
  expect(screen.queryByText('Próximamente')).not.toBeInTheDocument()
})
