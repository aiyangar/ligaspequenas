import { supabase } from './supabase'

test('supabase client is created in the test environment without throwing at import', () => {
  expect(supabase).toBeDefined()
})
