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

const STALE_MS = 21 * 24 * 60 * 60 * 1000
const COLLAPSED_KEY = 'staff-venue-board-collapsed'

function loadCollapsed(): Set<string> {
  try { const raw = localStorage.getItem(COLLAPSED_KEY); return raw ? new Set(JSON.parse(raw)) : new Set() } catch { return new Set() }
}
function saveCollapsed(s: Set<string>) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...s])) } catch { /* noop */ }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })
}
function fmtMD(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric' })
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    published: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)', label: 'LIVE' },
    pending:   { color: 'rgba(217,119,6,0.9)', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.3)', label: 'PENDING' },
  }
  const s = cfg[status] ?? cfg.pending
  return (
    <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.color, background: s.bg, border: `1px solid ${s.border}`, padding: '2px 6px', borderRadius: 3, flexShrink: 0 }}>
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
  const [collapsedNeighborhoods, setCollapsedNeighborhoods] = useState<Set<string>>(loadCollapsed)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const [venuesRes, eventsRes, checkoffsRes] = await Promise.all([
      supabase.from('venues').select('id, name, neighborhood').order('name'),
      supabase.from('events').select('id, title, starts_at, status, created_by, created_at, venue_id').gte('starts_at', cutoff).order('starts_at'),
      supabase.from('staff_venue_checkoff').select('venue_id'),
    ])
    if (venuesRes.data) setVenues(venuesRes.data as BoardVenue[])
    if (eventsRes.data) setEvents(eventsRes.data as BoardEvent[])
    if (checkoffsRes.data) setCheckedIds(new Set(checkoffsRes.data.map(r => r.venue_id)))
    setLoading(false)
  }, [user])

  useEffect(() => { fetchAll() }, [fetchAll])

  function toggleNeighborhood(name: string) {
    setCollapsedNeighborhoods(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      saveCollapsed(next)
      return next
    })
  }

  async function toggleCheckoff(venueId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!user) return
    const isChecked = checkedIds.has(venueId)
    setCheckedIds(prev => { const next = new Set(prev); if (isChecked) next.delete(venueId); else next.add(venueId); return next })
    if (isChecked) {
      const { error } = await supabase.from('staff_venue_checkoff').delete().match({ worker_id: user.id, venue_id: venueId })
      if (error) setCheckedIds(prev => { const next = new Set(prev); next.add(venueId); return next })
    } else {
      const { error } = await supabase.from('staff_venue_checkoff').insert({ worker_id: user.id, venue_id: venueId })
      if (error) setCheckedIds(prev => { const next = new Set(prev); next.delete(venueId); return next })
    }
  }

  function toggleExpand(venueId: string) {
    setExpandedIds(prev => { const next = new Set(prev); if (next.has(venueId)) next.delete(venueId); else next.add(venueId); return next })
  }

  if (loading) {
    return <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>Loading venues…</p>
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

  // Neighborhood grouping
  const neighborhoodOrder = [...NEIGHBORHOODS, 'Other']
  const byNeighborhood: Record<string, BoardVenue[]> = {}
  for (const v of venues) {
    const key = v.neighborhood && NEIGHBORHOODS.includes(v.neighborhood as typeof NEIGHBORHOODS[number]) ? v.neighborhood : 'Other'
    if (!byNeighborhood[key]) byNeighborhood[key] = []
    byNeighborhood[key].push(v)
  }
  const activeNeighborhoods = neighborhoodOrder.filter(n => byNeighborhood[n]?.length)

  return (
    <div>
      <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: '0 0 14px 0' }}>
        Venue board
      </h3>

      {/* Coverage gauge */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: '0 0 6px 0' }}>
          {coveredCount} of {venues.length} venues have an upcoming show
        </p>
        <div style={{ height: 3, background: 'var(--fg-08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${coveragePct}%`, background: '#A855F7', borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Neighborhood groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {activeNeighborhoods.map(neighborhoodName => {
          const group = byNeighborhood[neighborhoodName]
          const isNeighborhoodCollapsed = collapsedNeighborhoods.has(neighborhoodName)
          const sorted = [
            ...group.filter(v => !checkedIds.has(v.id)).sort((a, b) => a.name.localeCompare(b.name)),
            ...group.filter(v => checkedIds.has(v.id)).sort((a, b) => a.name.localeCompare(b.name)),
          ]

          return (
            <div key={neighborhoodName} style={{ marginBottom: 12 }}>
              {/* Neighborhood header — collapsible */}
              <button
                onClick={() => toggleNeighborhood(neighborhoodName)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 4px 6px 0',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--fg-15)',
                  marginBottom: isNeighborhoodCollapsed ? 0 : 6,
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--fg-55)', lineHeight: 1, flexShrink: 0, transition: 'transform 0.2s', display: 'inline-block', transform: isNeighborhoodCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>▸</span>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-65)', flex: 1, textAlign: 'left' }}>
                  {neighborhoodName}
                </span>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', flexShrink: 0 }}>
                  {sorted.length} venue{sorted.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Venue rows — cascading collapse */}
              <div style={{
                overflow: 'hidden',
                maxHeight: isNeighborhoodCollapsed ? 0 : 2000,
                opacity: isNeighborhoodCollapsed ? 0 : 1,
                transition: 'max-height 0.28s ease, opacity 0.22s ease',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
                  {sorted.map(venue => {
                    const venueEvents = (eventsByVenue[venue.id] ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                    const hasShows = venueEvents.length > 0
                    const isChecked = checkedIds.has(venue.id)
                    const isExpanded = expandedIds.has(venue.id)

                    // Staleness: no upcoming shows OR newest created_at >21 days ago
                    const maxCreatedAt = hasShows ? Math.max(...venueEvents.map(e => new Date(e.created_at).getTime())) : 0
                    const isStale = !hasShows || (Date.now() - maxCreatedAt > STALE_MS)

                    // Coverage high-water mark: latest pending/published show — quiet
                    // visibility for "how far ahead is this venue ingested" (NOT a
                    // gate; dedupe remains the overlap protection).
                    const coveredEvents = venueEvents.filter(e => e.status === 'pending' || e.status === 'published')
                    const coveredThru = coveredEvents.length
                      ? coveredEvents.reduce((max, e) => e.starts_at > max ? e.starts_at : max, coveredEvents[0].starts_at)
                      : null

                    const nextShow = venueEvents[0]

                    return (
                      <div
                        key={venue.id}
                        style={{ borderRadius: 7, border: '1px solid var(--fg-08)', overflow: 'hidden', opacity: isChecked ? 0.45 : 1, transition: 'opacity 0.2s' }}
                      >
                        {/* Venue header row */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>

                          {/* Disclosure chevron (venues with shows only) */}
                          {hasShows ? (
                            <button
                              onClick={() => toggleExpand(venue.id)}
                              style={{
                                width: 30, height: 36, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--fg-30)', fontSize: 10,
                                transition: 'color 0.15s',
                              }}
                            >
                              <span style={{ display: 'inline-block', transition: 'transform 0.22s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
                            </button>
                          ) : (
                            <div style={{ width: 30, flexShrink: 0 }} />
                          )}

                          {/* Venue name + meta — clicking expands if has shows */}
                          <button
                            onClick={() => hasShows && toggleExpand(venue.id)}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                              padding: '9px 8px 9px 2px',
                              background: isExpanded ? 'rgba(240,236,227,0.04)' : 'transparent',
                              border: 'none', cursor: hasShows ? 'pointer' : 'default', textAlign: 'left',
                            }}
                          >
                            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {venue.name}
                              <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 500, color: 'var(--fg-30)' }}>
                                {coveredThru ? `thru ${fmtMD(coveredThru)}` : '—'}
                              </span>
                            </span>
                            {isStale && (
                              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-30)', background: 'var(--fg-08)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
                                stale
                              </span>
                            )}
                            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: nextShow ? 'var(--fg-40)' : 'rgba(251,146,60,0.7)', flexShrink: 0 }}>
                              {nextShow ? fmtShort(nextShow.starts_at) : '⚠ no shows'}
                            </span>
                          </button>

                          {/* Check-off — far right, stopPropagation */}
                          <button
                            onClick={(e) => toggleCheckoff(venue.id, e)}
                            title={isChecked ? 'Mark as not done' : 'Mark as done'}
                            style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: isChecked ? '#4ade80' : 'var(--fg-25)', fontSize: 15, lineHeight: 1 }}
                          >
                            {isChecked ? '✓' : '○'}
                          </button>
                        </div>

                        {/* Show list — cascading expand */}
                        <div style={{
                          overflow: 'hidden',
                          maxHeight: isExpanded ? 600 : 0,
                          opacity: isExpanded ? 1 : 0,
                          transition: 'max-height 0.25s ease, opacity 0.2s ease',
                        }}>
                          <div style={{ borderTop: '1px solid var(--fg-08)', padding: '8px 12px 10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {venueEvents.map(e => {
                                const isOwnPending = e.status === 'pending' && e.created_by === user?.id
                                return (
                                  <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {e.title}
                                        </span>
                                        <StatusPill status={e.status} />
                                      </div>
                                      <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', marginTop: 2 }}>
                                        {fmtDate(e.starts_at)} at {fmtTime(e.starts_at)}
                                        {isOwnPending && <span style={{ marginLeft: 6, color: 'var(--fg-30)' }}>· added {fmtShort(e.created_at)}</span>}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
