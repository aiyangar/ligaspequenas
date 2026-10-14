import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkAdmin, type CallerProfile } from './authorize.ts'
import { corsHeaders, isOriginAllowed, parseAllowedOrigins, parseBearerToken } from './http.ts'
import { rollbackInvitedUser } from './rollback.ts'

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  const allowed = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))
  const cors = corsHeaders(origin, allowed)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(origin, allowed)) return new Response('forbidden', { status: 403, headers: cors })
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isOriginAllowed(origin, allowed)) return json({ error: 'origin_not_allowed' }, 403)

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing_authorization' }, 401)
  const token = parseBearerToken(authHeader)
  if (!token) return json({ error: 'invalid_authorization' }, 401)

  const { data: { user }, error: userError } = await serviceClient.auth.getUser(token)
  if (userError || !user) return json({ error: 'invalid_token' }, 401)

  const { data, error: profileError } = await serviceClient
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return json({ error: 'profile_lookup_failed' }, 500)
  const profile = data as CallerProfile | null
  if (!checkAdmin(profile)) return json({ error: 'forbidden' }, 403)

  let body: { email?: string; fullName?: string; role?: string; redirectTo?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const email = body.email?.trim()
  const fullName = body.fullName?.trim()
  const role = body.role
  if (!email) return json({ error: 'email_required' }, 400)
  if (!fullName) return json({ error: 'full_name_required' }, 400)
  if (role !== 'admin' && role !== 'readonly') return json({ error: 'invalid_role' }, 400)

  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    email,
    body.redirectTo ? { redirectTo: body.redirectTo } : undefined,
  )
  if (inviteError || !invited?.user) {
    // GoTrue reports an already-registered address as code 'email_exists' (HTTP 422)
    const duplicate =
      inviteError?.code === 'email_exists' ||
      inviteError?.status === 422 ||
      /already.*registered/i.test(inviteError?.message ?? '')
    if (duplicate) return json({ error: 'email_exists' }, 409)
    return json({ error: 'invite_failed', detail: inviteError?.message }, 400)
  }

  const { error: insertError } = await serviceClient.from('profiles').insert({
    id: invited.user.id,
    tenant_id: profile.tenant_id,
    full_name: fullName,
    role,
  })
  if (insertError) {
    // compensating action: remove the just-created auth user so the email stays re-invitable, not orphaned
    const rolledBack = await rollbackInvitedUser(
      (id) => serviceClient.auth.admin.deleteUser(id),
      invited.user.id,
    )
    if (!rolledBack) {
      return json({ error: 'profile_insert_failed', detail: insertError.message, rollback: 'failed' }, 500)
    }
    return json({ error: 'profile_insert_failed', detail: insertError.message }, 500)
  }

  return json({ userId: invited.user.id }, 200)
})
