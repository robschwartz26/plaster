import { useState, useEffect } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PosterGrid } from './PosterGrid'
import { BottomNav } from './BottomNav'
import { supabase } from '@/lib/supabase'
import { mockEvents } from '@/data/mockEvents'
import { dbEventToWallEvent, mockEventToWallEvent } from '@/lib/adapters'
import { type WallEvent } from '@/types/event'
import { useTheme } from '@/hooks/useTheme'

const today = new Date().toISOString().slice(0, 10)
const MOCK_WALL_EVENTS: WallEvent[] = mockEvents.map(mockEventToWallEvent)

// Hidden swipe-to-toggle wordmark — no visual indicator, pure easter egg
function Wordmark({ onSwipe }: { onSwipe: (dir: 'right' | 'left') => void }) {
  const x = useMotionValue(0)

  return (
    <motion.span
      className="font-display"
      style={{
        x,
        fontSize: 26,
        fontWeight: 900,
        color: 'var(--fg)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'default',
        display: 'inline-block',
      }}
      drag="x"
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const offset = info.offset.x
        if (Math.abs(offset) >= 40) {
          onSwipe(offset > 0 ? 'right' : 'left')
        }
        // Spring snap-back with slight overshoot (underdamped: ratio ≈ 0.49)
        animate(x, 0, { type: 'spring', stiffness: 500, damping: 22 })
      }}
    >
      plaster
    </motion.span>
  )
}

export function Wall() {
  const [activeFilter, setActiveFilter] = useState('All')
  const [_activeDay, setActiveDay] = useState(today)
  const [events, setEvents] = useState<WallEvent[]>(MOCK_WALL_EVENTS)
  const { setTheme } = useTheme()

  useEffect(() => {
    async function fetchEvents() {
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name)')
        .gte('starts_at', new Date().toISOString().slice(0, 10))
        .order('starts_at', { ascending: true })
        .limit(200)

      if (error || !data || data.length === 0) {
        setEvents(MOCK_WALL_EVENTS)
        return
      }
      setEvents(data.map(dbEventToWallEvent))
    }
    fetchEvents()
  }, [])

  const handleSwipe = (dir: 'right' | 'left') => {
    if (dir === 'right') toggle()
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingBottom: 10,
        }}
      >
        <Wordmark onSwipe={handleSwipe} />

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
                  border: '1px solid var(--fg-18)',
                  color: 'var(--fg-65)',
                }}
              >
                {icon}
              </button>
            ),
          )}
        </div>
      </div>

      <FilterBar active={activeFilter} onChange={setActiveFilter} />

      <PosterGrid
        events={events}
        activeFilter={activeFilter}
        today={today}
        onDayChange={setActiveDay}
      />

      <BottomNav />
    </div>
  )
}
