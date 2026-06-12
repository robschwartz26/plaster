import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Ingester } from '@/components/admin/Ingester'
import { AdminPendingEvents } from '@/components/admin/AdminPendingEvents'
import { AdminTools } from '@/components/admin/AdminTools'
import { AdminBottomNav } from '@/components/admin/AdminBottomNav'
import { VenueBoard } from '@/components/VenueBoard'
import { StaffPreview } from '@/components/StaffPreview'
import { StaffPresence } from '@/components/StaffPresence'
import { StaffClock } from '@/components/StaffClock'
import { StaffChat } from '@/components/StaffChat'
import { UploadHistory } from '@/components/UploadHistory'
import { Panel as ResizablePanel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import type { Layout } from 'react-resizable-panels'

// Auto-Ingest panel mothballed — AdminAutoIngest + scrape-sources kept on disk,
// just no longer surfaced in the staff dashboard.

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
// maxHeight bounds a long panel so it can't swallow the whole page — content past
// the cap scrolls inside the panel; shorter panels render at natural height.
function PanelShell({ header, children, bodyPadding = 16, onMinimize, maxHeight }: {
  header?: React.ReactNode; children: React.ReactNode; bodyPadding?: number; onMinimize?: () => void; maxHeight?: string | number
}) {
  return (
    <div style={{ flexShrink: 0, maxHeight, display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
      {header != null && (
        <div style={{ padding: '8px 10px 8px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{header}</span>
          {onMinimize && (
            <button onClick={onMinimize} title="Minimize panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-25)', fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>–</button>
          )}
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
// Admins get their own bumped key (new panel set — stale saved state from the old
// admin set must not leak into the new one); workers keep the original key.
const OPEN_KEY_WORKER = 'staff-panel-open'
const OPEN_KEY_ADMIN  = 'staff-panel-open-admin-v3'

interface PanelOpen {
  preview: boolean; ingester: boolean; board: boolean; history: boolean; review: boolean; team: boolean
  tools: boolean
}

const DEFAULT_OPEN_WORKER: PanelOpen = { preview: true, ingester: true, board: true, history: false, review: true, team: true, tools: false }
const DEFAULT_OPEN_ADMIN:  PanelOpen = { preview: true, review: true, ingester: true, board: false, tools: true, team: true, history: false }

function loadPanelOpen(key: string, defaults: PanelOpen): PanelOpen {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}')
    const out = { ...defaults }
    for (const k of Object.keys(defaults) as (keyof PanelOpen)[]) {
      if (typeof saved[k] === 'boolean') out[k] = saved[k]
    }
    return out
  } catch { return { ...defaults } }
}
function makeSavePanelOpen(key: string) {
  return (o: PanelOpen) => { try { localStorage.setItem(key, JSON.stringify(o)) } catch { /* noop */ } }
}

// ── Width-layout persistence ─────────────────────────────────
// Admin key bumped to v3: removing the Auto-Ingest panel changes the resizable
// group's panel count, so a v2 layout would corrupt the new group.
const LAYOUT_KEY_WORKER = 'staff-dashboard-cols-worker'
const LAYOUT_KEY_ADMIN  = 'staff-dashboard-cols-admin-v3'

function loadSavedLayout(key: string): Layout | undefined {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : undefined } catch { return undefined }
}
function makeSaveLayout(key: string) {
  return (layout: Layout) => { try { localStorage.setItem(key, JSON.stringify(layout)) } catch { /* noop */ } }
}

// ── Panel config ─────────────────────────────────────────────
type PanelKey = 'ingester' | 'board' | 'history' | 'review' | 'team' | 'tools'

// Workers keep their original labels; admins get the unified-dashboard names.
const PANEL_LABELS_WORKER: Record<PanelKey, string> = {
  ingester: 'Add a show', board: 'Venue board', history: 'Upload history', review: 'Review', team: 'Team', tools: 'Tools',
}
const PANEL_LABELS_ADMIN: Record<PanelKey, string> = {
  ingester: 'Ingester', board: 'Venues', history: 'Upload history', review: 'Review', team: 'Team', tools: 'Tools',
}

// Worker: 3 core panels + optional history; Admin: review/ingester/tools/team core
// + optional board.
const DEFAULT_SIZES_WORKER: Record<PanelKey, number> = { ingester: 30, board: 48, history: 30, review: 0,  team: 22, tools: 0 }
const DEFAULT_SIZES_ADMIN:  Record<PanelKey, number> = { ingester: 26, board: 24, history: 22, review: 28, team: 20, tools: 26 }
const MIN_SIZES: Record<PanelKey, number> = { ingester: 15, board: 20, history: 16, review: 18, team: 12, tools: 16 }

// ── Preview header with minimize ─────────────────────────────
function PreviewCard({ children, onMinimize, width = 360 }: { children: React.ReactNode; onMinimize: () => void; width?: number }) {
  return (
    <div style={{ width, flexShrink: 0, minHeight: 0, marginRight: 8, display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px 8px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Preview</span>
        <button onClick={onMinimize} title="Minimize panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-25)', fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>–</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────
// Thin gate: the dashboard's role-keyed persistence (open-state + layout keys)
// initializes in useState on first render, so the role must be RESOLVED before
// the dashboard mounts — otherwise a direct reload of /admin would initialize an
// admin with worker keys.
export function StaffScreen() {
  const { loading } = useAuth()
  if (loading) return null
  return <StaffDashboard />
}

function StaffDashboard() {
  const { canIngest, isAdmin, signOut, profile } = useAuth()
  const isWide = useIsWide(900)

  const openKey = isAdmin ? OPEN_KEY_ADMIN : OPEN_KEY_WORKER
  const [open, setOpen] = useState<PanelOpen>(() => loadPanelOpen(openKey, isAdmin ? DEFAULT_OPEN_ADMIN : DEFAULT_OPEN_WORKER))
  const savePanelOpen = makeSavePanelOpen(openKey)

  const layoutKey = isAdmin ? LAYOUT_KEY_ADMIN : LAYOUT_KEY_WORKER
  const [savedLayout] = useState<Layout | undefined>(() => loadSavedLayout(layoutKey))
  const saveLayout = makeSaveLayout(layoutKey)

  const [hasUnreadStaffChat, setHasUnreadStaffChat] = useState(false)

  function togglePanel(key: keyof PanelOpen) {
    setOpen(prev => { const next = { ...prev, [key]: !prev[key] }; savePanelOpen(next); return next })
  }

  if (!canIngest) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: '"Space Grotesk", sans-serif', color: 'var(--fg)', background: 'var(--bg)' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 32, fontWeight: 900, marginBottom: 8 }}>plaster</div>
        <p style={{ margin: '8px 0', fontSize: 15, maxWidth: 320 }}>This page is for Plaster staff.</p>
      </div>
    )
  }

  // ── Panel chips for top bar (role-aware) ─────────────────
  // Admin: Preview · Review · Ingester · Venues · Tools · Team.
  // Worker: unchanged from the original staff dashboard.
  const chipDefs: { key: keyof PanelOpen; label: string }[] = isAdmin
    ? [
        { key: 'preview', label: 'Preview' },
        { key: 'review', label: 'Review' },
        { key: 'ingester', label: 'Ingester' },
        { key: 'board', label: 'Venues' },
        { key: 'tools', label: 'Tools' },
        { key: 'team', label: 'Team' },
      ]
    : [
        { key: 'preview', label: 'Preview' },
        { key: 'ingester', label: 'Add a show' },
        { key: 'board', label: 'Venue board' },
        { key: 'history', label: 'Upload history' },
        { key: 'team', label: 'Team' },
      ]

  // Chip buttons — identical at every width; the wrapper differs (inline in the
  // top bar when wide, a scrollable row under it when narrow).
  const chipButtons = chipDefs.map(({ key, label }) => (
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
  ))

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

      {/* Middle: panel toggle chips (wide — inline; narrow chips live below the bar) */}
      {isWide && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', padding: '0 8px' }}>
          {chipButtons}
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
  const panelLabels = isAdmin ? PANEL_LABELS_ADMIN : PANEL_LABELS_WORKER
  // Optional panels are togglable extras; core panels are the always-default-open set
  const resizablePanelOrder: PanelKey[] = isAdmin
    ? ['review', 'ingester', 'board', 'tools', 'team']
    : ['ingester', 'board', 'history', 'team']
  const corePanelOrder: PanelKey[] = isAdmin
    ? ['review', 'ingester', 'tools', 'team']
    : ['ingester', 'board', 'team']
  const optionalPanels: PanelKey[] = isAdmin
    ? ['board']
    : ['history']

  const openResizable = resizablePanelOrder.filter(k => open[k])

  // Save/restore layout only when core panels are all open AND every optional
  // panel is closed — when an optional panel is open, each panel falls back to
  // defaultSize so the saved core-panel widths aren't corrupted by a
  // panel-count mismatch in v4.
  const isCoreFullOpen = corePanelOrder.every(k => open[k]) && optionalPanels.every(k => !open[k])
  const layoutToPass = isCoreFullOpen ? savedLayout : undefined
  const handleLayoutChanged = isCoreFullOpen ? saveLayout : () => { /* noop */ }

  function renderPanelBody(key: PanelKey): React.ReactNode {
    switch (key) {
      // Admin ingester runs the FULL admin importer (not staffMode)
      case 'ingester':   return <Ingester staffMode={!isAdmin} />
      case 'board':      return <VenueBoard />
      case 'history':    return <UploadHistory />
      case 'review':     return <AdminPendingEvents />
      case 'tools':      return <AdminTools />
      case 'team':       return teamContent
    }
  }

  // One stacked narrow panel. Preview keeps its fixed 480px block; every other
  // open panel is bounded (70vh) and scrolls internally so one long panel can't
  // swallow the page. All carry the – minimize button (toggles open state).
  function renderNarrowPanel(key: keyof PanelOpen): React.ReactNode {
    if (key === 'preview') {
      return (
        <div key="preview" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--fg-15)', borderRadius: 12, background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px 8px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Preview</span>
            <button onClick={() => togglePanel('preview')} title="Minimize panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-25)', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}>–</button>
          </div>
          <div style={{ height: 480, overflow: 'hidden' }}><StaffPreview scope={isAdmin ? 'all' : 'mine'} /></div>
        </div>
      )
    }
    const label = chipDefs.find(c => c.key === key)?.label ?? key
    return (
      <PanelShell key={key} header={label} onMinimize={() => togglePanel(key)} maxHeight="70vh">
        {renderPanelBody(key as PanelKey)}
      </PanelShell>
    )
  }

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', color: 'var(--fg)', display: 'flex', flexDirection: 'column' }}>
      {topBar}

      {isWide ? (
        /* ── Wide layout ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', padding: 12, gap: 0, overflow: 'hidden' }}>

          {/* Preview — fixed width (admins get the widest panel), conditionally shown */}
          {open.preview && (
            <PreviewCard onMinimize={() => togglePanel('preview')} width={isAdmin ? 420 : 360}>
              <StaffPreview scope={isAdmin ? 'all' : 'mine'} />
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
                      <PanelCard header={panelLabels[panelKey]} onMinimize={() => togglePanel(panelKey)} bodyPadding={panelKey === 'team' ? 16 : 16} bodyOverflow={panelKey === 'team' ? 'hidden' : 'auto'}>
                        {renderPanelBody(panelKey)}
                      </PanelCard>
                    </ResizablePanel>
                  ) : (
                    // Use a wrapper to pair seam + panel; key on the panel itself
                    <React.Fragment key={panelKey}>
                      <ResizeSeam />
                      <ResizablePanel id={panelKey} defaultSize={defaultSizes[panelKey]} minSize={MIN_SIZES[panelKey]} style={{ overflow: 'hidden' }}>
                        <PanelCard header={panelLabels[panelKey]} onMinimize={() => togglePanel(panelKey)} bodyPadding={16} bodyOverflow={panelKey === 'team' ? 'hidden' : 'auto'}>
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
        /* ── Narrow: chip-driven stack (respects open state + role order) ── */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Chip bar — horizontally scrollable row under the top bar */}
          <div className="hide-scrollbar" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', overflowX: 'auto', whiteSpace: 'nowrap', borderBottom: '1px solid var(--fg-08)' }}>
            {chipButtons}
          </div>
          {chipDefs.some(c => open[c.key]) ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflowY: 'auto' }}>
              {chipDefs.filter(c => open[c.key]).map(c => renderNarrowPanel(c.key))}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
                All panels hidden — tap a chip above to open one.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Back-compat: admins keep the app bottom nav on narrow/mobile */}
      {isAdmin && !isWide && <AdminBottomNav />}
    </div>
  )
}
