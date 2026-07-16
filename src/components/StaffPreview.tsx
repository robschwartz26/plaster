import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { dbEventToWallEvent } from '@/lib/adapters'
import { PosterGrid } from './PosterGrid'
import { AdminPendingEvents } from '@/components/admin/AdminPendingEvents'
import { AdminPendingQueue } from '@/components/admin/AdminPendingQueue'
import { ImportForm } from '@/components/admin/ImportForm'
import { UploadHistory } from '@/components/UploadHistory'
import { EventInfoFace } from '@/components/admin/EventInfoFace'
import { useStaffPreviewFocus } from '@/contexts/StaffPreviewFocus'
import { type WallEvent } from '@/types/event'

type Tab = 'mine' | 'review' | 'pending' | 'live' | 'history'

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        borderRadius: 6,
        border: active ? '1px solid rgba(168,85,247,0.4)' : '1px solid transparent',
        background: active ? 'rgba(168,85,247,0.1)' : 'transparent',
        color: active ? '#A855F7' : 'var(--fg-55)',
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 12, fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {children}
    </button>
  )
}

// scope='mine' (default): the wall tab shows the signed-in worker's own uploads —
// workers unchanged. scope='all' (admin QC): the wall tab shows EVERY pending event
// (worker uploads, scraper imports, everything) with uploader attribution; the
// published-context ('Live app') query is identical in both scopes.
export function StaffPreview({ scope = 'mine' }: { scope?: 'mine' | 'all' }) {
  const { user, isAdmin } = useAuth()
  const { focusEventId, clearFocus } = useStaffPreviewFocus()
  const [tab, setTab] = useState<Tab>(isAdmin ? 'review' : 'mine')
  const [reviewCount, setReviewCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [mine, setMine] = useState<WallEvent[]>([])
  const [live, setLive] = useState<WallEvent[]>([])
  // scope='all': uploader usernames by event id, for the attribution strip
  const [uploaders, setUploaders] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  const fetchBoth = useCallback(async () => {
    if (!user) return
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const pendingQuery = scope === 'all'
      ? supabase
          .from('events')
          .select('*, venues(name), profiles!created_by(username)')
          .eq('status', 'pending')
          .gte('starts_at', cutoff)
          .order('starts_at', { ascending: true })
          .limit(200)
      : supabase
          .from('events')
          .select('*, venues(name)')
          .eq('created_by', user.id)
          .gte('starts_at', cutoff)
          .order('starts_at', { ascending: true })
          .limit(200)
    const [mineRes, liveRes] = await Promise.all([
      pendingQuery,
      // 'Live app' = the real public wall — published only (without the filter,
      // admins/creators see their own pending mixed in via RLS).
      supabase
        .from('events')
        .select('*, venues(name)')
        .eq('status', 'published')
        .gte('starts_at', cutoff)
        .order('starts_at', { ascending: true })
        .limit(200),
    ])
    const mineRows = (mineRes.data ?? []) as Array<Record<string, unknown>>
    setMine(mineRows.map(r => dbEventToWallEvent(r as Parameters<typeof dbEventToWallEvent>[0])))
    if (scope === 'all') {
      const map: Record<string, string> = {}
      for (const r of mineRows) {
        const username = (r.profiles as { username?: string } | null)?.username
        if (typeof r.id === 'string' && username) map[r.id] = username
      }
      setUploaders(map)
    }
    setLive((liveRes.data ?? []).map(dbEventToWallEvent))
    setLoading(false)
  }, [user, scope])

  useEffect(() => { fetchBoth() }, [fetchBoth])

  // Stage counts for the Review/Pending tab badges (admin only).
  const refreshStageCounts = useCallback(async () => {
    if (!isAdmin) return
    const { data } = await supabase.rpc('admin_pending_events')
    const all = (data ?? []) as Array<{ passed_review: boolean }>
    setReviewCount(all.filter(e => !e.passed_review).length)
    setPendingCount(all.filter(e => e.passed_review).length)
  }, [isAdmin])
  useEffect(() => { refreshStageCounts() }, [refreshStageCounts])

  const events = tab === 'mine' ? mine : live
  const isGrid = tab === 'mine' || tab === 'live'
  const showEmpty = !loading && tab === 'mine' && mine.length === 0

  // scope='all': uploader attribution strip — counts by username, shown above the
  // pending wall so QC sees whose uploads are on screen. (The Review tab's approve
  // affordance already groups by uploader username.)
  const uploaderSummary = scope === 'all' && tab === 'mine' && mine.length > 0
    ? Object.entries(
        mine.reduce<Record<string, number>>((acc, ev) => {
          const name = uploaders[ev.id] ?? 'unknown'
          acc[name] = (acc[name] ?? 0) + 1
          return acc
        }, {}),
      ).sort((a, b) => b[1] - a[1])
    : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Tab toggle */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 4,
        padding: '8px 10px',
        borderBottom: '1px solid var(--fg-08)',
        background: 'var(--bg)',
      }}>
        {isAdmin ? (
          <>
            <TabBtn active={tab === 'review'} onClick={() => setTab('review')}>Review{reviewCount > 0 ? ` · ${reviewCount}` : ''}</TabBtn>
            <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')}>Pending{pendingCount > 0 ? ` · ${pendingCount}` : ''}</TabBtn>
          </>
        ) : (
          <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>Your uploads</TabBtn>
        )}
        <TabBtn active={tab === 'live'} onClick={() => setTab('live')}>Live app</TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>History</TabBtn>
      </div>

      {/* scope='all': uploader attribution above the pending wall */}
      {uploaderSummary && (
        <div style={{ flexShrink: 0, padding: '6px 12px', borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {uploaderSummary.map(([name, count], i) => (
            <span key={name}>{i > 0 && ' · '}<span style={{ color: 'var(--fg-65)', fontWeight: 600 }}>@{name}</span> ×{count}</span>
          ))}
        </div>
      )}

      {/* Content area — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Review tab — editable stage (admin only) */}
        {tab === 'review' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
            {/* Manual "old-fashioned" add, straight into Review */}
            <div style={{ marginBottom: 16, border: '1px solid var(--fg-15)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setShowManualAdd(s => !s)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700 }}
              >
                <span style={{ color: '#A855F7' }}>{showManualAdd ? '▾' : '▸'}</span> Add an event manually (drop a poster)
              </button>
              {showManualAdd && (
                <div style={{ padding: 12, borderTop: '1px solid var(--fg-08)' }}>
                  <ImportForm landInReview onDone={() => { refreshStageCounts() }} />
                </div>
              )}
            </div>
            <AdminPendingEvents onCountChange={setReviewCount} />
          </div>
        )}

        {/* Pending tab — passed review, live-app preview, awaiting publish (admin only) */}
        {tab === 'pending' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
            <AdminPendingQueue onCountChange={setPendingCount} />
          </div>
        )}

        {/* Upload history tab */}
        {tab === 'history' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
            <UploadHistory />
          </div>
        )}

        {isGrid && loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
              Loading…
            </p>
          </div>
        ) : isGrid && showEmpty ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontStyle: 'italic', maxWidth: 160, lineHeight: 1.5, margin: 0 }}>
              {scope === 'all' ? 'Nothing pending right now.' : 'Nothing uploaded yet — shows you add will appear here.'}
            </p>
          </div>
        ) : isGrid ? (
          <PosterGrid
            events={events}
            activeFilter="All"
            searchQuery=""
            today={today}
            likedIds={new Set()}
            onDayChange={() => {}}
            onLike={() => {}}
            onActiveCategoryChange={() => {}}
            onVenueTap={() => {}}
            isAdminMode={false}
            openEventId={null}
            onOpenEventHandled={() => {}}
            prevUrlMap={{}}
            onUndoCrop={() => {}}
            onConfirmCrop={() => {}}
            enableDesktopNav={true}
          />
        ) : null}
      </div>

      {/* Double-click an Upload-history row → the event pops up here in the live-app
          view, with a quick delete (confirm once). */}
      {focusEventId && (
        <EventFocusPopup
          eventId={focusEventId}
          onClose={clearFocus}
          onDeleted={() => { clearFocus(); fetchBoth() }}
        />
      )}

    </div>
  )
}

