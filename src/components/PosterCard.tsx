import { useRef, useEffect } from 'react'
import { type WallEvent } from '@/types/event'

interface Props {
  event: WallEvent
  cols: number
  activeFilter: string
  onDoubleTap: (event: WallEvent) => void
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function matchesFilter(event: WallEvent, filter: string, today: string): boolean {
  if (filter === 'All') return true
  if (filter === 'Tonight') return event.starts_at.slice(0, 10) === today
  return event.category === filter
}

// ── Heart pill — absolute top-right on the image ─────────────
function HeartPill({ count }: { count: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        background: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderRadius: 20,
        padding: '3px 7px',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        color: 'rgba(255,255,255,0.88)',
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      ♥ {count}
    </div>
  )
}

// ── Info bar — below the image, against app bg ────────────────
function InfoBar({ event, cols }: { event: WallEvent; cols: number }) {
  const titleSize = cols === 1 ? 13 : cols === 2 ? 11 : cols === 3 ? 10 : 9
  const metaSize  = cols === 1 ? 11 : cols === 2 ? 9  : cols === 3 ? 8  : 8
  const padV      = cols === 1 ? 7  : 5
  const padH      = cols === 1 ? 10 : 7

  const showVenue = cols <= 3
  const showTime  = cols <= 2

  const metaParts = [
    showVenue ? event.venue_name : null,
    showTime  ? formatTime(event.starts_at) : null,
  ].filter(Boolean)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        padding: `${padV}px ${padH}px`,
        background: 'var(--bg)',
        flexShrink: 0,
      }}
    >
      {/* Left — title + meta */}
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: titleSize,
            fontWeight: 600,
            color: 'var(--fg-80)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.25,
          }}
        >
          {event.title}
        </div>
        {metaParts.length > 0 && (
          <div
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: metaSize,
              color: 'var(--fg-30)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.3,
              marginTop: 1,
            }}
          >
            {metaParts.join(' · ')}
          </div>
        )}
      </div>

      {/* Right — heart (1-col only) + eye + view count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          color: 'var(--fg-25)',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: metaSize,
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {cols === 1 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            ♥ {event.like_count}
          </span>
        )}
        {/* Eye icon — inline SVG, sized to text */}
        <svg
          width={metaSize + 1}
          height={metaSize + 1}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ flexShrink: 0 }}
        >
          <path d="M1 8C1 8 3.5 3 8 3s7 5 7 5-2.5 5-7 5S1 8 1 8z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
        {event.view_count}
      </div>
    </div>
  )
}

export function PosterCard({ event, cols, activeFilter, onDoubleTap }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const matches = matchesFilter(event, activeFilter, today)

  // Double-tap
  const lastTap = useRef(0)
  const handleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) onDoubleTap(event)
    lastTap.current = now
  }

  // Refs for peek zoom (1-col only) — DOM mutation, no re-renders
  const cardRef = useRef<HTMLDivElement>(null)
  const imgRef  = useRef<HTMLImageElement>(null)
  const peekActive   = useRef(false)
  const peekStartDist = useRef(0)

  useEffect(() => {
    if (cols !== 1) return
    const card = cardRef.current
    const img  = imgRef.current
    if (!card || !img) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const t0 = e.touches[0], t1 = e.touches[1]
      peekStartDist.current = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
      peekActive.current = true
      const rect = img.getBoundingClientRect()
      const midX = (t0.clientX + t1.clientX) / 2
      const midY = (t0.clientY + t1.clientY) / 2
      img.style.transformOrigin = `${((midX - rect.left)  / rect.width)  * 100}% ${((midY - rect.top) / rect.height) * 100}%`
      img.style.transition = 'none'
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!peekActive.current || e.touches.length < 2) return
      e.preventDefault()
      const t0 = e.touches[0], t1 = e.touches[1]
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
      img.style.transform = `scale(${Math.min(3, Math.max(1, dist / peekStartDist.current))})`
    }
    const onRelease = () => {
      if (!peekActive.current) return
      peekActive.current = false
      img.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
      img.style.transform = 'scale(1)'
    }

    card.addEventListener('touchstart', onTouchStart, { passive: false })
    card.addEventListener('touchmove',  onTouchMove,  { passive: false })
    card.addEventListener('touchend',   onRelease)
    card.addEventListener('touchcancel', onRelease)
    return () => {
      card.removeEventListener('touchstart', onTouchStart)
      card.removeEventListener('touchmove',  onTouchMove)
      card.removeEventListener('touchend',   onRelease)
      card.removeEventListener('touchcancel', onRelease)
      img.style.transform = ''
      img.style.transition = ''
      img.style.transformOrigin = ''
    }
  }, [cols])

  const gradient = `linear-gradient(160deg, ${event.color1} 0%, ${event.color2} 100%)`
  const dimmed   = activeFilter !== 'All' && !matches

  // ── 1-col: snap card fills viewport height, image takes flex-1 ───────
  if (cols === 1) {
    return (
      <div
        ref={cardRef}
        onClick={handleTap}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          scrollSnapAlign: 'start',
          opacity: dimmed ? 0.18 : 1,
          filter: dimmed ? 'grayscale(0.5)' : 'none',
          transition: 'opacity 0.25s ease, filter 0.25s ease',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Image — fills remaining height, contain for full artwork */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {event.poster_url ? (
            <img
              ref={imgRef}
              src={event.poster_url}
              alt={event.title}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: gradient }} />
          )}
          {/* No heart overlay at 1-col — it lives in the info bar instead */}
        </div>

        <InfoBar event={event} cols={1} />
      </div>
    )
  }

  // ── 2-5 col: 2:3 image + info bar below ──────────────────────────────
  return (
    <div
      onClick={handleTap}
      style={{
        display: 'flex',
        flexDirection: 'column',
        opacity: dimmed ? 0.18 : 1,
        filter: dimmed ? 'grayscale(0.5)' : 'none',
        transition: 'opacity 0.25s ease, filter 0.25s ease',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Image — fixed 2:3 aspect ratio, no text overlay */}
      <div style={{ aspectRatio: '2/3', position: 'relative', overflow: 'hidden' }}>
        {event.poster_url ? (
          <img
            src={event.poster_url}
            alt={event.title}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: gradient }} />
        )}
        {/* Heart overlay only at 2-3 col; hidden at 4-5 col (too small) */}
        {cols <= 3 && <HeartPill count={event.like_count} />}
      </div>

      <InfoBar event={event} cols={cols} />
    </div>
  )
}
