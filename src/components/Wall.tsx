import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PosterGrid } from './PosterGrid'
import { BottomNav } from './BottomNav'
import { PlasterHeader, headerIconBtn } from './PlasterHeader'

import { supabase } from '@/lib/supabase'
import { mockEvents } from '@/data/mockEvents'
import { dbEventToWallEvent, mockEventToWallEvent } from '@/lib/adapters'
import { type WallEvent } from '@/types/event'
import { useAuth } from '@/contexts/AuthContext'

// Stable at module level — mock event dates are relative to app-load day,
// which is the same reference point used by today below.
const MOCK_WALL_EVENTS: WallEvent[] = mockEvents.map(mockEventToWallEvent)

export function Wall() {
  const today = new Date().toISOString().slice(0, 10)
  const [activeFilter, setActiveFilter] = useState('All')
  const [activePosterCategory, setActivePosterCategory] = useState<string | null>(null)
  const [_activeDay, setActiveDay] = useState(today)
  const [events, setEvents] = useState<WallEvent[]>(MOCK_WALL_EVENTS)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())

  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('plaster_admin_unlocked') === '1')
  const [isAdminMode, setIsAdminMode] = useState(false)
  // Tracks previous poster URLs per event for undo after crop save (session-only, clears on reload)
  const [prevUrlMap, setPrevUrlMap] = useState<Record<string, string>>({})

  // Re-check admin flag when tab regains focus (e.g. after visiting /admin)
  useEffect(() => {
    const check = () => setIsAdmin(sessionStorage.getItem('plaster_admin_unlocked') === '1')
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])

  const { user } = useAuth()
  const navigate = useNavigate()

  // Fetch events — real DB events first, mock events fill the rest.
  // Mock events always show so the wall is never empty.
  const fetchEvents = useCallback(async () => {
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
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

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

  async function handleUndoCrop(eventId: string) {
    const previousUrl = prevUrlMap[eventId]
    if (!previousUrl) return
    await supabase.from('events').update({ poster_url: previousUrl }).eq('id', eventId)
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, poster_url: previousUrl } : e))
    setPrevUrlMap(prev => { const next = { ...prev }; delete next[eventId]; return next })
    fetchEvents()
  }

  function handleConfirmCrop(eventId: string) {
    setPrevUrlMap(prev => { const next = { ...prev }; delete next[eventId]; return next })
  }

  return (
    <>
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      <PlasterHeader
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && (
              <button
                onClick={() => setIsAdminMode(v => !v)}
                style={{
                  padding: '3px 10px',
                  background: isAdminMode ? 'rgba(168,85,247,0.18)' : 'transparent',
                  border: `1px solid ${isAdminMode ? 'rgba(168,85,247,0.55)' : 'var(--fg-18)'}`,
                  borderRadius: 4,
                  color: isAdminMode ? '#c084fc' : 'var(--fg-55)',
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >
                {isAdminMode ? 'Done' : 'Edit'}
              </button>
            )}
            <button style={headerIconBtn()}><Search size={16} /></button>
            <button style={headerIconBtn()}><SlidersHorizontal size={16} /></button>
          </div>
        }
      />

      <FilterBar active={activeFilter} onChange={setActiveFilter} activePosterCategory={activePosterCategory ?? undefined} />

      <PosterGrid
        events={events}
        activeFilter={activeFilter}
        today={today}
        likedIds={likedIds}
        onDayChange={setActiveDay}
        onLike={handleLike}
        onActiveCategoryChange={setActivePosterCategory}
        onVenueTap={handleVenueTap}
        isAdminMode={isAdminMode}
        onEventSaved={(eventId, newPosterUrl) => {
          if (newPosterUrl) {
            // Capture the current poster URL before overwriting so undo can restore it
            setEvents(prev => {
              const old = prev.find(e => e.id === eventId)
              if (old?.poster_url) setPrevUrlMap(p => ({ ...p, [eventId]: old.poster_url! }))
              return prev.map(e => e.id === eventId ? { ...e, poster_url: newPosterUrl + '?t=' + Date.now() } : e)
            })
          }
          fetchEvents()
        }}
        prevUrlMap={prevUrlMap}
        onUndoCrop={handleUndoCrop}
        onConfirmCrop={handleConfirmCrop}
      />

      <BottomNav />
    </div>
    </>
  )
}
