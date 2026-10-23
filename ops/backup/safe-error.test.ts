// @vitest-environment node
import { CodedError, HttpError, INTERNAL_CODES, errorLine } from './lib/safe-error.ts'

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

test('a CodedError prints its code and index', () => {
  expect(errorLine(new CodedError('size', 3))).toBe('error: size index=3')
  expect(errorLine(new CodedError('env'))).toBe('error: env')
})

test('a code that is not a plain identifier is ignored', () => {
  expect(errorLine({ code: 'open /tmp/t1/p1/curp' })).toBe('error: unknown')
})

test('a code that looks like a secret key is never printed', () => {
  expect(errorLine({ code: 'sb_secret_abcdefghijklmnop' })).toBe('error: unknown')
  expect(errorLine({ code: 'AGE-SECRET-KEY-1QQQ' })).toBe('error: unknown')
  expect(errorLine({ code: 'Enoent' })).toBe('error: unknown')
  expect(errorLine({ code: 'usage' })).toBe('error: unknown')
})

test.each(['ENOENT', 'EACCES', 'ECONNREFUSED', 'ERR_INVALID_URL', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'])(
  'the system code %s passes through',
  (code) => {
    expect(errorLine({ code })).toBe(`error: ${code}`)
  },
)

test.each([...INTERNAL_CODES])('the internal code %s passes through', (code) => {
  expect(errorLine(new CodedError(code))).toBe(`error: ${code}`)
  expect(errorLine({ code })).toBe(`error: ${code}`)
})
