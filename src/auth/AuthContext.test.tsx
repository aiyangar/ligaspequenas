import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

function Probe() {
  const { session, loading } = useAuth()
  return <div>{loading ? 'loading' : session ? `user:${session.user.id}` : 'anon'}</div>
}

test('exposes anon when there is no session', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('anon')).toBeInTheDocument()
})

test('exposes the session user once loaded', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('user:u1')).toBeInTheDocument()
})

test('unsubscribes from auth changes on unmount', async () => {
  const unsubscribe = vi.fn()
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })
  const { unmount } = render(<AuthProvider><Probe /></AuthProvider>)
  await screen.findByText('anon')
  unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
