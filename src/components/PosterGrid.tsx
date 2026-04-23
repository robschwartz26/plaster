import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { type WallEvent } from '@/types/event'
import { PosterCard } from './PosterCard'
import { DatePoster } from './DatePoster'
import { DateIndicator, type EventInfo } from './DateIndicator'

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
  onDayChange: (day: string) => void
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

export function PosterGrid({ events, activeFilter, today, likedIds, onDayChange, onLike, onVenueTap, isAdminMode, onEventSaved, prevUrlMap, onUndoCrop, onConfirmCrop, onActiveCategoryChange, openEventId, onOpenEventHandled }: Props) {
  const [cols, setCols] = useState(5)
  const [activeDay, setActiveDay] = useState<string>(today)
  const activeDayRef = useRef(activeDay)
  useEffect(() => { activeDayRef.current = activeDay }, [activeDay])
  const [activeEventIdx, setActiveEventIdx] = useState(0)
  const [atDatePoster, setAtDatePoster] = useState<{ month: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollEndFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const eventDayMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const day of days) {
      for (const ev of grouped.get(day) ?? []) m.set(ev.id, day)
    }
    return m
  }, [days, grouped])

  // Reset activeDay to days[0] when the filtered event set changes (filter chip change,
  // initial load, or scroll back to top where days[0] is already activeDay).
  useEffect(() => {
    if (days.length === 0) return
    if (!days.includes(activeDay)) setActiveDay(days[0])
  }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // walledItems index → allEvents index (nearest poster at or before that position)
  const walledIdxToEventIdx = useMemo(() => {
    const result: number[] = []
    let last = 0
    for (const item of walledItems) {
      if (item.type === 'poster') last = item.eventIdx
      result.push(last)
    }
    return result
  }, [walledItems])

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
  // Spreading (ratio < 1) → fewer cols or peek zoom if already at 1.
  // Pinching in (ratio > 1) → more cols; cancels any active peek zoom.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const t0 = e.touches[0], t1 = e.touches[1]
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
      const currentCols = colsRef.current

      // In 1-col mode, grab the visible card's img for potential peek zoom
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
      // ratio > 1: pinching in (more cols). ratio < 1: spreading (fewer cols / peek)
      const ratio = p.startDist / dist
      const newCols = clamp(Math.round(p.startCols * ratio), 1, 5)

      if (newCols !== p.startCols) {
        // Col change — cancel peek zoom and drop the stale img ref
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
        // Still at 1-col — peek zoom on the active poster
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

  // ── Compute active day from current scroll position ───────────────
  const computeActiveDay = useCallback(() => {
    const container = containerRef.current
    if (!container || walledItems.length === 0) return

    const { scrollTop, clientHeight, clientWidth } = container

    if (cols === 1) {
      const wi = clamp(Math.floor(scrollTop / clientHeight), 0, walledItems.length - 1)
      const eventIdx = walledIdxToEventIdx[wi] ?? 0
      const ev = allEvents[eventIdx]
      if (!ev) return
      const day = eventDayMap.get(ev.id) ?? days[0]
      if (day !== activeDayRef.current) { setActiveDay(day); onDayChange(day) }
    } else {
      const cellWidth = (clientWidth - GAP * (cols - 1)) / cols
      const rowHeight = cellWidth * 1.5 + GAP
      const totalRows = Math.ceil(walledItems.length / cols)
      const dominantRow = clamp(
        Math.floor((scrollTop + rowHeight / 2) / rowHeight),
        0,
        totalRows - 1,
      )

      const rowStart = dominantRow * cols
      const rowEnd = Math.min(rowStart + cols, walledItems.length)
      const rowItems = walledItems.slice(rowStart, rowEnd)

      const eventDays = rowItems
        .filter((item): item is Extract<WallItem, { type: 'poster' }> => item.type === 'poster')
        .map(item => eventDayMap.get(item.event.id))
        .filter((d): d is string => !!d)

      if (eventDays.length === 0) return
      const latestDay = [...eventDays].sort().at(-1)!
      if (latestDay !== activeDayRef.current) { setActiveDay(latestDay); onDayChange(latestDay) }
    }
  }, [walledItems, walledIdxToEventIdx, allEvents, eventDayMap, days, cols])

  // ── Scroll → active day + 1-col-specific state ────────────────────
  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container || walledItems.length === 0) return

    if (cols === 1) {
      const { scrollTop, clientHeight } = container
      const wi = clamp(Math.floor(scrollTop / clientHeight), 0, walledItems.length - 1)
      setActiveEventIdx(walledIdxToEventIdx[wi] ?? 0)
      const topItem = walledItems[wi]
      if (topItem?.type === 'date-poster') {
        setAtDatePoster({ month: parseInt(topItem.date.split('-')[1], 10) })
      } else {
        setAtDatePoster(null)
      }
    }

    computeActiveDay()

    // Fallback for browsers/OS versions where scrollend doesn't fire (iOS 17 and older).
    // Clears on every scroll event and re-sets, so it only fires once motion stops.
    if (scrollEndFallbackRef.current) clearTimeout(scrollEndFallbackRef.current)
    scrollEndFallbackRef.current = setTimeout(computeActiveDay, 150)
  }, [walledItems, walledIdxToEventIdx, cols, computeActiveDay])

  // ── Sync activeDay on mount and when layout/events change ─────────
  useEffect(() => {
    computeActiveDay()
  }, [cols, walledItems.length, allEvents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    el.addEventListener('scrollend', computeActiveDay)
    return () => {
      el.removeEventListener('scroll', handleScroll)
      el.removeEventListener('scrollend', computeActiveDay)
      if (scrollEndFallbackRef.current) clearTimeout(scrollEndFallbackRef.current)
    }
  }, [handleScroll, computeActiveDay])

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

  // Clear date-poster overlay state when leaving 1-col view.
  useEffect(() => {
    if (cols !== 1) setAtDatePoster(null)
  }, [cols])

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

  // In 1-col snap mode, show the current poster's details in the date bar
  const eventInfo: EventInfo | null =
    cols === 1 && !atDatePoster && allEvents[activeEventIdx]
      ? {
          id: allEvents[activeEventIdx].id,
          title: allEvents[activeEventIdx].title,
          venue: allEvents[activeEventIdx].venue_name,
          venue_id: allEvents[activeEventIdx].venue_id,
          startsAt: allEvents[activeEventIdx].starts_at,
          likeCount: allEvents[activeEventIdx].like_count,
          viewCount: allEvents[activeEventIdx].view_count,
        }
      : null

  // Notify parent of the active poster's category (1-col only; null otherwise)
  const onActiveCategoryChangeRef = useRef(onActiveCategoryChange)
  onActiveCategoryChangeRef.current = onActiveCategoryChange
  useEffect(() => {
    const category = cols === 1 ? (allEvents[activeEventIdx]?.category ?? null) : null
    onActiveCategoryChangeRef.current?.(category)
  }, [cols, activeEventIdx, allEvents])

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
        <DateIndicator activeDay={activeDay} today={today} eventInfo={eventInfo} onVenueTap={onVenueTap} atDatePoster={atDatePoster} />
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
          // 1-col: snap poster-by-poster. 2-5 col: free scroll.
          scrollSnapType: cols === 1 ? 'y mandatory' : 'none',
        }}
      >
        {cols === 1 ? (
          // ── 1-col ─────────────────────────────────────────────────
          // Cards are direct children of the scroll container.
          // height: 100% = the container's clientHeight exactly.
          // No grid wrapper — avoids the auto-height problem.
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
