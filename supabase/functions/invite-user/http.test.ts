import { afterEach, vi } from 'vitest'
import {
  corsHeaders,
  failureBody,
  isOriginAllowed,
  jsonResponse,
  parseAllowedOrigins,
  parseBearerToken,
  parseInviteBody,
  withInternalErrorResponse,
} from './http.ts'

const ALLOWED = ['https://app.example.com', 'http://localhost:5173']

afterEach(() => {
  vi.restoreAllMocks()
})

test('parseBearerToken accepts a single Bearer token, case-insensitive scheme, surrounding spaces', () => {
  expect(parseBearerToken('Bearer abc')).toBe('abc')
  expect(parseBearerToken('bearer abc')).toBe('abc')
  expect(parseBearerToken('  Bearer   abc  ')).toBe('abc')
})

test('parseBearerToken rejects anything that is not exactly one Bearer token', () => {
  for (const header of [null, '', 'Bearer', 'Bearer ', 'Basic abc', 'Bearer a b', 'abc']) {
    expect(parseBearerToken(header)).toBeNull()
  }
})

test('parseAllowedOrigins trims, lowercases, drops empties and trailing slashes', () => {
  expect(parseAllowedOrigins('http://localhost:5173, https://app.example.com/')).toEqual([
    'http://localhost:5173',
    'https://app.example.com',
  ])
  expect(parseAllowedOrigins(' HTTPS://App.Example.com ')).toEqual(['https://app.example.com'])
  expect(parseAllowedOrigins(undefined)).toEqual([])
  expect(parseAllowedOrigins('')).toEqual([])
  expect(parseAllowedOrigins(' , ')).toEqual([])
})

test('isOriginAllowed lets a missing Origin through and matches present ones exactly', () => {
  expect(isOriginAllowed(null, ALLOWED)).toBe(true)
  expect(isOriginAllowed('https://app.example.com', ALLOWED)).toBe(true)
  expect(isOriginAllowed('null', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com.evil.com', ALLOWED)).toBe(false)
  expect(isOriginAllowed('http://app.example.com', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com:8443', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com', [])).toBe(false)
})

test('isOriginAllowed does not normalize the incoming Origin', () => {
  expect(isOriginAllowed('HTTPS://APP.EXAMPLE.COM', ALLOWED)).toBe(false)
  expect(isOriginAllowed('https://app.example.com/', ALLOWED)).toBe(false)
  expect(corsHeaders('HTTPS://APP.EXAMPLE.COM', ALLOWED)).not.toHaveProperty('Access-Control-Allow-Origin')
})

test('corsHeaders echoes only an allowed origin and never a wildcard', () => {
  const allowed = corsHeaders('https://app.example.com', ALLOWED)
  expect(allowed['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  expect(allowed['Vary']).toBe('Origin')
  expect(allowed['Access-Control-Allow-Headers']).toBe('authorization, x-client-info, apikey, content-type')
  expect(allowed['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')

  const denied = corsHeaders('https://evil.example', ALLOWED)
  const missing = corsHeaders(null, ALLOWED)
  const failClosed = corsHeaders('https://app.example.com', [])
  for (const headers of [denied, missing, failClosed]) {
    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(headers['Vary']).toBe('Origin')
  }
  for (const headers of [allowed, denied, missing, failClosed]) {
    expect(Object.values(headers)).not.toContain('*')
  }
})

test('jsonResponse sends the body as JSON with the given status and CORS headers', async () => {
  const cors = corsHeaders('https://app.example.com', ALLOWED)
  const res = jsonResponse({ error: 'forbidden' }, 403, cors)
  expect(res.status).toBe(403)
  expect(res.headers.get('Content-Type')).toBe('application/json')
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
  expect(res.headers.get('Vary')).toBe('Origin')
  expect(await res.json()).toEqual({ error: 'forbidden' })
})

test('withInternalErrorResponse passes the handler response through untouched', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const cors = corsHeaders('https://app.example.com', ALLOWED)
  const ok = new Response('ok', { status: 201 })
  expect(await withInternalErrorResponse(async () => ok, cors)).toBe(ok)
  expect(errorSpy).not.toHaveBeenCalled()
})

test('withInternalErrorResponse turns an unexpected exception into a 500 JSON with CORS headers', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const cors = corsHeaders('https://app.example.com', ALLOWED)
  const res = await withInternalErrorResponse(async () => {
    throw new TypeError('fetch failed')
  }, cors)
  expect(res.status).toBe(500)
  expect(res.headers.get('Content-Type')).toBe('application/json')
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
  expect(res.headers.get('Vary')).toBe('Origin')
  expect(await res.json()).toEqual({ error: 'internal_error' })
  expect(errorSpy).toHaveBeenCalledWith('invite-user unexpected error', { message: 'fetch failed' })
})

test('withInternalErrorResponse also catches a non-Error throw', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const res = await withInternalErrorResponse(async () => {
    throw 'boom'
  }, corsHeaders(null, ALLOWED))
  expect(res.status).toBe(500)
  expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  expect(await res.json()).toEqual({ error: 'internal_error' })
  expect(errorSpy).toHaveBeenCalledWith('invite-user unexpected error', { message: 'boom' })
})

// each case is wrapped: test.each spreads a bare array into arguments
test.each([[null], [42], ['text'], [true], [[]], [[{ email: 'a@b.com' }]]])('parseInviteBody rejects the non-object JSON body %j', (raw) => {
  expect(parseInviteBody(raw)).toBeNull()
})

test('parseInviteBody keeps the string fields of an object body', () => {
  expect(
    parseInviteBody({ email: 'a@b.com', fullName: 'Ana', role: 'admin', redirectTo: 'https://app.example.com/auth/callback', extra: 1 }),
  ).toStrictEqual({ email: 'a@b.com', fullName: 'Ana', role: 'admin', redirectTo: 'https://app.example.com/auth/callback' })
})

test('parseInviteBody drops fields that are not strings', () => {
  const empty = { email: undefined, fullName: undefined, role: undefined, redirectTo: undefined }
  expect(parseInviteBody({ email: 5, fullName: null, role: ['admin'], redirectTo: {} })).toStrictEqual(empty)
  expect(parseInviteBody({})).toStrictEqual(empty)
})

test('failureBody answers invite_failed with the code only and logs the upstream message', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const body = failureBody('invite_failed', 'Database error saving new user')
  expect(body).toStrictEqual({ error: 'invite_failed' })
  expect(JSON.stringify(body)).not.toContain('Database error')
  expect(errorSpy).toHaveBeenCalledWith('invite-user invite_failed', { message: 'Database error saving new user' })
})

test('failureBody answers profile_insert_failed with the code and the rollback flag only', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const message = 'duplicate key value violates unique constraint "profiles_pkey"'
  expect(failureBody('profile_insert_failed', message)).toStrictEqual({ error: 'profile_insert_failed' })
  expect(failureBody('profile_insert_failed', message, { rollback: 'failed' })).toStrictEqual({
    error: 'profile_insert_failed',
    rollback: 'failed',
  })
  expect(errorSpy).toHaveBeenCalledTimes(2)
  expect(errorSpy).toHaveBeenCalledWith('invite-user profile_insert_failed', { message })
})

test('failureBody logs a missing upstream message as undefined', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(failureBody('invite_failed', undefined)).toStrictEqual({ error: 'invite_failed' })
  expect(errorSpy).toHaveBeenCalledWith('invite-user invite_failed', { message: undefined })
})
