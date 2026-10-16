import { PLAYERS_SHEET_COLUMNS, buildPlayersSheet, playersExportFileName } from './playersSheet'
import type { PlayerRow } from './players'

export async function exportPlayersToExcel(rows: readonly PlayerRow[]): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  await writeExcelFile(buildPlayersSheet(rows), {
    sheet: 'Jugadores',
    stickyRowsCount: 1,
    columns: PLAYERS_SHEET_COLUMNS.map(({ width }) => ({ width })),
  }).toFile(playersExportFileName())
}
