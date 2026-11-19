import { flashOf } from './flash'

test('flashOf reads the flash message a form left in history state', () => {
  expect(flashOf({ flash: 'Equipo creado' })).toBe('Equipo creado')
})

test('flashOf is null when history state carries no flash', () => {
  expect(flashOf(null)).toBeNull()
  expect(flashOf(undefined)).toBeNull()
  expect(flashOf({})).toBeNull()
  expect(flashOf({ from: '/equipos' })).toBeNull()
})
