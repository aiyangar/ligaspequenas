import { supabase } from '../lib/supabase'

export interface InviteUserInput {
  email: string
  fullName: string
  role: 'admin' | 'readonly'
}

export interface InviteUserResult {
  ok: boolean
  error?: string
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const redirectTo = `${window.location.origin}/auth/callback`
  const { error } = await supabase.functions.invoke('invite-user', {
    body: { ...input, redirectTo },
  })
  if (!error) return { ok: true }
  // supabase-js turns a non-2xx function response into a FunctionsHttpError whose
  // `context` is the Response; the specific reason lives in its JSON body.
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    try {
      const body: unknown = await context.json()
      if (body && typeof body === 'object' && 'error' in body) {
        return { ok: false, error: String((body as { error: unknown }).error) }
      }
    } catch {
      // fall through to the generic message
    }
  }
  return { ok: false, error: error.message ?? 'invite_failed' }
}