// Popup shown when an admin double-clicks an event in Upload history: the poster +
// the exact info-page face it will show live, plus a quick delete (confirm once).
// Fetches the single event fresh, so it works for any status (pending/published/
// rejected) regardless of what's loaded in the grids.
function EventFocusPopup({ eventId, onClose, onDeleted }: { eventId: string; onClose: () => void; onDeleted: () => void }) {
  const [ev, setEv] = useState<WallEvent | null>(null)
  const [desc, setDesc] = useState<string | null>(null)
  const [addr, setAddr] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(''); setConfirm(false)
    supabase.from('events').select('*, venues(name)').eq('id', eventId).single().then(({ data, error }) => {
      if (!alive) return
      if (error || !data) { setErr(error?.message || 'Event not found'); setLoading(false); return }
      const row = data as Record<string, unknown>
      setEv(dbEventToWallEvent(row as Parameters<typeof dbEventToWallEvent>[0]))
      setDesc((row.description as string | null) ?? null)
      setAddr((row.address as string | null) ?? null)
      setStatus((row.status as string) ?? '')
      setLoading(false)
    })
    return () => { alive = false }
  }, [eventId])

  async function del() {
    setDeleting(true); setErr('')
    const { data, error } = await supabase.from('events').delete().eq('id', eventId).select('id')
    setDeleting(false)
    if (error || !data || data.length === 0) { setErr(error?.message || 'Delete blocked (0 rows) — are you admin?'); setConfirm(false); return }
    onDeleted()
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(700px, 96vw)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--fg-15)', padding: 16, fontFamily: '"Space Grotesk", sans-serif' }}>
        {/* header: status + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
            {status ? `${status} event` : 'Event'}
          </span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg-55)', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }} title="Close">×</button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--fg-55)', fontSize: 13 }}>Loading…</p>
        ) : ev ? (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {/* poster */}
              <div style={{ width: 200, flexShrink: 0 }}>
                <div style={{ position: 'relative', paddingBottom: '150%', borderRadius: 8, overflow: 'hidden', background: 'var(--fg-08)' }}>
                  {ev.poster_url
                    ? <img src={ev.poster_url} alt={ev.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-30)', fontSize: 11 }}>no poster</div>}
                </div>
              </div>
              {/* info-page face */}
              <div style={{ flex: 1, minWidth: 240 }}>
                <EventInfoFace event={ev} description={desc} address={addr} />
              </div>
            </div>

            {/* quick delete — confirm once */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              {confirm ? (
                <>
                  <span style={{ fontSize: 13, color: 'var(--fg-65)' }}>Delete this event permanently?</span>
                  <button onClick={del} disabled={deleting} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: '#e05555', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button onClick={() => setConfirm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </>
              ) : (
                <button onClick={() => setConfirm(true)} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(224,85,85,0.5)', background: 'transparent', color: '#e05555', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Delete event
                </button>
              )}
            </div>
            {err && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#e05555' }}>{err}</p>}
          </>
        ) : (
          <p style={{ color: '#e05555', fontSize: 13 }}>{err || 'Event not found'}</p>
        )}
      </div>
    </div>,
    document.body,
  )
}
