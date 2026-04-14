import { useState, useEffect, useRef } from 'react'
import { type WallEvent } from '@/types/event'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────

interface EventDetail {
  description: string | null
  address: string | null
  ends_at: string | null
}

interface WallPost {
  id: string
  user_id: string
  body: string
  like_count: number
  created_at: string
  is_venue_post: boolean
}

interface Props {
  event: WallEvent
  isLiked: boolean
  onLike: (eventId: string) => void
  onClose: () => void
  onVenueTap?: (venueId: string) => void
}

// ── Module-level helpers (never redefined) ─────────────────────────────────

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
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ` · ${time}`
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

function shortId(uid: string): string {
  return `#${uid.slice(0, 6)}`
}

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'rgba(0,0,0,0.5)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderRadius: 20,
  padding: '4px 9px',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 12,
  fontWeight: 500,
  color: '#fff',
  lineHeight: 1,
}

// ── Main component ─────────────────────────────────────────────────────────

export function FlyerCarousel({ event, isLiked, onLike, onClose, onVenueTap }: Props) {
  const { user } = useAuth()

  // ── Carousel ────────────────────────────────────────────────────────────
  const overlayRef = useRef<HTMLDivElement>(null)
  const stripRef   = useRef<HTMLDivElement>(null)
  const stripIdxRef = useRef(0)
  const [stripIdx, _setStripIdx] = useState(0)
  const dotIdx = stripIdx === 3 ? 0 : stripIdx

  function setStripIdx(i: number) {
    stripIdxRef.current = i
    _setStripIdx(i)
  }

  // ── Like / view ──────────────────────────────────────────────────────────
  const [localIsLiked,   setLocalIsLiked]   = useState(isLiked)
  const [localLikeCount, setLocalLikeCount] = useState(event.like_count)
  const [localViewCount, setLocalViewCount] = useState(event.view_count)
  const [heartBurst,     setHeartBurst]     = useState(false)

  // ── Detail / attendees / posts ───────────────────────────────────────────
  const [detail,        setDetail]        = useState<EventDetail | null>(null)
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [isAttending,   setIsAttending]   = useState(false)
  const [attendLoading, setAttendLoading] = useState(false)
  const [posts,         setPosts]         = useState<WallPost[]>([])
  const [likedPostIds,  setLikedPostIds]  = useState<Set<string>>(new Set())
  const [newPostText,   setNewPostText]   = useState('')
  const [postLoading,   setPostLoading]   = useState(false)

  // ── Gesture refs ─────────────────────────────────────────────────────────
  const pinchRef = useRef<{
    active: boolean; startDist: number; img: HTMLImageElement | null; peeking: boolean
  }>({ active: false, startDist: 0, img: null, peeking: false })

  const swipeRef = useRef<{
    active: boolean; startX: number; startY: number; isHorizontal: boolean | null
  }>({ active: false, startX: 0, startY: 0, isHorizontal: null })

  const lastTapRef = useRef(0)

  // ── On mount: view count + fetches ───────────────────────────────────────
  useEffect(() => {
    supabase.rpc('add_view_count', { p_event_id: event.id, delta: 1 })
      .then(() => setLocalViewCount((v) => v + 1))

    supabase.from('events').select('description, address, ends_at')
      .eq('id', event.id).single()
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
  }, [event.id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  function fetchPosts() {
    supabase.from('event_wall_posts')
      .select('id, user_id, body, like_count, created_at, is_venue_post')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setPosts((data as WallPost[] | null) ?? []))
  }

  // ── Snap to panel ────────────────────────────────────────────────────────
  function snapTo(idx: number, animate = true) {
    const el = stripRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
    // Each panel = 25% of the 400%-wide strip → one panel = 25% shift
    el.style.transform = `translateX(${-idx * 25}%)`
    setStripIdx(idx)
    // Seamless loop: snap to clone → after animation reset to panel 0
    if (idx === 3) {
      setTimeout(() => {
        const el2 = stripRef.current
        if (!el2) return
        el2.style.transition = 'none'
        el2.style.transform = 'translateX(0)'
        setStripIdx(0)
      }, 350)
    }
  }

  // ── Touch events (registered imperatively for passive:false control) ──────
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Two-finger pinch — zoom flyer image on panels 0 and 3
        const idx = stripIdxRef.current
        if (idx !== 0 && idx !== 3) return
        const t0 = e.touches[0], t1 = e.touches[1]
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
        const panelEl = stripRef.current?.children[idx] as HTMLElement | undefined
        const img = panelEl?.querySelector('img') as HTMLImageElement | null
        if (img) {
          const rect = img.getBoundingClientRect()
          const midX = (t0.clientX + t1.clientX) / 2
          const midY = (t0.clientY + t1.clientY) / 2
          img.style.transition = 'none'
          img.style.transformOrigin =
            `${((midX - rect.left) / rect.width) * 100}% ${((midY - rect.top) / rect.height) * 100}%`
        }
        pinchRef.current = { active: true, startDist: dist, img, peeking: false }
        swipeRef.current.active = false
        return
      }

      // Single finger — start swipe tracking
      const touch = e.touches[0]
      swipeRef.current = { active: true, startX: touch.clientX, startY: touch.clientY, isHorizontal: null }
      pinchRef.current.active = false
      const el = stripRef.current
      if (el) el.style.transition = 'none'
    }

    const onMove = (e: TouchEvent) => {
      // Pinch zoom
      if (pinchRef.current.active) {
        if (e.touches.length < 2) return
        const t0 = e.touches[0], t1 = e.touches[1]
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
        const scale = Math.min(3, Math.max(1, dist / pinchRef.current.startDist))
        if (pinchRef.current.img) {
          pinchRef.current.img.style.transform = `scale(${scale})`
          pinchRef.current.peeking = scale > 1
        }
        return
      }

      if (!swipeRef.current.active) return

      const touch = e.touches[0]
      const dx = touch.clientX - swipeRef.current.startX
      const dy = touch.clientY - swipeRef.current.startY

      // Lock in gesture direction after 8px of movement
      if (swipeRef.current.isHorizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipeRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy)
      }

      if (swipeRef.current.isHorizontal === false) {
        // Vertical — hand off to native scroll
        swipeRef.current.active = false
        return
      }

      if (swipeRef.current.isHorizontal === true) {
        e.preventDefault() // block native scroll while swiping panels
        const el = stripRef.current
        if (!el) return
        // Base position in px + live drag offset
        const baseX = -stripIdxRef.current * overlay.clientWidth
        el.style.transform = `translateX(${baseX + dx}px)`
      }
    }

    const onEnd = (e: TouchEvent) => {
      // Pinch release — spring image back
      if (pinchRef.current.active) {
        const { img, peeking } = pinchRef.current
        if (img && peeking) {
          img.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
          img.style.transform = 'scale(1)'
        }
        pinchRef.current = { active: false, startDist: 0, img: null, peeking: false }
        return
      }

      if (!swipeRef.current.active || swipeRef.current.isHorizontal !== true) {
        swipeRef.current.active = false
        return
      }

      const touch = e.changedTouches[0]
      const dx = touch.clientX - swipeRef.current.startX
      swipeRef.current.active = false

      const cur = stripIdxRef.current
      let next = cur
      if (dx < -40) next = Math.min(3, cur + 1)  // swipe left  → next panel
      else if (dx > 40) next = Math.max(0, cur - 1) // swipe right → prev panel

      snapTo(next)
    }

    // passive: false on touchstart is critical — iOS Safari uses the passive hint
    // to lock scroll behavior before touchmove fires. Without it, e.preventDefault()
    // in touchmove is silently ignored and horizontal swipes don't work.
    overlay.addEventListener('touchstart',  onStart, { passive: false })
    overlay.addEventListener('touchmove',   onMove,  { passive: false })
    overlay.addEventListener('touchend',    onEnd)
    overlay.addEventListener('touchcancel', onEnd)
    return () => {
      overlay.removeEventListener('touchstart',  onStart)
      overlay.removeEventListener('touchmove',   onMove)
      overlay.removeEventListener('touchend',    onEnd)
      overlay.removeEventListener('touchcancel', onEnd)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleLike() {
    if (!user) return
    onLike(event.id)
    if (localIsLiked) {
      setLocalIsLiked(false)
      setLocalLikeCount((c) => Math.max(0, c - 1))
    } else {
      setLocalIsLiked(true)
      setLocalLikeCount((c) => c + 1)
      setHeartBurst(true)
      setTimeout(() => setHeartBurst(false), 700)
    }
  }

  function handleFlyerTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 300) handleLike()
    lastTapRef.current = now
  }

  async function toggleAttend() {
    if (!user || attendLoading) return
    setAttendLoading(true)
    if (isAttending) {
      await supabase.from('attendees').delete().eq('event_id', event.id).eq('user_id', user.id)
      setIsAttending(false)
      setAttendeeCount((c) => Math.max(0, c - 1))
    } else {
      await supabase.from('attendees').insert({ event_id: event.id, user_id: user.id })
      setIsAttending(true)
      setAttendeeCount((c) => c + 1)
    }
    setAttendLoading(false)
  }

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

  async function submitPost() {
    if (!user || !newPostText.trim() || postLoading) return
    setPostLoading(true)
    const { error } = await supabase.from('event_wall_posts').insert({
      event_id: event.id,
      user_id: user.id,
      body: newPostText.trim(),
    })
    if (!error) { setNewPostText(''); fetchPosts() }
    setPostLoading(false)
  }

  // ── Render helpers (plain functions, not components — keeps DOM stable) ────
  // Using <LocalComponent /> inside a render function creates a new type on
  // every render and forces React to unmount/remount, breaking in-progress
  // gestures. Calling renderX() instead returns raw JSX that React reconciles
  // normally against the parent's fiber tree.

  function renderCloseBtn(extraStyle?: React.CSSProperties) {
    return (
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 'max(14px, env(safe-area-inset-top))',
          left: 14,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: 'none',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 20,
          flexShrink: 0,
          ...extraStyle,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="1" y1="1" x2="13" y2="13" />
          <line x1="13" y1="1" x2="1" y2="13" />
        </svg>
      </button>
    )
  }

  function renderDots(light?: boolean) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() => snapTo(i)}
            style={{
              width: dotIdx === i ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: light
                ? dotIdx === i ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'
                : dotIdx === i ? 'var(--fg)' : 'var(--fg-25)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transition: 'width 0.2s ease, background 0.2s ease',
            }}
          />
        ))}
      </div>
    )
  }

  // ── Panel 1: Flyer ────────────────────────────────────────────────────────
  function renderFlyer() {
    return (
      <div
        style={{
          width: '25%',
          height: '100%',
          flexShrink: 0,
          position: 'relative',
          background: '#000',
          overflow: 'hidden',
        }}
        onClick={handleFlyerTap}
      >
        {event.poster_url ? (
          <img
            src={event.poster_url}
            alt={event.title}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              pointerEvents: 'none', // let taps fall through to the wrapper
            }}
          />
        ) : (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(160deg, ${event.color1} 0%, ${event.color2} 100%)`,
          }} />
        )}

        {/* Heart burst */}
        {heartBurst && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 10,
          }}>
            <svg width="80" height="80" viewBox="0 0 24 22" fill="var(--fg)"
              style={{ animation: 'heartBurst 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}>
              <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
            </svg>
          </div>
        )}

        {/* Close */}
        {renderCloseBtn()}

        {/* View + like counts */}
        <div style={{
          position: 'absolute',
          top: 'max(14px, env(safe-area-inset-top))',
          right: 14,
          display: 'flex',
          gap: 8,
          zIndex: 20,
        }}>
          <div style={pillStyle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{localViewCount}</span>
          </div>
          <button
            style={{ ...pillStyle, cursor: 'pointer', border: 'none' }}
            onClick={(e) => { e.stopPropagation(); handleLike() }}
          >
            <svg
              width="12" height="11" viewBox="0 0 24 22"
              fill={localIsLiked ? '#fff' : 'none'}
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
            </svg>
            <span>{localLikeCount}</span>
          </button>
        </div>

        {/* Bottom: dots + swipe hint */}
        <div style={{
          position: 'absolute',
          bottom: 'max(24px, env(safe-area-inset-bottom))',
          left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          zIndex: 20,
          pointerEvents: 'none',
        }}>
          <div style={{ pointerEvents: 'auto' }}>{renderDots(true)}</div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            borderRadius: 20,
            padding: '5px 12px',
          }}>
            <span style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 11,
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: '0.04em',
            }}>
              swipe for info
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  // ── Panel 2: Info ─────────────────────────────────────────────────────────
  function renderInfo() {
    return (
      <div style={{
        width: '25%',
        height: '100%',
        flexShrink: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Header */}
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 'max(14px, env(safe-area-inset-top))',
          paddingBottom: 14,
          paddingLeft: 52,
          paddingRight: 52,
          position: 'relative',
          borderBottom: '1px solid var(--fg-08)',
        }}>
          {renderCloseBtn({ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 14, background: 'var(--fg-08)' })}
          {renderDots()}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>
          {/* Category badge */}
          <div style={{ marginBottom: 12 }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 20,
              background: event.color2 + '33',
              border: `1px solid ${event.color2}66`,
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: event.color2,
            }}>
              {event.category || 'Event'}
            </span>
          </div>

          {/* Title */}
          <h1 style={{
            margin: '0 0 6px',
            fontFamily: '"Playfair Display", serif',
            fontSize: 28, fontWeight: 900,
            color: 'var(--fg)',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}>
            {event.title}
          </h1>

          {/* Venue */}
          {event.venue_name && (
            <button
              onClick={() => event.venue_id && onVenueTap?.(event.venue_id)}
              style={{
                display: 'block',
                background: 'none', border: 'none', padding: 0,
                margin: '0 0 16px',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 15, fontWeight: 600,
                color: event.color2,
                cursor: event.venue_id ? 'pointer' : 'default',
                textAlign: 'left',
              }}
            >
              {event.venue_name}
              {event.venue_id && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 4, verticalAlign: 'middle' }}>
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          )}

          {/* Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--fg-40)', flexShrink: 0 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)' }}>
              {formatDateTime(event.starts_at)}
            </span>
          </div>

          {/* Address */}
          {detail?.address && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--fg-40)', flexShrink: 0, marginTop: 2 }}>
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.4 }}>
                {detail.address}
              </span>
            </div>
          )}

          {/* Description */}
          {detail?.description && (
            <p style={{ margin: '0 0 24px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.6 }}>
              {detail.description}
            </p>
          )}

          <div style={{ height: 1, background: 'var(--fg-08)', margin: '4px 0 20px' }} />

          {/* RSVP */}
          {attendeeCount > 0 && (
            <p style={{ margin: '0 0 12px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
              {attendeeCount} {attendeeCount === 1 ? 'person' : 'people'} going
            </p>
          )}

          {user ? (
            <button
              onClick={toggleAttend}
              disabled={attendLoading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 10,
                border: isAttending ? '1.5px solid var(--fg-25)' : 'none',
                background: isAttending ? 'transparent' : event.color2,
                color: isAttending ? 'var(--fg-65)' : '#fff',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 15, fontWeight: 700,
                cursor: attendLoading ? 'default' : 'pointer',
                opacity: attendLoading ? 0.6 : 1,
                transition: 'opacity 0.15s ease',
                letterSpacing: '0.01em',
              }}
            >
              {isAttending ? "I'm Going ✓" : "I'll Be There"}
            </button>
          ) : (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', textAlign: 'center' }}>
              Sign in to RSVP
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Panel 3: Post Wall ────────────────────────────────────────────────────
  function renderPostWall() {
    return (
      <div style={{
        width: '25%',
        height: '100%',
        flexShrink: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          paddingTop: 'max(14px, env(safe-area-inset-top))',
          paddingBottom: 14,
          paddingLeft: 52, paddingRight: 52,
          position: 'relative',
          borderBottom: '1px solid var(--fg-08)',
        }}>
          {renderCloseBtn({ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 14, background: 'var(--fg-08)' })}
          {renderDots()}
          <p style={{
            position: 'absolute', right: 16,
            margin: 0,
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--fg-30)',
            top: 'max(20px, calc(env(safe-area-inset-top) + 6px))',
          }}>
            Wall
          </p>
        </div>

        {/* Posts */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
          {posts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-25)' }}>
                No notes yet. Be the first.
              </p>
            </div>
          ) : posts.map((post) => (
            <div key={post.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--fg-08)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'var(--fg-15)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontFamily: '"Space Grotesk", sans-serif', color: 'var(--fg-40)',
                }}>
                  {shortId(post.user_id)[1]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--fg-65)' }}>
                      {shortId(post.user_id)}
                    </span>
                    {post.is_venue_post && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 10,
                        background: event.color2 + '33',
                        fontFamily: '"Space Grotesk", sans-serif',
                        fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.05em', color: event.color2, textTransform: 'uppercase',
                      }}>venue</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)' }}>
                      {timeAgo(post.created_at)}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-80)', lineHeight: 1.5 }}>
                    {post.body}
                  </p>
                  <button
                    onClick={() => togglePostLike(post.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'none', border: 'none', padding: 0,
                      cursor: user ? 'pointer' : 'default',
                      color: likedPostIds.has(post.id) ? event.color2 : 'var(--fg-30)',
                      fontFamily: '"Space Grotesk", sans-serif', fontSize: 12,
                    }}
                  >
                    <svg width="11" height="10" viewBox="0 0 24 22"
                      fill={likedPostIds.has(post.id) ? 'currentColor' : 'none'}
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
                    </svg>
                    {post.like_count > 0 && post.like_count}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Compose */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--fg-08)',
          padding: '10px 12px',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
          background: 'var(--bg)',
        }}>
          {user ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={newPostText}
                onChange={(e) => setNewPostText(e.target.value.slice(0, 280))}
                placeholder="Leave a note on the wall…"
                rows={1}
                style={{
                  flex: 1, resize: 'none',
                  background: 'var(--fg-08)',
                  border: '1px solid var(--fg-15)',
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 14, color: 'var(--fg)', lineHeight: 1.4,
                  outline: 'none', minHeight: 38, maxHeight: 100, overflowY: 'auto',
                }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 100) + 'px'
                }}
              />
              <button
                onClick={submitPost}
                disabled={!newPostText.trim() || postLoading}
                style={{
                  flexShrink: 0, width: 38, height: 38, borderRadius: 8,
                  background: newPostText.trim() ? event.color2 : 'var(--fg-15)',
                  border: 'none', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: newPostText.trim() ? 'pointer' : 'default',
                  transition: 'background 0.15s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-30)', textAlign: 'center', padding: '4px 0' }}>
              Sign in to leave a note
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes heartBurst {
          0%   { opacity: 0; transform: scale(0.4); }
          40%  { opacity: 1; transform: scale(1.3); }
          70%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1.4); }
        }
      `}</style>

      {/*
        touch-action: none tells iOS/Android not to handle any native touch
        behaviors (scroll, pinch-zoom) on this element — our handlers own
        all gestures. Combined with passive:false on touchstart this ensures
        e.preventDefault() in touchmove is respected on every mobile browser.
      */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: '#000',
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        {/* 4-panel strip: Flyer | Info | PostWall | FlyerClone */}
        <div
          ref={stripRef}
          style={{
            display: 'flex',
            width: '400%',
            height: '100%',
            willChange: 'transform',
          }}
        >
          {renderFlyer()}
          {renderInfo()}
          {renderPostWall()}
          {renderFlyer()}
        </div>
      </div>
    </>
  )
}
