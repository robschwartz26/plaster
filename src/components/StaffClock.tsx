import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Date-seeded quote — stable per calendar day (PT)
const QUOTES = [
  'The show must go on.',
  'Every venue has a story. Know the room.',
  'Portland shows up. Every night.',
  'The poster is the promise. Make it good.',
  'Good data keeps the lights on.',
  'Tonight someone will hear their new favorite band.',
  'The wall is only as good as the people who fill it.',
  'A show you almost didn\'t go to is often the best one.',
  'Holocene on a Tuesday is still Holocene.',
  'Every show starts with someone putting up a flyer.',
  'The city is alive when the doors open.',
  'Local first. Always.',
]

function getDailyQuote(): string {
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })
  let seed = 0
  for (let i = 0; i < today.length; i++) seed += today.charCodeAt(i)
  return QUOTES[seed % QUOTES.length]
}

interface Shift {
  id: string
  clock_in: string
  clock_out: string | null
}

function fmtElapsed(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function StaffClock() {
  const { user } = useAuth()
  const [shift, setShift] = useState<Shift | null | undefined>(undefined) // undefined = loading
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const quote = getDailyQuote()

  // Load open shift on mount
  useEffect(() => {
    if (!user) return
    supabase
      .from('staff_shifts')
      .select('id, clock_in, clock_out')
      .eq('worker_id', user.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setShift(data ?? null))
  }, [user])

  // Live elapsed timer when clocked in
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!shift) return
    const tick = () => setElapsed(Date.now() - new Date(shift.clock_in).getTime())
    tick()
    timerRef.current = setInterval(tick, 30000) // 30s tick
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [shift])

  async function clockIn() {
    if (!user) return
    const { data, error } = await supabase
      .from('staff_shifts')
      .insert({ worker_id: user.id })
      .select('id, clock_in, clock_out')
      .single()
    if (!error && data) setShift(data)
  }

  async function clockOut() {
    if (!user || !shift) return
    const { error } = await supabase
      .from('staff_shifts')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', shift.id)
    if (!error) { setShift(null); setElapsed(0) }
  }

  if (shift === undefined) return null // still loading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Clock row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {shift ? (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', marginBottom: 2 }}>
                Clocked in · <span style={{ color: 'var(--fg-80)', fontWeight: 600 }}>{fmtElapsed(elapsed)}</span>
              </div>
              <div style={{ display: 'flex', width: '100%', height: 3, borderRadius: 2, background: 'var(--fg-08)', overflow: 'hidden' }}>
                {/* Subtle elapsed bar: max shown at 8h */}
                <div style={{ height: '100%', width: `${Math.min((elapsed / (8 * 3600000)) * 100, 100)}%`, background: '#A855F7', borderRadius: 2, transition: 'width 1s linear' }} />
              </div>
            </div>
            <button
              onClick={clockOut}
              style={{
                flexShrink: 0, padding: '5px 12px',
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600,
                background: 'var(--fg-08)', border: '1px solid var(--fg-15)',
                color: 'var(--fg-55)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Clock out
            </button>
          </>
        ) : (
          <button
            onClick={clockIn}
            style={{
              padding: '6px 14px',
              fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600,
              background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)',
              color: '#A855F7', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Clock in
          </button>
        )}
      </div>

      {/* Daily quote */}
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', fontStyle: 'italic', margin: 0, lineHeight: 1.5 }}>
        "{quote}"
      </p>
    </div>
  )
}
