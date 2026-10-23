// @vitest-environment node
import { HttpError, errorLine } from './lib/safe-error.ts'

test('an fs error prints only its code, never the path', () => {
  const err = Object.assign(new Error("ENOENT: no such file, open '/tmp/x/t1/p1/curp'"), { code: 'ENOENT' })
  const line = errorLine(err)
  expect(line).toBe('error: ENOENT')
  expect(line).not.toContain('/tmp')
})

test('an fs-like plain object prints only its code', () => {
  expect(errorLine({ code: 'ENOENT', message: "ENOENT: no such file, open '/tmp/x/t1/p1/curp'" })).toBe('error: ENOENT')
})

test('an HttpError prints its status and index', () => {
  expect(errorLine(new HttpError(403, 12))).toBe('error: status=403 index=12')
})

test('an HttpError without index prints only the status', () => {
  expect(errorLine(new HttpError(500))).toBe('error: status=500')
})

test('a plain Error prints unknown, never its message', () => {
  const line = errorLine(new Error('boom /secret/path'))
  expect(line).toBe('error: unknown')
  expect(line).not.toContain('secret')
})

test('a non-Error throw prints unknown', () => {
  expect(errorLine('boom /secret/path')).toBe('error: unknown')
  expect(errorLine(undefined)).toBe('error: unknown')
  expect(errorLine(null)).toBe('error: unknown')
})

test('a non-string code is ignored', () => {
  expect(errorLine({ code: 42 })).toBe('error: unknown')
})

test('a fetch failure prints the code of its cause', () => {
  const err = new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), { code: 'ECONNREFUSED' }) })
  expect(errorLine(err)).toBe('error: ECONNREFUSED')
})

test('a code that is not a plain identifier is ignored', () => {
  expect(errorLine({ code: 'open /tmp/t1/p1/curp' })).toBe('error: unknown')
})
