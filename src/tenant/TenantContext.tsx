import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'

type TenantStatus = 'loading' | 'ready' | 'no-profile' | 'error'
type Role = 'admin' | 'readonly'

interface TenantState {
  tenantId: string | null
  role: Role | null
  fullName: string | null
  status: TenantStatus
}

const EMPTY: TenantState = { tenantId: null, role: null, fullName: null, status: 'loading' }

const TenantContext = createContext<TenantState | undefined>(undefined)

export function TenantProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [state, setState] = useState<TenantState>(EMPTY)

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      setState(EMPTY)
      return
    }
    let active = true
    setState((s) => ({ ...s, status: 'loading' }))
    void (async () => {
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

export function useTenant(): TenantState {
  const ctx = useContext(TenantContext)
  if (ctx === undefined) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
