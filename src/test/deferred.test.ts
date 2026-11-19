import { expect } from 'vitest'
import { deferred } from './deferred'

test('deferred resolves its promise from outside', async () => {
  const pending = deferred<number>()
  pending.resolve(7)
  await expect(pending.promise).resolves.toBe(7)
})

test('deferred rejects its promise from outside', async () => {
  const pending = deferred<number>()
  pending.reject(new Error('boom'))
  await expect(pending.promise).rejects.toThrow('boom')
})
