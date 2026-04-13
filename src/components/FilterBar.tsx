import { useRef } from 'react'
import { type Category } from '@/data/mockEvents'

const CHIPS: (Category | 'All')[] = [
  'All',
  'Tonight',
  'Music',
  'Drag',
  'Comedy',
  'Dance',
  'Art',
  'Film',
  'Literary',
  'Trivia',
  'Other',
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
      className="flex items-center gap-2 overflow-x-auto px-4 bg-[#0c0b0b]"
      style={{ height: 'var(--filterbar-height)', WebkitOverflowScrolling: 'touch' }}
    >
      {CHIPS.map((chip) => {
        const isActive = chip === active
        return (
          <button
            key={chip}
            onClick={() => onChange(chip)}
            className="shrink-0 font-body font-medium whitespace-nowrap transition-all duration-150"
            style={{
              fontSize: 9,
              letterSpacing: '0.02em',
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid rgba(240,236,227,${isActive ? 0.55 : 0.15})`,
              background: isActive ? 'rgba(240,236,227,0.08)' : 'transparent',
              color: `rgba(240,236,227,${isActive ? 1 : 0.4})`,
            }}
          >
            {chip}
          </button>
        )
      })}
      {/* trailing spacer */}
      <div className="shrink-0 w-2" />
    </div>
  )
}
