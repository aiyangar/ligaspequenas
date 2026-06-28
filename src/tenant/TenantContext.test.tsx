import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { TenantProvider, useTenant } from './TenantContext'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: mocks.useAuth }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.maybeSingle.mockResolvedValue({
    data: { tenant_id: 't1', role: 'admin', full_name: 'Ana' },
    error: null,
  })
})

function Probe() {
  const { tenantId, role, fullName, status } = useTenant()
  return <div>{`${status}|${tenantId ?? '-'}|${role ?? '-'}|${fullName ?? '-'}`}</div>
}

test('maps the profile row to tenant + role when ready', async () => {
  render(<TenantProvider><Probe /></TenantProvider>)
  expect(await screen.findByText('ready|t1|admin|Ana')).toBeInTheDocument()
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.select).toHaveBeenCalledWith('tenant_id, role, full_name')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
})

test('reports no-profile when the profile row is missing', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  render(<TenantProvider><Probe /></TenantProvider>)
  expect(await screen.findByText('no-profile|-|-|-')).toBeInTheDocument()
})

test('reports error when the query errors', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
  render(<TenantProvider><Probe /></TenantProvider>)
  expect(await screen.findByText('error|-|-|-')).toBeInTheDocument()
})
