import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PosterGrid } from './PosterGrid'
import { BottomNav } from './BottomNav'
import { supabase } from '@/lib/supabase'
import { mockEvents } from '@/data/mockEvents'
import { dbEventToWallEvent, mockEventToWallEvent } from '@/lib/adapters'
import { type WallEvent } from '@/types/event'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/contexts/AuthContext'

// Stable at module level — mock event dates are relative to app-load day,
// which is the same reference point used by today below.
const MOCK_WALL_EVENTS: WallEvent[] = mockEvents.map(mockEventToWallEvent)

// Hidden swipe-to-toggle wordmark — no visual indicator, pure easter egg
function Wordmark({ onSwipe }: { onSwipe: (dir: 'right' | 'left') => void }) {
  const x = useMotionValue(0)

  return (
    <motion.span
      className="font-display"
      style={{
        x,
        fontSize: 26,
        fontWeight: 900,
        color: 'var(--fg)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'default',
        display: 'inline-block',
      }}
      drag="x"
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const offset = info.offset.x
        if (Math.abs(offset) >= 40) {
          onSwipe(offset > 0 ? 'right' : 'left')
        }
        animate(x, 0, { type: 'spring', stiffness: 500, damping: 22 })
      }}
    >
      plaster
    </motion.span>
  )
}

export function Wall() {
  const today = new Date().toISOString().slice(0, 10)
  const [activeFilter, setActiveFilter] = useState('All')
  const [_activeDay, setActiveDay] = useState(today)
  const [events, setEvents] = useState<WallEvent[]>(MOCK_WALL_EVENTS)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const { toggle } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()

  // Fetch events — real DB events first, mock events fill the rest.
  // Mock events always show so the wall is never empty.
  useEffect(() => {
    async function fetchEvents() {
      // Show events from up to 6 hours ago so late-night shows
      // that started before midnight don't vanish off the wall.
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

      const { data } = await supabase
        .from('events')
        .select('*, venues(name)')
        .gte('starts_at', cutoff)
        .order('starts_at', { ascending: true })
        .limit(200)

      const realEvents = (data ?? []).map(dbEventToWallEvent)

      const merged = [...realEvents, ...MOCK_WALL_EVENTS]
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

      setEvents(merged)
    }
    fetchEvents()
  }, [])

  // Fetch liked event IDs for the current user
  useEffect(() => {
    if (!user) { setLikedIds(new Set()); return }
    supabase
      .from('event_likes')
      .select('event_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setLikedIds(new Set((data ?? []).map((r: { event_id: string }) => r.event_id)))
      })
  }, [user])

  async function handleLike(eventId: string) {
    if (!user) return
    if (likedIds.has(eventId)) {
      // Unlike
      await supabase.from('event_likes').delete().eq('event_id', eventId).eq('user_id', user.id)
      await supabase.rpc('add_like_count', { p_event_id: eventId, delta: -1 })
      setLikedIds((prev) => { const next = new Set(prev); next.delete(eventId); return next })
      setEvents((prev) =>
        prev.map((e) => e.id === eventId ? { ...e, like_count: Math.max(0, e.like_count - 1) } : e)
      )
    } else {
      // Like
      await supabase.from('event_likes').insert({ event_id: eventId, user_id: user.id })
      await supabase.rpc('add_like_count', { p_event_id: eventId, delta: 1 })
      setLikedIds((prev) => new Set([...prev, eventId]))
      setEvents((prev) =>
        prev.map((e) => e.id === eventId ? { ...e, like_count: e.like_count + 1 } : e)
      )
    }
  }

  function handleVenueTap(venueId: string) {
    navigate(`/venue/${venueId}`)
  }

  const handleSwipe = (dir: 'right' | 'left') => {
    if (dir === 'right') toggle()
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingBottom: 10,
        }}
      >
        <Wordmark onSwipe={handleSwipe} />

        <div className="flex items-center gap-2">
          {[<Search key="s" size={16} />, <SlidersHorizontal key="f" size={16} />].map(
            (icon, i) => (
              <button
                key={i}
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  border: '1px solid var(--fg-18)',
                  color: 'var(--fg-65)',
                }}
              >
                {icon}
              </button>
            ),
          )}
        </div>
      </div>

      <FilterBar active={activeFilter} onChange={setActiveFilter} />

      <PosterGrid
        events={events}
        activeFilter={activeFilter}
        today={today}
        likedIds={likedIds}
        onDayChange={setActiveDay}
        onLike={handleLike}
        onVenueTap={handleVenueTap}
      />

      <BottomNav />
    </div>
  )
}
