import { createContext, useContext } from 'react'

export type TenantStatus = 'loading' | 'ready' | 'no-profile' | 'error'
export type Role = 'admin' | 'readonly'

export interface TenantState {
  tenantId: string | null
  role: Role | null
  fullName: string | null
  status: TenantStatus
}

export const EMPTY: TenantState = { tenantId: null, role: null, fullName: null, status: 'loading' }

export const TenantContext = createContext<TenantState | undefined>(undefined)

export function useTenant(): TenantState {
  const ctx = useContext(TenantContext)
  if (ctx === undefined) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
