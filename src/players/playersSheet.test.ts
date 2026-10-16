import { expect } from 'vitest'
import type { CellObject } from 'write-excel-file/browser'
import { PLAYERS_SHEET_COLUMNS, buildPlayersSheet, dateCell, excelDate, playersExportFileName } from './playersSheet'
import type { AffiliationStatus, PlayerRow } from './players'
import { PAYMENT_STATE_LABELS } from '../payments/payments'
import type { PaymentState } from '../payments/payments'
import { DOCUMENT_TOTAL } from '../documents/documents'

const HEADERS = [
  'Nombre', 'Fecha de nacimiento', 'CURP', 'Categoría', 'Equipo', 'Estatus',
  'Fecha de inscripción', 'Tutor', 'WhatsApp del tutor', 'Correo del tutor',
  'Contacto de emergencia', 'Teléfono de emergencia', 'Afiliación', 'Fecha de afiliación',
  'Pago', 'Documentos',
]
const col = (header: string) => HEADERS.indexOf(header)

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: 'RUAA150610MNLZNN09', photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis Ruiz', tutor_whatsapp: '8112345678', tutor_email: 'luis@example.com',
    emergency_contact_name: 'Marta Ruiz', emergency_contact_phone: '8187654321',
    affiliation_status: 'autoriza', affiliation_date: '2026-07-02',
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: 'team9', team_name: 'MTY AC Rojo',
    payment_state: 'al_corriente', docs_delivered: 2,
    ...over,
  }
}

function dataRow(over: Partial<PlayerRow> = {}) {
  return buildPlayersSheet([row(over)])[1]
}

test('there is one column definition per header, with a width', () => {
  expect(PLAYERS_SHEET_COLUMNS).toHaveLength(16)
  expect(PLAYERS_SHEET_COLUMNS.map((c) => c.header)).toEqual(HEADERS)
  for (const c of PLAYERS_SHEET_COLUMNS) expect(c.width).toBeGreaterThan(0)
})

test('the first row holds the 16 headers in bold', () => {
  const [header] = buildPlayersSheet([])
  expect(header).toEqual(HEADERS.map((value) => ({ value, fontWeight: 'bold' })))
})

test('one row per player, in the order received', () => {
  const sheet = buildPlayersSheet([
    row({ id: 'p3', full_name: 'Carla Paz' }),
    row({ id: 'p1', full_name: 'Ana Ruiz' }),
    row({ id: 'p2', full_name: 'Beto Gómez' }),
  ])
  expect(sheet).toHaveLength(4)
  expect(sheet.slice(1).map((r) => r[col('Nombre')])).toEqual(['Carla Paz', 'Ana Ruiz', 'Beto Gómez'])
})

test('a full player maps to the expected cells', () => {
  expect(dataRow()).toEqual([
    'Ana Ruiz',
    { value: new Date(Date.UTC(2015, 5, 10)), type: Date, format: 'dd/mm/yyyy' },
    'RUAA150610MNLZNN09',
    'Infantil Mayor (1ro)',
    'MTY AC Rojo',
    'Activo',
    { value: new Date(Date.UTC(2026, 6, 1)), type: Date, format: 'dd/mm/yyyy' },
    'Luis Ruiz',
    { value: '8112345678', type: String, format: '@' },
    'luis@example.com',
    'Marta Ruiz',
    { value: '8187654321', type: String, format: '@' },
    'Autoriza',
    { value: new Date(Date.UTC(2026, 6, 2)), type: Date, format: 'dd/mm/yyyy' },
    'Al corriente',
    { value: `2/${DOCUMENT_TOTAL}`, type: String, format: '@' },
  ])
})

test('dates are UTC midnight of the calendar day, also at year end', () => {
  const cell = dataRow({ birth_date: '2015-06-10', enrollment_date: '2026-12-31' })
  const birth = cell[col('Fecha de nacimiento')] as CellObject
  const enrollment = cell[col('Fecha de inscripción')] as CellObject
  expect(birth.type).toBe(Date)
  expect(birth.format).toBe('dd/mm/yyyy')
  expect((birth.value as Date).getTime()).toBe(Date.UTC(2015, 5, 10))
  expect((enrollment.value as Date).getTime()).toBe(Date.UTC(2026, 11, 31))
})

