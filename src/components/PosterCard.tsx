import { useRef, useState, useEffect } from 'react'
import { type WallEvent } from '@/types/event'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AdminEditModal } from './AdminEditModal'
import { pickHeart, type PickedHeart } from '@/lib/pickHeart'

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  event: WallEvent
  cols: number
  activeFilter: string
  isLiked: boolean
  isActive?: boolean
  onDoubleTap?: (event: WallEvent) => void
  onLike: (eventId: string) => void
  isAdminMode?: boolean
  onEventSaved?: (eventId: string, newPosterUrl?: string) => void
  previousPosterUrl?: string
  onUndoCrop?: () => void
  onConfirmCrop?: () => void
}

interface EventDetail {
  description: string | null
  address: string | null
}

interface WallPost {
  id: string
  user_id: string
  body: string
  like_count: number
  created_at: string
  is_venue_post: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function matchesFilter(event: WallEvent, filter: string, isLiked: boolean): boolean {
  if (filter === 'All') return true
  if (filter === '♥') return isLiked
  return event.category === filter
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (isToday) return `Tonight · ${time}`
  if (isTomorrow) return `Tomorrow · ${time}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` · ${time}`
}

function formatDatePill(iso: string): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const month   = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return `${weekday} ${month} ${d.getDate()}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── HeartPill (2-5 col) ────────────────────────────────────────────────────

function HeartPill({ count, isLiked, onLike }: { count: number; isLiked: boolean; onLike: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onLike() }}
      style={{
        position: 'absolute', top: 6, right: 6,
        background: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderRadius: 20,
        padding: '3px 7px',
        display: 'flex', alignItems: 'center', gap: 3,
        color: '#f0ece3',
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 11, fontWeight: 500, lineHeight: 1,
        userSelect: 'none', cursor: 'pointer',
        zIndex: 2,
      }}
    >
      <svg width="11" height="10" viewBox="0 0 24 22"
        fill={isLiked ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
      </svg>
      {count}
    </div>
  )
}



const PANEL_PCT = [-20, -40, -60] as const
const TAN60 = Math.tan(Math.PI / 3)

export function PosterCard({ event, cols, activeFilter, isLiked, isActive, onDoubleTap, onLike, isAdminMode, onEventSaved, previousPosterUrl, onUndoCrop, onConfirmCrop }: Props) {
  const { user } = useAuth()
  const matches = matchesFilter(event, activeFilter, isLiked)
  const dimmed = activeFilter !== 'All' && !matches
  const gradient = `linear-gradient(160deg, ${event.color1} 0%, ${event.color2} 100%)`

  const [showEdit, setShowEdit] = useState(false)
  const [confirmToast, setConfirmToast] = useState(false)
  const [popHeart, setPopHeart] = useState<PickedHeart | null>(null)


  // ── 2-5 col: double-tap → zoom to 1-col ───────────────────────────────
  const lastTap = useRef(0)
  function handleTap() {
    const now = Date.now()
    if (now - lastTap.current < 300) onDoubleTap?.(event)
    lastTap.current = now
  }

  // ── 1-col: 3-panel strip state ─────────────────────────────────────────
  const stripRef = useRef<HTMLDivElement>(null)
  const panelIdxRef = useRef(0)
  const [panelIdx, _setPanelIdx] = useState(0)
  const loopingRef = useRef(false)

  function setPanelIdx(i: number) {
    panelIdxRef.current = i
    _setPanelIdx(i)
  }

  // ── Reset to Poster when card scrolls out of view ─────────────────────
  useEffect(() => {
    if (cols !== 1) return
    if (!isActive && panelIdxRef.current !== 0) {
      const el = stripRef.current
      if (el) { el.style.transition = 'none'; el.style.transform = `translateX(${PANEL_PCT[0]}%)` }
      setPanelIdx(0)
      loopingRef.current = false
    }
  }, [isActive, cols])

  // ── 1-col: lazy-fetched data ─────────────────────────────────────────
  const detailFetched = useRef(false)
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [isAttending, setIsAttending] = useState(false)
  const [attendLoading, setAttendLoading] = useState(false)
  const [posts, setPosts] = useState<WallPost[]>([])
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set())
  const [newPostText, setNewPostText] = useState('')
  const [postLoading, setPostLoading] = useState(false)

