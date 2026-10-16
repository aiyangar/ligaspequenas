import { afterEach, beforeEach, expect, vi } from 'vitest'
import { exportPlayersToExcel } from './exportPlayers'
import { buildPlayersSheet } from './playersSheet'
import type { PlayerRow } from './players'

const mocks = vi.hoisted(() => ({ writeExcelFile: vi.fn(), toFile: vi.fn() }))
vi.mock('write-excel-file/browser', () => ({ default: mocks.writeExcelFile }))

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
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  mocks.toFile.mockResolvedValue(undefined)
  mocks.writeExcelFile.mockReturnValue({ toFile: mocks.toFile })
})

afterEach(() => {
  vi.useRealTimers()
})

test('writes the sheet built from the rows with the Jugadores options and downloads it', async () => {
  const rows = [row({ id: 'p2', full_name: 'Beto Gómez' }), row()]
  await exportPlayersToExcel(rows)
  expect(mocks.writeExcelFile).toHaveBeenCalledTimes(1)
  const [sheet, options] = mocks.writeExcelFile.mock.calls[0]
  expect(sheet).toEqual(buildPlayersSheet(rows))
  expect(options).toMatchObject({ sheet: 'Jugadores', stickyRowsCount: 1 })
  expect(options.columns).toHaveLength(16)
  expect(mocks.toFile).toHaveBeenCalledWith('jugadores-2026-10-15.xlsx')
})

test('the file name uses the local date, not the UTC one', async () => {
  // 21:00 on Oct 15 in Monterrey is already Oct 16 in UTC
  vi.setSystemTime(new Date(2026, 9, 15, 21))
  await exportPlayersToExcel([row()])
  expect(mocks.toFile).toHaveBeenCalledWith('jugadores-2026-10-15.xlsx')
})

test('a failed download rejects', async () => {
  mocks.toFile.mockRejectedValue(new Error('zip failed'))
  await expect(exportPlayersToExcel([row()])).rejects.toThrow('zip failed')
})
