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

export function StaffPreview() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('mine')
  const [pendingCount, setPendingCount] = useState(0)
  const [mine, setMine] = useState<WallEvent[]>([])
  const [live, setLive] = useState<WallEvent[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  const fetchBoth = useCallback(async () => {
    if (!user) return
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const [mineRes, liveRes] = await Promise.all([
      supabase
        .from('events')
        .select('*, venues(name)')
        .eq('created_by', user.id)
        .gte('starts_at', cutoff)
        .order('starts_at', { ascending: true })
        .limit(200),
      supabase
        .from('events')
        .select('*, venues(name)')
        .gte('starts_at', cutoff)
        .order('starts_at', { ascending: true })
        .limit(200),
    ])
    setMine((mineRes.data ?? []).map(dbEventToWallEvent))
    setLive((liveRes.data ?? []).map(dbEventToWallEvent))
    setLoading(false)
  }, [user])

  useEffect(() => { fetchBoth() }, [fetchBoth])

  const events = tab === 'mine' ? mine : live
  const showEmpty = !loading && tab === 'mine' && mine.length === 0

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
        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>Your uploads</TabBtn>
        {isAdmin && (
          <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')}>
            Review{pendingCount > 0 ? ` · ${pendingCount}` : ''}
          </TabBtn>
        )}
        <TabBtn active={tab === 'live'} onClick={() => setTab('live')}>Live app</TabBtn>
      </div>

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
              Nothing uploaded yet — shows you add will appear here.
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
