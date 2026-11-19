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

export function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export async function withInternalErrorResponse(
  handle: () => Promise<Response>,
  cors: Record<string, string>,
): Promise<Response> {
  try {
    return await handle()
  } catch (err) {
    // an escaped throw would reach the browser as a bare 500 without CORS, i.e. a CORS error
    console.error('invite-user unexpected error', { message: err instanceof Error ? err.message : String(err) })
    return jsonResponse({ error: 'internal_error' }, 500, cors)
  }
}

export interface InviteBody {
  email?: string
  fullName?: string
  role?: string
  redirectTo?: string
}

// req.json() accepts any JSON value; only an object is an invitation, and only its string fields count
export function parseInviteBody(raw: unknown): InviteBody | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const text = (key: keyof InviteBody) => (typeof record[key] === 'string' ? record[key] : undefined)
  return { email: text('email'), fullName: text('fullName'), role: text('role'), redirectTo: text('redirectTo') }
}

export type UpstreamFailure = 'invite_failed' | 'profile_insert_failed'

// GoTrue and PostgREST text stays in the function logs; the client only needs the stable code
export function failureBody(
  error: UpstreamFailure,
  message: string | undefined,
  extra: { rollback?: 'failed' } = {},
): { error: UpstreamFailure; rollback?: 'failed' } {
  console.error(`invite-user ${error}`, { message })
  return { error, ...extra }
}
