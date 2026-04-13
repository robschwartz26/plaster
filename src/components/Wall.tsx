import { useState, useEffect } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PosterGrid } from './PosterGrid'
import { BottomNav } from './BottomNav'
import { supabase } from '@/lib/supabase'
import { mockEvents } from '@/data/mockEvents'
import { dbEventToWallEvent, mockEventToWallEvent } from '@/lib/adapters'
import { type WallEvent } from '@/types/event'

const today = new Date().toISOString().slice(0, 10)
const MOCK_WALL_EVENTS: WallEvent[] = mockEvents.map(mockEventToWallEvent)

export function Wall() {
  const [activeFilter, setActiveFilter] = useState('All')
  const [_activeDay, setActiveDay] = useState(today)
  const [events, setEvents] = useState<WallEvent[]>(MOCK_WALL_EVENTS)

  useEffect(() => {
    async function fetchEvents() {
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name)')
        .gte('starts_at', new Date().toISOString().slice(0, 10))
        .order('starts_at', { ascending: true })
        .limit(200)

      if (error || !data || data.length === 0) {
        // Fall back to mock data if table is empty or unreachable
        setEvents(MOCK_WALL_EVENTS)
        return
      }

      setEvents(data.map(dbEventToWallEvent))
    }

    fetchEvents()
  }, [])

  return (
    <div className="flex flex-col h-full bg-bg overflow-hidden">
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingBottom: 10,
        }}
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
            ),
          )}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar active={activeFilter} onChange={setActiveFilter} />

      {/* Poster grid */}
      <PosterGrid
        events={events}
        activeFilter={activeFilter}
        today={today}
        onDayChange={setActiveDay}
      />

      {/* Bottom nav */}
      <BottomNav />
    </div>
  )
}
