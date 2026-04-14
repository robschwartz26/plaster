import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { PlasterHeader } from '@/components/PlasterHeader'

interface TonightEvent {
  id: string
  title: string
  starts_at: string
  poster_url: string | null
  category: string | null
  like_count: number
  venues: { id: string; name: string } | null
}

interface FriendActivity {
  user_id: string
  username: string | null
  avatar_url: string | null
  event_id: string
  event_title: string
}

export function TonightScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const today = new Date().toISOString().slice(0, 10)
  const [tonightEvents, setTonightEvents] = useState<TonightEvent[]>([])
  const [myRsvps, setMyRsvps] = useState<TonightEvent[]>([])
  const [friendActivity, setFriendActivity] = useState<FriendActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTonightEvents()
    if (user) {
      fetchMyRsvps()
      fetchFriendActivity()
    } else {
      setLoading(false)
    }
  }, [user])

  async function fetchTonightEvents() {
    const { data } = await supabase
      .from('events')
      .select('id, title, starts_at, poster_url, category, like_count, venues(id, name)')
      .gte('starts_at', `${today}T00:00:00`)
      .lt('starts_at', `${today}T23:59:59`)
      .order('starts_at', { ascending: true })
      .limit(50)
    setTonightEvents((data as TonightEvent[] | null) ?? [])
    if (!user) setLoading(false)
  }

  async function fetchMyRsvps() {
    if (!user) return
    const { data } = await supabase
      .from('attendees')
      .select('events(id, title, starts_at, poster_url, category, like_count, venues(id, name))')
      .eq('user_id', user.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = (data ?? []).map((r: any) => r.events).filter(Boolean)
      .filter((e: TonightEvent) => e.starts_at?.startsWith(today))
    setMyRsvps(events as TonightEvent[])
  }

  async function fetchFriendActivity() {
    if (!user) return
    // Get users I follow
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .eq('status', 'accepted')

    const friendIds = (followData ?? []).map((r: { following_id: string }) => r.following_id)
    if (friendIds.length === 0) { setLoading(false); return }

    // Get their attendances for tonight
    const { data: attendData } = await supabase
      .from('attendees')
      .select('user_id, event_id, profiles(username, avatar_url), events(title, starts_at)')
      .in('user_id', friendIds)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tonight = (attendData ?? [] as any[]).filter((r: any) =>
      r.events?.starts_at?.startsWith(today)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).map((r: any) => ({
      user_id: r.user_id as string,
      username: (r.profiles?.username ?? null) as string | null,
      avatar_url: (r.profiles?.avatar_url ?? null) as string | null,
      event_id: r.event_id as string,
      event_title: (r.events?.title ?? '') as string,
    }))

    setFriendActivity(tonight)
    setLoading(false)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <PlasterHeader />

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <p style={emptyStyle}>Loading…</p>
        )}

        {/* Login prompt if not authenticated */}
        {!user && !loading && (
          <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, color: 'var(--fg-65)', textAlign: 'center', lineHeight: 1.5 }}>
              Sign in to see friend activity and save your RSVPs
            </p>
            <button
              onClick={() => navigate('/auth')}
              style={{
                padding: '12px 28px',
                borderRadius: 14,
                border: 'none',
                background: 'var(--fg)',
                color: 'var(--bg)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </div>
        )}

        {/* My RSVPs */}
        {user && myRsvps.length > 0 && (
          <Section label="Your plans">
            {myRsvps.map((ev) => <EventRow key={ev.id} event={ev} />)}
          </Section>
        )}

        {/* Friend activity */}
        {user && friendActivity.length > 0 && (
          <Section label="Friends going out">
            {friendActivity.map((fa, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--fg-08)' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: 'var(--fg-08)', flexShrink: 0 }}>
                  {fa.avatar_url && <img src={fa.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                    @{fa.username}
                  </p>
                  <p style={{ margin: '1px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fa.event_title}
                  </p>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* All tonight events */}
        {tonightEvents.length > 0 && (
          <Section label="Happening tonight">
            {tonightEvents.map((ev) => <EventRow key={ev.id} event={ev} />)}
          </Section>
        )}

        {!loading && tonightEvents.length === 0 && (
          <p style={emptyStyle}>Nothing on the wall for tonight yet</p>
        )}

        <div style={{ height: 'var(--nav-height)' }} />
      </div>

      <BottomNav />
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ margin: 0, padding: '14px 20px 6px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)' }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function EventRow({ event }: { event: TonightEvent }) {
  const time = new Date(event.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--fg-08)' }}>
      {/* Mini poster */}
      <div style={{ width: 38, height: 57, borderRadius: 4, overflow: 'hidden', background: 'var(--fg-08)', flexShrink: 0 }}>
        {event.poster_url && <img src={event.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
        </p>
        {event.venues?.name && (
          <p style={{ margin: '1px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.venues.name}
          </p>
        )}
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)' }}>{time}</p>
        {event.like_count > 0 && (
          <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)' }}>{'♥\uFE0E'} {event.like_count}</p>
        )}
      </div>
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: 60,
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  color: 'var(--fg-30)',
}
