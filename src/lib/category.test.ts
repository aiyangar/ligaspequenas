import { categoryLabel } from './category'

test('formats category with ordinal year', () => {
  expect(categoryLabel('Infantil Menor', 1)).toBe('Infantil Menor (1ro)')
  expect(categoryLabel('Juvenil Superior Mayor', 5)).toBe('Juvenil Superior Mayor (5to)')
})

test('shows out-of-category when name is null', () => {
  expect(categoryLabel(null, null)).toBe('Fuera de categoría')
})

test('uses numeric fallback for years beyond the ordinal map', () => {
  expect(categoryLabel('Juvenil', 6)).toBe('Juvenil (6)')
})

test('returns name alone when year is null', () => {
  expect(categoryLabel('Infantil', null)).toBe('Infantil')
})
