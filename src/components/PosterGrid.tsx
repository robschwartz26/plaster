import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { type WallEvent } from '@/types/event'
import { PosterCard } from './PosterCard'
import { DateIndicator, type EventInfo } from './DateIndicator'

const IS_DEV = import.meta.env.DEV
const GAP = 2 // px — only used in 2-5 col grid

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
  const [activeEventIdx, setActiveEventIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const pinchRef = useRef({ active: false, startDist: 0, startCols: 2 })

  const days = useMemo(() => uniqueDays(events), [events])
  const grouped = useMemo(() => groupByDay(events), [events])

  const allEvents = useMemo(
    () => days.flatMap((day) => grouped.get(day) ?? []),
    [days, grouped],
  )

  const eventDayMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const day of days) {
      for (const ev of grouped.get(day) ?? []) m.set(ev.id, day)
    }
    return m
  }, [days, grouped])

  // ── Pinch → column count (2-5 col only; 1-col cards own the gesture) ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      if (cols === 1) return // PosterCard handles peek zoom in 1-col
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchRef.current = {
        active: true,
        startDist: Math.sqrt(dx * dx + dy * dy),
        startCols: cols,
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length < 2) return
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = pinchRef.current.startDist / dist
      setCols(clamp(Math.round(pinchRef.current.startCols * ratio), 1, 5))
    }
    const onTouchEnd = () => { pinchRef.current.active = false }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [cols])

  // ── Ctrl+scroll simulates pinch on desktop ─────────────────────────
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

  // ── Scroll → active day ────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container || allEvents.length === 0) return

    const { scrollTop, clientHeight, clientWidth } = container
    let centerIndex: number

    if (cols === 1) {
      centerIndex = clamp(Math.round(scrollTop / clientHeight), 0, allEvents.length - 1)
      setActiveEventIdx(centerIndex)
    } else {
      const cellWidth = (clientWidth - GAP * (cols - 1)) / cols
      const rowHeight = cellWidth * 1.5 + GAP
      const centerRow = Math.floor((scrollTop + clientHeight / 2) / rowHeight)
      centerIndex = clamp(centerRow * cols, 0, allEvents.length - 1)
    }

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

  const handleDoubleTap = (event: WallEvent) => {
    console.log('double-tap:', event.title)
  }

  // In 1-col snap mode, show the current poster's details in the date bar
  const eventInfo: EventInfo | null =
    cols === 1 && allEvents[activeEventIdx]
      ? {
          id: allEvents[activeEventIdx].id,
          title: allEvents[activeEventIdx].title,
          venue: allEvents[activeEventIdx].venue_name,
          startsAt: allEvents[activeEventIdx].starts_at,
        }
      : null

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: GAP,
    transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* Date indicator — sticky above scroll area */}
      <div className="shrink-0 z-10" style={{ background: '#0c0b0b' }}>
        <DateIndicator activeDay={activeDay} today={today} eventInfo={eventInfo} />
      </div>

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

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scroll-momentum"
        style={{
          overscrollBehavior: 'none',
          // 1-col: snap poster-by-poster. 2-5 col: free scroll.
          scrollSnapType: cols === 1 ? 'y mandatory' : 'none',
        }}
      >
        {cols === 1 ? (
          // ── 1-col ─────────────────────────────────────────────────
          // Cards are direct children of the scroll container.
          // height: 100% = the container's clientHeight exactly.
          // No grid wrapper — avoids the auto-height problem.
          allEvents.map((event) => (
            <PosterCard
              key={event.id}
              event={event}
              cols={1}
              activeFilter={activeFilter}
              onDoubleTap={handleDoubleTap}
            />
          ))
        ) : (
          // ── 2-5 col ───────────────────────────────────────────────
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
            <div style={{ gridColumn: '1 / -1', height: 'var(--nav-height)' }} />
          </div>
        )}
      </div>
    </div>
  )
}
