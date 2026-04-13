import { useRef } from 'react'
import { type Category } from '@/data/mockEvents'

const CHIPS: (Category | 'All')[] = [
  'All', 'Tonight', 'Music', 'Drag', 'Comedy', 'Dance',
  'Art', 'Film', 'Literary', 'Trivia', 'Other',
] as (Category | 'All')[]

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
              fontSize: 9,
              letterSpacing: '0.02em',
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${isActive ? 'var(--fg-55)' : 'var(--fg-15)'}`,
              background: isActive ? 'var(--fg-08)' : 'transparent',
              color: isActive ? 'var(--fg)' : 'var(--fg-40)',
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
