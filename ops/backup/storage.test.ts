// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpError, errorLine } from './lib/safe-error.ts'
import { PAGE_LIMIT, createApi, dumpAll, listAll, parseIndex, restoreAll } from './lib/storage.ts'
import type { FsLike, StorageObject } from './lib/storage.ts'

const URL_BASE = 'https://example.test'
const KEY = 'sb_secret_dummy'

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

type Entry = { name: string; id: string | null; metadata: { size: number; mimetype: string } | null }

function file(name: string, size: number, mimetype = 'application/pdf'): Entry {
  return { name, id: `id-${name}`, metadata: { size, mimetype } }
}

function folder(name: string): Entry {
  return { name, id: null, metadata: null }
}

// A fake Storage API: folders maps a prefix to its full (unpaged) listing; blobs maps a path to its bytes.
function fakeFetch(opts: {
  folders: Record<string, Entry[]>
  blobs?: Record<string, Uint8Array>
  listStatus?: number
  downloadStatus?: Record<string, number>
  uploadStatus?: number
}) {
  const calls: Call[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = { ...(init?.headers as Record<string, string>) }
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    calls.push({ method, url, headers, body })
    const listUrl = `${URL_BASE}/storage/v1/object/list/player-files`
    if (method === 'POST' && url === listUrl) {
      if (opts.listStatus) return new Response('nope', { status: opts.listStatus })
      const { prefix, limit, offset } = body as { prefix: string; limit: number; offset: number }
      return Response.json((opts.folders[prefix] ?? []).slice(offset, offset + limit))
    }
    const objectPrefix = `${URL_BASE}/storage/v1/object/player-files/`
    if (url.startsWith(objectPrefix)) {
      const path = url.slice(objectPrefix.length).split('/').map(decodeURIComponent).join('/')
      if (method === 'GET') {
        const status = opts.downloadStatus?.[path]
        if (status) return new Response('nope', { status })
        const blob = opts.blobs?.[path]
        return blob ? new Response(blob) : new Response('missing', { status: 404 })
      }
      if (method === 'POST') return new Response('{}', { status: opts.uploadStatus ?? 200 })
    }
    return new Response('unexpected', { status: 599 })
  }) as typeof fetch
  return { calls, api: createApi(URL_BASE + '/', KEY, impl) }
}

function memFs(files: Record<string, Uint8Array> = {}) {
  const written = new Map<string, Uint8Array | string>()
  const dirs: string[] = []
  const fs: FsLike = {
    async mkdir(path) {
      dirs.push(path)
    },
    async writeFile(path, data) {
      written.set(path, data)
    },
    async readFile(path) {
      const data = files[path]
      if (!data) throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: 'ENOENT' })
      return data
    },
  }
  return { fs, written, dirs }
}

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)

test('a full page asks for the next one and a partial page stops', async () => {
  const many = Array.from({ length: PAGE_LIMIT + 5 }, (_, i) => file(`f${String(i).padStart(4, '0')}`, 1))
  const { calls, api } = fakeFetch({ folders: { '': many } })
  const objects = await listAll(api)
  expect(objects).toHaveLength(PAGE_LIMIT + 5)
  const lists = calls.filter((c) => c.url.endsWith('/object/list/player-files'))
  expect(lists.map((c) => (c.body as { offset: number }).offset)).toEqual([0, PAGE_LIMIT])
  expect(lists[0].body).toEqual({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } })
})

test('an exactly full last page triggers one more, empty, request', async () => {
  const exact = Array.from({ length: PAGE_LIMIT }, (_, i) => file(`f${i}`, 1))
  const { calls, api } = fakeFetch({ folders: { '': exact } })
  expect(await listAll(api)).toHaveLength(PAGE_LIMIT)
  expect(calls).toHaveLength(2)
})

test('folders are walked recursively and the root placeholder is kept', async () => {
  const { api } = fakeFetch({
    folders: {
      '': [file('.emptyFolderPlaceholder', 0, 'application/octet-stream'), folder('t1')],
      't1/': [folder('p1')],
      't1/p1/': [file('curp', 3), file('acta nacimiento.pdf', 4)],
    },
  })
  expect(await listAll(api)).toEqual([
    { path: '.emptyFolderPlaceholder', size: 0, mimetype: 'application/octet-stream' },
    { path: 't1/p1/curp', size: 3, mimetype: 'application/pdf' },
    { path: 't1/p1/acta nacimiento.pdf', size: 4, mimetype: 'application/pdf' },
  ])
})

