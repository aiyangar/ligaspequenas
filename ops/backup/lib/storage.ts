import { join, resolve, sep } from 'node:path'
import { CodedError, HttpError } from './safe-error.ts'

export const BUCKET = 'player-files'
export const PAGE_LIMIT = 1000
const REQUEST_TIMEOUT_MS = 120_000

export interface StorageObject {
  path: string
  size: number
  mimetype: string
}

interface ListEntry {
  name: string
  id: string | null
  metadata: { size?: unknown; mimetype?: unknown } | null
}

export interface StorageApi {
  list(prefix: string, offset: number): Promise<ListEntry[]>
  download(path: string, index: number): Promise<Uint8Array>
  upload(path: string, bytes: Uint8Array, mimetype: string, index: number): Promise<void>
}

export interface FileKind {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

export interface FsLike {
  lstat(path: string): Promise<FileKind>
  mkdir(path: string): Promise<void>
  writeFile(path: string, data: Uint8Array | string): Promise<void>
  readFile(path: string): Promise<Uint8Array>
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function createApi(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch): StorageApi {
  const base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1`
  // sb_secret_ keys are not JWTs: they go in apikey only, never in Authorization.
  const headers = { apikey: secretKey }

  async function request(url: string, init: RequestInit, index?: number): Promise<Response> {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) {
      await res.body?.cancel()
      throw new HttpError(res.status, index)
    }
    return res
  }

  return {
    async list(prefix, offset) {
      const res = await request(`${base}/object/list/${BUCKET}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, limit: PAGE_LIMIT, offset, sortBy: { column: 'name', order: 'asc' } }),
      })
      const page: unknown = await res.json()
      if (!Array.isArray(page)) throw new CodedError('listing')
      return page as ListEntry[]
    },
    async download(path, index) {
      const res = await request(`${base}/object/${BUCKET}/${encodePath(path)}`, { method: 'GET', headers }, index)
      return new Uint8Array(await res.arrayBuffer())
    },
    async upload(path, bytes, mimetype, index) {
      const res = await request(
        `${base}/object/${BUCKET}/${encodePath(path)}`,
        { method: 'POST', headers: { ...headers, 'x-upsert': 'true', 'content-type': mimetype }, body: bytes },
        index,
      )
      await res.body?.cancel()
    },
  }
}

// Shared by dump (listed names) and restore (index paths), so neither can write or read outside its root.
// Newlines are refused too: they would break the line-based SHA256SUMS.
export function assertSafeSegment(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..' || /[/\\\0\n\r]/.test(name)) {
    throw new CodedError('path')
  }
}

export function assertSafePath(path: unknown): asserts path is string {
  if (typeof path !== 'string') throw new CodedError('path')
  for (const segment of path.split('/')) assertSafeSegment(segment)
}

function insideRoot(root: string, path: string): string {
  const absRoot = resolve(root)
  const target = resolve(join(absRoot, ...path.split('/')))
  if (!target.startsWith(absRoot + sep)) throw new CodedError('path')
  return target
}

function toObject(entry: ListEntry, path: string): StorageObject {
  const size = entry.metadata?.size
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) throw new CodedError('listing')
  const mimetype = entry.metadata?.mimetype
  return { path, size, mimetype: typeof mimetype === 'string' && mimetype !== '' ? mimetype : 'application/octet-stream' }
}

export async function listAll(api: StorageApi, prefix = ''): Promise<StorageObject[]> {
  const objects: StorageObject[] = []
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const page = await api.list(prefix, offset)
    for (const entry of page) {
      if (entry === null || typeof entry !== 'object') throw new CodedError('listing')
      assertSafeSegment(entry.name)
      const path = prefix + entry.name
      if (entry.id === null) objects.push(...(await listAll(api, path + '/')))
      else objects.push(toObject(entry, path))
    }
    if (page.length < PAGE_LIMIT) return objects
  }
}

export function bucketDir(storageDir: string): string {
  return join(storageDir, BUCKET)
}

export function indexFile(backupRoot: string): string {
  return join(backupRoot, 'storage-index.json')
}

export async function dumpAll(
  api: StorageApi,
  storageDir: string,
  fs: FsLike,
): Promise<{ objects: number; bytes: number }> {
  const objects = await listAll(api)
  const root = bucketDir(storageDir)
  await fs.mkdir(root)
  let bytes = 0
  for (const [index, object] of objects.entries()) {
    const target = insideRoot(root, object.path)
    const data = await api.download(object.path, index)
    if (data.length !== object.size) throw new CodedError('size', index)
    await fs.mkdir(resolve(target, '..'))
    await fs.writeFile(target, data)
    bytes += data.length
  }
  await fs.writeFile(indexFile(resolve(storageDir, '..')), JSON.stringify(objects, null, 2) + '\n')
  return { objects: objects.length, bytes }
}

export function parseIndex(text: string): StorageObject[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new CodedError('index')
  }
  if (!Array.isArray(parsed)) throw new CodedError('index')
  return parsed.map((entry: unknown, index) => {
    if (entry === null || typeof entry !== 'object') throw new CodedError('index', index)
    const { path, size, mimetype } = entry as Record<string, unknown>
    try {
      assertSafePath(path)
    } catch {
      throw new CodedError('path', index)
    }
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) throw new CodedError('index', index)
    if (typeof mimetype !== 'string' || mimetype === '') throw new CodedError('index', index)
    return { path, size, mimetype }
  })
}

// Like the manifest walk: every parent must be a real directory and the leaf a regular file, never a symlink.
async function assertRegularFile(fs: FsLike, root: string, path: string, index: number): Promise<void> {
  const segments = path.split('/')
  for (let depth = 1; depth <= segments.length; depth++) {
    const kind = await fs.lstat(join(root, ...segments.slice(0, depth)))
    const leaf = depth === segments.length
    if (kind.isSymbolicLink() || (leaf ? !kind.isFile() : !kind.isDirectory())) throw new CodedError('filetype', index)
  }
}

export const PRODUCTION_REF = 'eksbaugyypadtanyjcje'

// A restore always goes into a new project, never over the live one.
export function assertRestoreTarget(targetUrl: string): void {
  if (new URL(targetUrl).hostname.startsWith(`${PRODUCTION_REF}.`)) throw new CodedError('target')
}

const PLACEHOLDER = '.emptyFolderPlaceholder'

// Zero-byte Dashboard folder markers; the bucket's MIME allowlist may reject them on upload.
export function isFolderPlaceholder(object: StorageObject): boolean {
  return object.size === 0 && object.path.split('/').at(-1) === PLACEHOLDER
}

export async function restoreAll(
  api: StorageApi,
  backupRoot: string,
  index: StorageObject[],
  fs: FsLike,
): Promise<{ restored: number; skipped: number }> {
  const root = bucketDir(join(backupRoot, 'storage'))
  const pending: [number, StorageObject][] = []
  // Check every path and file type before the first upload, so a bad entry never leaves a half restore.
  for (const [i, object] of index.entries()) {
    assertSafePath(object.path)
    if (isFolderPlaceholder(object)) continue
    insideRoot(root, object.path)
    await assertRegularFile(fs, root, object.path, i)
    pending.push([i, object])
  }
  let restored = 0
  const skipped = index.length - pending.length
  for (const [i, object] of pending) {
    const data = await fs.readFile(insideRoot(root, object.path))
    if (data.length !== object.size) throw new CodedError('size', i)
    await api.upload(object.path, data, object.mimetype, i)
    restored++
  }
  return { restored, skipped }
}
