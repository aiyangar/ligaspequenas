import { beforeEach, expect, vi } from 'vitest'
import { inviteUser } from './inviteUser'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }))

beforeEach(() => {
  vi.clearAllMocks()
})

test('invokes the edge function with the input plus a redirectTo', async () => {
  mocks.invoke.mockResolvedValue({ data: { userId: 'new' }, error: null })
  const result = await inviteUser({ email: 'a@b.com', fullName: 'Ana', role: 'admin' })
  expect(result).toEqual({ ok: true })
  expect(mocks.invoke).toHaveBeenCalledWith('invite-user', {
    body: expect.objectContaining({
      email: 'a@b.com',
      fullName: 'Ana',
      role: 'admin',
      redirectTo: expect.stringMatching(/\/accept-invite$/),
    }),
  })
})

test('returns the transport error when invoke fails', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { message: 'network' } })
  const result = await inviteUser({ email: 'a@b.com', fullName: 'Ana', role: 'readonly' })
  expect(result).toEqual({ ok: false, error: 'network' })
})

test('surfaces the specific reason from a non-2xx function response', async () => {
  // supabase-js shape for a non-2xx function: data null, error is a FunctionsHttpError
  // whose `context` is the Response carrying the JSON body.
  mocks.invoke.mockResolvedValue({
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    },
  })
  const result = await inviteUser({ email: 'a@b.com', fullName: 'Ana', role: 'readonly' })
  expect(result).toEqual({ ok: false, error: 'forbidden' })
})
