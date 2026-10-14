import { afterEach, vi } from 'vitest'
import { rollbackInvitedUser } from './rollback.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

test('returns true and logs nothing when the user is deleted', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const deleteUser = vi.fn().mockResolvedValue({ error: null })
  expect(await rollbackInvitedUser(deleteUser, 'u1')).toBe(true)
  expect(deleteUser).toHaveBeenCalledWith('u1')
  expect(errorSpy).not.toHaveBeenCalled()
})

test('returns false and logs the user id when deleteUser returns an error', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const deleteUser = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
  expect(await rollbackInvitedUser(deleteUser, 'u1')).toBe(false)
  expect(errorSpy).toHaveBeenCalledWith('invite-user rollback failed', { userId: 'u1', message: 'boom' })
})

test('returns false and logs when deleteUser throws', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const deleteUser = vi.fn().mockRejectedValue(new Error('network down'))
  expect(await rollbackInvitedUser(deleteUser, 'u1')).toBe(false)
  expect(errorSpy).toHaveBeenCalledWith('invite-user rollback failed', { userId: 'u1', message: 'network down' })
})
