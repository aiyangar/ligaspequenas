export interface CopyCount {
  found: boolean
  count: number
}

// Rows of `COPY <table> (<cols>) FROM stdin;` whose <column> equals <value>, up to the `\.` terminator.
export function countCopyRows(sql: string, table: string, column: string, value: string): CopyCount {
  const lines = sql.split('\n')
  const header = `COPY ${table} (`
  const start = lines.findIndex((line) => line.startsWith(header) && line.endsWith(') FROM stdin;'))
  if (start === -1) return { found: false, count: 0 }
  const cols = lines[start]
    .slice(header.length, -') FROM stdin;'.length)
    .split(',')
    .map((col) => col.trim())
  const at = cols.indexOf(`"${column}"`)
  if (at === -1) return { found: false, count: 0 }
  let count = 0
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (line === '\\.') return { found: true, count }
    if (line.split('\t')[at] === value) count++
  }
  // No terminator: a truncated dump.
  return { found: false, count: 0 }
}

export const CROSSCHECK_TOLERANCE = 2

export function crosscheckPasses(db: CopyCount, storageObjects: number): boolean {
  return db.found && Math.abs(db.count - storageObjects) <= CROSSCHECK_TOLERANCE
}
