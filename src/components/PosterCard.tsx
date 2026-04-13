import { useRef } from 'react'
import { type WallEvent } from '@/types/event'

interface Props {
  event: WallEvent
  cols: number
  activeFilter: string
  onDoubleTap: (event: WallEvent) => void
}

function matchesFilter(event: WallEvent, filter: string, today: string): boolean {
  if (filter === 'All') return true
  if (filter === 'Tonight') return event.starts_at.slice(0, 10) === today
  return event.category === filter
}

// ── Heart pill — top-right overlay on the image ───────────────
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
        color: 'var(--fg)',
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

export function PosterCard({ event, cols, activeFilter, onDoubleTap }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const matches = matchesFilter(event, activeFilter, today)

  // Double-tap detection
  const lastTap = useRef(0)
  const handleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) onDoubleTap(event)
    lastTap.current = now
  }

  // Peek zoom is handled by PosterGrid's pinch handler, which queries
  // the img element directly. No listeners needed here.

  const gradient = `linear-gradient(160deg, ${event.color1} 0%, ${event.color2} 100%)`
  const dimmed   = activeFilter !== 'All' && !matches

  // ── 1-col: full-height snap card, completely clean ────────────
  if (cols === 1) {
    return (
      <div
        onClick={handleTap}
        style={{
          height: '100%',
          background: 'var(--bg)',
          scrollSnapAlign: 'start',
          opacity: dimmed ? 0.18 : 1,
          filter: dimmed ? 'grayscale(0.5)' : 'none',
          transition: 'opacity 0.25s ease, filter 0.25s ease',
          cursor: 'pointer',
          userSelect: 'none',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {event.poster_url ? (
          <img
            src={event.poster_url}
            alt={event.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: gradient }} />
        )}
        {/* No overlays — poster speaks for itself */}
      </div>
    )
  }

  // ── 2-5 col: 2:3 image, heart pill only ──────────────────────
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
      }}
    >
      {event.poster_url ? (
        <img
          src={event.poster_url}
          alt={event.title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: gradient }} />
      )}
      <HeartPill count={event.like_count} />
    </div>
  )
}
