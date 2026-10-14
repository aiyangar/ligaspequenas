import { act, render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './AuthContext'

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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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

test('resolves to anon when getSession rejects', async () => {
  mocks.getSession.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('anon')).toBeInTheDocument()
})

test('an auth event wins over a getSession result that arrives later', async () => {
  const pending = deferred<{ data: { session: null }; error: null }>()
  mocks.getSession.mockReturnValue(pending.promise)
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(screen.getByText('loading')).toBeInTheDocument()
  act(() => {
    captured!('SIGNED_IN', { user: { id: 'u2' } })
  })
  expect(screen.getByText('user:u2')).toBeInTheDocument()
  await act(async () => {
    pending.resolve({ data: { session: null }, error: null })
  })
  expect(screen.getByText('user:u2')).toBeInTheDocument()
})

test('a getSession rejection after an auth event keeps the signed-in user', async () => {
  const pending = deferred<{ data: { session: null }; error: null }>()
  mocks.getSession.mockReturnValue(pending.promise)
  let captured: ((event: string, session: unknown) => void) | undefined
  mocks.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  render(<AuthProvider><Probe /></AuthProvider>)
  act(() => {
    captured!('SIGNED_IN', { user: { id: 'u2' } })
  })
  await act(async () => {
    pending.reject(new DOMException('The operation is insecure.', 'SecurityError'))
  })
  expect(screen.getByText('user:u2')).toBeInTheDocument()
})
