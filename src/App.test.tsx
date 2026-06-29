import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
}))
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange },
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

test('an unauthenticated visit lands on the login screen', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
})
