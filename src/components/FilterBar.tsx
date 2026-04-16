import { useRef, useEffect } from 'react'

// ♥ replaces 'Tonight' (Tonight is now a dedicated tab)
const CHIPS = [
  'All', '♥', 'Music', 'Drag', 'Dance',
  'Art', 'Film', 'Literary', 'Trivia', 'Other',
] as const

interface Props {
  active: string
  onChange: (chip: string) => void
  activePosterCategory?: string
}

export function FilterBar({ active, onChange, activePosterCategory }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Scroll the auto-highlighted chip into center when active poster category changes
  useEffect(() => {
    if (!activePosterCategory) return
    const chip = chipRefs.current.get(activePosterCategory)
    if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activePosterCategory])

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-2 overflow-x-auto px-4"
      style={{
        height: 'var(--filterbar-height)',
        background: 'var(--bg)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {CHIPS.map((chip) => {
        const isActive = chip === active
        const isAutoHighlighted = activePosterCategory === chip
        return (
          <button
            key={chip}
            ref={el => { if (el) chipRefs.current.set(chip, el); else chipRefs.current.delete(chip) }}
            onClick={() => onChange(chip)}
            className="shrink-0 font-body font-medium whitespace-nowrap"
            style={{
              fontSize: chip === '♥' ? 12 : 9,
              letterSpacing: chip === '♥' ? 0 : '0.02em',
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${isAutoHighlighted ? 'var(--fg)' : isActive ? 'var(--fg-55)' : 'var(--fg-15)'}`,
              background: isAutoHighlighted ? 'var(--fg)' : isActive ? 'var(--fg-08)' : 'transparent',
              color: isAutoHighlighted ? 'var(--bg)' : isActive ? 'var(--fg)' : 'var(--fg-40)',
              lineHeight: 1.6,
            }}
          >
            {chip === '♥' ? '♥\uFE0E' : chip}
          </button>
        )
      })}
      <div className="shrink-0 w-2" />
    </div>
  )
}
