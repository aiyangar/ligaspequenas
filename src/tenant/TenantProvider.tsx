import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { TenantContext, EMPTY } from './TenantContext'
import type { TenantState } from './TenantContext'

export function TenantProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [state, setState] = useState<TenantState>(EMPTY)

  useEffect(() => {
    if (authLoading) return
    let active = true
    void (async () => {
      if (!session) {
        if (active) setState(EMPTY)
        return
      }
      setState((s) => ({ ...s, status: 'loading' }))
      const { data, error } = await supabase
        .from('profiles')
        .select('tenant_id, role, full_name')
        .eq('id', session.user.id)
        .maybeSingle()
      if (!active) return
      if (error) {
        setState({ tenantId: null, role: null, fullName: null, status: 'error' })
        return
      }
      if (!data) {
        setState({ tenantId: null, role: null, fullName: null, status: 'no-profile' })
        return
      }
      setState({ tenantId: data.tenant_id, role: data.role, fullName: data.full_name, status: 'ready' })
    })()
    return () => {
      active = false
    }
  }, [session, authLoading])

  return <TenantContext.Provider value={state}>{children}</TenantContext.Provider>
}
