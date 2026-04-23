import { useRef, useState, useEffect, useMemo } from 'react'
import { type WallEvent } from '@/types/event'
import { PosterCard } from './PosterCard'
import { DatePoster } from './DatePoster'
import { DateIndicator, type EventInfo } from './DateIndicator'
import { useDateIndicator } from '@/hooks/useDateIndicator'

type WallItem =
  | { type: 'poster'; event: WallEvent; eventIdx: number }
  | { type: 'date-poster'; date: string }

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
  likedIds: Set<string>
  onLike: (eventId: string) => void
  onVenueTap?: (venueId: string) => void
  isAdminMode?: boolean
  onEventSaved?: (eventId: string, newPosterUrl?: string) => void
  prevUrlMap?: Record<string, string>
  onUndoCrop?: (eventId: string) => void
  onConfirmCrop?: (eventId: string) => void
  onActiveCategoryChange?: (category: string | null) => void
  openEventId?: string | null
  onOpenEventHandled?: () => void
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export function PosterGrid({ events, activeFilter, today, likedIds, onLike, onVenueTap, isAdminMode, onEventSaved, prevUrlMap, onUndoCrop, onConfirmCrop, onActiveCategoryChange, openEventId, onOpenEventHandled }: Props) {
  const [cols, setCols] = useState(5)
  const containerRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef(cols)
  colsRef.current = cols // always current — no stale closure on the listener
  const pinchRef = useRef<{
    active: boolean
    startDist: number
    startCols: number
    peekImg: HTMLImageElement | null
    peeking: boolean
  }>({ active: false, startDist: 0, startCols: 2, peekImg: null, peeking: false })

  const days = useMemo(() => uniqueDays(events), [events])
  const grouped = useMemo(() => groupByDay(events), [events])

  const allEvents = useMemo(
    () => days.flatMap((day) => grouped.get(day) ?? []),
    [days, grouped],
  )

  const walledItems = useMemo<WallItem[]>(() => {
    const items: WallItem[] = []
    allEvents.forEach((event, i) => {
      const currDate = event.starts_at.slice(0, 10)
      const prevDate = i > 0 ? allEvents[i - 1].starts_at.slice(0, 10) : null
      if (prevDate && prevDate !== currDate) {
        items.push({ type: 'date-poster', date: currDate })
      }
      items.push({ type: 'poster', event, eventIdx: i })
    })
    return items
  }, [allEvents])

  // event id → walledItems index (for scroll-to on double-tap / openEventId)
  const eventIdToWalledIdx = useMemo(() => {
    const m = new Map<string, number>()
    walledItems.forEach((item, wi) => {
      if (item.type === 'poster') m.set(item.event.id, wi)
    })
    return m
  }, [walledItems])

  // ── Pinch → column count at all col counts + peek zoom at 1-col ───────
  // Registered once ([] deps). colsRef.current always reflects latest cols.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const t0 = e.touches[0], t1 = e.touches[1]
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
      const currentCols = colsRef.current

      let peekImg: HTMLImageElement | null = null
      if (currentCols === 1) {
        const idx = Math.round(el.scrollTop / el.clientHeight)
        const card = el.children[idx] as HTMLElement | undefined
        peekImg = card?.querySelector('img') ?? null
        if (peekImg) {
          const rect = peekImg.getBoundingClientRect()
          const midX = (t0.clientX + t1.clientX) / 2
          const midY = (t0.clientY + t1.clientY) / 2
          peekImg.style.transformOrigin =
            `${((midX - rect.left) / rect.width) * 100}% ${((midY - rect.top) / rect.height) * 100}%`
          peekImg.style.transition = 'none'
        }
      }

      pinchRef.current = { active: true, startDist: dist, startCols: currentCols, peekImg, peeking: false }
    }

    const onTouchMove = (e: TouchEvent) => {
      const p = pinchRef.current
      if (!p.active || e.touches.length < 2) return
      e.preventDefault()
      const t0 = e.touches[0], t1 = e.touches[1]
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
      const ratio = p.startDist / dist
      const newCols = clamp(Math.round(p.startCols * ratio), 1, 5)

      if (newCols !== p.startCols) {
        if (p.peekImg) {
          if (p.peeking) {
            p.peekImg.style.transition = 'transform 0.2s ease'
            p.peekImg.style.transform = 'scale(1)'
          }
          p.peekImg = null
          p.peeking = false
        }
        setCols(newCols)
      } else if (p.startCols === 1 && p.peekImg) {
        const scale = Math.min(3, Math.max(1, dist / p.startDist))
        p.peekImg.style.transform = `scale(${scale})`
        p.peeking = scale > 1
      }
    }

    const onTouchEnd = () => {
      const p = pinchRef.current
      if (p.peekImg && p.peeking) {
        p.peekImg.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
        p.peekImg.style.transform = 'scale(1)'
      }
      pinchRef.current = { ...pinchRef.current, active: false, peeking: false, peekImg: null }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── DOM-reading date indicator — replaces all state-sync date tracking ──
  const dateIndicator = useDateIndicator(containerRef, cols, walledItems.length)

  // Derive the full event object for event-info mode
  const activeEvent = useMemo(
    () => dateIndicator.mode === 'event-info' && dateIndicator.eventId
      ? (allEvents.find(e => e.id === dateIndicator.eventId) ?? null)
      : null,
    [dateIndicator.mode, dateIndicator.eventId, allEvents],
  )

  // Precomputed once per eventId change — avoids O(n²) per-card findIndex in 1-col render
  const activeEventIdx = useMemo(
    () => dateIndicator.eventId
      ? allEvents.findIndex(e => e.id === dateIndicator.eventId)
      : -1,
    [dateIndicator.eventId, allEvents],
  )

  const eventInfo: EventInfo | null = activeEvent ? {
    id: activeEvent.id,
    title: activeEvent.title,
    venue: activeEvent.venue_name,
    venue_id: activeEvent.venue_id,
    startsAt: activeEvent.starts_at,
    likeCount: activeEvent.like_count,
    viewCount: activeEvent.view_count,
  } : null

  // Notify parent of the active poster's category (1-col only; null otherwise)
  const onActiveCategoryChangeRef = useRef(onActiveCategoryChange)
  onActiveCategoryChangeRef.current = onActiveCategoryChange
  useEffect(() => {
    onActiveCategoryChangeRef.current?.(activeEvent?.category ?? null)
  }, [activeEvent])

  // ── Double-tap (2-5 col): zoom to 1-col centered on tapped card ───────
  const pendingScrollIdxRef = useRef<number | null>(null)

  function handleDoubleTap(event: WallEvent) {
    const wi = eventIdToWalledIdx.get(event.id)
    if (wi === undefined) return
    pendingScrollIdxRef.current = wi
    setCols(1)
  }

  // Open a specific event in 1-col mode (e.g. tapped from Map panel).
  useEffect(() => {
    if (!openEventId || walledItems.length === 0) return
    const wi = eventIdToWalledIdx.get(openEventId)
    if (wi === undefined) return
    pendingScrollIdxRef.current = wi
    setCols(1)
    onOpenEventHandled?.()
  }, [openEventId, walledItems]) // eslint-disable-line react-hooks/exhaustive-deps

  // After cols snaps to 1 and the DOM re-renders, scroll to the tapped card.
  // rAF ensures the 1-col card heights are painted before we set scrollTop.
  useEffect(() => {
    if (cols !== 1 || pendingScrollIdxRef.current === null) return
    const idx = pendingScrollIdxRef.current
    pendingScrollIdxRef.current = null
    const container = containerRef.current
    if (!container) return
    requestAnimationFrame(() => {
      container.scrollTop = idx * container.clientHeight
    })
  }, [cols])

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: GAP,
    transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* Date indicator — sticky above scroll area */}
      <div className="shrink-0 z-10" style={{ background: 'var(--bg)' }}>
        <DateIndicator
          mode={dateIndicator.mode}
          day={dateIndicator.day}
          eventInfo={eventInfo}
          datePosterMonth={dateIndicator.datePosterMonth}
          today={today}
          onVenueTap={onVenueTap}
        />
      </div>

      {IS_DEV && (
        <button
          onClick={() => setCols((c) => (c % 5) + 1)}
          className="fixed bottom-20 right-4 z-50 font-body font-bold"
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            background: 'var(--fg-08)',
            border: '1px solid var(--fg-25)',
            color: 'var(--fg)',
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
          scrollSnapType: cols === 1 ? 'y mandatory' : 'none',
        }}
      >
        {cols === 1 ? (
          // ── 1-col ─────────────────────────────────────────────────
          walledItems.map((item) => {
            if (item.type === 'date-poster') {
              return (
                <div key={`d-${item.date}`} style={{ height: '100%', flexShrink: 0, scrollSnapAlign: 'start' }}>
                  <DatePoster date={item.date} />
                </div>
              )
            }
            const { event, eventIdx } = item
            return (
              <PosterCard
                key={`p-${event.id}`}
                event={event}
                cols={1}
                activeFilter={activeFilter}
                isLiked={likedIds.has(event.id)}
                isActive={eventIdx === activeEventIdx}
                onLike={onLike}
                isAdminMode={isAdminMode}
                onEventSaved={onEventSaved}
                previousPosterUrl={prevUrlMap?.[event.id]}
                onUndoCrop={onUndoCrop ? () => onUndoCrop(event.id) : undefined}
                onConfirmCrop={onConfirmCrop ? () => onConfirmCrop(event.id) : undefined}
              />
            )
          })
        ) : (
          // ── 2-5 col ───────────────────────────────────────────────
          <div style={gridStyle}>
            {walledItems.map((item) => {
              if (item.type === 'date-poster') {
                return <DatePoster key={`d-${item.date}`} date={item.date} />
              }
              const { event } = item
              return (
                <PosterCard
                  key={`p-${event.id}`}
                  event={event}
                  cols={cols}
                  activeFilter={activeFilter}
                  isLiked={likedIds.has(event.id)}
                  onDoubleTap={handleDoubleTap}
                  onLike={onLike}
                  isAdminMode={isAdminMode}
                  onEventSaved={onEventSaved}
                />
              )
            })}
            <div style={{ gridColumn: '1 / -1', height: 'var(--nav-height)' }} />
          </div>
        )}
      </div>
    </div>
  )
}
