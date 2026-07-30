/**
 * GuestGate — the sign-up door for guest mode (Apple 5.1.1(v)).
 *
 * Guests browse the Wall/Map with no session. Account-based actions stay
 * full-color and inviting; the gate happens ON THE TAP, not on the look.
 * Call `requireAuth(message)` at the top of any account-based handler:
 *
 *   const { requireAuth } = useGuestGate()
 *   function handleLike() {
 *     if (!requireAuth('♥ Sign up to save this show')) return
 *     ...normal signed-in path
 *   }
 *
 * Signed-in users pass straight through (returns true, no UI). Guests get a
 * bottom sheet with the contextual message and Sign up / Log in / Keep
 * browsing — dismissing returns them exactly where they were. Never a dead end.
 */

import { createContext, useContext, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface GuestGateContextValue {
  /** True → proceed (signed in). False → sheet shown, abort the action. */
  requireAuth: (message?: string) => boolean
}

const GuestGateContext = createContext<GuestGateContextValue>({ requireAuth: () => true })

// eslint-disable-next-line react-refresh/only-export-components
export function useGuestGate() {
  return useContext(GuestGateContext)
}

const DEFAULT_MESSAGE = 'Sign up to make Plaster yours'

export function GuestGateProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)

  const requireAuth = useCallback((msg?: string) => {
    if (user) return true
    setMessage(msg ?? DEFAULT_MESSAGE)
    return false
  }, [user])

  const close = () => setMessage(null)

  return (
    <GuestGateContext.Provider value={{ requireAuth }}>
      {children}

      {message && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'var(--bg)',
              borderTop: '1px solid var(--fg-15)',
              borderRadius: '16px 16px 0 0',
              padding: '28px 24px calc(24px + env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <p style={{
              margin: 0,
              fontFamily: '"Playfair Display", serif',
              fontWeight: 900, fontSize: 26, lineHeight: 1,
              color: 'var(--fg)',
            }}>
              plaster
            </p>
            <p style={{
              margin: '2px 0 10px',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 15, fontWeight: 600, lineHeight: 1.45,
              color: 'var(--fg)',
            }}>
              {message}
            </p>

            <button
              onClick={() => { close(); navigate('/auth', { state: { tab: 'signup' } }) }}
              style={{
                padding: '14px 0', borderRadius: 14, border: 'none',
                background: '#A855F7', color: '#fff',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Sign up free
            </button>
            <button
              onClick={() => { close(); navigate('/auth', { state: { tab: 'signin' } }) }}
              style={{
                padding: '13px 0', borderRadius: 14,
                border: '1px solid var(--fg-25)', background: 'none',
                color: 'var(--fg)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Log in
            </button>
            <button
              onClick={close}
              style={{
                padding: '6px 0', border: 'none', background: 'none',
                color: 'var(--fg-55)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Keep browsing
            </button>
          </div>
        </div>
      )}
    </GuestGateContext.Provider>
  )
}
