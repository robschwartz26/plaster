import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { NEIGHBORHOODS } from '@/components/admin/adminShared'

interface BoardVenue {
  id: string
  name: string
  neighborhood: string | null
}

interface BoardEvent {
  id: string
  title: string
  starts_at: string
  status: string
  created_by: string
  created_at: string
  venue_id: string
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short', day: 'numeric',
  })
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    published: { color: '#4ade80',             bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)', label: 'LIVE'    },
    pending:   { color: 'rgba(217,119,6,0.9)', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.3)',  label: 'PENDING' },
  }
  const s = cfg[status] ?? cfg.pending
  return (
    <span style={{
      fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      padding: '2px 6px', borderRadius: 3, flexShrink: 0,
    }}>
      {s.label}
    </span>
  )
}

export function VenueBoard() {
  const { user } = useAuth()
  const [venues, setVenues] = useState<BoardVenue[]>([])
  const [events, setEvents] = useState<BoardEvent[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const [venuesRes, eventsRes, checkoffsRes] = await Promise.all([
      supabase.from('venues').select('id, name, neighborhood').order('name'),
      supabase.from('events')
        .select('id, title, starts_at, status, created_by, created_at, venue_id')
        .gte('starts_at', cutoff)
        .order('starts_at'),
      supabase.from('staff_venue_checkoff').select('venue_id'),
    ])
    if (venuesRes.data) setVenues(venuesRes.data as BoardVenue[])
    if (eventsRes.data) setEvents(eventsRes.data as BoardEvent[])
    if (checkoffsRes.data) setCheckedIds(new Set(checkoffsRes.data.map(r => r.venue_id)))
    setLoading(false)
  }, [user])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function toggleCheckoff(venueId: string) {
    if (!user) return
    const isChecked = checkedIds.has(venueId)
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (isChecked) next.delete(venueId); else next.add(venueId)
      return next
    })
    if (isChecked) {
      const { error } = await supabase.from('staff_venue_checkoff')
        .delete().match({ worker_id: user.id, venue_id: venueId })
      if (error) setCheckedIds(prev => { const next = new Set(prev); next.add(venueId); return next })
    } else {
      const { error } = await supabase.from('staff_venue_checkoff')
        .insert({ worker_id: user.id, venue_id: venueId })
      if (error) setCheckedIds(prev => { const next = new Set(prev); next.delete(venueId); return next })
    }
  }

  function toggleExpand(venueId: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(venueId)) next.delete(venueId); else next.add(venueId)
      return next
    })
  }

  if (loading) {
    return (
      <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
        Loading venues…
      </p>
    )
  }

  // Index events by venue_id
  const eventsByVenue: Record<string, BoardEvent[]> = {}
  for (const e of events) {
    if (!eventsByVenue[e.venue_id]) eventsByVenue[e.venue_id] = []
    eventsByVenue[e.venue_id].push(e)
  }

  // Coverage gauge
  const coveredCount = venues.filter(v => (eventsByVenue[v.id]?.length ?? 0) > 0).length
  const coveragePct = venues.length > 0 ? (coveredCount / venues.length) * 100 : 0

  // Group venues by neighborhood (NEIGHBORHOODS order, then "Other")
  const neighborhoodOrder = [...NEIGHBORHOODS, 'Other']
  const byNeighborhood: Record<string, BoardVenue[]> = {}
  for (const v of venues) {
    const key = v.neighborhood && NEIGHBORHOODS.includes(v.neighborhood as typeof NEIGHBORHOODS[number])
      ? v.neighborhood
      : 'Other'
    if (!byNeighborhood[key]) byNeighborhood[key] = []
    byNeighborhood[key].push(v)
  }
  const activeNeighborhoods = neighborhoodOrder.filter(n => byNeighborhood[n]?.length)

  return (
    <div>
      {/* Heading */}
      <h3 style={{
        fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 700,
        color: 'var(--fg)', margin: '0 0 14px 0',
      }}>
        Venue board
      </h3>

      {/* Coverage gauge */}
      <div style={{ marginBottom: 24 }}>
        <p style={{
          fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)',
          margin: '0 0 6px 0',
        }}>
          {coveredCount} of {venues.length} venues have an upcoming show
        </p>
        <div style={{ height: 3, background: 'var(--fg-08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${coveragePct}%`,
            background: '#A855F7', borderRadius: 2,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Neighborhood groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {activeNeighborhoods.map(neighborhoodName => {
          const group = byNeighborhood[neighborhoodName]
          // Unchecked venues first (alpha), checked venues at bottom (alpha)
          const sorted = [
            ...group.filter(v => !checkedIds.has(v.id)).sort((a, b) => a.name.localeCompare(b.name)),
            ...group.filter(v => checkedIds.has(v.id)).sort((a, b) => a.name.localeCompare(b.name)),
          ]
          return (
            <div key={neighborhoodName}>
              <p style={{
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--fg-40)', margin: '0 0 6px 0',
              }}>
                {neighborhoodName}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sorted.map(venue => {
                  const venueEvents = (eventsByVenue[venue.id] ?? [])
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                  const nextShow = venueEvents[0]
                  const isChecked = checkedIds.has(venue.id)
                  const isExpanded = expandedIds.has(venue.id)

                  return (
                    <div
                      key={venue.id}
                      style={{
                        borderRadius: 7, border: '1px solid var(--fg-08)',
                        overflow: 'hidden',
                        opacity: isChecked ? 0.45 : 1,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      {/* Venue header row */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {/* Expand toggle */}
                        <button
                          onClick={() => toggleExpand(venue.id)}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '9px 10px 9px 12px', gap: 10,
                            background: isExpanded ? 'rgba(240,236,227,0.04)' : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <span style={{
                            fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600,
                            color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {venue.name}
                          </span>
                          <span style={{
                            fontFamily: '"Space Grotesk", sans-serif', fontSize: 11,
                            color: nextShow ? 'var(--fg-40)' : 'rgba(251,146,60,0.7)',
                            flexShrink: 0,
                          }}>
                            {nextShow ? fmtShort(nextShow.starts_at) : '⚠ no upcoming shows'}
                          </span>
                        </button>

                        {/* Check-off toggle */}
                        <button
                          onClick={() => toggleCheckoff(venue.id)}
                          title={isChecked ? 'Mark as not done' : 'Mark as done'}
                          style={{
                            width: 36, height: 36, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: isChecked ? '#4ade80' : 'var(--fg-25)',
                            fontSize: 15, lineHeight: 1,
                          }}
                        >
                          {isChecked ? '✓' : '○'}
                        </button>
                      </div>

                      {/* Expanded show list */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--fg-08)', padding: '8px 12px 10px' }}>
                          {venueEvents.length === 0 ? (
                            <p style={{
                              fontFamily: '"Space Grotesk", sans-serif', fontSize: 12,
                              color: 'var(--fg-40)', fontStyle: 'italic', margin: 0,
                            }}>
                              No shows yet — add one with the ingester.
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {venueEvents.map(e => {
                                const isOwnPending = e.status === 'pending' && e.created_by === user?.id
                                return (
                                  <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                        <span style={{
                                          fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600,
                                          color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                          {e.title}
                                        </span>
                                        <StatusPill status={e.status} />
                                      </div>
                                      <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', marginTop: 2 }}>
                                        {fmtDate(e.starts_at)} at {fmtTime(e.starts_at)}
                                        {isOwnPending && (
                                          <span style={{ marginLeft: 6, color: 'var(--fg-30)' }}>
                                            · added {fmtShort(e.created_at)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
