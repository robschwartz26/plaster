import { useRef, useState, useEffect, useCallback } from 'react'
import { type Event, groupByDay, uniqueDays } from '@/data/mockEvents'
import { PosterCard } from './PosterCard'
import { DateIndicator } from './DateIndicator'

const IS_DEV = import.meta.env.DEV

interface Props {
  events: Event[]
  activeFilter: string
  today: string
  onDayChange: (day: string) => void
}

// Clamp column count 1–5
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export function PosterGrid({ events, activeFilter, today, onDayChange }: Props) {
  const [cols, setCols] = useState(2)
  const [activeDay, setActiveDay] = useState<string>(today)
  const containerRef = useRef<HTMLDivElement>(null)
  const dayMarkerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pinchRef = useRef({ active: false, startDist: 0, startCols: 2 })

  const days = uniqueDays(events)
  const grouped = groupByDay(events)

  // ── Pinch to zoom ──────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
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
      const ratio = pinchRef.current.startDist / dist // pinch-out → smaller ratio → fewer cols
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

  // ── Scroll tracking → active day ──────────────────────────────
  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const centerY = container.scrollTop + container.clientHeight / 2

    let closestDay = days[0]
    let closestDist = Infinity

    for (const [day, ref] of dayMarkerRefs.current) {
      const markerTop = ref.offsetTop
      const dist = Math.abs(markerTop - centerY)
      if (dist < closestDist) {
        closestDist = dist
        closestDay = day
      }
    }

    if (closestDay !== activeDay) {
      setActiveDay(closestDay)
      onDayChange(closestDay)
    }
  }, [days, activeDay, onDayChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // ── Double tap handler ─────────────────────────────────────────
  const handleDoubleTap = (event: Event) => {
    // Shell — full implementation session 2
    console.log('double-tap:', event.title)
  }

  const gridColsStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 2,
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

      {/* Scrollable grid */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scroll-momentum"
        style={{ overscrollBehavior: 'none' }}
      >
        <div style={gridColsStyle}>
          {days.map((day) => {
            const dayEvents = grouped.get(day) ?? []
            return (
  <div key={`group-${day}`} style={{ display: 'contents' }}>
                {/* Invisible day marker — height 0, full row */}
                <div
                  ref={(el) => {
                    if (el) dayMarkerRefs.current.set(day, el)
                    else dayMarkerRefs.current.delete(day)
                  }}
                  style={{ gridColumn: '1 / -1', height: 0 }}
                />
                {dayEvents.map((event) => (
                  <PosterCard
                    key={event.id}
                    event={event}
                    cols={cols}
                    activeFilter={activeFilter}
                    onDoubleTap={handleDoubleTap}
                  />
                ))}
              </div>
            )
          })}
          {/* Bottom padding row */}
          <div style={{ gridColumn: '1 / -1', height: 'var(--nav-height)' }} />
        </div>
      </div>
    </div>
  )
}
