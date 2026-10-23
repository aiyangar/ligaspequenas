// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildManifest } from './lib/manifest.ts'
import { errorLine } from './lib/safe-error.ts'

const sha = (data: string) => createHash('sha256').update(data).digest('hex')
const META = { createdAt: '2026-10-23T09:17:00.000Z', commit: 'abc123' }

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'manifest-'))
  mkdirSync(join(root, 'db'))
  mkdirSync(join(root, 'storage', 'player-files', 't1', 'p1'), { recursive: true })
  writeFileSync(join(root, 'db', 'data.sql'), 'data\n')
  writeFileSync(join(root, 'db', 'roles.sql'), 'roles\n')
  writeFileSync(join(root, 'storage', 'player-files', '.emptyFolderPlaceholder'), '')
  writeFileSync(join(root, 'storage', 'player-files', 't1', 'p1', 'acta nacimiento.pdf'), 'pdf bytes')
  writeFileSync(
    join(root, 'storage-index.json'),
    JSON.stringify([
      { path: '.emptyFolderPlaceholder', size: 0, mimetype: 'application/octet-stream' },
      { path: 't1/p1/acta nacimiento.pdf', size: 9, mimetype: 'application/pdf' },
    ]),
  )
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test('lists every file sorted, with POSIX paths, sizes and sha256', async () => {
  const { manifest } = await buildManifest(root, META)
  const index = readFileSync(join(root, 'storage-index.json'), 'utf8')
  expect(manifest).toEqual({
    created_at: META.createdAt,
    commit: 'abc123',
    supabase_cli: '2.107.0',
    objects: 2,
    files: [
      { path: 'db/data.sql', size: 5, sha256: sha('data\n') },
      { path: 'db/roles.sql', size: 6, sha256: sha('roles\n') },
      // Code-unit order: '-' sorts before '/'.
      { path: 'storage-index.json', size: index.length, sha256: sha(index) },
      { path: 'storage/player-files/.emptyFolderPlaceholder', size: 0, sha256: sha('') },
      { path: 'storage/player-files/t1/p1/acta nacimiento.pdf', size: 9, sha256: sha('pdf bytes') },
    ],
  })
})

test('SHA256SUMS uses the exact shasum -c format', async () => {
  const { manifest, sha256sums } = await buildManifest(root, META)
  const lines = sha256sums.split('\n')
  expect(lines.at(-1)).toBe('')
  expect(lines.slice(0, -1)).toEqual(manifest.files.map((f) => `${f.sha256}  ${f.path}`))
  expect(lines[0]).toMatch(/^[0-9a-f]{64} {2}db\/data\.sql$/)
})

test('the manifest and SHA256SUMS exclude themselves', async () => {
  writeFileSync(join(root, 'manifest.json'), '{}')
  writeFileSync(join(root, 'SHA256SUMS'), 'old')
  const { manifest } = await buildManifest(root, { ...META, commit: null })
  expect(manifest.commit).toBeNull()
  expect(manifest.files.map((f) => f.path)).not.toContain('manifest.json')
  expect(manifest.files.map((f) => f.path)).not.toContain('SHA256SUMS')
  expect(manifest.files).toHaveLength(5)
})

test('a symlink in the backup root is refused', async () => {
  symlinkSync('/etc/hosts', join(root, 'db', 'link.sql'))
  const err = await buildManifest(root, META).catch((e: unknown) => e)
  expect(errorLine(err)).toBe('error: filetype')
})

describe('manifest entry point', () => {
  const script = fileURLToPath(new URL('./manifest.ts', import.meta.url))

  function run(env: Record<string, string> = {}) {
    const res = spawnSync(process.execPath, [script, root], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } })
    return { status: res.status, out: res.stdout + res.stderr }
  }

  test('writes both files, prints only the count and shasum -c accepts the sums', () => {
    expect(run({ GITHUB_SHA: 'deadbeef' })).toEqual({ status: 0, out: 'files=5\n' })
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
    expect(manifest.commit).toBe('deadbeef')
    expect(manifest.objects).toBe(2)
    const check = spawnSync('shasum', ['-a', '256', '-c', 'SHA256SUMS'], { cwd: root, encoding: 'utf8' })
    if (check.error === undefined) expect(check.status).toBe(0)
  })

  test('a missing index prints only the fs code', () => {
    rmSync(join(root, 'storage-index.json'))
    expect(run()).toEqual({ status: 1, out: 'error: ENOENT\n' })
  })
})
