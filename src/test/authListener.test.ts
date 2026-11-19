import { expect, vi } from 'vitest'
import { captureAuthListener } from './authListener'

test('captureAuthListener hands back an emit that calls the registered listener', () => {
  const onAuthStateChange = vi.fn()
  const emit = captureAuthListener(onAuthStateChange)
  const listener = vi.fn()
  const result = onAuthStateChange(listener)
  expect(result).toEqual({ data: { subscription: { unsubscribe: expect.any(Function) } } })
  emit('SIGNED_IN', { user: { id: 'u1' } })
  expect(listener).toHaveBeenCalledWith('SIGNED_IN', { user: { id: 'u1' } })
})

test('emit before any listener registered throws', () => {
  const emit = captureAuthListener(vi.fn())
  expect(() => emit('SIGNED_IN', null)).toThrow('no auth listener registered')
})
