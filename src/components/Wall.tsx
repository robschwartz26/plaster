import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PosterGrid } from './PosterGrid'
import { BottomNav } from './BottomNav'
import { mockEvents } from '@/data/mockEvents'

const today = new Date().toISOString().slice(0, 10)

// Fake signal dots for status bar
function SignalDots() {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-full bg-ink"
          style={{
            width: 4,
            height: 4,
            opacity: i <= 3 ? 1 : 0.25,
          }}
        />
      ))}
    </div>
  )
}

export function Wall() {
  const [activeFilter, setActiveFilter] = useState('All')
  const [_activeDay, setActiveDay] = useState(today)

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden">
      {/* Status bar */}
      <div
        className="shrink-0 flex items-center justify-between px-5"
        style={{ height: 'var(--status-height)' }}
      >
        <span
          className="font-body font-medium"
          style={{ fontSize: 12, color: 'rgba(240,236,227,0.45)' }}
        >
          9:41
        </span>
        <SignalDots />
      </div>

      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{ height: 'var(--topbar-height)' }}
      >
        <span
          className="font-display"
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: '#f0ece3',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          plaster
        </span>

        <div className="flex items-center gap-2">
          {[<Search key="s" size={16} />, <SlidersHorizontal key="f" size={16} />].map(
            (icon, i) => (
              <button
                key={i}
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  border: '1px solid rgba(240,236,227,0.18)',
                  color: 'rgba(240,236,227,0.65)',
                }}
              >
                {icon}
              </button>
            )
          )}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar active={activeFilter} onChange={setActiveFilter} />

      {/* Poster grid (includes DateIndicator sticky inside) */}
      <PosterGrid
        events={mockEvents}
        activeFilter={activeFilter}
        today={today}
        onDayChange={setActiveDay}
      />

      {/* Bottom nav */}
      <BottomNav />
    </div>
  )
}
