import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ImportForm } from '@/components/admin/ImportForm'
import { AdminPendingEvents } from '@/components/admin/AdminPendingEvents'
import { VenueBoard } from '@/components/VenueBoard'
import { StaffPreview } from '@/components/StaffPreview'
import { StaffPresence } from '@/components/StaffPresence'
import { StaffClock } from '@/components/StaffClock'
import { StaffChat } from '@/components/StaffChat'
import { Panel as ResizablePanel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import type { Layout } from 'react-resizable-panels'

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

// ── Live clock (no seconds) ──────────────────────────────────
export function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000) // 10s tick is fine w/o seconds
    return () => clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })
  const date = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' })
  if (compact) {
    return (
      <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.04em', lineHeight: 1 }}>{time}</span>
    )
  }
  return (
    <div>
      <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--fg)', letterSpacing: '0.04em', lineHeight: 1 }}>{time}</div>
      <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', marginTop: 4 }}>{date}</div>
    </div>
  )
}

// ── Panel shell (narrow / non-resizable layout) ──────────────
function PanelShell({ header, children, bodyPadding = 16 }: {
  header?: React.ReactNode; children: React.ReactNode; bodyPadding?: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
      {header != null && (
        <div style={{ padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
          {header}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: bodyPadding }}>{children}</div>
    </div>
  )
}

// ── Resizable panel card (full-height, wide layout) ──────────
function PanelCard({ header, children, bodyPadding = 16, onMinimize, bodyOverflow = 'auto' }: {
  header?: React.ReactNode; children: React.ReactNode; bodyPadding?: number; onMinimize?: () => void; bodyOverflow?: 'auto' | 'hidden'
}) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
      {header != null && (
        <div style={{ padding: '8px 10px 8px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{header}</span>
          {onMinimize && (
            <button
              onClick={onMinimize}
              title="Minimize panel"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-25)', fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              –
            </button>
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: bodyOverflow, padding: bodyPadding }}>{children}</div>
    </div>
  )
}

// ── Resize seam ──────────────────────────────────────────────
function ResizeSeam() {
  return (
    <PanelResizeHandle style={{ width: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'col-resize' }}>
      <div className="resize-handle-line" style={{ width: 1, height: '100%', background: 'var(--fg-15)', transition: 'background 0.15s' }} />
    </PanelResizeHandle>
  )
}

// ── Panel open/closed persistence ───────────────────────────
const OPEN_KEY = 'staff-panel-open'

interface PanelOpen {
  preview: boolean; ingester: boolean; board: boolean; review: boolean; team: boolean
}

function loadPanelOpen(): PanelOpen {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}')
    return { preview: saved.preview ?? true, ingester: saved.ingester ?? true, board: saved.board ?? true, review: saved.review ?? true, team: saved.team ?? true }
  } catch { return { preview: true, ingester: true, board: true, review: true, team: true } }
}
function savePanelOpen(o: PanelOpen) { try { localStorage.setItem(OPEN_KEY, JSON.stringify(o)) } catch { /* noop */ } }

// ── Width-layout persistence ─────────────────────────────────
const LAYOUT_KEY_WORKER = 'staff-dashboard-cols-worker'
const LAYOUT_KEY_ADMIN  = 'staff-dashboard-cols-admin'

function loadSavedLayout(key: string): Layout | undefined {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : undefined } catch { return undefined }
}
function makeSaveLayout(key: string) {
  return (layout: Layout) => { try { localStorage.setItem(key, JSON.stringify(layout)) } catch { /* noop */ } }
}

// ── Panel config ─────────────────────────────────────────────
type PanelKey = 'ingester' | 'board' | 'review' | 'team'

const PANEL_LABELS: Record<PanelKey, string> = {
  ingester: 'Add a show', board: 'Venue board', review: 'Review', team: 'Team',
}

// Worker: 3 panels; Admin: 4 panels
const DEFAULT_SIZES_WORKER: Record<PanelKey, number> = { ingester: 30, board: 48, review: 0,  team: 22 }
const DEFAULT_SIZES_ADMIN:  Record<PanelKey, number> = { ingester: 24, board: 34, review: 24, team: 18 }
const MIN_SIZES: Record<PanelKey, number> = { ingester: 15, board: 22, review: 18, team: 12 }

