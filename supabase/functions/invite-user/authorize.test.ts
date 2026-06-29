import { checkAdmin } from './authorize.ts'

test('checkAdmin requires an admin role and a tenant', () => {
  expect(checkAdmin({ role: 'admin', tenant_id: 't1' })).toBe(true)
  expect(checkAdmin({ role: 'readonly', tenant_id: 't1' })).toBe(false)
  expect(checkAdmin({ role: 'admin', tenant_id: null })).toBe(false)
  expect(checkAdmin(null)).toBe(false)
})
