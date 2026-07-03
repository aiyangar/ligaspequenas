import { beforeEach, expect, vi } from 'vitest'
import { fetchPlayers, fetchPlayer, playerCategoryText } from './players'
import type { PlayerRow } from './players'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis Ruiz', tutor_whatsapp: '8110000000', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.mockResolvedValue({ data: [row()], error: null })
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.maybeSingle.mockResolvedValue({ data: row(), error: null })
  mocks.from.mockReturnValue({ select: mocks.select })
})

test('fetchPlayers reads the category view ordered by name', async () => {
  const rows = await fetchPlayers()
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.select).toHaveBeenCalledWith('*')
  expect(mocks.order).toHaveBeenCalledWith('full_name', { ascending: true })
  expect(rows).toHaveLength(1)
  expect(rows[0].category_name).toBe('Infantil Mayor')
})

test('fetchPlayers returns [] when the view yields null data', async () => {
  mocks.order.mockResolvedValue({ data: null, error: null })
  expect(await fetchPlayers()).toEqual([])
})

test('fetchPlayer reads a single row by id from the view', async () => {
  const found = await fetchPlayer('p1')
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'p1')
  expect(found?.id).toBe('p1')
})

test('fetchPlayer returns null when no row matches', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  expect(await fetchPlayer('missing')).toBeNull()
})

test('playerCategoryText formats a matched category via categoryLabel', () => {
  expect(playerCategoryText({ category_name: 'Infantil Mayor', category_year: 1, edad_liga: 11 }))
    .toBe('Infantil Mayor (1ro)')
})

test('playerCategoryText shows out-of-category with the league age', () => {
  expect(playerCategoryText({ category_name: null, category_year: null, edad_liga: 2 }))
    .toBe('Fuera de categoría (edad 2)')
})

test('playerCategoryText shows bare out-of-category when there is no league age', () => {
  expect(playerCategoryText({ category_name: null, category_year: null, edad_liga: null }))
    .toBe('Fuera de categoría')
})
