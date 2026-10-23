// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countCopyRows, crosscheckPasses } from './lib/copy-block.ts'

const OBJECTS_COLS =
  '"id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata"'

function objectsRow(bucket: string, name: string) {
  return ['00000000-0000-0000-0000-000000000001', bucket, name, '\\N', '2026-10-22 00:00:00+00', '2026-10-22 00:00:00+00', '2026-10-22 00:00:00+00', '{"size": 0}', '\\N', '\\N', '\\N'].join('\t')
}

function dataSql(rows: string[]) {
  return [
    'SET session_replication_role = replica;',
    '',
    'COPY "public"."players" ("id", "tenant_id", "bucket_id", "full_name") FROM stdin;',
    'p1\tt1\tplayer-files\tAna Ruiz',
    'p2\tt1\t\\N\tLuis Ruiz',
    '\\.',
    '',
    `COPY "storage"."objects" (${OBJECTS_COLS}) FROM stdin;`,
    ...rows,
    '\\.',
    '',
    'RESET ALL;',
    '',
  ].join('\n')
}

const count = (sql: string) => countCopyRows(sql, '"storage"."objects"', 'bucket_id', 'player-files')

test('counts only player-files rows of the storage.objects block', () => {
  const sql = dataSql([
    objectsRow('player-files', '.emptyFolderPlaceholder'),
    objectsRow('other-bucket', 't1/x'),
    objectsRow('player-files', 't1/p1/curp'),
  ])
  expect(count(sql)).toEqual({ found: true, count: 2 })
})

test('an empty block is found with zero rows', () => {
  expect(count(dataSql([]))).toEqual({ found: true, count: 0 })
})

test('a missing block is reported as not found', () => {
  expect(count('COPY "public"."players" ("id") FROM stdin;\np1\n\\.\n')).toEqual({ found: false, count: 0 })
})

test('a block without the terminator is reported as not found', () => {
  const sql = `COPY "storage"."objects" (${OBJECTS_COLS}) FROM stdin;\n${objectsRow('player-files', 'a')}\n`
  expect(count(sql)).toEqual({ found: false, count: 0 })
})

test('a block without the bucket_id column is reported as not found', () => {
  expect(count('COPY "storage"."objects" ("id", "name") FROM stdin;\na\tb\n\\.\n')).toEqual({ found: false, count: 0 })
})

test('the column index follows the header, not a fixed position', () => {
  const sql = 'COPY "storage"."objects" ("name", "id", "bucket_id") FROM stdin;\nx\t1\tplayer-files\nplayer-files\t2\tother\n\\.\n'
  expect(count(sql)).toEqual({ found: true, count: 1 })
})

test('a difference of 2 passes and 3 fails, in both directions', () => {
  expect(crosscheckPasses({ found: true, count: 5 }, 5)).toBe(true)
  expect(crosscheckPasses({ found: true, count: 5 }, 3)).toBe(true)
  expect(crosscheckPasses({ found: true, count: 3 }, 5)).toBe(true)
  expect(crosscheckPasses({ found: true, count: 5 }, 2)).toBe(false)
  expect(crosscheckPasses({ found: true, count: 2 }, 5)).toBe(false)
  expect(crosscheckPasses({ found: false, count: 0 }, 0)).toBe(false)
})

describe('crosscheck entry point', () => {
  const script = fileURLToPath(new URL('./crosscheck.ts', import.meta.url))
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'crosscheck-'))
    mkdirSync(join(root, 'db'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function setup(dbRows: number, storageObjects: number) {
    const rows = Array.from({ length: dbRows }, (_, i) => objectsRow('player-files', `t1/p1/f${i}`))
    writeFileSync(join(root, 'db', 'data.sql'), dataSql(rows))
    const index = Array.from({ length: storageObjects }, (_, i) => ({ path: `t1/p1/f${i}`, size: 0, mimetype: 'a/b' }))
    writeFileSync(join(root, 'storage-index.json'), JSON.stringify(index))
  }

  function run() {
    const res = spawnSync(process.execPath, [script, root], { encoding: 'utf8' })
    return { status: res.status, out: res.stdout + res.stderr }
  }

  test('prints the two counts and passes within tolerance', () => {
    setup(4, 2)
    expect(run()).toEqual({ status: 0, out: 'db_objects=4 storage_objects=2\n' })
  })

  test('fails beyond tolerance', () => {
    setup(1, 4)
    expect(run()).toEqual({ status: 1, out: 'db_objects=1 storage_objects=4\nerror: crosscheck\n' })
  })

  test('fails when the storage.objects block is missing', () => {
    setup(0, 0)
    writeFileSync(join(root, 'db', 'data.sql'), 'COPY "public"."players" ("id") FROM stdin;\n\\.\n')
    expect(run()).toEqual({ status: 1, out: 'error: crosscheck\n' })
  })

  test('a missing data.sql prints only the fs code', () => {
    expect(run()).toEqual({ status: 1, out: 'error: ENOENT\n' })
  })
})
