import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { type WallEvent } from '@/types/event'
import { PosterCard } from './PosterCard'
import { DatePoster } from './DatePoster'
import { DateIndicator, type EventInfo } from './DateIndicator'
import { eventLocalDate } from '@/lib/dates'
import { reportTourAction } from '@/lib/tourBus'

type WallItem =
  | { type: 'poster'; event: WallEvent; eventIdx: number }
  | { type: 'date-poster'; date: string }

const GAP = 2 // px — only used in 2-5 col grid

function groupByDay(events: WallEvent[]): Map<string, WallEvent[]> {
  const map = new Map<string, WallEvent[]>()
  for (const e of events) {
    const day = eventLocalDate(e.starts_at)
    const list = map.get(day) ?? []
    list.push(e)
    map.set(day, list)
  }
  return map
}

function uniqueDays(events: WallEvent[]): string[] {
  return [...new Set(events.map((e) => eventLocalDate(e.starts_at)))].sort()
}

interface Props {
  events: WallEvent[]
  activeFilter: string
  searchQuery?: string
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
  enableDesktopNav?: boolean
  onNearEnd?: () => void
  maxCols?: number // user pref: default AND ceiling for zoom-out (3-5)
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export function PosterGrid({ events, activeFilter, searchQuery = '', today, likedIds, onDayChange, onLike, onVenueTap, isAdminMode, onEventSaved, prevUrlMap, onUndoCrop, onConfirmCrop, onActiveCategoryChange, openEventId, onOpenEventHandled, enableDesktopNav, onNearEnd, maxCols = 5 }: Props) {
  const [cols, setCols] = useState(maxCols)
  // Back-to-top affordance: appears in multi-col after ~3s of stillness once
  // scrolled a few screens down; hides again the moment scrolling resumes.
  const [showBackToTop, setShowBackToTop] = useState(false)
  const showBackToTopRef = useRef(false)
  const backToTopStillnessRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tour freezes vertical scroll during anchored single-poster steps.
  const [scrollLocked, setScrollLocked] = useState(false)
  // Ref so the []-dep touch/wheel handlers always clamp to the current pref
  const maxColsRef = useRef(maxCols)
  useEffect(() => {
    maxColsRef.current = maxCols
    // Snap to the newly chosen size (not just clamp) — tapping "5 across"
    // with the prefs sheet open should visibly reflow the wall behind it.
    setCols(maxCols)
  }, [maxCols])
  const [activeDay, setActiveDay] = useState<string>(today)
  const activeDayRef = useRef(activeDay)
  useEffect(() => { activeDayRef.current = activeDay }, [activeDay])
  const [activeEventIdx, setActiveEventIdx] = useState(0)
  // Walled index at the top of the viewport, kept current on scroll — used to
  // re-anchor scroll when the column count changes (zoom) so the content stays put.
  const anchorWalledIdxRef = useRef(0)
  const [atDatePoster, setAtDatePoster] = useState<{ month: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Resting 1-col panel (0=poster, 1=info, 2=wall) — STATE, not a ref, so every
  // card re-renders pre-positioned on it and an incoming card never flashes its
  // poster. A card reports a settled swipe via onPanelSettled → setRestingPanel.
  // Per-instance state, so a second PosterGrid (e.g. StaffPreview) is independent
  // and a remount resets to poster automatically.
  const [restingPanel, setRestingPanel] = useState<0 | 1 | 2>(0)
  const scrollEndFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Near-end infinite-load trigger — kept in refs so the stable scroll handler reads
  // them fresh without re-registering. Cooldown throttles onNearEnd to ~2/sec.
  const onNearEndRef = useRef(onNearEnd)
  onNearEndRef.current = onNearEnd
  const nearEndCooldownRef = useRef(0)
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
      const currDate = eventLocalDate(event.starts_at)
      const prevDate = i > 0 ? eventLocalDate(allEvents[i - 1].starts_at) : null
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
      const newCols = clamp(Math.round(p.startCols * ratio), 1, maxColsRef.current)

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
        reportTourAction('pinch')
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
      setCols((c) => clamp(c + (e.deltaY > 0 ? 1 : -1), 1, maxColsRef.current))
      reportTourAction('pinch')
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Data refs — synced each render so stable callbacks always see fresh values ──
  // computeActiveDay and handleScroll read exclusively from these refs,
  // which lets both be useCallback([]) — stable forever, never causing
  // the scroll listener effect to re-register mid-scroll.
  const walledItemsRef = useRef(walledItems)
  const walledIdxToEventIdxRef = useRef(walledIdxToEventIdx)
  const allEventsRef = useRef(allEvents)
  const eventDayMapRef = useRef(eventDayMap)
  const daysRef = useRef(days)
  const eventIdToIdxRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    walledItemsRef.current = walledItems
    walledIdxToEventIdxRef.current = walledIdxToEventIdx
    allEventsRef.current = allEvents
    eventDayMapRef.current = eventDayMap
    daysRef.current = days
    const m = new Map<string, number>()
    allEvents.forEach((e, i) => m.set(e.id, i))
    eventIdToIdxRef.current = m
  }, [walledItems, walledIdxToEventIdx, allEvents, eventDayMap, days])

