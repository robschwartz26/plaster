import { useRef } from 'react'
import { type Event } from '@/data/mockEvents'

interface Props {
  event: Event
  cols: number
  activeFilter: string
  onDoubleTap: (event: Event) => void
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function matchesFilter(event: Event, filter: string, today: string): boolean {
  if (filter === 'All') return true
  if (filter === 'Tonight') return event.starts_at.slice(0, 10) === today
  return event.category === filter
}

export function PosterCard({ event, cols, activeFilter, onDoubleTap }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const matches = matchesFilter(event, activeFilter, today)

  // Title sizing by column count
  const titleSize =
    cols === 1 ? 20 :
    cols === 2 ? 13 :
    cols === 3 ? 10 :
    cols === 4 ? 8 : 0

  const showMeta = cols <= 2
  const showTitle = cols <= 4

  // Double-tap detection
  const lastTap = useRef(0)
  const handleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      onDoubleTap(event)
    }
    lastTap.current = now
  }

  return (
    <div
      onClick={handleTap}
      className="relative overflow-hidden cursor-pointer select-none"
      style={{
        aspectRatio: '2/3',
        opacity: activeFilter === 'All' ? 1 : matches ? 1 : 0.18,
        filter: activeFilter === 'All' ? 'none' : matches ? 'none' : 'grayscale(0.5)',
        transition: 'opacity 0.25s ease, filter 0.25s ease',
      }}
    >
      {/* Gradient background / poster art area */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, ${event.color1} 0%, ${event.color2} 100%)`,
        }}
      />

      {/* Centered venue + title watermark (art area) */}
      {showTitle && cols >= 3 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-1 gap-0.5">
          <span
            className="font-body font-medium text-center uppercase"
            style={{
              fontSize: 7,
              letterSpacing: '0.1em',
              color: 'rgba(240,236,227,0.45)',
            }}
          >
            {event.venue_name}
          </span>
          <div className="w-6 border-t border-white/20 my-0.5" />
          <span
            className="font-display font-bold text-center leading-tight"
            style={{
              fontSize: titleSize,
              color: 'rgba(240,236,227,0.85)',
            }}
          >
            {event.title}
          </span>
        </div>
      )}

      {/* Bottom gradient overlay */}
      {showMeta && (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: '60%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
          }}
        />
      )}

      {/* 1–2 col: full art-area watermark in center */}
      {showTitle && cols <= 2 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 gap-1">
          <span
            className="font-body font-medium uppercase text-center"
            style={{
              fontSize: cols === 1 ? 10 : 8,
              letterSpacing: '0.12em',
              color: 'rgba(240,236,227,0.4)',
            }}
          >
            {event.venue_name}
          </span>
          <div
            className="border-t border-white/20"
            style={{ width: cols === 1 ? 48 : 28 }}
          />
          <span
            className="font-display font-bold text-center leading-tight"
            style={{
              fontSize: titleSize,
              color: 'rgba(240,236,227,0.9)',
            }}
          >
            {event.title}
          </span>
        </div>
      )}

      {/* Meta bottom-left */}
      {showMeta && (
        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
          <div
            className="font-body font-medium truncate"
            style={{
              fontSize: cols === 1 ? 10 : 8,
              letterSpacing: '0.04em',
              color: 'rgba(240,236,227,0.55)',
            }}
          >
            {event.venue_name}
          </div>
          <div
            className="font-display font-bold leading-tight truncate"
            style={{ fontSize: cols === 1 ? 20 : 13, color: '#f0ece3' }}
          >
            {event.title}
          </div>
          <div
            className="font-body"
            style={{
              fontSize: cols === 1 ? 12 : 9,
              color: 'rgba(240,236,227,0.6)',
            }}
          >
            {formatTime(event.starts_at)}
          </div>
        </div>
      )}
    </div>
  )
}
