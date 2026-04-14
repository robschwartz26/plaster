import { useRef } from 'react'
import { type WallEvent } from '@/types/event'

interface Props {
  event: WallEvent
  cols: number
  activeFilter: string
  isLiked: boolean
  onDoubleTap: (event: WallEvent) => void
  onLike: (eventId: string) => void
}

function matchesFilter(event: WallEvent, filter: string, today: string, isLiked: boolean): boolean {
  if (filter === 'All') return true
  if (filter === '♥') return isLiked
  if (filter === 'Tonight') return event.starts_at.slice(0, 10) === today
  return event.category === filter
}

// ── Heart pill — top-right overlay on the image ───────────────
function HeartPill({
  count, isLiked, onLike,
}: { count: number; isLiked: boolean; onLike: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onLike() }}
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
        color: isLiked ? '#ec4899' : 'var(--fg)',
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        userSelect: 'none',
        cursor: 'pointer',
        transition: 'color 150ms ease',
      }}
    >
      {isLiked ? '♥' : '♡'} {count}
    </div>
  )
}

export function PosterCard({ event, cols, activeFilter, isLiked, onDoubleTap, onLike }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const matches = matchesFilter(event, activeFilter, today, isLiked)

  // Double-tap detection
  const lastTap = useRef(0)
  const handleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) onDoubleTap(event)
    lastTap.current = now
  }

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

  // ── 2-5 col: 2:3 image, heart pill at 2-3 col ────────────────
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
      {cols <= 3 && (
        <HeartPill
          count={event.like_count}
          isLiked={isLiked}
          onLike={() => onLike(event.id)}
        />
      )}
    </div>
  )
}
