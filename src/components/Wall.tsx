import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PosterGrid } from './PosterGrid'
import { TrendingStrip } from './TrendingStrip'
import { PlasterHeader, headerIconBtn } from './PlasterHeader'
import { PreferencesPanel } from './PreferencesPanel'

import { matchesFilter, matchesSearch } from './PosterCard'
import { supabase } from '@/lib/supabase'
import { dbEventToWallEvent, type WallEventRow } from '@/lib/adapters'
import { type WallEvent } from '@/types/event'
import { useAuth } from '@/contexts/AuthContext'

const WALL_CACHE_KEY = 'wall-cache-v3' // v3: status-filtered — flush cached admin walls holding pending events
const WALL_CACHE_TTL = 24 * 60 * 60 * 1000
const WALL_PAGE = 300 // events per fetch window (initial + each load-more page)
// Slim select — ONLY the columns dbEventToWallEvent reads for wall rendering
// (description and other long-text excluded; the 1-col info panel lazy-fetches
// detail). Shared verbatim by the initial fetch and loadMore.
const EVENT_SELECT = 'id, title, venue_id, starts_at, category, poster_url, fill_frame, focal_x, focal_y, poster_offset_x, poster_offset_y, view_count, like_count, sold_out, sold_out_report_count, show_times, trending_score, recurrence_group_id, venues(name)'

// Wrap a filter-chip change in a View Transition so surviving posters glide to
// their new grid slots while removed ones fade. flushSync forces React to commit
// synchronously inside the transition callback so the API captures the new layout.
// Falls back to an instant update under reduced-motion or on browsers without the
// API (older iOS Safari). Search is deliberately NOT animated — it fires per
// keystroke, so animating it would make the wall churn mid-word. Never wrap data
// refreshes.
function withWallTransition(update: () => void) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const d = document as any
  if (reduce || typeof d.startViewTransition !== 'function') { update(); return }
  d.startViewTransition(() => { flushSync(update) })
}

export function Wall() {
  const today = new Date().toISOString().slice(0, 10)
  const [activeFilter, setActiveFilter] = useState('All')
  const [activePosterCategory, setActivePosterCategory] = useState<string | null>(null)
  const [_activeDay, setActiveDay] = useState(today)
  const [events, setEvents] = useState<WallEvent[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())

  const [isAdminMode, setIsAdminMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const visibleEvents = useMemo(
    () => events.filter(e => matchesFilter(e, activeFilter, likedIds.has(e.id)) && matchesSearch(e, searchQuery)),
    [events, activeFilter, likedIds, searchQuery],
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  // Tracks previous poster URLs per event for undo after crop save (session-only, clears on reload)
  const [prevUrlMap, setPrevUrlMap] = useState<Record<string, string>>({})

  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const openEventId = (location.state as { openEventId?: string } | null)?.openEventId ?? null

  // Windowed infinite loading: cursor = last loaded row's starts_at; pages append.
  const cursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(true)
  const isLoadingMoreRef = useRef(false)

  const fetchEvents = useCallback(async () => {
    // Show events from up to 6 hours ago so late-night shows
    // that started before midnight don't vanish off the wall.
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('status', 'published') // RLS hides pending from the public, but admins/creators see their own — filter explicitly
      .gte('starts_at', cutoff)
      .order('starts_at', { ascending: true })
      .limit(WALL_PAGE)

    const batch = data ?? []
    setEvents(batch.map(dbEventToWallEvent))
    cursorRef.current = batch.length ? batch[batch.length - 1].starts_at : null
    hasMoreRef.current = batch.length === WALL_PAGE

    try {
      // Cache only the first window — appended pages are session-only.
      localStorage.setItem(WALL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), events: batch.slice(0, WALL_PAGE) }))
    } catch { /* quota failure must never break the wall */ }
  }, [])

  // Append the next window when the grid nears the bottom. Guarded against
  // double-fires and a no-op once the DB is exhausted; dedupes by id on append.
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || cursorRef.current == null) return
    isLoadingMoreRef.current = true
    try {
      const { data } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('status', 'published')
        .gt('starts_at', cursorRef.current)
        .order('starts_at', { ascending: true })
        .limit(WALL_PAGE)

      const batch = data ?? []
      if (batch.length) {
        const mapped = batch.map(dbEventToWallEvent)
        setEvents(prev => {
          const seen = new Set(prev.map(e => e.id))
          const fresh = mapped.filter(e => !seen.has(e.id))
          return fresh.length ? [...prev, ...fresh] : prev
        })
        cursorRef.current = batch[batch.length - 1].starts_at
      }
      hasMoreRef.current = batch.length === WALL_PAGE
    } finally {
      isLoadingMoreRef.current = false
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WALL_CACHE_KEY)
      if (raw) {
        const { savedAt, events: cachedData } = JSON.parse(raw) as { savedAt: number; events: WallEventRow[] }
        if (Date.now() - savedAt < WALL_CACHE_TTL) {
          const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
          setEvents(cachedData.filter(e => e.starts_at >= cutoff).map(dbEventToWallEvent))
        }
      }
    } catch { /* corrupt or missing cache — first load proceeds normally */ }
    fetchEvents()
  }, [fetchEvents])

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
  }, [user?.id])

  // When deep-linking to an event (TrendingStrip tap, location.state), reset filters
  // so the target event is always visible in the filtered grid.
  useEffect(() => {
    if (!openEventId) return
    setActiveFilter('All')
    setSearchQuery('')
  }, [openEventId]) // eslint-disable-line react-hooks/exhaustive-deps

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
            <button
              style={{
                ...headerIconBtn(),
                background: searchOpen ? 'var(--fg-08)' : 'transparent',
              }}
              onClick={() => setSearchOpen(v => !v)}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
            >
              <Search size={16} />
            </button>
            <button
              style={{
                ...headerIconBtn(),
                background: prefsOpen ? 'var(--fg-08)' : 'transparent',
              }}
              onClick={() => setPrefsOpen(v => !v)}
              aria-label="Preferences"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        }
      />

      {searchOpen && (
        <div style={{
          flexShrink: 0,
          padding: '8px 16px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--fg-08)',
          background: 'var(--bg)',
        }}>
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search events, venues, categories…"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--fg-15)',
              background: 'var(--fg-08)',
              color: 'var(--fg)',
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--fg-55)',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 13,
                padding: '4px 8px',
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      <FilterBar active={activeFilter} onChange={(f) => withWallTransition(() => setActiveFilter(f))} activePosterCategory={activePosterCategory ?? undefined} />

      <TrendingStrip events={events} onOpenEvent={id => navigate(location.pathname, { state: { openEventId: id } })} />

      {visibleEvents.length === 0 && events.length > 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-30)' }}>
            Nothing on the wall for this yet
          </p>
        </div>
      ) : (
      <PosterGrid
        events={visibleEvents}
        activeFilter={activeFilter}
        searchQuery={searchQuery}
        today={today}
        likedIds={likedIds}
        onDayChange={setActiveDay}
        onLike={handleLike}
        onActiveCategoryChange={setActivePosterCategory}
        onVenueTap={handleVenueTap}
        isAdminMode={isAdminMode}
        openEventId={openEventId}
        onOpenEventHandled={() => navigate(location.pathname, { replace: true, state: null })}
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
        onNearEnd={loadMore}
      />
      )}

    </div>
    <PreferencesPanel open={prefsOpen} onClose={() => setPrefsOpen(false)} context="wall" />
    </>
  )
}
