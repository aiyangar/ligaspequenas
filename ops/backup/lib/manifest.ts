import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CodedError } from './safe-error.ts'
import { indexFile, parseIndex } from './storage.ts'

export const SUPABASE_CLI_VERSION = '2.107.0'
export const MANIFEST_FILE = 'manifest.json'
export const SUMS_FILE = 'SHA256SUMS'

export interface ManifestFile {
  path: string
  size: number
  sha256: string
}

export interface Manifest {
  created_at: string
  commit: string | null
  supabase_cli: string
  files: ManifestFile[]
  objects: number
}

async function walk(root: string, rel: string[] = []): Promise<string[]> {
  const entries = await readdir(join(root, ...rel), { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    const parts = [...rel, entry.name]
    if (entry.isDirectory()) out.push(...(await walk(root, parts)))
    else if (entry.isFile()) out.push(parts.join('/'))
    // Anything else (symlink, socket) has no place in a backup.
    else throw new CodedError('filetype')
  }
  return out
}

export async function buildManifest(
  root: string,
  meta: { createdAt: string; commit: string | null },
): Promise<{ manifest: Manifest; sha256sums: string }> {
  const paths = (await walk(root))
    .filter((path) => path !== MANIFEST_FILE && path !== SUMS_FILE)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const files: ManifestFile[] = []
  for (const path of paths) {
    if (/[\n\r\\]/.test(path)) throw new CodedError('path')
    const data = await readFile(join(root, ...path.split('/')))
    files.push({ path, size: data.length, sha256: createHash('sha256').update(data).digest('hex') })
  }
  const objects = parseIndex(await readFile(indexFile(root), 'utf8')).length
  const manifest: Manifest = {
    created_at: meta.createdAt,
    commit: meta.commit,
    supabase_cli: SUPABASE_CLI_VERSION,
    files,
    objects,
  }
  const sha256sums = files.map((file) => `${file.sha256}  ${file.path}\n`).join('')
  return { manifest, sha256sums }
}
