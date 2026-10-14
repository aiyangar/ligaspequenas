import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    // Events are newer than the initial read, so a late getSession result must not overwrite them.
    let settledByEvent = false
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || settledByEvent) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!active || settledByEvent) return
        setSession(null)
        setLoading(false)
      })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      settledByEvent = true
      setSession(newSession)
      setLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}