  function fetchPanelData() {
    if (detailFetched.current) return
    detailFetched.current = true

    supabase.from('events').select('description, address').eq('id', event.id).single()
      .then(({ data }) => { if (data) setDetail(data as EventDetail) })

    supabase.from('attendees').select('user_id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .then(({ count }) => setAttendeeCount(count ?? 0))

    if (user) {
      supabase.from('attendees').select('id')
        .eq('event_id', event.id).eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setIsAttending(!!data))
    }

    fetchPosts()

    if (user) {
      supabase.from('post_likes').select('post_id').eq('user_id', user.id)
        .then(({ data }) => {
          setLikedPostIds(new Set((data ?? []).map((r: { post_id: string }) => r.post_id)))
        })
    }
  }

  function fetchPosts() {
    supabase.from('event_wall_posts')
      .select('id, user_id, body, like_count, created_at, is_venue_post')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setPosts((data as WallPost[] | null) ?? []))
  }

  // ── 1-col: panel navigation ───────────────────────────────────────────
  function shiftPanel(dir: 1 | -1) {
    if (loopingRef.current) return
    const el = stripRef.current
    if (!el) return
    const cur = panelIdxRef.current

    if (cur === 0) fetchPanelData()

    if (dir === 1) {
      if (cur === 2) {
        loopingRef.current = true
        el.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
        el.style.transform = 'translateX(-80%)'
        setTimeout(() => {
          const el2 = stripRef.current
          if (el2) { el2.style.transition = 'none'; el2.style.transform = `translateX(${PANEL_PCT[0]}%)` }
          setPanelIdx(0)
          loopingRef.current = false
        }, 300)
      } else {
        const next = (cur + 1) as 1 | 2
        el.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
        el.style.transform = `translateX(${PANEL_PCT[next]}%)`
        setPanelIdx(next)
      }
    } else {
      if (cur === 0) {
        loopingRef.current = true
        el.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
        el.style.transform = 'translateX(0%)'
        setTimeout(() => {
          const el2 = stripRef.current
          if (el2) { el2.style.transition = 'none'; el2.style.transform = `translateX(${PANEL_PCT[2]}%)` }
          setPanelIdx(2)
          loopingRef.current = false
        }, 300)
      } else {
        const prev = (cur - 1) as 0 | 1
        el.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
        el.style.transform = `translateX(${PANEL_PCT[prev]}%)`
        setPanelIdx(prev)
      }
    }
  }

  // ── 1-col: bidirectional swipe ────────────────────────────────────────
  const cardRef = useRef<HTMLDivElement>(null)
  const swipe = useRef({
    active: false,
    startX: 0,
    startY: 0,
    isHorizontal: null as boolean | null,
    cardW: 0,
    movedSignificantly: false,
  })
  const lastTapTimeRef = useRef(0)

  useEffect(() => {
    if (cols !== 1) return
    const el = cardRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || loopingRef.current) return
      swipe.current = {
        active: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        isHorizontal: null,
        cardW: el.clientWidth,
        movedSignificantly: false,
      }
      const strip = stripRef.current
      if (strip) strip.style.transition = 'none'
    }

    const onMove = (e: TouchEvent) => {
      const s = swipe.current
      if (!s.active) return

      const dx = e.touches[0].clientX - s.startX
      const dy = e.touches[0].clientY - s.startY

      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        s.movedSignificantly = true
      }

      if (s.isHorizontal === null) {
        s.isHorizontal = Math.abs(dy) <= Math.abs(dx) * TAN60
      }

      if (!s.isHorizontal) {
        s.active = false
        const strip = stripRef.current
        if (strip) {
          strip.style.transition = 'none'
          strip.style.transform = `translateX(${PANEL_PCT[panelIdxRef.current]}%)`
        }
        return
      }

      e.preventDefault()

      const strip = stripRef.current
      if (!strip) return
      const dragPct = (dx / (5 * s.cardW)) * 100
      strip.style.transform = `translateX(${PANEL_PCT[panelIdxRef.current] + dragPct}%)`
    }

    const onEnd = (e: TouchEvent) => {
      const s = swipe.current
      if (!s.active) { s.active = false; return }

      const endX = e.changedTouches[0].clientX
      const endY = e.changedTouches[0].clientY
      const dx = endX - s.startX
      const dy = endY - s.startY

      // Double-tap-to-like: only on poster panel (panelIdx 0), no significant movement
      if (!s.movedSignificantly && Math.abs(dx) < 10 && Math.abs(dy) < 10 && panelIdxRef.current === 0) {
        const now = Date.now()
        if (now - lastTapTimeRef.current < 300) {
          lastTapTimeRef.current = 0
          if (!isLiked) onLike(event.id)
          const heart = pickHeart()
          setPopHeart(heart)
          setTimeout(() => setPopHeart(null), 700)
          s.active = false
          return
        }
        lastTapTimeRef.current = now
      }

      if (s.isHorizontal !== true) { s.active = false; return }
      s.active = false

      if (Math.abs(dx) > 50) {
        shiftPanel(dx < 0 ? 1 : -1)
      } else {
        const strip = stripRef.current
        if (strip) {
          strip.style.transition = 'transform 0.2s ease'
          strip.style.transform = `translateX(${PANEL_PCT[panelIdxRef.current]}%)`
        }
      }
    }

    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [cols, isLiked]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── RSVP ──────────────────────────────────────────────────────────────
  async function toggleAttend() {
    if (!user || attendLoading) return
    setAttendLoading(true)
    if (isAttending) {
      await supabase.from('attendees').delete().eq('event_id', event.id).eq('user_id', user.id)
      setIsAttending(false); setAttendeeCount((c) => Math.max(0, c - 1))
    } else {
      await supabase.from('attendees').insert({ event_id: event.id, user_id: user.id })
      setIsAttending(true); setAttendeeCount((c) => c + 1)
    }
    setAttendLoading(false)
  }

  // ── Post like ──────────────────────────────────────────────────────────
  async function togglePostLike(postId: string) {
    if (!user) return
    if (likedPostIds.has(postId)) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
      await supabase.rpc('add_post_like_count', { p_post_id: postId, delta: -1 })
      setLikedPostIds((prev) => { const s = new Set(prev); s.delete(postId); return s })
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, like_count: Math.max(0, p.like_count - 1) } : p))
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id })
      await supabase.rpc('add_post_like_count', { p_post_id: postId, delta: 1 })
      setLikedPostIds((prev) => new Set([...prev, postId]))
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, like_count: p.like_count + 1 } : p))
    }
  }

  // ── Submit post ────────────────────────────────────────────────────────
  async function submitPost() {
    if (!user || !newPostText.trim() || postLoading) return
    setPostLoading(true)
    const { error } = await supabase.from('event_wall_posts').insert({
      event_id: event.id, user_id: user.id, body: newPostText.trim(),
    })
    if (!error) { setNewPostText(''); fetchPosts() }
    setPostLoading(false)
  }

  // ── 1-col render ──────────────────────────────────────────────────────
  if (cols === 1) {
    return (
      <div
        ref={cardRef}
        style={{
          height: '100%',
          background: 'var(--bg)',
          scrollSnapAlign: 'start',
          opacity: dimmed ? 0.18 : 1,
          filter: dimmed ? 'grayscale(0.5)' : 'none',
          transition: 'opacity 0.25s ease, filter 0.25s ease',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          ref={stripRef}
          style={{
            display: 'flex',
            width: '500%',
            height: '100%',
            transform: 'translateX(-20%)',
            willChange: 'transform',
          }}
        >
          {/* Panel 0: PostWallClone */}
          <div style={{ width: '20%', flexShrink: 0, height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderPostWall()}
          </div>

          {/* Panel 1: Poster */}
          <div style={{ width: '20%', flexShrink: 0, height: '100%', position: 'relative', background: 'var(--bg)' }}>
            {renderPosterContent()}
            {panelIdx === 0 && (
              <div style={{ position: 'absolute', bottom: 'max(18px, env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <span style={{ fontSize: 18, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.22)', lineHeight: 1, userSelect: 'none' }}>· · ·</span>
              </div>
            )}
            {panelIdx === 0 && (
              <div style={{
                position: 'absolute',
                bottom: 'env(safe-area-inset-bottom)',
                right: 0,
                padding: '6px 12px',
                background: 'var(--bg)',
                color: 'var(--fg)',
                fontFamily: '"Barlow Condensed", sans-serif',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                borderRadius: 0,
                zIndex: 5,
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                {formatDatePill(event.starts_at)}
              </div>
            )}
          </div>

          {/* Panel 2: Info */}
          <div style={{ width: '20%', flexShrink: 0, height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderInfo()}
          </div>

          {/* Panel 3: PostWall */}
          <div style={{ width: '20%', flexShrink: 0, height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderPostWall()}
          </div>

          {/* Panel 4: PosterClone */}
          <div style={{ width: '20%', flexShrink: 0, height: '100%', position: 'relative', background: 'var(--bg)' }}>
            {renderPosterContent()}
          </div>
        </div>

        {/* Heart pop overlay — double-tap-to-like */}
        {popHeart && (
          <div
            key={popHeart.src + String(Date.now())}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', zIndex: 30,
            }}
          >
            <img
              src={popHeart.src}
              alt=""
              style={{
                width: popHeart.isSpecial ? '96%' : '55%',
                height: 'auto',
                maxHeight: popHeart.isSpecial ? '96%' : '55%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.6))',
                animation: 'heartPop 700ms ease-out forwards',
              }}
            />
          </div>
        )}

        {/* Confirm ✓ / Undo ↩ pills — shown in admin mode when a recent crop exists */}
        {isAdminMode && previousPosterUrl && !showEdit && (
          <div style={{
            position: 'absolute',
            bottom: 'max(60px, calc(env(safe-area-inset-bottom) + 46px))',
            left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: 8,
            zIndex: 21,
          }}>
            {confirmToast ? (
              <span style={{ padding: '5px 12px', background: 'rgba(0,0,0,0.7)', borderRadius: 20, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                Locked in
              </span>
            ) : (
              <>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    onConfirmCrop?.()
                    setConfirmToast(true)
                    setTimeout(() => setConfirmToast(false), 1800)
                  }}
                  style={{ padding: '5px 12px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(168,85,247,0.5)', borderRadius: 20, color: '#c084fc', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Confirm ✓
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onUndoCrop?.() }}
                  style={{ padding: '5px 12px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 20, color: 'rgba(239,68,68,0.8)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Undo ↩
                </button>
              </>
            )}
          </div>
        )}

        {/* ✏️ edit button — outside the strip so it stays fixed over all panels */}
        {isAdminMode && (
          <button
            onClick={e => { e.stopPropagation(); setShowEdit(true) }}
            style={{
              position: 'absolute',
              bottom: 'max(14px, env(safe-area-inset-bottom))',
              right: 14,
              width: 34, height: 34,
              background: 'rgba(0,0,0,0.58)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              border: '1px solid rgba(168,85,247,0.55)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, cursor: 'pointer', zIndex: 20,
            }}
          >
            ✏️
          </button>
        )}

        {showEdit && (
          <AdminEditModal
            event={event}
            onClose={() => setShowEdit(false)}
            onSaved={(newUrl) => { setShowEdit(false); onEventSaved?.(event.id, newUrl) }}
            onCropSaved={(newUrl) => onEventSaved?.(event.id, newUrl)}
            onUndo={() => onUndoCrop?.()}
          />
        )}
      </div>
    )
  }

  // ── 2-5 col: blurred backdrop card ────────────────────────────────────
  return (
    <div
      onClick={handleTap}
      style={{
        aspectRatio: '2/3',
        position: 'relative',
        overflow: 'hidden',
        opacity: dimmed ? 0.18 : 1,
        filter: dimmed ? 'grayscale(0.5)' : 'none',
        transition: 'opacity 0.25s ease, filter 0.25s ease',
        cursor: 'pointer',
        userSelect: 'none',
        background: '#000',
      }}
    >
      {event.poster_url ? (
        <>
          {/* Blurred backdrop — same poster image, blurred, feels like an extension of the poster */}
          {event.poster_url && (
            <img
              src={event.poster_url}
              alt=""
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(24px)',
                transform: 'scale(1.15)',
                zIndex: 0,
              }}
            />
          )}
          {/* Main poster image */}
          <img
            src={event.poster_url}
            alt={event.title}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: event.fill_frame ? 'cover' : 'contain',
              objectPosition: event.fill_frame ? `${(event.focal_x ?? 0.5) * 100}% ${(event.focal_y ?? 0.5) * 100}%` : undefined,
              transform: !event.fill_frame && (event.poster_offset_x || event.poster_offset_y) ? `translate(${event.poster_offset_x ?? 0}%, ${event.poster_offset_y ?? 0}%)` : undefined,
              opacity: 1,
              pointerEvents: 'none',
              userSelect: 'none',
              zIndex: 1,
            }}
          />
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: gradient }} />
      )}


      {cols <= 3 && (
        <HeartPill count={event.like_count} isLiked={isLiked} onLike={() => onLike(event.id)} />
      )}

      {isAdminMode && (
        <button
          onClick={e => { e.stopPropagation(); setShowEdit(true) }}
          style={{
            position: 'absolute', bottom: 6, left: 6,
            width: 28, height: 28,
            background: 'rgba(0,0,0,0.58)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '1px solid rgba(168,85,247,0.55)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, cursor: 'pointer',
            zIndex: 3,
          }}
        >
          ✏️
        </button>
      )}

      {showEdit && (
        <AdminEditModal
          event={event}
          onClose={() => setShowEdit(false)}
          onSaved={(newUrl) => { setShowEdit(false); onEventSaved?.(event.id, newUrl) }}
          onCropSaved={(newUrl) => onEventSaved?.(event.id, newUrl)}
          onUndo={() => onUndoCrop?.()}
        />
      )}
    </div>
  )

  // ── Render helpers ─────────────────────────────────────────────────────

  function renderPosterContent() {
    return event.poster_url ? (
      <img
        src={event.poster_url}
        alt={event.title}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
    ) : (
      <div style={{ position: 'absolute', inset: 0, background: gradient }} />
    )
  }

  function renderInfo() {
    return (
      <>
        <div style={{ flexShrink: 0, paddingTop: 'max(14px, env(safe-area-inset-top))', padding: '14px 16px 12px', borderBottom: '1px solid var(--fg-08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, background: event.color2 + '33', border: `1px solid ${event.color2}55`, fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: event.color2 }}>
              {event.category || 'Event'}
            </span>
            <span style={{ marginLeft: 'auto', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', letterSpacing: '0.04em' }}>swipe → for wall</span>
          </div>
          <h2 style={{ margin: '8px 0 2px', fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.15 }}>
            {event.title}
          </h2>
          {event.venue_name && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: event.color2, fontWeight: 600 }}>
              {event.venue_name}
            </p>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--fg-40)', flexShrink: 0 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
              {formatDateTime(event.starts_at)}
            </span>
          </div>

          {detail?.address && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--fg-40)', flexShrink: 0, marginTop: 1 }}>
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.4 }}>{detail.address}</span>
            </div>
          )}

          {detail?.description && (
            <p style={{ margin: '0 0 20px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.6 }}>
              {detail.description}
            </p>
          )}

          <div style={{ height: 1, background: 'var(--fg-08)', margin: '0 0 16px' }} />

          {attendeeCount > 0 && (
            <p style={{ margin: '0 0 10px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)' }}>
              {attendeeCount} {attendeeCount === 1 ? 'person' : 'people'} going
            </p>
          )}

          {user ? (
            <button onClick={toggleAttend} disabled={attendLoading} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: isAttending ? '1.5px solid var(--fg-25)' : 'none', background: isAttending ? 'transparent' : event.color2, color: isAttending ? 'var(--fg-65)' : '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, cursor: attendLoading ? 'default' : 'pointer', opacity: attendLoading ? 0.6 : 1 }}>
              {isAttending ? "I'm Going ✓" : "I'll Be There"}
            </button>
          ) : (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-35)', textAlign: 'center' }}>Sign in to RSVP</p>
          )}
        </div>
      </>
    )
  }

  function renderPostWall() {
    return (
      <>
        <div style={{ flexShrink: 0, paddingTop: 'max(14px, env(safe-area-inset-top))', padding: '14px 16px 12px', borderBottom: '1px solid var(--fg-08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>Wall</span>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', letterSpacing: '0.04em' }}>swipe → to loop</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {posts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-25)' }}>No notes yet. Be the first.</p>
            </div>
          ) : posts.map((post) => (
            <div key={post.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--fg-08)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--fg-15)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: '"Space Grotesk", sans-serif', color: 'var(--fg-40)' }}>
                  {post.user_id.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, color: 'var(--fg-55)' }}>#{post.user_id.slice(0, 6)}</span>
                    {post.is_venue_post && (
                      <span style={{ padding: '1px 5px', borderRadius: 8, background: event.color2 + '33', fontFamily: '"Space Grotesk", sans-serif', fontSize: 8, fontWeight: 700, color: event.color2, textTransform: 'uppercase' }}>venue</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-25)' }}>{timeAgo(post.created_at)}</span>
                  </div>
                  <p style={{ margin: '0 0 6px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-80)', lineHeight: 1.45 }}>{post.body}</p>
                  <button onClick={() => togglePostLike(post.id)} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: user ? 'pointer' : 'default', color: likedPostIds.has(post.id) ? event.color2 : 'var(--fg-25)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11 }}>
                    <svg width="10" height="9" viewBox="0 0 24 22" fill={likedPostIds.has(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
                    </svg>
                    {post.like_count > 0 && post.like_count}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flexShrink: 0, borderTop: '1px solid var(--fg-08)', padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', background: 'var(--bg)' }}>
          {user ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={newPostText}
                onChange={(e) => setNewPostText(e.target.value.slice(0, 280))}
                placeholder="Leave a note on the wall…"
                rows={1}
                style={{ flex: 1, resize: 'none', background: 'var(--fg-08)', border: '1px solid var(--fg-15)', borderRadius: 8, padding: '8px 10px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg)', lineHeight: 1.4, outline: 'none', minHeight: 36, maxHeight: 90, overflowY: 'auto' }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 90) + 'px'
                }}
              />
              <button onClick={submitPost} disabled={!newPostText.trim() || postLoading} style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, background: newPostText.trim() ? event.color2 : 'var(--fg-15)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newPostText.trim() ? 'pointer' : 'default' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-30)', textAlign: 'center', padding: '2px 0' }}>Sign in to leave a note</p>
          )}
        </div>
      </>
    )
  }
}
