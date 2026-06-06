import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ImportForm } from '@/components/admin/ImportForm'
import { AdminPendingEvents } from '@/components/admin/AdminPendingEvents'
import { VenueBoard } from '@/components/VenueBoard'
import { StaffPreview } from '@/components/StaffPreview'
import { Panel as ResizablePanel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import type { Layout } from 'react-resizable-panels'
import { StaffPresence } from '@/components/StaffPresence'

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

// ── Panel shell (used in narrow / non-resizable layout) ──────
function PanelShell({
  header,
  children,
  bodyPadding = 16,
  bodyOverflow = 'auto' as 'auto' | 'hidden',
}: {
  header?: React.ReactNode
  children: React.ReactNode
  bodyPadding?: number
  bodyOverflow?: 'auto' | 'hidden'
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      border: '1px solid var(--fg-15)', borderRadius: 12,
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      {header != null && (
        <div style={{
          padding: '10px 16px', flexShrink: 0,
          borderBottom: '1px solid var(--fg-08)',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--fg-40)',
        }}>
          {header}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: bodyOverflow, padding: bodyPadding }}>
        {children}
      </div>
    </div>
  )
}

// ── Resizable panel card (full-height, used in wide layout) ──
function PanelCard({
  header,
  children,
  bodyPadding = 16,
}: {
  header?: React.ReactNode
  children: React.ReactNode
  bodyPadding?: number
}) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      border: '1px solid var(--fg-15)', borderRadius: 12,
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      {header != null && (
        <div style={{
          padding: '10px 16px', flexShrink: 0,
          borderBottom: '1px solid var(--fg-08)',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--fg-40)',
        }}>
          {header}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: bodyPadding }}>
        {children}
      </div>
    </div>
  )
}

// ── Resize handle (seam between resizable panels) ────────────
function ResizeSeam() {
  return (
    <PanelResizeHandle style={{
      width: 10, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'col-resize',
    }}>
      <div className="resize-handle-line" style={{
        width: 1, height: '100%',
        background: 'var(--fg-15)',
        transition: 'background 0.15s',
      }} />
    </PanelResizeHandle>
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

// ── Layout persistence ────────────────────────────────────────
const LAYOUT_KEY = 'staff-dashboard-cols'

function loadSavedLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function saveLayout(layout: Layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* noop */ }
}

// ── Main screen ──────────────────────────────────────────────
export function StaffScreen() {
  const { canIngest, isAdmin, loading, signOut, profile } = useAuth()
  const isWide = useIsWide(900)
  const [savedLayout] = useState<Layout | undefined>(loadSavedLayout)

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

  // ── Team rail content (shared between wide + narrow) ─────
  const teamContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LiveClock />
      {profile?.username && (
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', margin: 0 }}>
          Signed in as <span style={{ color: 'var(--fg)', fontWeight: 600 }}>@{profile.username}</span>
        </p>
      )}
      <StaffPresence />
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-30)', fontStyle: 'italic', margin: 0, lineHeight: 1.5 }}>
        Chat coming here.
      </p>
    </div>
  )

  // ── Worker: four-panel fixed dashboard ───────────────────
  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', color: 'var(--fg)', display: 'flex', flexDirection: 'column' }}>
      {topBar}

      {isWide ? (
        /* ── Wide: Preview fixed + three resizable panels ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', padding: 12, gap: 0, overflow: 'hidden' }}>

          {/* 1. Preview — fixed 360px, not resizable */}
          <div style={{
            width: 360, flexShrink: 0, minHeight: 0, marginRight: 8,
            display: 'flex', flexDirection: 'column',
            border: '1px solid var(--fg-15)', borderRadius: 12,
            background: 'var(--bg)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 16px', flexShrink: 0,
              borderBottom: '1px solid var(--fg-08)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--fg-40)',
            }}>Preview</div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <StaffPreview />
            </div>
          </div>

          {/* 2–4. Resizable group fills remaining width */}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <PanelGroup
              orientation="horizontal"
              defaultLayout={savedLayout}
              onLayoutChanged={saveLayout}
            >

              {/* 2. Add a show */}
              <ResizablePanel id="ingester" defaultSize={30} minSize={18} style={{ overflow: 'hidden' }}>
                <PanelCard header="Add a show">
                  <ImportForm staffMode />
                </PanelCard>
              </ResizablePanel>

              <ResizeSeam />

              {/* 3. Venue board */}
              <ResizablePanel id="venue-board" defaultSize={48} minSize={30} style={{ overflow: 'hidden' }}>
                <PanelCard bodyPadding={16}>
                  <VenueBoard />
                </PanelCard>
              </ResizablePanel>

              <ResizeSeam />

              {/* 4. Team */}
              <ResizablePanel id="team" defaultSize={22} minSize={14} style={{ overflow: 'hidden' }}>
                <PanelCard header="Team">
                  {teamContent}
                </PanelCard>
              </ResizablePanel>

            </PanelGroup>
          </div>

        </div>
      ) : (
        /* ── Narrow: stacked, no resize ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflowY: 'auto' }}>
          <div style={{
            flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            border: '1px solid var(--fg-15)', borderRadius: 12,
            background: 'var(--bg)', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>Preview</div>
            <div style={{ height: 480, overflow: 'hidden' }}>
              <StaffPreview />
            </div>
          </div>
          <PanelShell header="Add a show">
            <ImportForm staffMode />
          </PanelShell>
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
              <VenueBoard />
            </div>
          </div>
          <PanelShell header="Team">
            {teamContent}
          </PanelShell>
        </div>
      )}

    </div>
  )
}
