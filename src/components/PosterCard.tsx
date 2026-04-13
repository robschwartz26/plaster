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
  const imgRef = useRef<HTMLImageElement>(null)
  const peekActive = useRef(false)
  const peekStartDist = useRef(0)

  useEffect(() => {
    if (cols !== 1) return
    const card = cardRef.current
    const img = imgRef.current
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
      img.style.transformOrigin = `${((midX - rect.left) / rect.width) * 100}% ${((midY - rect.top) / rect.height) * 100}%`
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
    card.addEventListener('touchmove', onTouchMove, { passive: false })
    card.addEventListener('touchend', onRelease)
    card.addEventListener('touchcancel', onRelease)
    return () => {
      card.removeEventListener('touchstart', onTouchStart)
      card.removeEventListener('touchmove', onTouchMove)
      card.removeEventListener('touchend', onRelease)
      card.removeEventListener('touchcancel', onRelease)
      img.style.transform = ''
      img.style.transition = ''
      img.style.transformOrigin = ''
    }
  }, [cols])

  const gradient = `linear-gradient(160deg, ${event.color1} 0%, ${event.color2} 100%)`
  const dimmed = activeFilter !== 'All' && !matches

  // ── 1-col: full-height letterboxed card, snaps to viewport ─────────
  if (cols === 1) {
    return (
      <div
        ref={cardRef}
        onClick={handleTap}
        className="relative overflow-hidden cursor-pointer select-none"
        style={{
          // Direct child of scroll container → height: 100% = container's clientHeight
          height: '100%',
          background: '#0c0b0b',
          scrollSnapAlign: 'start',
          opacity: dimmed ? 0.18 : 1,
          filter: dimmed ? 'grayscale(0.5)' : 'none',
          transition: 'opacity 0.25s ease, filter 0.25s ease',
        }}
      >
        {/* Poster image — contain keeps full artwork visible, letterbox = #0c0b0b bg */}
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
        {/* No text overlays in 1-col — artwork shown clean, info lives in the date bar */}
      </div>
    )
  }

  // ── 2-5 col: fixed 2:3 grid cell ────────────────────────────────────
  const titleSize = cols === 2 ? 13 : cols === 3 ? 10 : cols === 4 ? 8 : 0
  const showMeta = cols === 2
  const showTitle = cols <= 4

  return (
    <div
      onClick={handleTap}
      className="relative overflow-hidden cursor-pointer select-none"
      style={{
        aspectRatio: '2/3',
        opacity: dimmed ? 0.18 : 1,
        filter: dimmed ? 'grayscale(0.5)' : 'none',
        transition: 'opacity 0.25s ease, filter 0.25s ease',
      }}
    >
      {event.poster_url ? (
        <img
          src={event.poster_url}
          alt={event.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: gradient }} />
      )}

      {/* Centered watermark — cols 3–4 */}
      {showTitle && cols >= 3 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-1 gap-0.5">
          <span
            className="font-body font-medium text-center uppercase"
            style={{ fontSize: 7, letterSpacing: '0.1em', color: 'rgba(240,236,227,0.45)' }}
          >
            {event.venue_name}
          </span>
          <div className="w-6 border-t border-white/20 my-0.5" />
          <span
            className="font-display font-bold text-center leading-tight"
            style={{ fontSize: titleSize, color: 'rgba(240,236,227,0.85)' }}
          >
            {event.title}
          </span>
        </div>
      )}

      {/* Bottom scrim + meta — col 2 only */}
      {showMeta && (
        <>
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: '60%',
              background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3 gap-1">
            <span
              className="font-body font-medium uppercase text-center"
              style={{ fontSize: 8, letterSpacing: '0.12em', color: 'rgba(240,236,227,0.4)' }}
            >
              {event.venue_name}
            </span>
            <div className="border-t border-white/20" style={{ width: 28 }} />
            <span
              className="font-display font-bold text-center leading-tight"
              style={{ fontSize: titleSize, color: 'rgba(240,236,227,0.9)' }}
            >
              {event.title}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
            <div
              className="font-body font-medium truncate"
              style={{ fontSize: 8, letterSpacing: '0.04em', color: 'rgba(240,236,227,0.55)' }}
            >
              {event.venue_name}
            </div>
            <div
              className="font-display font-bold leading-tight truncate"
              style={{ fontSize: 13, color: '#f0ece3' }}
            >
              {event.title}
            </div>
            <div className="font-body" style={{ fontSize: 9, color: 'rgba(240,236,227,0.6)' }}>
              {formatTime(event.starts_at)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
