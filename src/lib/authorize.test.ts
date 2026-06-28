import { isAdmin } from './authorize'

test('isAdmin is true only for the admin role', () => {
  expect(isAdmin('admin')).toBe(true)
  expect(isAdmin('readonly')).toBe(false)
  expect(isAdmin(null)).toBe(false)
  expect(isAdmin(undefined)).toBe(false)
})
