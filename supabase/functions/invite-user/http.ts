const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'
const ALLOW_METHODS = 'POST, OPTIONS'

export function parseBearerToken(header: string | null): string | null {
  const match = header?.trim().match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((origin) => origin.trim().toLowerCase().replace(/\/$/, ''))
    .filter((origin) => origin !== '')
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  // No Origin header means a non-browser caller; the JWT check still decides.
  if (origin === null) return true
  return allowed.includes(origin)
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    Vary: 'Origin',
  }
  if (origin !== null && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