  // ── Active state from scroll position (day + 1-col poster + zoom anchor) ──
  // The single source of truth for everything derived from scroll position. It
  // reads container.scrollTop directly, so it's correct whenever it runs. It is
  // driven by a requestAnimationFrame loop (see below) rather than scroll events
  // because iOS WebKit throttles/drops scroll events — and IntersectionObserver
  // callbacks — during momentum, but never rAF. Empty deps; reads only refs.
  const computeActiveDay = useCallback(() => {
    const container = containerRef.current
    const walledItems = walledItemsRef.current
    if (!container || walledItems.length === 0) return
    const cols = colsRef.current
    const { scrollTop, clientHeight, clientWidth } = container

    if (cols === 1) {
      const wi = clamp(Math.floor(scrollTop / clientHeight), 0, walledItems.length - 1)
      anchorWalledIdxRef.current = wi
      const item = walledItems[wi]
      if (item?.type === 'date-poster') {
        setAtDatePoster({ month: parseInt(item.date.split('-')[1], 10) })
        if (item.date !== activeDayRef.current) { setActiveDay(item.date); onDayChange(item.date) }
      } else {
        setAtDatePoster(null)
        const eidx = walledIdxToEventIdxRef.current[wi] ?? 0
        setActiveEventIdx(eidx)
        const ev = allEventsRef.current[eidx]
        const day = ev ? (eventDayMapRef.current.get(ev.id) ?? daysRef.current[0]) : null
        if (day && day !== activeDayRef.current) { setActiveDay(day); onDayChange(day) }
      }
      return
    }

    // Multi-col: the day of the row at the top of the viewport.
    const cellWidth = (clientWidth - GAP * (cols - 1)) / cols
    const rowHeight = cellWidth * 1.5 + GAP
    const totalRows = Math.ceil(walledItems.length / cols)
    const topRow = clamp(Math.floor(scrollTop / rowHeight), 0, totalRows - 1)
    anchorWalledIdxRef.current = clamp(topRow * cols, 0, walledItems.length - 1)
    const rowItems = walledItems.slice(topRow * cols, topRow * cols + cols)
    const day = rowItems
      .filter((it): it is Extract<WallItem, { type: 'poster' }> => it.type === 'poster')
      .map(it => eventDayMapRef.current.get(it.event.id))
      .find((d): d is string => !!d)
    if (day && day !== activeDayRef.current) { setActiveDay(day); onDayChange(day) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll → active day + 1-col-specific state ────────────────────
  // Empty deps — stable forever. Reads layout data from refs.
  const handleScroll = useCallback(() => {
    const container = containerRef.current
    const walledItems = walledItemsRef.current
    if (!container || walledItems.length === 0) return

    // Active day, 1-col poster, and the zoom anchor are all computed in
    // computeActiveDay (driven by the rAF loop below, which is reliable during
    // iOS momentum). This scroll-event call is just a bonus fast-path.
    computeActiveDay()

    // Back-to-top: only offer it in multi-col once scrolled ~2.5 screens down.
    // While scrolling it stays hidden; it fades in after 3s of stillness and
    // hides again the instant the user scrolls. The stillness timer is cleared
    // and re-armed on every scroll tick, so it only fires once motion stops.
    const eligible = colsRef.current !== 1 && container.scrollTop > container.clientHeight * 2.5
    if (showBackToTopRef.current) {
      showBackToTopRef.current = false
      setShowBackToTop(false)
    }
    if (backToTopStillnessRef.current) clearTimeout(backToTopStillnessRef.current)
    if (eligible) {
      backToTopStillnessRef.current = setTimeout(() => {
        showBackToTopRef.current = true
        setShowBackToTop(true)
      }, 3000)
    }

    // Fallback for browsers/OS versions where scrollend doesn't fire (iOS 17 and older).
    // Clears on every scroll event and re-sets, so it only fires once motion stops.
    if (scrollEndFallbackRef.current) clearTimeout(scrollEndFallbackRef.current)
    scrollEndFallbackRef.current = setTimeout(computeActiveDay, 150)

    // Near the bottom (within 3 viewports) → request the next window, throttled.
    const { scrollTop, clientHeight, scrollHeight } = container
    if (scrollTop + clientHeight > scrollHeight - 3 * clientHeight) {
      const now = Date.now()
      if (now - nearEndCooldownRef.current > 500) {
        nearEndCooldownRef.current = now
        onNearEndRef.current?.()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync activeDay on mount and when layout/events change ─────────
  // Deferred by one rAF + 150ms: lets the new grid layout paint and
  // inertial scroll settle before reading scrollTop. If cols changes
  // again within the window the previous raf/timeout are cancelled.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const raf = requestAnimationFrame(() => { t = setTimeout(computeActiveDay, 150) })
    return () => { cancelAnimationFrame(raf); if (t !== null) clearTimeout(t) }
  }, [cols, walledItems.length, allEvents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Registers once on mount, removes only on unmount — never mid-scroll.
  // Safe because handleScroll and computeActiveDay are both stable (empty deps).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    el.addEventListener('scrollend', computeActiveDay)
    return () => {
      el.removeEventListener('scroll', handleScroll)
      el.removeEventListener('scrollend', computeActiveDay)
      if (scrollEndFallbackRef.current) clearTimeout(scrollEndFallbackRef.current)
      if (backToTopStillnessRef.current) clearTimeout(backToTopStillnessRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── rAF-driven scroll tracking (the reliable-on-iOS mechanism) ────
  // iOS WebKit throttles/drops BOTH scroll events and IntersectionObserver
  // callbacks during momentum scrolling — that is what froze the date bar and
  // fed a stale scroll position into the zoom re-anchor. requestAnimationFrame
  // is NOT throttled during momentum, so we poll scrollTop each frame while
  // scrolling and recompute everything (computeActiveDay). The loop starts on
  // any interaction and stops itself once scrolling settles, so it's idle-cheap.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let raf = 0, lastTop = -1, still = 0, running = false

    const tick = () => {
      const top = container.scrollTop
      if (top !== lastTop) { lastTop = top; still = 0; computeActiveDay() }
      else if (++still > 6) { running = false; return } // ~100ms of stillness → stop
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      if (running) return
      running = true; still = 0; lastTop = -1
      raf = requestAnimationFrame(tick)
    }

    container.addEventListener('scroll', start, { passive: true })
    container.addEventListener('touchstart', start, { passive: true })
    container.addEventListener('touchmove', start, { passive: true })
    container.addEventListener('wheel', start, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      container.removeEventListener('scroll', start)
      container.removeEventListener('touchstart', start)
      container.removeEventListener('touchmove', start)
      container.removeEventListener('wheel', start)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: if the filtered set shrinks below the current index (e.g. a
  // filter applied while in 1-col), clamp so the date bar never falls back to
  // stale date-mode because allEvents[activeEventIdx] went undefined. The
  // observer then re-fires on the reset scroll and lands on the real poster.
  useEffect(() => {
    if (allEvents.length > 0 && activeEventIdx >= allEvents.length) {
      setActiveEventIdx(allEvents.length - 1)
    }
  }, [allEvents.length, activeEventIdx])

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
    if (wi === undefined) {
      // Target isn't on the wall (e.g. its show already ended and aged off) —
      // clear the deep-link instead of leaving stale nav state behind.
      onOpenEventHandled?.()
      return
    }
    pendingScrollIdxRef.current = wi
    setCols(1)
    onOpenEventHandled?.()
  }, [openEventId, walledItems]) // eslint-disable-line react-hooks/exhaustive-deps

  // Interactive tour: let the tour force the wall back to the multi-column grid so its
  // step state can't drift from the app's view (e.g. after a pinch-to-1-col), and
  // freeze vertical scroll during anchored single-poster steps so the user can't
  // scroll off the poster the step is highlighting.
  useEffect(() => {
    const onCmd = (e: Event) => {
      const cmd = (e as CustomEvent).detail?.cmd
      if (cmd === 'reset-grid') setCols(maxColsRef.current)
      else if (cmd === 'lock-scroll') setScrollLocked(true)
      else if (cmd === 'unlock-scroll') setScrollLocked(false)
    }
    window.addEventListener('plaster-tour-cmd', onCmd)
    return () => window.removeEventListener('plaster-tour-cmd', onCmd)
  }, [])

  // Clear 1-col-only state when leaving 1-col view.
  useEffect(() => {
    if (cols !== 1) {
      setAtDatePoster(null)
      setActiveEventIdx(0) // reset — only meaningful in 1-col
      setRestingPanel(0) // zoom-out resets panel persistence to poster
    } else {
      // Entering 1-col (vertical poster nav) — back-to-top doesn't apply there.
      if (backToTopStillnessRef.current) clearTimeout(backToTopStillnessRef.current)
      if (showBackToTopRef.current) {
        showBackToTopRef.current = false
        setShowBackToTop(false)
      }
    }
  }, [cols])

  // Filtering now genuinely shrinks the event list (chips remove cards rather
  // than fading them), so a stale scrollTop can land mid-wall or past the end.
  // Reset to the top whenever the filter or search query changes. Skipped while
  // deep-linking (openEventId) so it doesn't fight the scroll-to-target.
  useEffect(() => {
    if (openEventId) return
    const el = containerRef.current
    if (el) el.scrollTop = 0
  }, [activeFilter, searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  // After cols snaps to 1 and the DOM re-renders, scroll to the tapped card.
  // rAF ensures the 1-col card heights are painted before we set scrollTop.
  // activeEventIdx is synced here so DateIndicator has correct state before
  // handleScroll fires — prevents a stale-event flash on first 1-col render.
  useEffect(() => {
    if (cols !== 1 || pendingScrollIdxRef.current === null) return
    const idx = pendingScrollIdxRef.current
    pendingScrollIdxRef.current = null
    setActiveEventIdx(walledIdxToEventIdxRef.current[idx] ?? 0)
    const container = containerRef.current
    if (!container) return
    requestAnimationFrame(() => {
      container.scrollTop = idx * container.clientHeight
      computeActiveDay() // update day/poster now — no scroll event is guaranteed
    })
  }, [cols]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-anchor scroll when the column count changes via zoom (pinch/wheel) so the
  // poster you were looking at stays in view. Skipped when a double-tap drives the
  // transition (that path scrolls to the tapped poster via pendingScrollIdxRef).
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || pendingScrollIdxRef.current !== null) return
    const wi = clamp(anchorWalledIdxRef.current, 0, Math.max(0, walledItemsRef.current.length - 1))
    requestAnimationFrame(() => {
      const c = colsRef.current
      if (c === 1) { container.scrollTop = wi * container.clientHeight }
      else {
        const cellWidth = (container.clientWidth - GAP * (c - 1)) / c
        const rowHeight = cellWidth * 1.5 + GAP
        container.scrollTop = Math.floor(wi / c) * rowHeight
      }
      computeActiveDay() // sync the date bar to the re-anchored position immediately
    })
  }, [cols]) // eslint-disable-line react-hooks/exhaustive-deps

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
          soldOut: allEvents[activeEventIdx].sold_out ?? false,
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

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="flex-1 scroll-momentum"
        style={{
          // Tour lock: freeze vertical scroll (horizontal panel swipes, handled
          // by PosterCard's own touch handlers, keep working).
          overflowY: scrollLocked ? 'hidden' : 'auto',
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
                <div key={`d-${item.date}`} data-date-id={item.date} style={{ height: '100%', flexShrink: 0, scrollSnapAlign: 'start' }}>
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
                searchQuery={searchQuery}
                isLiked={likedIds.has(event.id)}
                isActive={eventIdx === activeEventIdx}
                onLike={onLike}
                isAdminMode={isAdminMode}
                onEventSaved={onEventSaved}
                previousPosterUrl={prevUrlMap?.[event.id]}
                onUndoCrop={onUndoCrop ? () => onUndoCrop(event.id) : undefined}
                onConfirmCrop={onConfirmCrop ? () => onConfirmCrop(event.id) : undefined}
                enableDesktopNav={enableDesktopNav}
                restingPanel={restingPanel}
                onPanelSettled={setRestingPanel}
              />
            )
          })
        ) : (
          // ── 2-5 col ───────────────────────────────────────────────
          <div style={gridStyle}>
            {walledItems.map((item, wi) => {
              if (item.type === 'date-poster') {
                return <DatePoster key={`d-${item.date}`} date={item.date} transitionName={`d-${item.date}`} />
              }
              const { event } = item
              return (
                <PosterCard
                  key={`p-${event.id}`}
                  event={event}
                  cols={cols}
                  activeFilter={activeFilter}
                  searchQuery={searchQuery}
                  isLiked={likedIds.has(event.id)}
                  onDoubleTap={handleDoubleTap}
                  onLike={onLike}
                  isAdminMode={isAdminMode}
                  onEventSaved={onEventSaved}
                  enableDesktopNav={enableDesktopNav}
                  transitionName={wi < 40 ? `p-${event.id}` : undefined}
                  dayKey={eventDayMap.get(event.id)}
                />
              )
            })}
            <div style={{ gridColumn: '1 / -1', height: 'var(--nav-height)' }} />
          </div>
        )}
      </div>

      {/* Back to top — floats above the wall once scrolled a few screens down */}
      <button
        aria-label="Back to top"
        onClick={() => {
          containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        style={{
          position: 'absolute',
          bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) - 28px)',
          right: 16,
          width: 36,
          height: 36,
          border: 'none',
          background: 'none',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.4))',
          cursor: 'pointer',
          zIndex: 20,
          opacity: showBackToTop ? 0.45 : 0,
          pointerEvents: showBackToTop ? 'auto' : 'none',
          // Pure fade, no vertical motion. Slow, gentle fade-in so it's barely
          // perceptible; quicker fade-out so it clears promptly on scroll.
          transition: showBackToTop ? 'opacity 1100ms ease-in' : 'opacity 250ms ease',
        }}
      >
        <svg width="34" height="34" viewBox="0 0 24 24">
          {/* Upward triangle — always the light color (#f0ece3) in both themes */}
          <path d="M12 4 L21 19.5 L3 19.5 Z" fill="#f0ece3" stroke="#f0ece3" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