test('requests send the apikey header and never an authorization header', async () => {
  const { calls, api } = fakeFetch({ folders: { '': [file('a', 1)] }, blobs: { a: bytes(1) } })
  await dumpAll(api, '/b/storage', memFs().fs)
  expect(calls).toHaveLength(2)
  for (const call of calls) {
    expect(call.headers.apikey).toBe(KEY)
    expect(Object.keys(call.headers).map((h) => h.toLowerCase())).not.toContain('authorization')
  }
})

test('dump writes each object under the bucket dir and the index next to storage/', async () => {
  const { calls, api } = fakeFetch({
    folders: { '': [file('.emptyFolderPlaceholder', 0), folder('t1')], 't1/': [file('a b#.pdf', 3)] },
    blobs: { '.emptyFolderPlaceholder': bytes(0), 't1/a b#.pdf': bytes(3) },
  })
  const { fs, written } = memFs()
  expect(await dumpAll(api, '/b/storage', fs)).toEqual({ objects: 2, bytes: 3 })
  expect(calls.map((c) => c.url)).toContain(`${URL_BASE}/storage/v1/object/player-files/t1/a%20b%23.pdf`)
  expect([...written.keys()]).toEqual([
    '/b/storage/player-files/.emptyFolderPlaceholder',
    '/b/storage/player-files/t1/a b#.pdf',
    '/b/storage-index.json',
  ])
  expect(JSON.parse(String(written.get('/b/storage-index.json')))).toEqual([
    { path: '.emptyFolderPlaceholder', size: 0, mimetype: 'application/pdf' },
    { path: 't1/a b#.pdf', size: 3, mimetype: 'application/pdf' },
  ])
})

test('a failed list throws an HttpError with its status', async () => {
  const { api } = fakeFetch({ folders: {}, listStatus: 500 })
  const err = await listAll(api).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(HttpError)
  expect((err as HttpError).status).toBe(500)
})

test('a failed download reports status and index without the path', async () => {
  const names = ['a', 'b', 'c']
  const { api } = fakeFetch({
    folders: { '': [...names.map((n) => file(n, 1)), folder('t1')], 't1/': [folder('p1')], 't1/p1/': [file('curp', 1)] },
    blobs: { a: bytes(1), b: bytes(1), c: bytes(1) },
    downloadStatus: { 't1/p1/curp': 403 },
  })
  const { fs, written } = memFs()
  const err = await dumpAll(api, '/b/storage', fs).catch((e: unknown) => e)
  const line = errorLine(err)
  expect(line).toBe('error: status=403 index=3')
  expect(line).not.toContain('t1/p1/curp')
  expect(written.has('/b/storage-index.json')).toBe(false)
})

test('a size mismatch throws', async () => {
  const { api } = fakeFetch({ folders: { '': [file('a', 5)] }, blobs: { a: bytes(4) } })
  const err = await dumpAll(api, '/b/storage', memFs().fs).catch((e: unknown) => e)
  expect(errorLine(err)).toBe('error: size index=0')
})

test.each(['..', '.', '', 'a/b', 'a\\b', 'a\0b'])('a hostile listed name %j throws and nothing is written', async (name) => {
  const { api } = fakeFetch({ folders: { '': [file('ok', 1), file(name, 1)] }, blobs: { ok: bytes(1) } })
  const { fs, written } = memFs()
  const err = await dumpAll(api, '/b/storage', fs).catch((e: unknown) => e)
  expect(errorLine(err)).toBe('error: path')
  expect(written.size).toBe(0)
})

test('a hostile folder name throws before recursing', async () => {
  const { calls, api } = fakeFetch({ folders: { '': [folder('..')] } })
  await expect(listAll(api)).rejects.toThrow()
  expect(calls).toHaveLength(1)
})

