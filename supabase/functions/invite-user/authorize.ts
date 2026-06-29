export interface CallerProfile {
  role: string | null
  tenant_id: string | null
}

export function checkAdmin(
  profile: CallerProfile | null,
): profile is CallerProfile & { role: 'admin'; tenant_id: string } {
  return !!profile && profile.role === 'admin' && !!profile.tenant_id
}
