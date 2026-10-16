import type { Cell, SheetData } from 'write-excel-file/browser'
import { PAYMENT_STATE_LABELS, localToday } from '../payments/payments'
import { DOCUMENT_TOTAL } from '../documents/documents'
import { AFFILIATION_STATUS_LABELS, PLAYER_STATUS_LABELS, playerCategoryText } from './players'
import type { PlayerRow } from './players'

export const PLAYERS_SHEET_COLUMNS: readonly { header: string; width: number }[] = [
  { header: 'Nombre', width: 28 },
  { header: 'Fecha de nacimiento', width: 12 },
  { header: 'CURP', width: 20 },
  { header: 'Categoría', width: 24 },
  { header: 'Equipo', width: 20 },
  { header: 'Estatus', width: 10 },
  { header: 'Fecha de inscripción', width: 12 },
  { header: 'Tutor', width: 24 },
  { header: 'WhatsApp del tutor', width: 16 },
  { header: 'Correo del tutor', width: 28 },
  { header: 'Contacto de emergencia', width: 24 },
  { header: 'Teléfono de emergencia', width: 16 },
  { header: 'Afiliación', width: 12 },
  { header: 'Fecha de afiliación', width: 12 },
  { header: 'Pago', width: 14 },
  { header: 'Documentos', width: 12 },
]

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// UTC midnight: the library converts Dates to Excel serials in UTC
export function excelDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return date
}

export function dateCell(value: string | null): Cell {
  if (value === null) return null
  const date = excelDate(value)
  if (!date) return value
  return { value: date, type: Date, format: 'dd/mm/yyyy' }
}

function textCell(value: string | null): Cell {
  if (value === null) return null
  return { value, type: String, format: '@' }
}

function playerRow(p: PlayerRow): Cell[] {
  return [
    p.full_name,
    dateCell(p.birth_date),
    p.curp,
    playerCategoryText(p),
    p.team_name,
    PLAYER_STATUS_LABELS[p.status] ?? null,
    dateCell(p.enrollment_date),
    p.tutor_name,
    textCell(p.tutor_whatsapp),
    p.tutor_email,
    p.emergency_contact_name,
    textCell(p.emergency_contact_phone),
    AFFILIATION_STATUS_LABELS[p.affiliation_status] ?? null,
    dateCell(p.affiliation_date),
    PAYMENT_STATE_LABELS[p.payment_state] ?? null,
    textCell(`${p.docs_delivered}/${DOCUMENT_TOTAL}`),
  ]
}

export function buildPlayersSheet(rows: readonly PlayerRow[]): SheetData {
  const header: Cell[] = PLAYERS_SHEET_COLUMNS.map(({ header }) => ({ value: header, fontWeight: 'bold' }))
  return [header, ...rows.map(playerRow)]
}

export function playersExportFileName(today: string = localToday()): string {
  return `jugadores-${today}.xlsx`
}
