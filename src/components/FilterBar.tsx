import { useRef, useEffect, useState, useCallback } from 'react'
import { CATEGORIES } from '@/lib/categories'

const CATS = CATEGORIES
type Cat = typeof CATS[number]
const TRIPLE_CATS = [...CATS, ...CATS, ...CATS]

const SAFE = 1
const GAP = 6

interface Props {
  active: string
  onChange: (chip: string) => void
  activePosterCategory?: string
}

export function FilterBar({ active, onChange, activePosterCategory }: Props) {
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

  // Measure one copy width and seed offset to middle copy
  useEffect(() => {
    const chipEls = chipElsRef.current.filter((el): el is HTMLButtonElement => el !== null)
    if (chipEls.length < TRIPLE_CATS.length) return

    let copyWidth = 0
    for (let i = 0; i < CATS.length; i++) {
      copyWidth += chipEls[i].offsetWidth + GAP
    }
    oneCopyWidthRef.current = copyWidth

    setAnimating(false)
    setOffset(-copyWidth)
    requestAnimationFrame(() => setAnimating(true))
  }, [])

  const snapToCategory = useCallback((cat: string) => {
    const catIdx = CATS.indexOf(cat as Cat)
    if (catIdx === -1) return

    requestAnimationFrame(() => {
      const sa      = scrollAreaRef.current
      const chipEls = chipElsRef.current.filter((el): el is HTMLButtonElement => el !== null)
      if (!sa || chipEls.length < TRIPLE_CATS.length) return

      // Build left-edge positions for every chip
      const positions: number[] = [0]
      for (let i = 1; i < chipEls.length; i++) {
        positions.push(positions[i - 1] + chipEls[i - 1].offsetWidth + GAP)
      }

      // Target index = middle copy of the active chip
      const targetI  = CATS.length + catIdx
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
    fontSize: isHeart ? 12 : 9,
    letterSpacing: isHeart ? 0 : '0.02em',
    padding: '3px 8px',
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
            {chip === '♥' ? '♥\uFE0E' : chip}
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
          {TRIPLE_CATS.map((cat, i) => {
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
