import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { NEIGHBORHOODS } from '@/components/admin/adminShared'

interface BoardVenue {
  id: string
  name: string
  neighborhood: string | null
  prominence: number | null
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

// How far ahead a venue is booked, and what that looks like at a glance. The
// board exists to find rooms that are about to go empty, so the name itself
// carries the signal rather than a badge you have to hunt for.
const DAY_MS = 24 * 60 * 60 * 1000
const COVERAGE = {
  deep:  { days: 180, color: '#4ade80', label: '6+ months booked' },   // + star
  good:  { days: 90,  color: '#4ade80', label: '3+ months booked' },
  thin:  { days: 30,  color: 'rgba(251,146,60,0.95)', label: 'under 3 months' },
  empty: { days: 0,   color: '#ef4444', label: 'under a month — needs events' },
}

function coverageOf(coveredThru: string | null): { color: string; star: boolean; label: string } {
  if (!coveredThru) return { color: COVERAGE.empty.color, star: false, label: 'no shows' }
  const daysOut = (new Date(coveredThru).getTime() - Date.now()) / DAY_MS
  if (daysOut >= COVERAGE.deep.days) return { color: COVERAGE.deep.color, star: true, label: COVERAGE.deep.label }
  if (daysOut >= COVERAGE.good.days) return { color: COVERAGE.good.color, star: false, label: COVERAGE.good.label }
  if (daysOut >= COVERAGE.thin.days) return { color: COVERAGE.thin.color, star: false, label: COVERAGE.thin.label }
  return { color: COVERAGE.empty.color, star: false, label: COVERAGE.empty.label }
}

// Prominence buckets. Unranked is where every NEW venue starts, so it is a
// normal state the board shows plainly rather than an error.
const TIERS: { key: string; label: string; match: (p: number | null) => boolean }[] = [
  { key: 'marquee',      label: 'Marquee',      match: p => p === 1 },
  { key: 'core',         label: 'Core rooms',   match: p => p === 2 },
  { key: 'neighborhood', label: 'Neighborhood', match: p => p === 3 },
  { key: 'unranked',     label: 'Unranked',     match: p => p == null },
]

const SORT_KEY = 'staff-venue-board-sort'

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
  const { user, isAdmin } = useAuth()
  const [venues, setVenues] = useState<BoardVenue[]>([])
  const [events, setEvents] = useState<BoardEvent[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [collapsedNeighborhoods, setCollapsedNeighborhoods] = useState<Set<string>>(loadCollapsed)
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Record<string, string>>({}) // venue_id -> worker_id
  const [roster, setRoster] = useState<{ id: string; username: string }[]>([])
  const [assigningVenueId, setAssigningVenueId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<'area' | 'prominence'>(() => {
    try { return localStorage.getItem(SORT_KEY) === 'prominence' ? 'prominence' : 'area' } catch { return 'area' }
  })
  function pickSort(m: 'area' | 'prominence') {
    setSortMode(m)
    try { localStorage.setItem(SORT_KEY, m) } catch { /* noop */ }
  }

  const fetchAll = useCallback(async () => {
    if (!user) return
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const [venuesRes, eventsRes, checkoffsRes, assignmentsRes, rosterRes] = await Promise.all([
      supabase.from('venues').select('id, name, neighborhood, prominence').order('name'),
      supabase.from('events').select('id, title, starts_at, status, created_by, created_at, venue_id').gte('starts_at', cutoff).order('starts_at'),
      supabase.from('staff_venue_checkoff').select('venue_id'),
      supabase.from('staff_venue_assignments').select('venue_id, worker_id'),
      supabase.rpc('staff_roster'),
    ])
    if (venuesRes.data) setVenues(venuesRes.data as BoardVenue[])
    if (eventsRes.data) setEvents(eventsRes.data as BoardEvent[])
    if (checkoffsRes.data) setCheckedIds(new Set(checkoffsRes.data.map(r => r.venue_id)))
    if (assignmentsRes.data) setAssignments(Object.fromEntries(assignmentsRes.data.map(r => [r.venue_id, r.worker_id])))
    if (rosterRes.data) setRoster((rosterRes.data as { id: string; username: string }[]).map(r => ({ id: r.id, username: r.username })))
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

  // Admin-only writes (RLS also enforces is_admin). Optimistic, revert on error.
  async function assignVenue(venueId: string, workerId: string) {
    if (!user) return
    setAssignments(prev => ({ ...prev, [venueId]: workerId }))
    setAssigningVenueId(null)
    const { error } = await supabase.from('staff_venue_assignments')
      .upsert({ venue_id: venueId, worker_id: workerId, assigned_by: user.id }, { onConflict: 'venue_id' })
    if (error) { console.error('[VenueBoard] assign failed', error); fetchAll() }
  }
  async function unassignVenue(venueId: string) {
    setAssignments(prev => { const next = { ...prev }; delete next[venueId]; return next })
    setAssigningVenueId(null)
    const { error } = await supabase.from('staff_venue_assignments').delete().eq('venue_id', venueId)
    if (error) { console.error('[VenueBoard] unassign failed', error); fetchAll() }
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

  // Assignments: worker_id -> username for chips; the current user's own venues
  // get pinned to a "Your venues" section and dropped from neighborhood groups.
  const rosterNames: Record<string, string> = Object.fromEntries(roster.map(r => [r.id, r.username]))
  const myVenueIds = new Set(venues.filter(v => assignments[v.id] && assignments[v.id] === user?.id).map(v => v.id))
  const myVenues = venues.filter(v => myVenueIds.has(v.id)).sort((a, b) => a.name.localeCompare(b.name))

  // Two ways to read the same list. By area answers "whose patch is this";
  // by prominence answers "what hurts most if it goes empty". Empty groups are
  // dropped either way, so Unranked only appears once a venue lands in it.
  const boardVenues = venues.filter(v => !myVenueIds.has(v.id)) // the rest are pinned above in "Your venues"

  const sections: { label: string; venues: BoardVenue[] }[] = []
  if (sortMode === 'area') {
    const byNeighborhood: Record<string, BoardVenue[]> = {}
    for (const v of boardVenues) {
      const key = v.neighborhood && NEIGHBORHOODS.includes(v.neighborhood as typeof NEIGHBORHOODS[number]) ? v.neighborhood : 'Other'
      ;(byNeighborhood[key] ??= []).push(v)
    }
    for (const n of [...NEIGHBORHOODS, 'Other']) {
      if (byNeighborhood[n]?.length) sections.push({ label: n, venues: byNeighborhood[n] })
    }
  } else {
    for (const t of TIERS) {
      const inTier = boardVenues.filter(v => t.match(v.prominence))
      if (inTier.length) sections.push({ label: t.label, venues: inTier })
    }
  }

  // ── Venue row renderer (shared by "Your venues" + neighborhood groups) ──
  function renderVenueRow(venue: BoardVenue) {
    const venueEvents = (eventsByVenue[venue.id] ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const hasShows = venueEvents.length > 0
    const isChecked = checkedIds.has(venue.id)
    const isExpanded = expandedIds.has(venue.id)

    // Staleness: no upcoming shows OR newest created_at >21 days ago
    const maxCreatedAt = hasShows ? Math.max(...venueEvents.map(e => new Date(e.created_at).getTime())) : 0
    const isStale = !hasShows || (Date.now() - maxCreatedAt > STALE_MS)

    // Coverage high-water mark: latest pending/published show (visibility, not a gate)
    const coveredEvents = venueEvents.filter(e => e.status === 'pending' || e.status === 'published')
    const coveredThru = coveredEvents.length
      ? coveredEvents.reduce((max, e) => e.starts_at > max ? e.starts_at : max, coveredEvents[0].starts_at)
      : null

    const cover = coverageOf(coveredThru)
    const nextShow = venueEvents[0]

    const assignedWorkerId = assignments[venue.id]
    const assigneeName = assignedWorkerId ? rosterNames[assignedWorkerId] : undefined
    const isPicking = assigningVenueId === venue.id

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
              style={{ width: 30, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-30)', fontSize: 10, transition: 'color 0.15s' }}
            >
              <span style={{ display: 'inline-block', transition: 'transform 0.22s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
            </button>
          ) : (
            <div style={{ width: 30, flexShrink: 0 }} />
          )}

          {/* Venue name + meta — clicking expands if has shows */}
          <button
            onClick={() => hasShows && toggleExpand(venue.id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '9px 8px 9px 2px', background: isExpanded ? 'rgba(240,236,227,0.04)' : 'transparent', border: 'none', cursor: hasShows ? 'pointer' : 'default', textAlign: 'left' }}
          >
            <span title={cover.label} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: cover.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {cover.star && <span style={{ marginRight: 4 }}>★</span>}
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

          {/* Assignee — admin can (re)assign; everyone else sees a read-only chip */}
          {isAdmin ? (
            <button
              onClick={(e) => { e.stopPropagation(); setAssigningVenueId(prev => prev === venue.id ? null : venue.id) }}
              title={assigneeName ? `Assigned to @${assigneeName}` : 'Assign a venue owner'}
              style={{
                flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 600,
                padding: '2px 7px', marginRight: 2, borderRadius: 4, cursor: 'pointer',
                border: assigneeName ? '1px solid rgba(168,85,247,0.4)' : '1px dashed var(--fg-15)',
                background: assigneeName ? 'rgba(168,85,247,0.1)' : 'transparent',
                color: assigneeName ? '#A855F7' : 'var(--fg-30)',
              }}
            >
              {assigneeName ? `@${assigneeName}` : 'assign'}
            </button>
          ) : assigneeName ? (
            <span style={{ flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 600, padding: '2px 7px', marginRight: 2, borderRadius: 4, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', color: '#A855F7' }}>
              @{assigneeName}
            </span>
          ) : null}

          {/* Check-off — far right, stopPropagation */}
          <button
            onClick={(e) => toggleCheckoff(venue.id, e)}
            title={isChecked ? 'Mark as not done' : 'Mark as done'}
            style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: isChecked ? '#4ade80' : 'var(--fg-25)', fontSize: 15, lineHeight: 1 }}
          >
            {isChecked ? '✓' : '○'}
          </button>
        </div>

        {/* Admin assignee picker — inline (role-gated, RLS-enforced) */}
        {isAdmin && isPicking && (
          <div style={{ borderTop: '1px solid var(--fg-08)', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', marginRight: 2 }}>Assign to</span>
            {roster.map(r => (
              <button
                key={r.id}
                onClick={() => assignVenue(venue.id, r.id)}
                style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', border: r.id === assignedWorkerId ? '1px solid rgba(168,85,247,0.4)' : '1px solid var(--fg-15)', background: r.id === assignedWorkerId ? 'rgba(168,85,247,0.1)' : 'transparent', color: r.id === assignedWorkerId ? '#A855F7' : 'var(--fg-65)' }}
              >
                @{r.username}
              </button>
            ))}
            {assignedWorkerId && (
              <button
                onClick={() => unassignVenue(venue.id)}
                style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#ef4444' }}
              >
                Unassign
              </button>
            )}
          </div>
        )}

        {/* Show list — cascading expand */}
        <div style={{ overflow: 'hidden', maxHeight: isExpanded ? 620 : 0, opacity: isExpanded ? 1 : 0, transition: 'max-height 0.25s ease, opacity 0.2s ease' }}>
          <div style={{ borderTop: '1px solid var(--fg-08)', padding: '8px 12px 10px' }}>
            {venueEvents.length > 8 && (
              <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', marginBottom: 6 }}>
                {venueEvents.length} upcoming · scroll for the rest
              </div>
            )}
            {/* Scrolls rather than clipping: a deeply-booked venue used to have
                its later dates cut off with no way to reach them. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 540, overflowY: 'auto', overscrollBehavior: 'contain' }}>
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
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '0 0 8px 0' }}>
        <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Venue board
        </h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['area', 'By area'], ['prominence', 'By prominence']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => pickSort(mode)}
              style={{
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
                padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                border: sortMode === mode ? '1px solid rgba(168,85,247,0.45)' : '1px solid var(--fg-15)',
                background: sortMode === mode ? 'rgba(168,85,247,0.1)' : 'transparent',
                color: sortMode === mode ? '#A855F7' : 'var(--fg-40)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* What the name colours mean — otherwise they are just decoration. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', margin: '0 0 12px 0' }}>
        <span><span style={{ color: COVERAGE.deep.color }}>★ name</span> 6 mo+</span>
        <span><span style={{ color: COVERAGE.good.color }}>name</span> 3 mo+</span>
        <span><span style={{ color: COVERAGE.thin.color }}>name</span> 1–3 mo</span>
        <span><span style={{ color: COVERAGE.empty.color }}>name</span> under a month</span>
      </div>

      {/* Coverage gauge */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: '0 0 6px 0' }}>
          {coveredCount} of {venues.length} venues have an upcoming show
        </p>
        <div style={{ height: 3, background: 'var(--fg-08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${coveragePct}%`, background: '#A855F7', borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Your venues — the current user's assigned venues, pinned to the top */}
      {myVenues.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 4px 6px 0', borderBottom: '1px solid var(--fg-15)', marginBottom: 6 }}>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#A855F7', flex: 1 }}>
              Your venues
            </span>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)' }}>
              {myVenues.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
            {myVenues.map(venue => renderVenueRow(venue))}
          </div>
        </div>
      )}

      {/* Neighborhood groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sections.map(section => {
          const neighborhoodName = section.label
          const group = section.venues
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
                  {sorted.map(venue => renderVenueRow(venue))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
