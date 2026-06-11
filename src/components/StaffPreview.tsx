import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { dbEventToWallEvent } from '@/lib/adapters'
import { PosterGrid } from './PosterGrid'
import { AdminPendingEvents } from '@/components/admin/AdminPendingEvents'
import { type WallEvent } from '@/types/event'

type Tab = 'mine' | 'pending' | 'live'

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
  const [tab, setTab] = useState<Tab>('mine')
  const [pendingCount, setPendingCount] = useState(0)
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
      supabase
        .from('events')
        .select('*, venues(name)')
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

  const events = tab === 'mine' ? mine : live
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
        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>{scope === 'all' ? 'All pending' : 'Your uploads'}</TabBtn>
        {isAdmin && (
          <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')}>
            Review{pendingCount > 0 ? ` · ${pendingCount}` : ''}
          </TabBtn>
        )}
        <TabBtn active={tab === 'live'} onClick={() => setTab('live')}>Live app</TabBtn>
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

        {/* Pending review tab — admin only */}
        {tab === 'pending' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
            <AdminPendingEvents onCountChange={setPendingCount} />
          </div>
        )}

        {tab !== 'pending' && loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
              Loading…
            </p>
          </div>
        ) : tab !== 'pending' && showEmpty ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontStyle: 'italic', maxWidth: 160, lineHeight: 1.5, margin: 0 }}>
              {scope === 'all' ? 'Nothing pending right now.' : 'Nothing uploaded yet — shows you add will appear here.'}
            </p>
          </div>
        ) : tab !== 'pending' ? (
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

    </div>
  )
}
