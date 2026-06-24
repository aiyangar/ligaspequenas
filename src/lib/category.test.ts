import { categoryLabel } from './category'

test('formats category with ordinal year', () => {
  expect(categoryLabel('Infantil Menor', 1)).toBe('Infantil Menor (1ro)')
  expect(categoryLabel('Juvenil Superior Mayor', 5)).toBe('Juvenil Superior Mayor (5to)')
})

test('shows out-of-category when name is null', () => {
  expect(categoryLabel(null, null)).toBe('Fuera de categoría')
})
