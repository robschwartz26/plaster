import { useRef } from 'react'

// ♥ replaces 'Tonight' (Tonight is now a dedicated tab)
const CHIPS = [
  'All', '♥', 'Music', 'Drag', 'Dance',
  'Art', 'Film', 'Literary', 'Trivia', 'Other',
] as const

interface Props {
  active: string
  onChange: (chip: string) => void
}

export function FilterBar({ active, onChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

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
        return (
          <button
            key={chip}
            onClick={() => onChange(chip)}
            className="shrink-0 font-body font-medium whitespace-nowrap"
            style={{
              fontSize: chip === '♥' ? 12 : 9,
              letterSpacing: chip === '♥' ? 0 : '0.02em',
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${isActive ? 'var(--fg-55)' : 'var(--fg-15)'}`,
              background: isActive ? 'var(--fg-08)' : 'transparent',
              color: isActive ? (chip === '♥' ? '#ec4899' : 'var(--fg)') : 'var(--fg-40)',
              lineHeight: 1.6,
            }}
          >
            {chip}
          </button>
        )
      })}
      <div className="shrink-0 w-2" />
    </div>
  )
}
