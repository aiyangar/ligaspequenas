import { vi } from 'vitest'
import type { Mock } from 'vitest'

export type AuthListener = (event: string, session: unknown) => void

export function captureAuthListener(onAuthStateChange: Mock): AuthListener {
  let listener: AuthListener | undefined
  onAuthStateChange.mockImplementation((cb: AuthListener) => {
    listener = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  return (event, session) => {
    if (!listener) throw new Error('no auth listener registered')
    listener(event, session)
  }
}
