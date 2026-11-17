import { useRef, useEffect, useState, useCallback } from 'react'
import { CATEGORIES } from '@/lib/categories'
import { HOLIDAY_FILTER } from '@/lib/holiday'

const CATS = CATEGORIES
type Cat = typeof CATS[number]

const SAFE = 1
const GAP = 6

// Holiday chip palettes — alternating per letter. Festive at rest, icy once
// picked. Same font and size as every other chip; only the colors carry it.
const HOLIDAY_LABEL = 'Holiday'.split('')
const FESTIVE: [string, string] = ['#2fa84f', '#e0403a']   // fir green / ribbon red
const ICY: [string, string]     = ['#eaf7ff', '#7dd3fc']   // snow white / frost blue

interface Props {
  active: string
  onChange: (chip: string) => void
  activePosterCategory?: string
  neighborhood?: string | null
  onOpenNeighborhood?: () => void
  hiddenCats?: string[] // user-hidden categories (Settings → Personalize the wall)
  large?: boolean       // bigger chips for legibility
  // Holiday chip — only mounted while the wall actually has holiday events, so
  // it shows up with the season and leaves with it. Filters like any other chip;
  // Holiday just isn't a stored category (see lib/holiday.ts).
  showHoliday?: boolean
}

// Carousel items: the genres, plus the neighborhood chip appended at the end of
// each copy (so it scrolls + infinite-loops like an ordinary chip).
type ChipItem = { kind: 'cat'; cat: Cat } | { kind: 'nbhd' } | { kind: 'holiday' }

