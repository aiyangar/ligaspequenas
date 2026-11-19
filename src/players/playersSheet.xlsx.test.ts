import { expect } from 'vitest'
import writeExcelFile from 'write-excel-file/browser'
import { PLAYERS_SHEET_COLUMNS, buildPlayersSheet } from './playersSheet'
import type { PlayerRow } from './players'

const player: PlayerRow = {
  id: 'p1', tenant_id: 't1', full_name: '=1+1', birth_date: '2015-06-10',
  curp: '@SUM(1)', photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
  tutor_name: '+52 81', tutor_whatsapp: '8112345678', tutor_email: '-1',
  emergency_contact_name: null, emergency_contact_phone: null,
  affiliation_status: 'autoriza', affiliation_date: null, created_at: '', updated_at: '',
  edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
  category_id: 'cat1', team_id: null, team_name: null, payment_state: 'al_corriente', docs_delivered: 2,
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(source.pipeThrough(new DecompressionStream('deflate-raw'))).text()
}

// reads one entry of a zip through its central directory, so sizes are known even with data descriptors
async function zipEntry(zip: Uint8Array<ArrayBuffer>, name: string): Promise<string> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let eocd = zip.length - 22
  while (view.getUint32(eocd, true) !== 0x06054b50) eocd--
  let at = view.getUint32(eocd + 16, true)
  const count = view.getUint16(eocd + 10, true)
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localHeader = view.getUint32(at + 42, true)
    const entryName = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
    if (entryName === name) {
      const start = localHeader + 30 + view.getUint16(localHeader + 26, true) + view.getUint16(localHeader + 28, true)
      const data = zip.subarray(start, start + compressedSize)
      return method === 0 ? new TextDecoder().decode(data) : inflateRaw(data)
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`${name} not found`)
}

test('the written workbook stores formula-like values as shared strings, never as formulas', async () => {
  const blob = await writeExcelFile(buildPlayersSheet([player]), {
    columns: PLAYERS_SHEET_COLUMNS.map(({ width }) => ({ width })),
  }).toBlob()
  const zip = new Uint8Array(await blob.arrayBuffer())
  const sheet = await zipEntry(zip, 'xl/worksheets/sheet1.xml')
  const shared = await zipEntry(zip, 'xl/sharedStrings.xml')
  expect(sheet).not.toMatch(/<f[\s>]/)
  expect(sheet).toMatch(/<c r="A2"[^>]*t="s"/)
  for (const value of ['=1+1', '@SUM(1)', '+52 81', '-1']) expect(shared).toContain(`>${value}<`)
})
