import { beforeEach, expect, vi } from 'vitest'
import { fetchPlayers, fetchPlayer, playerCategoryText, createPlayer, updatePlayer, emptyPlayer, rowToValues } from './players'
import type { PlayerRow, PlayerFormValues } from './players'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
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
  // read chain: from().select().order()  and  from().select().eq().maybeSingle()
  mocks.order.mockResolvedValue({ data: [row()], error: null })
  mocks.maybeSingle.mockResolvedValue({ data: row(), error: null })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle }) // read path only
  // write chains: from().insert().select('id').single()  and  from().update().eq()
  mocks.single.mockResolvedValue({ data: { id: 'newid' }, error: null })
  mocks.insert.mockReturnValue({ select: mocks.select })
  mocks.updateEq.mockResolvedValue({ error: null })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
  // select serves reads (order/eq) and the insert().select('id').single() write
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq, single: mocks.single })
  mocks.from.mockReturnValue({ select: mocks.select, insert: mocks.insert, update: mocks.update })
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

test('createPlayer inserts with tenant_id and empty strings coerced to null', async () => {
  const values: PlayerFormValues = {
    ...emptyPlayer(),
    full_name: 'Ana Ruiz',
    birth_date: '2015-06-10',
    curp: '',
    tutor_name: 'Luis Ruiz',
    tutor_whatsapp: '8110000000',
    tutor_email: '',
  }
  const result = await createPlayer(values, 'tenant-1')
  expect(mocks.from).toHaveBeenCalledWith('players')
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      tenant_id: 'tenant-1',
      full_name: 'Ana Ruiz',
      birth_date: '2015-06-10',
      curp: null,
      tutor_email: null,
    }),
  )
  expect(mocks.select).toHaveBeenCalledWith('id')
  expect(result).toEqual({ ok: true, id: 'newid' })
})

test('createPlayer surfaces an RLS/DB error as ok:false', async () => {
  mocks.single.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
  const result = await createPlayer({ ...emptyPlayer(), full_name: 'X', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' }, 'tenant-1')
  expect(result).toEqual({ ok: false, error: 'permission denied' })
})

test('updatePlayer updates by id and returns ok', async () => {
  const result = await updatePlayer('p1', { ...emptyPlayer(), full_name: 'Ana', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' })
  expect(mocks.from).toHaveBeenCalledWith('players')
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Ana' }))
  expect(mocks.updateEq).toHaveBeenCalledWith('id', 'p1')
  expect(result).toEqual({ ok: true })
})

test('rowToValues maps nulls to empty strings', () => {
  const values = rowToValues(row({ curp: null, tutor_email: null, affiliation_date: null }))
  expect(values.curp).toBe('')
  expect(values.tutor_email).toBe('')
  expect(values.affiliation_date).toBe('')
  expect(values.status).toBe('activo')
})

test('emptyPlayer defaults status/affiliation and a today enrollment_date', () => {
  const v = emptyPlayer()
  expect(v.status).toBe('activo')
  expect(v.affiliation_status).toBe('pendiente')
  expect(v.enrollment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(v.full_name).toBe('')
})
