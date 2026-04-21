import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface FollowVenue {
  id: string
  name: string
  neighborhood: string | null
  address: string | null
  cover_url: string | null
  avatar_url: string | null
  banner_url: string | null
  diamond_focal_x: number | null
  diamond_focal_y: number | null
}

interface VenueEvent {
  id: string
  title: string
  starts_at: string
  poster_url: string | null
  category: string | null
}

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  Music:    ['#4c1d95', '#7c3aed'],
  Drag:     ['#831843', '#ec4899'],
  Dance:    ['#7c2d12', '#f97316'],
  Literary: ['#3730a3', '#818cf8'],
  Art:      ['#365314', '#a3e635'],
  Film:     ['#0c4a6e', '#38bdf8'],
  Trivia:   ['#7c2d12', '#fb923c'],
  Other:    ['#2e1065', '#a855f7'],
}
function catGradient(cat: string | null | undefined): string {
  const [c1, c2] = CATEGORY_GRADIENTS[cat ?? ''] ?? CATEGORY_GRADIENTS.Other
  return `conic-gradient(from 0deg at 50% 50%, ${c1}, ${c2}, ${c1})`
}

interface Props {
  venue: FollowVenue
  onBack: () => void
}

export function VenueSubPanel({ venue, onBack }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [toggling,    setToggling]    = useState(false)
  const [events,      setEvents]      = useState<VenueEvent[] | null>(null)

  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, starts_at, poster_url, category')
      .eq('venue_id', venue.id)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(9)
      .then(({ data }) => setEvents((data as VenueEvent[] | null) ?? []))
  }, [venue.id])

  useEffect(() => {
    if (!user) return
    supabase
      .from('venue_follows')
      .select('id')
      .eq('user_id', user.id)
      .eq('venue_id', venue.id)
      .single()
      .then(({ data }) => setIsFollowing(!!data))
  }, [user, venue.id])

  async function toggleFollow() {
    if (!user) return
    setToggling(true)
    if (isFollowing) {
      await supabase.from('venue_follows').delete().eq('user_id', user.id).eq('venue_id', venue.id)
      setIsFollowing(false)
    } else {
      await supabase.from('venue_follows').insert({ user_id: user.id, venue_id: venue.id })
      setIsFollowing(true)
    }
    setToggling(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Back — pinned */}
      <div style={{
        display: 'flex', alignItems: 'center',
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
        flexShrink: 0, borderBottom: '1px solid var(--fg-08)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--fg-55)', padding: 0,
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em',
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          BACK
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Banner */}
        <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--fg-08)', overflow: 'hidden', flexShrink: 0 }}>
          {(venue.banner_url ?? venue.cover_url) ? (
            <img
              src={venue.banner_url ?? venue.cover_url!}
              alt={venue.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #1a0533 0%, #3b0764 100%)' }} />
          )}
        </div>

        {/* Name + follow */}
        <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              margin: 0,
              fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 20,
              color: 'var(--fg)', lineHeight: 1.2,
            }}>
              {venue.name}
            </h2>
            {(venue.neighborhood || venue.address) && (
              <p style={{ margin: '4px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
                {venue.neighborhood ?? venue.address}
              </p>
            )}
          </div>
          <button
            onClick={toggleFollow}
            disabled={toggling || !user}
            style={{
              flexShrink: 0,
              padding: '8px 18px', borderRadius: 20,
              border: isFollowing ? '1.5px solid var(--fg-25)' : 'none',
              background: isFollowing ? 'transparent' : 'var(--fg)',
              color: isFollowing ? 'var(--fg-55)' : 'var(--bg)',
              fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 700,
              cursor: toggling ? 'not-allowed' : 'pointer', opacity: toggling ? 0.6 : 1,
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>

        {/* Upcoming events grid */}
        <div style={{ padding: '20px 16px 0' }}>
          <p style={{
            margin: '0 0 10px',
            fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 11,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)',
          }}>
            Upcoming
          </p>
          {events === null && (
            <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-30)' }}>Loading…</p>
          )}
          {events !== null && events.length === 0 && (
            <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-30)' }}>No upcoming events</p>
          )}
          {events !== null && events.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {events.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => navigate('/', { state: { openEventId: ev.id } })}
                  style={{
                    aspectRatio: '2/3', borderRadius: 4, overflow: 'hidden',
                    cursor: 'pointer', position: 'relative',
                    background: catGradient(ev.category),
                  }}
                >
                  {ev.poster_url && (
                    <img
                      src={ev.poster_url}
                      alt={ev.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
