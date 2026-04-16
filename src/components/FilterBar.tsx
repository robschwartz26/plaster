import { useRef, useEffect, useCallback } from 'react'

const CATS = ['Music', 'Drag', 'Dance', 'Art', 'Film', 'Literary', 'Trivia', 'Other'] as const
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

  const snapToCategory = useCallback((cat: string) => {
    const catIdx = CATS.indexOf(cat as Cat)
    if (catIdx === -1) return

    requestAnimationFrame(() => {
      const track   = trackRef.current
      const sa      = scrollAreaRef.current
      const chipEls = chipElsRef.current.filter((el): el is HTMLButtonElement => el !== null)
      if (!track || !sa || chipEls.length < TRIPLE_CATS.length) return

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

      // 1px safe margin so chip border never clips
      const finalOffset = bestOffset - SAFE
      track.style.transform = `translateX(${-Math.max(-SAFE, finalOffset)}px)`
    })
  }, [])

  // Snap when scroll-driven category changes
  useEffect(() => {
    if (!activePosterCategory) return
    snapToCategory(activePosterCategory)
  }, [activePosterCategory, snapToCategory])

  const chipStyle = (highlighted: boolean, isHeart?: boolean): React.CSSProperties => ({
    fontSize: isHeart ? 12 : 9,
    letterSpacing: isHeart ? 0 : '0.02em',
    padding: '3px 8px',
    borderRadius: 4,
    border: `1px solid ${highlighted ? 'var(--fg)' : 'var(--fg-15)'}`,
    background: highlighted ? 'var(--fg)' : 'transparent',
    color: highlighted ? 'var(--bg)' : 'var(--fg-40)',
    lineHeight: 1.6,
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: GAP, height: 34, background: 'var(--bg)' }}>

      {/* Fixed: All + ♥ */}
      <div style={{ display: 'flex', gap: GAP, paddingLeft: 12, flexShrink: 0, background: 'var(--bg)', position: 'relative', zIndex: 10 }}>
        {(['All', '♥'] as const).map(chip => (
          <button
            key={chip}
            onClick={() => onChange(chip)}
            className="font-body font-medium"
            style={chipStyle(chip === active, chip === '♥')}
          >
            {chip === '♥' ? '♥\uFE0E' : chip}
          </button>
        ))}
      </div>

      {/* Carousel */}
      <div ref={scrollAreaRef} style={{ flex: 1, overflow: 'hidden', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            gap: GAP,
            transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
            willChange: 'transform',
          }}
        >
          {TRIPLE_CATS.map((cat, i) => {
            const highlighted = cat === active || cat === activePosterCategory
            return (
              <button
                key={`${cat}-${i}`}
                ref={el => { chipElsRef.current[i] = el }}
                onClick={() => { onChange(cat); snapToCategory(cat) }}
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
