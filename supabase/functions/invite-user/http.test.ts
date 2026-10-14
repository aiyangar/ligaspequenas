import { corsHeaders, isOriginAllowed, parseAllowedOrigins, parseBearerToken } from './http.ts'

const ALLOWED = ['https://app.example.com', 'http://localhost:5173']

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
