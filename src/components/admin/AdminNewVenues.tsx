import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { VenueForm } from '@/components/admin/VenueForm'

// New-venue intake: events the ingester parked because their venue is named on the
// page but not yet in our venues table. Grouped by raw_venue_name. Create the venue
// (form pre-filled from what we scraped) or assign to an existing one → the group's
// orphans relink into Review as normal pending events, correctly attributed.

interface Orphan {
  id: string
  title: string
  starts_at: string
  raw_venue_name: string | null
  raw_venue_address: string | null
  raw_venue_website: string | null
  category: string | null
}
interface VenueLite { id: string; name: string }

async function callIngest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not signed in')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `failed: ${res.status}`)
  return json
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })
}

export function AdminNewVenues({ onCountChange }: { onCountChange?: (n: number) => void } = {}) {
  const [orphans, setOrphans] = useState<Orphan[]>([])
  const [venues, setVenues] = useState<VenueLite[]>([])
  const [loading, setLoading] = useState(true)
  const [openCreate, setOpenCreate] = useState<string | null>(null)   // group name whose create-form is open
  const [openAssign, setOpenAssign] = useState<string | null>(null)
  const [assignVenueId, setAssignVenueId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const fetchOrphans = useCallback(async () => {
    const { data } = await supabase.from('ingest_orphans')
      .select('id, title, starts_at, raw_venue_name, raw_venue_address, raw_venue_website, category')
      .eq('status', 'open').order('raw_venue_name', { nullsFirst: false }).order('starts_at')
    const rows = (data ?? []) as Orphan[]
    setOrphans(rows)
    onCountChange?.(new Set(rows.map(o => o.raw_venue_name ?? '')).size)
    setLoading(false)
  }, [onCountChange])

  useEffect(() => { fetchOrphans() }, [fetchOrphans])
  useEffect(() => { supabase.from('venues').select('id, name').order('name').then(({ data }) => setVenues((data ?? []) as VenueLite[])) }, [])

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; address: string | null; website: string | null; events: Orphan[] }>()
    for (const o of orphans) {
      const key = o.raw_venue_name ?? '(no name)'
      if (!map.has(key)) map.set(key, { name: key, address: o.raw_venue_address, website: o.raw_venue_website, events: [] })
      map.get(key)!.events.push(o)
    }
    return [...map.values()]
  }, [orphans])

  async function relink(venueId: string, rawVenueName: string) {
    setBusy(rawVenueName); setErr('')
    try {
      await callIngest({ relink: { venueId, rawVenueName } })
      setOpenCreate(null); setOpenAssign(null); setAssignVenueId('')
      await fetchOrphans()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(null) }
  }

  async function discard(rawVenueName: string) {
    setBusy(rawVenueName); setErr('')
    const base = supabase.from('ingest_orphans').update({ status: 'discarded' }).eq('status', 'open')
    await (rawVenueName === '(no name)' ? base.is('raw_venue_name', null) : base.eq('raw_venue_name', rawVenueName))
    setBusy(null); await fetchOrphans()
  }

  if (loading) return <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>Loading…</p>
  if (groups.length === 0) return <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontStyle: 'italic' }}>No new venues waiting. When a fetch finds shows at a venue you don't have yet, they park here.</p>

  return (
    <div style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
      <p style={{ fontSize: 13, color: 'var(--fg-65)', margin: '0 0 14px' }}>
        <strong>{groups.length}</strong> new venue{groups.length !== 1 ? 's' : ''} detected · <strong>{orphans.length}</strong> event{orphans.length !== 1 ? 's' : ''} waiting to be attributed
      </p>
      {err && <p style={{ fontSize: 12, color: '#e05555', margin: '0 0 12px' }}>{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map(g => {
          const isBusy = busy === g.name
          return (
            <div key={g.name} style={{ border: '1px solid var(--fg-15)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 900 }}>{g.name}</span>
                <span style={{ fontSize: 12, color: 'var(--fg-55)' }}>{g.events.length} event{g.events.length !== 1 ? 's' : ''}</span>
              </div>
              {(g.address || g.website) && (
                <div style={{ fontSize: 12, color: 'var(--fg-40)', marginBottom: 6 }}>
                  {g.address}{g.address && g.website ? ' · ' : ''}{g.website}
                </div>
              )}
              {/* a few sample events so you know what it is */}
              <div style={{ fontSize: 12, color: 'var(--fg-55)', marginBottom: 10, lineHeight: 1.5 }}>
                {g.events.slice(0, 4).map((e, i) => (
                  <span key={e.id}>{i > 0 && ' · '}{e.title} <span style={{ color: 'var(--fg-30)' }}>({fmtDate(e.starts_at)})</span></span>
                ))}
                {g.events.length > 4 && <span style={{ color: 'var(--fg-30)' }}> +{g.events.length - 4} more</span>}
              </div>

              {/* actions */}
              {openCreate !== g.name && openAssign !== g.name && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setOpenCreate(g.name); setOpenAssign(null) }} disabled={isBusy} style={btnPrimary}>Create venue</button>
                  <button onClick={() => { setOpenAssign(g.name); setOpenCreate(null); setAssignVenueId('') }} disabled={isBusy} style={btnGhost}>Assign to existing…</button>
                  <button onClick={() => discard(g.name)} disabled={isBusy} style={{ ...btnGhost, color: 'var(--fg-40)', marginLeft: 'auto' }}>{isBusy ? '…' : 'Discard'}</button>
                </div>
              )}

              {/* create venue — seeded from what we scraped */}
              {openCreate === g.name && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--fg-08)' }}>
                  <VenueForm
                    key={g.name}
                    initial={{ name: g.name, address: g.address ?? '', website: g.website ?? '' }}
                    onVenueAdded={() => {}}
                    onCreated={(venueId) => relink(venueId, g.name)}
                  />
                  <button onClick={() => setOpenCreate(null)} style={{ ...btnGhost, marginTop: 8 }}>Cancel</button>
                </div>
              )}

              {/* assign to existing venue */}
              {openAssign === g.name && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--fg-08)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={assignVenueId} onChange={e => setAssignVenueId(e.target.value)} style={{ flex: 1, minWidth: 180, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--fg-18)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
                    <option value="">— pick a venue —</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <button onClick={() => assignVenueId && relink(assignVenueId, g.name)} disabled={!assignVenueId || isBusy} style={{ ...btnPrimary, opacity: !assignVenueId || isBusy ? 0.5 : 1 }}>{isBusy ? 'Relinking…' : 'Relink'}</button>
                  <button onClick={() => setOpenAssign(null)} style={btnGhost}>Cancel</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#A855F7', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
