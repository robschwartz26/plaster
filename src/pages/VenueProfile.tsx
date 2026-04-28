import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, type DbVenue } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader } from '@/components/PlasterHeader'

interface VenueEvent {
  id: string
  title: string
  starts_at: string
  poster_url: string | null
  category: string | null
}

export function VenueProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [venue, setVenue] = useState<DbVenue | null>(null)
  const [events, setEvents] = useState<VenueEvent[]>([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('venues').select('*').eq('id', id).single(),
      supabase.from('events').select('id, title, starts_at, poster_url, category')
        .eq('venue_id', id)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(20),
    ]).then(([{ data: v }, { data: ev }]) => {
      setVenue(v as DbVenue | null)
      setEvents((ev as VenueEvent[] | null) ?? [])
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!user || !id) return
    supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', id).single()
      .then(({ data }) => setIsFollowing(!!data))
  }, [user, id])

  async function toggleFollow() {
    if (!user || !id) return
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', id)
      setIsFollowing(false)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: id })
      setIsFollowing(true)
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--fg-30)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  if (!venue) {
    return (
      <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--fg-30)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14 }}>Venue not found</p>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlasterHeader actions={
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 32, height: 32, borderRadius: 4,
            border: '1px solid var(--fg-18)',
            background: 'transparent',
            color: 'var(--fg-65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
      } />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Hero image */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/7', background: 'var(--fg-08)', flexShrink: 0 }}>
          {venue.cover_url ? (
            <img src={venue.cover_url} alt={venue.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #1a0533 0%, #3b0764 100%)' }} />
          )}

        </div>

        {/* Identity row */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* Avatar */}
          {venue.avatar_url && (
            <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0, marginTop: -30, border: '2px solid var(--bg)' }}>
              <img src={venue.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h1 style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--fg)', lineHeight: 1.2 }}>
                {venue.name}
              </h1>
              {venue.is_verified && (
                <span style={{ fontSize: 14 }}>✓</span>
              )}
            </div>
            {venue.neighborhood && (
              <p style={{ margin: '3px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
                {venue.neighborhood}
              </p>
            )}
          </div>

          {/* Follow button */}
          <button
            onClick={toggleFollow}
            style={{
              flexShrink: 0,
              padding: '8px 18px',
              borderRadius: 20,
              border: isFollowing ? '1.5px solid var(--fg-25)' : 'none',
              background: isFollowing ? 'transparent' : 'var(--fg)',
              color: isFollowing ? 'var(--fg-55)' : 'var(--bg)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>

        {/* Details */}
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {venue.description && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.5 }}>
              {venue.description}
            </p>
          )}
          {venue.address && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
              📍 {venue.address}
            </p>
          )}
          {venue.website && (
            <a
              href={venue.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', textDecoration: 'none' }}
            >
              🌐 {venue.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {venue.instagram && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
              @{venue.instagram.replace(/^@/, '')}
            </p>
          )}
        </div>

        {/* Upcoming events */}
        {events.length > 0 && (
          <div style={{ padding: '0 20px' }}>
            <p style={sectionLabel}>Upcoming</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {events.map((ev) => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--fg-08)' }}>
                  {/* Mini poster */}
                  <div style={{ width: 38, height: 57, borderRadius: 4, overflow: 'hidden', background: 'var(--fg-08)', flexShrink: 0 }}>
                    {ev.poster_url && <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                      {ev.title}
                    </p>
                    <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>
                      {formatEventDate(ev.starts_at)}
                    </p>
                  </div>
                  {ev.category && (
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>
                      {ev.category}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Superlatives placeholder */}
        <div style={{ padding: '20px 20px 0' }}>
          <p style={sectionLabel}>Superlatives</p>
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-25)' }}>
            Coming soon
          </p>
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (diffDays <= 0) return `Tonight · ${time}`
  if (diffDays === 1) return `Tomorrow · ${time}`
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`
}

const sectionLabel: React.CSSProperties = {
  margin: '0 0 10px',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--fg-30)',
}
