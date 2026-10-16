import { beforeEach, expect, vi } from 'vitest'
import { fetchPlayers, fetchPlayer, playerCategoryText, createPlayer, updatePlayer, emptyPlayer, rowToValues, validatePhotoFile, uploadPlayerPhoto, removePlayerPhoto } from './players'
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
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  calls: [] as string[],
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from, storage: { from: mocks.storageFrom } } }))

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis Ruiz', tutor_whatsapp: '8110000000', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: null, team_name: null,
    payment_state: 'sin_pagos', docs_delivered: 0,
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
  mocks.updateEq.mockImplementation(async () => {
    mocks.calls.push('update')
    return { error: null }
  })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
  // select serves reads (order/eq) and the insert().select('id').single() write
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq, single: mocks.single })
  mocks.from.mockReturnValue({ select: mocks.select, insert: mocks.insert, update: mocks.update })
  mocks.calls.length = 0
  mocks.upload.mockImplementation(async () => {
    mocks.calls.push('upload')
    return { data: { path: 't1/p1/photo' }, error: null }
  })
  mocks.remove.mockImplementation(async (paths: string[]) => {
    mocks.calls.push('remove')
    return { data: paths.map((name) => ({ name })), error: null }
  })
  mocks.list.mockResolvedValue({ data: [], error: null })
  mocks.storageFrom.mockReturnValue({ upload: mocks.upload, remove: mocks.remove, list: mocks.list })
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

test('fetchPlayers throws when Supabase returns an error', async () => {
  mocks.order.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(fetchPlayers()).rejects.toThrow('boom')
})

test('fetchPlayer throws when Supabase returns an error', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(fetchPlayer('p1')).rejects.toThrow('boom')
})

function photo(type: string, size: number): File {
  const f = new File(['x'], 'p', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

test('validatePhotoFile accepts images up to exactly 5 MB', () => {
  expect(validatePhotoFile(photo('image/jpeg', 5 * 1024 * 1024))).toBeNull()
  expect(validatePhotoFile(photo('image/png', 5 * 1024 * 1024 + 1))).toBe('La foto supera 5 MB.')
  expect(validatePhotoFile(photo('application/pdf', 1))).toBe('Formato no permitido: usa JPG, PNG o WebP.')
  expect(validatePhotoFile(photo('', 1))).toBe('Formato no permitido: usa JPG, PNG o WebP.')
})

test('uploadPlayerPhoto upserts to tenant/player/photo, then sets photo_path', async () => {
  const f = photo('image/jpeg', 100)
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, f, true)
  expect(res).toEqual({ ok: true })
  expect(mocks.storageFrom).toHaveBeenCalledWith('player-files')
  expect(mocks.upload).toHaveBeenCalledWith('t1/p1/photo', f, { upsert: true, contentType: 'image/jpeg' })
  expect(mocks.from).toHaveBeenCalledWith('players')
  expect(mocks.update).toHaveBeenCalledWith({ photo_path: 't1/p1/photo' })
  expect(mocks.calls).toEqual(['upload', 'update'])
})

test('uploadPlayerPhoto validates before calling Supabase', async () => {
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, photo('application/pdf', 1), true)
  expect(res).toEqual({ ok: false, error: 'Formato no permitido: usa JPG, PNG o WebP.' })
  expect(mocks.upload).not.toHaveBeenCalled()
})

test('uploadPlayerPhoto rolls back a new photo when the update fails', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'consent_required: x' } })
  const res = await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: null }, photo('image/jpeg', 1), true)
  expect(res).toEqual({ ok: false, error: 'Primero registra el consentimiento de imagen y el aviso de privacidad.' })
  expect(mocks.remove).toHaveBeenCalledWith(['t1/p1/photo'])
})

test('uploadPlayerPhoto does not roll back a replacement', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'boom' } })
  await uploadPlayerPhoto({ id: 'p1', tenant_id: 't1', photo_path: 't1/p1/photo' }, photo('image/jpeg', 1), true)
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('removePlayerPhoto removes the object first, then clears photo_path', async () => {
  const res = await removePlayerPhoto({ id: 'p1', photo_path: 't1/p1/photo' })
  expect(res).toEqual({ ok: true })
  expect(mocks.update).toHaveBeenCalledWith({ photo_path: null })
  expect(mocks.calls).toEqual(['remove', 'update'])
})

test('removePlayerPhoto keeps photo_path when the remove fails', async () => {
  mocks.remove.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  const res = await removePlayerPhoto({ id: 'p1', photo_path: 't1/p1/photo' })
  expect(res.ok).toBe(false)
  expect(mocks.update).not.toHaveBeenCalled()
})
