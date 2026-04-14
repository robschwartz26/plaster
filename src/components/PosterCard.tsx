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

function matchesFilter(event: WallEvent, filter: string, isLiked: boolean): boolean {
  if (filter === 'All') return true
  if (filter === '♥') return isLiked
  return event.category === filter
}

// ── Heart pill — top-right overlay on the image ───────────────
// Uses SVG to avoid iOS emoji coercion of ♥ (U+2665) to red ❤️
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
        color: '#f0ece3', // always white — pill sits on dark blur overlay
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        userSelect: 'none',
        cursor: 'pointer',
      }}
    >
      <svg
        width="11"
        height="10"
        viewBox="0 0 24 22"
        fill={isLiked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
      </svg>
      {count}
    </div>
  )
}

export function PosterCard({ event, cols, activeFilter, isLiked, onDoubleTap, onLike }: Props) {
  const matches = matchesFilter(event, activeFilter, isLiked)

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
