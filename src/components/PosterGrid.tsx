import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { type WallEvent } from '@/types/event'
import { PosterCard } from './PosterCard'
import { DateIndicator } from './DateIndicator'

const IS_DEV = import.meta.env.DEV
const GAP = 2 // px, must match grid gap below

function groupByDay(events: WallEvent[]): Map<string, WallEvent[]> {
  const map = new Map<string, WallEvent[]>()
  for (const e of events) {
    const day = e.starts_at.slice(0, 10)
    const list = map.get(day) ?? []
    list.push(e)
    map.set(day, list)
  }
  return map
}

function uniqueDays(events: WallEvent[]): string[] {
  return [...new Set(events.map((e) => e.starts_at.slice(0, 10)))].sort()
}

interface Props {
  events: WallEvent[]
  activeFilter: string
  today: string
  onDayChange: (day: string) => void
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export function PosterGrid({ events, activeFilter, today, onDayChange }: Props) {
  const [cols, setCols] = useState(2)
  const [activeDay, setActiveDay] = useState<string>(today)
  const containerRef = useRef<HTMLDivElement>(null)
  const pinchRef = useRef({ active: false, startDist: 0, startCols: 2 })

  const days = useMemo(() => uniqueDays(events), [events])
  const grouped = useMemo(() => groupByDay(events), [events])

  // Flat ordered event list — no day breaks in the grid
  const allEvents = useMemo(
    () => days.flatMap((day) => grouped.get(day) ?? []),
    [days, grouped],
  )

  // Map event id → day string for scroll tracking
  const eventDayMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const day of days) {
      for (const ev of grouped.get(day) ?? []) {
        m.set(ev.id, day)
      }
    }
    return m
  }, [days, grouped])

  // ── Pinch to zoom ──────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // In 1-col mode, PosterCard owns the 2-finger gesture (peek zoom).
        // Don't intercept it here — just let it bubble through.
        if (cols === 1) return
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = {
          active: true,
          startDist: Math.sqrt(dx * dx + dy * dy),
          startCols: cols,
        }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length < 2) return
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = pinchRef.current.startDist / dist
      const newCols = clamp(Math.round(pinchRef.current.startCols * ratio), 1, 5)
      setCols(newCols)
    }
    const onTouchEnd = () => {
      pinchRef.current.active = false
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [cols])

  // ── Ctrl+scroll on desktop simulates pinch ─────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setCols((c) => clamp(c + (e.deltaY > 0 ? 1 : -1), 1, 5))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Scroll tracking → active day (math-based, no DOM markers) ──
  // Cell height = cellWidth × (3/2) because aspect-ratio is 2/3 (w:h = 2:3).
  // cellWidth = (containerWidth - gap × (cols-1)) / cols
  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container || allEvents.length === 0) return

    const { scrollTop, clientHeight, clientWidth } = container
    const cellWidth = (clientWidth - GAP * (cols - 1)) / cols
    const cellHeight = cellWidth * (3 / 2)
    const rowHeight = cellHeight + GAP

    const centerY = scrollTop + clientHeight / 2
    const centerRow = Math.floor(centerY / rowHeight)
    const centerIndex = clamp(centerRow * cols, 0, allEvents.length - 1)

    const ev = allEvents[centerIndex]
    if (!ev) return
    const day = eventDayMap.get(ev.id) ?? days[0]

    if (day !== activeDay) {
      setActiveDay(day)
      onDayChange(day)
    }
  }, [allEvents, eventDayMap, days, cols, activeDay, onDayChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // ── Double tap handler ─────────────────────────────────────────
  const handleDoubleTap = (event: WallEvent) => {
    console.log('double-tap:', event.title)
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: GAP,
    transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* Sticky date indicator */}
      <div className="sticky top-0 z-10" style={{ background: '#0c0b0b' }}>
        <DateIndicator activeDay={activeDay} today={today} />
      </div>

      {/* DEV column cycle button */}
      {IS_DEV && (
        <button
          onClick={() => setCols((c) => (c % 5) + 1)}
          className="fixed bottom-20 right-4 z-50 font-body font-bold"
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            background: 'rgba(240,236,227,0.12)',
            border: '1px solid rgba(240,236,227,0.3)',
            color: '#f0ece3',
            padding: '6px 10px',
            borderRadius: 4,
          }}
        >
          {cols}COL
        </button>
      )}

      {/* Scrollable grid — flat event list, no day-break rows */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scroll-momentum"
        style={{ overscrollBehavior: 'none' }}
      >
        <div style={gridStyle}>
          {allEvents.map((event) => (
            <PosterCard
              key={event.id}
              event={event}
              cols={cols}
              activeFilter={activeFilter}
              onDoubleTap={handleDoubleTap}
            />
          ))}
          {/* Bottom spacer — full row, pushes content above nav bar */}
          <div style={{ gridColumn: '1 / -1', height: 'var(--nav-height)' }} />
        </div>
      </div>
    </div>
  )
}