export function FilterBar({ active, onChange, activePosterCategory, neighborhood, onOpenNeighborhood, hiddenCats = [], large = false, showHoliday = false }: Props) {
  const trackRef       = useRef<HTMLDivElement>(null)
  const scrollAreaRef  = useRef<HTMLDivElement>(null)
  const chipElsRef     = useRef<(HTMLButtonElement | null)[]>([])

  const [offset, setOffset]       = useState(0)
  const [animating, setAnimating] = useState(true)

  const oneCopyWidthRef    = useRef(0)
  const dragStartXRef      = useRef<number | null>(null)
  const dragStartOffsetRef = useRef(0)
  const draggedRef         = useRef(false)
  const DRAG_THRESHOLD     = 5

  const showNbhd = !!(neighborhood && onOpenNeighborhood)
  const visibleCats = CATS.filter(c => !hiddenCats.includes(c))
  // Holiday leads each copy so it's on screen when the wall opens; the genres
  // follow, which is what snapToCategory's index math has to account for.
  const lead = showHoliday ? 1 : 0
  const baseItems: ChipItem[] = [
    ...(showHoliday ? [{ kind: 'holiday' } as ChipItem] : []),
    ...visibleCats.map((c): ChipItem => ({ kind: 'cat', cat: c })),
    ...(showNbhd ? [{ kind: 'nbhd' } as ChipItem] : []),
  ]
  const copyLen = baseItems.length
  const tripleItems = [...baseItems, ...baseItems, ...baseItems]
  const copyLenRef = useRef(copyLen)
  copyLenRef.current = copyLen

  // Measure one copy width and seed offset to the middle copy. Re-runs if the
  // per-copy count changes (e.g. the neighborhood chip appears once it loads).
  useEffect(() => {
    const chipEls = chipElsRef.current.filter((el): el is HTMLButtonElement => el !== null)
    if (chipEls.length < copyLen * 3) return

    let copyWidth = 0
    for (let i = 0; i < copyLen; i++) {
      copyWidth += chipEls[i].offsetWidth + GAP
    }
    oneCopyWidthRef.current = copyWidth

    setAnimating(false)
    setOffset(-copyWidth)
    requestAnimationFrame(() => setAnimating(true))
  }, [copyLen, large])

  // Ref so the []-dep snap callback always sees the current (unhidden) list
  const visibleCatsRef = useRef(visibleCats)
  visibleCatsRef.current = visibleCats
  const leadRef = useRef(lead)
  leadRef.current = lead

  const snapToCategory = useCallback((cat: string) => {
    const catIdx = visibleCatsRef.current.indexOf(cat as Cat)
    if (catIdx === -1) return

    requestAnimationFrame(() => {
      const sa      = scrollAreaRef.current
      const chipEls = chipElsRef.current.filter((el): el is HTMLButtonElement => el !== null)
      if (!sa || chipEls.length < copyLenRef.current * 3) return

      // Build left-edge positions for every chip
      const positions: number[] = [0]
      for (let i = 1; i < chipEls.length; i++) {
        positions.push(positions[i - 1] + chipEls[i - 1].offsetWidth + GAP)
      }

      // Target index = middle copy of the active chip (any lead chips first)
      const targetI  = copyLenRef.current + leadRef.current + catIdx
      const chipW    = chipEls[targetI].offsetWidth
      const saW      = sa.offsetWidth
      const RIGHT_MARGIN = 16
      const idealOffset = positions[targetI] - saW + chipW + RIGHT_MARGIN

      // Snap to nearest chip left-edge
      let bestOffset = positions[0]
      let bestDist   = Math.abs(positions[0] - idealOffset)
      for (let i = 0; i < positions.length; i++) {
        const d = Math.abs(positions[i] - idealOffset)
        if (d < bestDist) { bestDist = d; bestOffset = positions[i] }
      }

      const finalOffset = bestOffset - SAFE
      setAnimating(true)
      setOffset(-Math.max(-SAFE, finalOffset))
    })
  }, [])

  // Snap when scroll-driven category changes
  useEffect(() => {
    if (!activePosterCategory) return
    snapToCategory(activePosterCategory)
  }, [activePosterCategory, snapToCategory])

  function wrapIfNeeded(currentOffset: number) {
    const copyW = oneCopyWidthRef.current
    if (copyW === 0) return currentOffset

    let wrapped = currentOffset
    if (wrapped > -copyW * 0.5) {
      wrapped -= copyW
    } else if (wrapped < -copyW * 1.5) {
      wrapped += copyW
    }
    return wrapped
  }

  function onPointerDown(e: React.PointerEvent) {
    dragStartXRef.current      = e.clientX
    dragStartOffsetRef.current = offset
    draggedRef.current         = false
    setAnimating(false)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragStartXRef.current === null) return
    const dx = e.clientX - dragStartXRef.current

    if (!draggedRef.current && Math.abs(dx) > DRAG_THRESHOLD) {
      draggedRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    if (draggedRef.current) {
      setOffset(dragStartOffsetRef.current + dx)
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragStartXRef.current === null) return
    const wasDragging = draggedRef.current
    dragStartXRef.current = null

    if (wasDragging) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      const wrapped = wrapIfNeeded(offset)
      if (wrapped !== offset) {
        setAnimating(false)
        setOffset(wrapped)
        requestAnimationFrame(() => setAnimating(true))
      }
      e.preventDefault()
    }
  }

  function onChipClick(cat: Cat) {
    if (draggedRef.current) return
    if (cat === active) {
      onChange('All')
    } else {
      onChange(cat)
    }
  }

  const chipStyle = (highlighted: boolean, isHeart?: boolean): React.CSSProperties => ({
    fontSize: isHeart ? (large ? 14 : 12) : (large ? 11.5 : 9),
    letterSpacing: isHeart ? 0 : '0.02em',
    padding: large ? '5px 11px' : '3px 8px',
    borderRadius: 4,
    border: `1px solid ${highlighted ? 'var(--fg-55)' : 'var(--fg-15)'}`,
    background: highlighted ? 'var(--fg-08)' : 'transparent',
    color: highlighted ? 'var(--fg)' : 'var(--fg-40)',
    lineHeight: 1.6,
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: GAP, height: 'var(--filterbar-height)', background: 'var(--bg)' }}>

      {/* Fixed: All + ♥ */}
      <div style={{ display: 'flex', gap: GAP, paddingLeft: 12, flexShrink: 0, background: 'var(--bg)', position: 'relative', zIndex: 10 }}>
        {(['All', '♥'] as const).map(chip => (
          <button
            key={chip}
            onClick={() => {
              if (chip === active) {
                onChange('All')
              } else {
                onChange(chip)
              }
            }}
            className="font-body font-medium"
            style={chipStyle(chip === active && !activePosterCategory, chip === '♥')}
          >
            {chip === '♥' ? (
              // Inline SVG heart, NOT the ♥ glyph: Android WebView renders ♥ as a
              // red emoji even with the \uFE0E text selector. currentColor inherits the
              // chip's theme color — never red, identical on iOS + Android.
              <svg width={large ? 14 : 12} height={large ? 14 : 12} viewBox="0 0 24 22"
                   fill="currentColor" style={{ display: 'block' }} aria-label="Favorites">
                <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
              </svg>
            ) : chip}
          </button>
        ))}
      </div>

      {/* Carousel */}
      <div
        ref={scrollAreaRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          flex: 1,
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          touchAction: 'pan-y',
          cursor: 'grab',
        }}
      >
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            gap: GAP,
            transform: `translateX(${offset}px)`,
            transition: animating ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1)' : 'none',
            willChange: 'transform',
          }}
        >
          {tripleItems.map((item, i) => {
            // Neighborhood chip — ordinary chip style (neutral, not an accent) with
            // a little diamond; opens the region wall instead of filtering.
            if (item.kind === 'nbhd') {
              return (
                <button
                  key={`nbhd-${i}`}
                  ref={el => { chipElsRef.current[i] = el }}
                  onClick={() => { if (!draggedRef.current) onOpenNeighborhood?.() }}
                  className="font-body font-medium"
                  style={{ ...chipStyle(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <span style={{ width: 6, height: 6, background: 'var(--fg-40)', transform: 'rotate(45deg)', display: 'inline-block', flexShrink: 0 }} />
                  {neighborhood}
                </button>
              )
            }
            // Filters like any other chip — tap for holiday only, tap again for
            // All. Resting it's festive (fir green / ribbon red letters); picked
            // it goes cold, icy blue and white with a frost glow.
            if (item.kind === 'holiday') {
              const on  = active === HOLIDAY_FILTER
              const pal = on ? ICY : FESTIVE
              return (
                <button
                  key={`holiday-${i}`}
                  ref={el => { chipElsRef.current[i] = el }}
                  onClick={() => { if (!draggedRef.current) onChange(on ? 'All' : HOLIDAY_FILTER) }}
                  className="font-body font-medium"
                  aria-pressed={on}
                  aria-label="Holiday events"
                  style={{
                    ...chipStyle(false),
                    border: `1px solid ${on ? 'rgba(125,211,252,0.65)' : 'rgba(47,168,79,0.55)'}`,
                    background: on ? 'rgba(186,230,253,0.14)' : 'rgba(47,168,79,0.07)',
                    color: 'inherit',
                    transition: 'background 0.35s ease, border-color 0.35s ease',
                  }}
                >
                  {HOLIDAY_LABEL.map((ch, n) => (
                    <span
                      key={n}
                      style={{
                        color: pal[n % 2],
                        textShadow: on ? '0 0 6px rgba(125,211,252,0.7)' : 'none',
                        transition: 'color 0.35s ease, text-shadow 0.35s ease',
                      }}
                    >{ch}</span>
                  ))}
                </button>
              )
            }
            const cat = item.cat
            const highlighted = cat === active || cat === activePosterCategory
            return (
              <button
                key={`${cat}-${i}`}
                ref={el => { chipElsRef.current[i] = el }}
                onClick={() => onChipClick(cat)}
                className="font-body font-medium"
                style={chipStyle(highlighted)}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}
