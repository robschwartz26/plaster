import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { type DbVenue } from '@/lib/supabase'
import { PlasterHeader } from '@/components/PlasterHeader'

export function VenuesScreen() {
  const [venues, setVenues] = useState<DbVenue[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('venues')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setVenues((data as DbVenue[] | null) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      <PlasterHeader />

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <p style={emptyStyle}>Loading…</p>
        )}
        {!loading && venues.length === 0 && (
          <p style={emptyStyle}>No venues yet</p>
        )}
        {venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} onTap={() => navigate(`/venue/${venue.id}`)} />
        ))}
        <div style={{ height: 'var(--nav-height)' }} />
      </div>

    </div>
  )
}

function VenueCard({ venue, onTap }: { venue: DbVenue; onTap: () => void }) {
  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 20px',
        borderBottom: '1px solid var(--fg-08)',
        cursor: 'pointer',
        background: 'var(--bg)',
        transition: 'background 100ms ease',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 10,
          flexShrink: 0,
          overflow: 'hidden',
          background: 'var(--fg-08)',
        }}
      >
        {venue.avatar_url ? (
          <img
            src={venue.avatar_url}
            alt={venue.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            🏛
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p
            style={{
              margin: 0,
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {venue.name}
          </p>
          {venue.is_verified && (
            <span style={{ fontSize: 12, flexShrink: 0 }}>✓</span>
          )}
        </div>
        {venue.neighborhood && (
          <p
            style={{
              margin: '2px 0 0',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 12,
              color: 'var(--fg-40)',
            }}
          >
            {venue.neighborhood}
          </p>
        )}
      </div>

      {/* Chevron */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fg-25)', flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
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
