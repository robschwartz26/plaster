import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ImportForm } from '@/components/admin/ImportForm'
import { AdminPendingEvents } from '@/components/admin/AdminPendingEvents'
import { VenueBoard } from '@/components/VenueBoard'

// ── Responsive hook ──────────────────────────────────────────
function useIsWide(breakpoint = 900) {
  const [wide, setWide] = useState(() => window.innerWidth >= breakpoint)
  useEffect(() => {
    const handler = () => setWide(window.innerWidth >= breakpoint)
    window.addEventListener('resize', handler, { passive: true })
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return wide
}

// ── Panel shell ──────────────────────────────────────────────
function Panel({
  header,
  children,
  flex,
  minWidth,
}: {
  header?: React.ReactNode
  children: React.ReactNode
  flex: string
  minWidth: number
}) {
  return (
    <div style={{
      flex,
      minWidth,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid var(--fg-15)',
      borderRadius: 12,
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {header != null && (
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--fg-08)',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--fg-40)',
          flexShrink: 0,
        }}>
          {header}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {children}
      </div>
    </div>
  )
}

// ── Team panel live clock ────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  })
  const date = now.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short', month: 'short', day: 'numeric',
  })
  return (
    <div>
      <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.04em', lineHeight: 1 }}>
        {time}
      </div>
      <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', marginTop: 4 }}>
        {date}
      </div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────
export function StaffScreen() {
  const { canIngest, isAdmin, loading, signOut, profile } = useAuth()
  const isWide = useIsWide(900)

  if (loading) return null

  if (!canIngest) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
        fontFamily: '"Space Grotesk", sans-serif',
        color: 'var(--fg)', background: 'var(--bg)',
      }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
          plaster
        </div>
        <p style={{ margin: '8px 0', fontSize: 15, maxWidth: 320 }}>
          This page is for Plaster staff.
        </p>
      </div>
    )
  }

  // ── Top bar (shared) ─────────────────────────────────────
  const topBar = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 24px',
      paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
      borderBottom: '1px solid var(--fg-08)',
      background: 'var(--bg)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 26, fontWeight: 900, color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1 }}>
          plaster
        </span>
        <span style={{
          fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#A855F7', background: 'rgba(168,85,247,0.12)',
          border: '1px solid rgba(168,85,247,0.3)',
          padding: '2px 8px', borderRadius: 4,
        }}>STAFF</span>
      </div>
      <button
        onClick={signOut}
        style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer', padding: '4px 0' }}
      >
        Sign out
      </button>
    </div>
  )

  // ── Admin: single-column review queue (unchanged) ────────
  if (isAdmin) {
    return (
      <div style={{ height: '100dvh', background: 'var(--bg)', color: 'var(--fg)', display: 'flex', flexDirection: 'column' }}>
        {topBar}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 48px', width: '100%' }}>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-55)', margin: '0 0 28px 0' }}>
              Review uploads from your staff — approve, reject, or consolidate duplicates.
            </p>
            <AdminPendingEvents />
          </div>
        </div>
      </div>
    )
  }

  // ── Worker: four-panel fixed dashboard ───────────────────
  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', color: 'var(--fg)', display: 'flex', flexDirection: 'column' }}>
      {topBar}

      {/* Panel row — fills remaining height, no page scroll */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: isWide ? 'row' : 'column',
        gap: 12,
        padding: 12,
        overflow: isWide ? 'hidden' : 'auto',
      }}>

        {/* 1. Preview ─────────────────────────────────────── */}
        <Panel header="Preview" flex="1.2 1 0" minWidth={220}>
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', gap: 12,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 8,
              background: 'var(--fg-08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--fg-25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', maxWidth: 160, margin: 0, lineHeight: 1.5 }}>
              Shows you upload will preview here as you add them — with the live app behind.
            </p>
          </div>
        </Panel>

        {/* 2. Ingester ─────────────────────────────────────── */}
        <Panel header="Add a show" flex="0 0 400px" minWidth={320}>
          <ImportForm staffMode />
        </Panel>

        {/* 3. Venue Board ──────────────────────────────────── */}
        {/* No panel header — VenueBoard renders its own heading */}
        <div style={{
          flex: '1.8 1 0',
          minWidth: 320,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--fg-15)',
          borderRadius: 12,
          background: 'var(--bg)',
          overflow: 'hidden',
        }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
            <VenueBoard />
          </div>
        </div>

        {/* 4. Team Rail ────────────────────────────────────── */}
        <Panel header="Team" flex="0 0 260px" minWidth={220}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <LiveClock />
            {profile?.username && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', margin: 0 }}>
                Signed in as <span style={{ color: 'var(--fg)', fontWeight: 600 }}>@{profile.username}</span>
              </p>
            )}
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-30)', fontStyle: 'italic', margin: 0, lineHeight: 1.5 }}>
              Clock-in, who's online, and chat are coming here.
            </p>
          </div>
        </Panel>

      </div>
    </div>
  )
}
