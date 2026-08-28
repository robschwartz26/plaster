import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// One-time invite for guests browsing the free wall: sign up and the interactive
// tour will walk you through the app (the tour auto-runs for new accounts after
// onboarding — this card is the bridge that tells guests it exists).
//
// Anti-extractive by design: appears once per device, after the wall has had a
// moment to make its own first impression; non-blocking (no backdrop — you can
// keep scrolling behind it); one tap to dismiss forever.

const SEEN_KEY = 'plaster_guest_tour_invite_seen'

function hasSeenInvite(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
}

export function GuestTourInvite() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  // Guests only, once per device, after a short beat so the wall lands first.
  useEffect(() => {
    if (loading || user || hasSeenInvite()) return
    const t = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(t)
  }, [loading, user])

  // Signed in while the card is up (e.g. via another tab) → it no longer applies.
  useEffect(() => { if (user && visible) setVisible(false) }, [user, visible])

  function dismiss() {
    markSeen()
    setVisible(false)
  }
  function signUp() {
    markSeen()
    setVisible(false)
    navigate('/auth')
  }

  return (
    <>
      {visible && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 12px)',
            zIndex: 3000,
            background: 'var(--bg)',
            border: '1px solid var(--fg-25)',
            borderRadius: 14,
            padding: '16px 16px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            animation: 'guestInviteIn 0.35s ease',
          }}
        >
          <style>{`@keyframes guestInviteIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <button
            aria-label="Dismiss"
            onClick={dismiss}
            style={{
              position: 'absolute', top: 8, right: 8, width: 28, height: 28,
              background: 'none', border: 'none', color: 'var(--fg-40)',
              fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
            }}
          >
            ×
          </button>
          <p style={{
            fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 19,
            color: 'var(--fg)', margin: '0 0 6px',
          }}>
            New here?
          </p>
          <p style={{
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 13.5, lineHeight: 1.45,
            color: 'var(--fg-65)', margin: '0 0 14px',
          }}>
            Sign up and we&rsquo;ll walk you through the wall — a quick, hands-on tour of everything Plaster can do.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={signUp}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
                background: '#A855F7', color: '#fff',
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700,
                letterSpacing: '0.02em', cursor: 'pointer',
              }}
            >
              Sign up &amp; take the tour
            </button>
            <button
              onClick={dismiss}
              style={{
                flexShrink: 0, padding: '11px 14px', borderRadius: 10,
                border: '1px solid var(--fg-18)', background: 'none', color: 'var(--fg-55)',
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Just browsing
            </button>
          </div>
        </div>
      )}

      {/* DEV: reset + re-show the invite (localhost/dev builds only) */}
      {import.meta.env.DEV && !visible && !user && (
        <button
          onClick={() => { try { localStorage.removeItem(SEEN_KEY) } catch { /* ignore */ } setVisible(true) }}
          style={{
            position: 'fixed', left: 10,
            bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 10px)',
            zIndex: 2999, padding: '4px 8px', borderRadius: 6,
            border: '1px dashed var(--fg-30)', background: 'var(--bg)', color: 'var(--fg-40)',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, cursor: 'pointer',
          }}
        >
          DEV: tour invite
        </button>
      )}
    </>
  )
}