test('excelDate rejects malformed strings and impossible calendar dates', () => {
  expect(excelDate('2015-06-10')?.getTime()).toBe(Date.UTC(2015, 5, 10))
  expect(excelDate('10/06/2015')).toBeNull()
  expect(excelDate('')).toBeNull()
  expect(excelDate('2015-02-30')).toBeNull()
  expect(excelDate('2015-6-10')).toBeNull()
})

test('dateCell leaves null empty and keeps a malformed value as raw text', () => {
  expect(dateCell(null)).toBeNull()
  expect(dateCell('10/06/2015')).toBe('10/06/2015')
  expect(dateCell('2015-02-30')).toBe('2015-02-30')
})

test('nullable fields become empty cells, never "" or "null" or a styled empty object', () => {
  const cells = dataRow({
    curp: null, team_name: null, tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null, affiliation_date: null,
  })
  for (const header of ['CURP', 'Equipo', 'Correo del tutor', 'Contacto de emergencia', 'Teléfono de emergencia', 'Fecha de afiliación']) {
    expect(cells[col(header)]).toBeNull()
  }
})

test('enums use their human labels', () => {
  expect(dataRow({ status: 'baja' })[col('Estatus')]).toBe('Baja')
  const affiliations: Record<AffiliationStatus, string> = {
    autoriza: 'Autoriza', no_autoriza: 'No autoriza', pendiente: 'Pendiente',
  }
  for (const [value, label] of Object.entries(affiliations)) {
    expect(dataRow({ affiliation_status: value as AffiliationStatus })[col('Afiliación')]).toBe(label)
  }
  for (const state of ['con_adeudo', 'sin_pagos', 'al_corriente'] as PaymentState[]) {
    expect(dataRow({ payment_state: state })[col('Pago')]).toBe(PAYMENT_STATE_LABELS[state])
  }
})

test('category falls back to the out-of-category text with the league age', () => {
  const cells = dataRow({ category_id: null, category_name: null, category_year: null, edad_liga: 25 })
  expect(cells[col('Categoría')]).toBe('Fuera de categoría (edad 25)')
})

test('phones and the documents count are text-formatted cells', () => {
  const cells = dataRow({ docs_delivered: DOCUMENT_TOTAL })
  for (const header of ['WhatsApp del tutor', 'Teléfono de emergencia', 'Documentos']) {
    expect(cells[col(header)]).toMatchObject({ type: String, format: '@' })
  }
  expect(cells[col('Documentos')]).toMatchObject({ value: `${DOCUMENT_TOTAL}/${DOCUMENT_TOTAL}` })
})

test('a value that looks like a formula stays a plain string and no cell is a formula', () => {
  const sheet = buildPlayersSheet([
    row({ full_name: '=1+1', curp: '@SUM(1)', tutor_name: '+52 81', tutor_email: '-1' }),
  ])
  expect(sheet[1][col('Nombre')]).toBe('=1+1')
  for (const cell of sheet.flat()) {
    if (cell !== null && typeof cell === 'object' && !(cell instanceof Date)) {
      expect((cell as CellObject).type).not.toBe('Formula')
    }
  }
})

test('the file name carries the given local date', () => {
  expect(playersExportFileName('2026-10-15')).toBe('jugadores-2026-10-15.xlsx')
})

test('an enum value with no label (DB grew first) leaves an empty cell instead of "undefined"', () => {
  const cells = dataRow({
    status: 'suspendido' as PlayerRow['status'],
    affiliation_status: 'revocada' as AffiliationStatus,
    payment_state: 'condonado' as PaymentState,
  })
  expect(cells[col('Estatus')]).toBeNull()
  expect(cells[col('Afiliación')]).toBeNull()
  expect(cells[col('Pago')]).toBeNull()
})