describe('restore', () => {
  const index: StorageObject[] = [
    { path: '.emptyFolderPlaceholder', size: 0, mimetype: 'application/octet-stream' },
    { path: 't1/p1/acta nacimiento.pdf', size: 3, mimetype: 'application/pdf' },
  ]
  const files = {
    '/r/storage/player-files/.emptyFolderPlaceholder': bytes(0),
    '/r/storage/player-files/t1/p1/acta nacimiento.pdf': bytes(3),
  }

  test('uploads with x-upsert, the content-type and the encoded path, without authorization', async () => {
    const { calls, api } = fakeFetch({ folders: {} })
    expect(await restoreAll(api, '/r', index, memFs(files).fs)).toBe(2)
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['POST', `${URL_BASE}/storage/v1/object/player-files/.emptyFolderPlaceholder`],
      ['POST', `${URL_BASE}/storage/v1/object/player-files/t1/p1/acta%20nacimiento.pdf`],
    ])
    expect(calls[1].headers).toEqual({ apikey: KEY, 'x-upsert': 'true', 'content-type': 'application/pdf' })
    expect(calls[1].body).toEqual(bytes(3))
  })

  test('an upload failure reports status and index only', async () => {
    const { api } = fakeFetch({ folders: {}, uploadStatus: 400 })
    const err = await restoreAll(api, '/r', index, memFs(files).fs).catch((e: unknown) => e)
    expect(errorLine(err)).toBe('error: status=400 index=0')
  })

  test('a missing file reports the fs code only', async () => {
    const { api } = fakeFetch({ folders: {} })
    const err = await restoreAll(api, '/r', index, memFs({}).fs).catch((e: unknown) => e)
    expect(errorLine(err)).toBe('error: ENOENT')
  })

  test('a file whose size differs from the index is not uploaded', async () => {
    const { calls, api } = fakeFetch({ folders: {} })
    const tampered = { ...files, '/r/storage/player-files/t1/p1/acta nacimiento.pdf': bytes(2) }
    const err = await restoreAll(api, '/r', index, memFs(tampered).fs).catch((e: unknown) => e)
    expect(errorLine(err)).toBe('error: size index=1')
    expect(calls).toHaveLength(1)
  })

  test.each(['../etc/passwd', 't1/../../x', '/abs', 't1//x', 't1/./x', 'a\\b'])(
    'the index rejects the traversal path %j',
    (path) => {
      const text = JSON.stringify([{ path: 'ok', size: 1, mimetype: 'a/b' }, { path, size: 1, mimetype: 'a/b' }])
      let caught: unknown
      try {
        parseIndex(text)
      } catch (err) {
        caught = err
      }
      expect(errorLine(caught)).toBe('error: path index=1')
    },
  )

  test('the index rejects malformed JSON and entries', () => {
    expect(() => parseIndex('not json')).toThrow()
    expect(() => parseIndex('{}')).toThrow()
    expect(() => parseIndex('[{"path":"a","size":-1,"mimetype":"a/b"}]')).toThrow()
    expect(() => parseIndex('[{"path":"a","size":1}]')).toThrow()
    expect(parseIndex(JSON.stringify(index))).toEqual(index)
  })

  test('restore applies the same path check to a hand-built index', async () => {
    const { calls, api } = fakeFetch({ folders: {} })
    const err = await restoreAll(api, '/r', [{ path: '../x', size: 0, mimetype: 'a/b' }], memFs(files).fs).catch(
      (e: unknown) => e,
    )
    expect(errorLine(err)).toBe('error: path')
    expect(calls).toHaveLength(0)
  })
})

describe('entry points', () => {
  const dumpScript = fileURLToPath(new URL('./storage-dump.ts', import.meta.url))
  const restoreScript = fileURLToPath(new URL('./storage-restore.ts', import.meta.url))
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'storage-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function run(script: string, args: string[], env: Record<string, string>) {
    const res = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', ...env },
      timeout: 20_000,
    })
    return { status: res.status, out: res.stdout + res.stderr }
  }

  test('storage-dump against a closed port prints only an error code', () => {
    const key = 'sb_secret_should_never_print'
    const res = run(dumpScript, [join(dir, 'storage')], { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_BACKUP_SECRET_KEY: key })
    expect(res.status).toBe(1)
    expect(res.out).toMatch(/^error: \S+( index=\d+)?\n?$/)
    expect(res.out).not.toContain('127.0.0.1')
    expect(res.out).not.toContain(key)
    expect(res.out).not.toContain(dir)
  })

  test('storage-dump without env prints error: env', () => {
    expect(run(dumpScript, [join(dir, 'storage')], {})).toEqual({ status: 1, out: 'error: env\n' })
  })

  test('storage-restore without the key prints error: env', () => {
    expect(run(restoreScript, [dir, 'http://127.0.0.1:9'], {})).toEqual({ status: 1, out: 'error: env\n' })
  })

  test('storage-restore with a missing index prints only the fs code', () => {
    const res = run(restoreScript, [dir, 'http://127.0.0.1:9'], { SUPABASE_RESTORE_SECRET_KEY: 'k' })
    expect(res).toEqual({ status: 1, out: 'error: ENOENT\n' })
  })
})