// ── Preview header with minimize ─────────────────────────────
function PreviewCard({ children, onMinimize }: { children: React.ReactNode; onMinimize: () => void }) {
  return (
    <div style={{ width: 360, flexShrink: 0, minHeight: 0, marginRight: 8, display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px 8px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Preview</span>
        <button onClick={onMinimize} title="Minimize panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-25)', fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>–</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────
export function StaffScreen() {
  const { canIngest, isAdmin, loading, signOut, profile } = useAuth()
  const isWide = useIsWide(900)

  const [open, setOpen] = useState<PanelOpen>(loadPanelOpen)

  const layoutKey = isAdmin ? LAYOUT_KEY_ADMIN : LAYOUT_KEY_WORKER
  const [savedLayout] = useState<Layout | undefined>(() => loadSavedLayout(layoutKey))
  const saveLayout = makeSaveLayout(layoutKey)

  const [hasUnreadStaffChat, setHasUnreadStaffChat] = useState(false)

  function togglePanel(key: keyof PanelOpen) {
    setOpen(prev => { const next = { ...prev, [key]: !prev[key] }; savePanelOpen(next); return next })
  }

  if (loading) return null

  if (!canIngest) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: '"Space Grotesk", sans-serif', color: 'var(--fg)', background: 'var(--bg)' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 32, fontWeight: 900, marginBottom: 8 }}>plaster</div>
        <p style={{ margin: '8px 0', fontSize: 15, maxWidth: 320 }}>This page is for Plaster staff.</p>
      </div>
    )
  }

  // ── Panel chips for top bar (role-aware) ─────────────────
  const chipDefs: { key: keyof PanelOpen; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'ingester', label: 'Add a show' },
    { key: 'board', label: 'Venue board' },
    ...(isAdmin ? [{ key: 'review' as keyof PanelOpen, label: 'Review' }] : []),
    { key: 'team', label: 'Team' },
  ]

  // ── Top bar ──────────────────────────────────────────────
  const teamMinimizedSection = isWide && !open.team ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LiveClock compact />
      {profile?.username && (
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)' }}>
          @{profile.username}
        </span>
      )}
      {hasUnreadStaffChat && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#A855F7', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>!</span>
      )}
    </div>
  ) : null

  const topBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 0 24px', paddingTop: 'calc(env(safe-area-inset-top) + 0px)', minHeight: 'calc(env(safe-area-inset-top) + 44px)', borderBottom: '1px solid var(--fg-08)', background: 'var(--bg)', flexShrink: 0 }}>
      {/* Left: wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 900, color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1 }}>plaster</span>
        <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A855F7', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', padding: '2px 8px', borderRadius: 4 }}>STAFF</span>
      </div>

      {/* Middle: panel toggle chips (wide only) */}
      {isWide && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', padding: '0 8px' }}>
          {chipDefs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => togglePanel(key)}
              style={{
                padding: '4px 10px', borderRadius: 6, flexShrink: 0,
                border: open[key] ? '1px solid rgba(168,85,247,0.4)' : '1px solid var(--fg-15)',
                background: open[key] ? 'rgba(168,85,247,0.1)' : 'transparent',
                color: open[key] ? '#A855F7' : 'var(--fg-30)',
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Right: team-minimized info OR sign out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: isWide ? 0 : 'auto' }}>
        {teamMinimizedSection}
        <button onClick={signOut} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer', padding: '4px 0' }}>
          Sign out
        </button>
      </div>
    </div>
  )

  // ── Team rail content ────────────────────────────────────
  const teamContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Fixed header section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0, paddingBottom: 16, borderBottom: '1px solid var(--fg-08)', marginBottom: 16 }}>
        <LiveClock />
        {profile?.username && (
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', margin: 0 }}>
            Signed in as <span style={{ color: 'var(--fg)', fontWeight: 600 }}>@{profile.username}</span>
          </p>
        )}
        <StaffClock />
        <StaffPresence />
      </div>

      {/* Chat — fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          Staff chat
          {hasUnreadStaffChat && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: '#A855F7', color: '#fff', fontSize: 8, fontWeight: 700, lineHeight: 1 }}>!</span>
          )}
        </div>
        <StaffChat onUnreadChange={setHasUnreadStaffChat} />
      </div>
    </div>
  )

  // ── Resizable panel group (wide layout) ──────────────────
  const defaultSizes = isAdmin ? DEFAULT_SIZES_ADMIN : DEFAULT_SIZES_WORKER
  const resizablePanelOrder: PanelKey[] = isAdmin
    ? ['ingester', 'board', 'review', 'team']
    : ['ingester', 'board', 'team']

  const openResizable = resizablePanelOrder.filter(k => open[k])

  // Only pass/save layout when ALL resizable panels for this role are open (v4 footgun prevention)
  const isFullOpen = resizablePanelOrder.every(k => open[k])
  const layoutToPass = isFullOpen ? savedLayout : undefined
  const handleLayoutChanged = isFullOpen ? saveLayout : () => { /* noop when partial */ }

  function renderPanelBody(key: PanelKey): React.ReactNode {
    switch (key) {
      case 'ingester': return <ImportForm staffMode />
      case 'board':    return <VenueBoard />
      case 'review':   return <AdminPendingEvents />
      case 'team':     return teamContent
    }
  }

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', color: 'var(--fg)', display: 'flex', flexDirection: 'column' }}>
      {topBar}

      {isWide ? (
        /* ── Wide layout ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', padding: 12, gap: 0, overflow: 'hidden' }}>

          {/* Preview — fixed 360px, conditionally shown */}
          {open.preview && (
            <PreviewCard onMinimize={() => togglePanel('preview')}>
              <StaffPreview />
            </PreviewCard>
          )}

          {/* Resizable group — only rendered when at least one panel is open */}
          {openResizable.length > 0 && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <PanelGroup
                orientation="horizontal"
                defaultLayout={layoutToPass}
                onLayoutChanged={handleLayoutChanged}
              >
                {openResizable.map((panelKey, idx) => (
                  // React.Fragment with key for seam+panel pairs
                  idx === 0 ? (
                    <ResizablePanel key={panelKey} id={panelKey} defaultSize={defaultSizes[panelKey]} minSize={MIN_SIZES[panelKey]} style={{ overflow: 'hidden' }}>
                      <PanelCard header={PANEL_LABELS[panelKey]} onMinimize={() => togglePanel(panelKey)} bodyPadding={panelKey === 'team' ? 16 : 16} bodyOverflow={panelKey === 'team' ? 'hidden' : 'auto'}>
                        {renderPanelBody(panelKey)}
                      </PanelCard>
                    </ResizablePanel>
                  ) : (
                    // Use a wrapper to pair seam + panel; key on the panel itself
                    <React.Fragment key={panelKey}>
                      <ResizeSeam />
                      <ResizablePanel id={panelKey} defaultSize={defaultSizes[panelKey]} minSize={MIN_SIZES[panelKey]} style={{ overflow: 'hidden' }}>
                        <PanelCard header={PANEL_LABELS[panelKey]} onMinimize={() => togglePanel(panelKey)} bodyPadding={16} bodyOverflow={panelKey === 'team' ? 'hidden' : 'auto'}>
                          {renderPanelBody(panelKey)}
                        </PanelCard>
                      </ResizablePanel>
                    </React.Fragment>
                  )
                ))}
              </PanelGroup>
            </div>
          )}
        </div>
      ) : (
        /* ── Narrow: stacked (minimize not active on narrow) ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflowY: 'auto' }}>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>Preview</div>
            <div style={{ height: 480, overflow: 'hidden' }}><StaffPreview /></div>
          </div>
          <PanelShell header="Add a show"><ImportForm staffMode /></PanelShell>
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}><VenueBoard /></div>
          </div>
          {isAdmin && <PanelShell header="Review"><AdminPendingEvents /></PanelShell>}
          <PanelShell header="Team">{teamContent}</PanelShell>
        </div>
      )}
    </div>
  )
}
