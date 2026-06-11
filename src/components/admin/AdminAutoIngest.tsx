import { useState, useEffect, useCallback } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { CATEGORIES } from '@/lib/categories'
import { inputStyle, labelStyle, NEIGHBORHOODS, neighborhoodFromAddress, venueSimilarity, type Venue } from '@/components/admin/adminShared'

// ── Auto-Ingest admin section ──────────────────────────────────────────────────
// Manages venue_sources rows and drives the scrape-sources edge function.
// Test = dryRun (found / wouldInsert / sample titles); Run = real insert into the
// pending review pipeline.

interface SourceRow {
  id: string
  venue_id: string
  source_url: string
  source_type: string
  default_category: string
  enabled: boolean
  horizon_days: number
  last_run_at: string | null
  last_run_note: string | null
  venues: { name: string } | null
}

// Ingest horizon choices — how far ahead a fetch/source looks.
const HORIZON_OPTIONS = [
  { days: 30, label: '1 month' },
  { days: 60, label: '2 months' },
  { days: 90, label: '3 months' },
  { days: 120, label: '4 months' },
]

interface ScrapeResult {
  sourceId: string
  venue: string
  url: string
  found: number
  wouldInsert?: number
  samples?: Array<{ title: string; date: string }>
  inserted?: number
  skipped?: number
  error?: string
  rewriteFailures?: number
  rewriteError?: string
  enriched?: number
  enrichTried?: number
  beyondHorizon?: number
  past?: number
}

// friendlyExtractionError-style mapping for description-rewrite failures.
function friendlyRewriteError(n: number, msg?: string): string {
  const m = (msg ?? '').toLowerCase()
  if (m.includes('credit balance') || m.includes('credit')) return `descriptions failed: ${n} (${msg} — tell Rob)`
  if (m.includes('429') || m.includes('rate limit')) return `descriptions failed: ${n} (rate limit — retry in a minute)`
  return `descriptions failed: ${n}${msg ? ` (${msg})` : ''}`
}

interface AdhocEvent {
  title: string
  starts_at: string
  portland_date: string
  event_url: string
  image: string | null
  description: string | null
  venue_id: string | null
  venue_name: string | null
  needsVenue: boolean
  confidence: number
  duplicate: boolean
  suggested_venue_id?: string
  suggested_venue_name?: string
  venue_latest?: string | null
  soldOut?: boolean
}

interface AdhocResponse {
  url: string
  sourcePage?: string
  method?: string
  found?: number
  wouldInsert?: number
  events?: AdhocEvent[]
  inserted?: number
  skipped?: number
  parked?: number
  notes?: string[]
  rewriteFailures?: number
  rewriteError?: string
  enriched?: number
  enrichTried?: number
  beyondHorizon?: number
  past?: number
  horizonLabel?: string
}

interface VenueDraft {
  name: string | null
  website: string | null
  instagram: string | null
  address: string | null
  location_lat: number | null
  location_lng: number | null
}

export interface RelinkResult { linked: number; duplicates: number; remaining: number }

// Exported so other admin surfaces (VenueForm) can fire relinkOrphans after a
// client-side venue create.
export async function callScrapeFn(body: Record<string, unknown>): Promise<{ results?: ScrapeResult[]; adhoc?: AdhocResponse; relink?: RelinkResult }> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
  const { data: { session } } = await supabaseAdmin.auth.getSession()
  if (!session?.access_token) throw new Error('Not signed in')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/scrape-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `scrape-sources failed: ${res.status}`)
  return json
}

async function callScrapeSources(body: { sourceId?: string; all?: boolean; dryRun?: boolean }): Promise<ScrapeResult[]> {
  return (await callScrapeFn(body)).results ?? []
}

function portlandTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })
}

// Mirror of the edge function's URL normalization — scheme-less input
// ("kellysolympian.com") gets https:// so display parsing and hrefs work.
function ensureScheme(u: string): string {
  const t = u.trim()
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function shortUrl(url: string): string {
  try {
    const u = new URL(ensureScheme(url))
    const path = u.pathname.length > 24 ? u.pathname.slice(0, 24) + '…' : u.pathname
    return u.hostname.replace(/^www\./, '') + (path === '/' ? '' : path)
  } catch { return url.slice(0, 40) }
}

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const smallBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, border: '1px solid var(--fg-18)',
  background: 'transparent', color: 'var(--fg-65)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}

export function AdminAutoIngest({ venues }: { venues: Venue[] }) {
  const [sources, setSources] = useState<SourceRow[]>([])
  const [addVenueId, setAddVenueId] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addCategory, setAddCategory] = useState('Live Music')
  const [addHorizon, setAddHorizon] = useState(60) // new sources default 60 — far-future events roll in on later sweeps
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')
  // Per-source inline result / error / busy state, keyed by source id ('*' = run-all)
  const [rowResults, setRowResults] = useState<Record<string, ScrapeResult | { error: string }>>({})
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  // Ad-hoc "Import from URL" state
  const [adhocUrl, setAdhocUrl] = useState('')
  const [adhocVenueId, setAdhocVenueId] = useState('')
  const [adhocMaxDays, setAdhocMaxDays] = useState(60)
  const [adhocBusy, setAdhocBusy] = useState(false)
  const [adhocError, setAdhocError] = useState('')
  const [adhocParsed, setAdhocParsed] = useState<AdhocResponse | null>(null)
  const [adhocChecked, setAdhocChecked] = useState<Set<number>>(new Set())
  const [adhocVenueFix, setAdhocVenueFix] = useState<Record<number, string>>({})
  const [adhocDone, setAdhocDone] = useState<{ inserted: number; skipped: number; parked?: number; rewriteFailures?: number; rewriteError?: string; enriched?: number; enrichTried?: number } | null>(null)
  // New-venue-from-URL enrichment state
  const [draft, setDraft] = useState<{ name: string; address: string; neighborhood: string; website: string; instagram: string; lat: number | null; lng: number | null } | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [draftNotes, setDraftNotes] = useState<string[]>([])
  // Venues created in-session (merged into selects + assignment options)
  const [createdVenues, setCreatedVenues] = useState<Array<{ id: string; name: string }>>([])
  const allVenueOptions = [...venues.map(v => ({ id: v.id, name: v.name })), ...createdVenues]
  const [bulkVenueId, setBulkVenueId] = useState('')
  // Orphan queue (scraped events at unknown venues, parked at import)
  interface OrphanRow { id: string; title: string; starts_at: string; raw_venue_name: string | null }
  const [orphans, setOrphans] = useState<OrphanRow[]>([])
  const [orphanAssign, setOrphanAssign] = useState<Record<string, string>>({}) // group key → venue id
  const [orphanMsg, setOrphanMsg] = useState<Record<string, string>>({}) // group key → result line
  const [orphanBusy, setOrphanBusy] = useState<string | null>(null)
  // Set when the create-venue draft was seeded from an orphan group — on create,
  // that group force-relinks to the new venue.
  const [pendingRelinkIds, setPendingRelinkIds] = useState<string[] | null>(null)

  const fetchOrphans = useCallback(async () => {
    const { data } = await supabaseAdmin
      .from('ingest_orphans')
      .select('id, title, starts_at, raw_venue_name')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
    if (data) setOrphans(data as OrphanRow[])
  }, [])

  useEffect(() => { fetchOrphans() }, [fetchOrphans])

  async function runRelink(groupKey: string, venueId: string, orphanIds: string[] | undefined, forceAll: boolean) {
    setOrphanBusy(groupKey)
    try {
      const { relink } = await callScrapeFn({ relinkOrphans: { venueId, forceAll, ...(orphanIds ? { orphanIds } : {}) } })
      setOrphanMsg(prev => ({
        ...prev,
        [groupKey]: relink
          ? `linked ${relink.linked} → pending${relink.duplicates ? ` · ${relink.duplicates} duplicate${relink.duplicates !== 1 ? 's' : ''} skipped` : ''}`
          : 'relink returned nothing',
      }))
      fetchOrphans()
    } catch (e) {
      setOrphanMsg(prev => ({ ...prev, [groupKey]: e instanceof Error ? e.message : String(e) }))
    } finally { setOrphanBusy(null) }
  }

  async function discardGroup(ids: string[]) {
    if (!window.confirm(`Discard ${ids.length} parked event${ids.length !== 1 ? 's' : ''}?`)) return
    await supabaseAdmin.from('ingest_orphans').update({ status: 'discarded' }).in('id', ids)
    fetchOrphans()
  }

  const fetchSources = useCallback(async () => {
    const { data } = await supabaseAdmin
      .from('venue_sources')
      .select('*, venues(name)')
    if (data) {
      const rows = data as unknown as SourceRow[]
      rows.sort((a, b) => (a.venues?.name ?? '').localeCompare(b.venues?.name ?? ''))
      setSources(rows)
    }
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  // Prefill the URL input from the picked venue's website column
  function handleVenuePick(venueId: string) {
    setAddVenueId(venueId)
    const v = venues.find(v => v.id === venueId)
    if (v?.website && !addUrl) setAddUrl(v.website)
  }

  async function handleAdd() {
    if (!addVenueId || !addUrl.trim()) { setAddError('Pick a venue and enter a URL.'); return }
    setAddBusy(true); setAddError('')
    const { error } = await supabaseAdmin.from('venue_sources').insert({
      venue_id: addVenueId, source_url: addUrl.trim(), default_category: addCategory, horizon_days: addHorizon,
    })
    if (error) setAddError(error.message)
    else { setAddVenueId(''); setAddUrl(''); setAddCategory('Live Music'); setAddHorizon(60); fetchSources() }
    setAddBusy(false)
  }

  async function handleHorizonChange(src: SourceRow, days: number) {
    await supabaseAdmin.from('venue_sources').update({ horizon_days: days }).eq('id', src.id)
    fetchSources()
  }

  async function handleToggle(src: SourceRow) {
    await supabaseAdmin.from('venue_sources').update({ enabled: !src.enabled }).eq('id', src.id)
    fetchSources()
  }

  async function handleDelete(src: SourceRow) {
    if (!window.confirm(`Remove source for ${src.venues?.name ?? 'venue'}?`)) return
    await supabaseAdmin.from('venue_sources').delete().eq('id', src.id)
    fetchSources()
  }

  async function runScrape(key: string, body: { sourceId?: string; all?: boolean; dryRun?: boolean }) {
    setBusyIds(prev => new Set([...prev, key]))
    try {
      const results = await callScrapeSources(body)
      setRowResults(prev => {
        const next = { ...prev }
        for (const r of results) next[r.sourceId] = r
        return next
      })
    } catch (e) {
      const err = { error: e instanceof Error ? e.message : String(e) }
      setRowResults(prev => key === '*' ? prev : { ...prev, [key]: err })
      if (key === '*') setAddError(err.error)
    } finally {
      setBusyIds(prev => { const next = new Set(prev); next.delete(key); return next })
      if (!body.dryRun) fetchSources() // refresh last_run stamps after real runs
    }
  }

  // ── Ad-hoc: Fetch (dryRun parse) ──
  async function handleAdhocFetch() {
    if (!adhocUrl.trim()) { setAdhocError('Paste an event page URL.'); return }
    setAdhocBusy(true); setAdhocError(''); setAdhocParsed(null); setAdhocDone(null)
    try {
      const { adhoc } = await callScrapeFn({ adhocUrl: adhocUrl.trim(), venueId: adhocVenueId || undefined, dryRun: true, maxDays: adhocMaxDays })
      setAdhocParsed(adhoc ?? null)
      // Default-check everything insertable (venue resolved + not a duplicate)
      const checked = new Set<number>()
      adhoc?.events?.forEach((ev, i) => { if (!ev.needsVenue && !ev.duplicate) checked.add(i) })
      setAdhocChecked(checked)
      setAdhocVenueFix({})
    } catch (e) {
      setAdhocError(e instanceof Error ? e.message : String(e))
    } finally { setAdhocBusy(false) }
  }

  // ── Ad-hoc: Import selected (posts the parsed selection back) ──
  async function handleAdhocImport() {
    if (!adhocParsed?.events) return
    const selection = adhocParsed.events
      .map((ev, i) => ({ ev, i }))
      .filter(({ i }) => adhocChecked.has(i))
      .map(({ ev, i }) => ({ ...ev, venue_id: adhocVenueFix[i] || ev.venue_id }))
    if (selection.length === 0) { setAdhocError('Nothing selected.'); return }
    // Venueless rows no longer block — the server parks them in the orphan queue.
    setAdhocBusy(true); setAdhocError('')
    try {
      const { adhoc } = await callScrapeFn({ adhocUrl: adhocParsed.url, events: selection, dryRun: false, maxDays: adhocMaxDays })
      setAdhocDone({ inserted: adhoc?.inserted ?? 0, skipped: adhoc?.skipped ?? 0, parked: adhoc?.parked, rewriteFailures: adhoc?.rewriteFailures, rewriteError: adhoc?.rewriteError, enriched: adhoc?.enriched, enrichTried: adhoc?.enrichTried })
      setAdhocParsed(null)
      fetchOrphans()
    } catch (e) {
      setAdhocError(e instanceof Error ? e.message : String(e))
    } finally { setAdhocBusy(false) }
  }

  // ── New venue from this site: enrichment draft (NO inserts server-side) ──
  async function handleEnrichVenue() {
    if (!adhocUrl.trim()) { setDraftError('Paste a URL first.'); return }
    setDraftBusy(true); setDraftError(''); setDraft(null)
    try {
      const json = await callScrapeFn({ enrichVenueFromUrl: adhocUrl.trim() }) as { venueDraft?: VenueDraft; notes?: string[] }
      const d = json.venueDraft
      if (!d) throw new Error('No venue draft returned')
      setDraft({
        name: d.name ?? '',
        address: d.address ?? '',
        // neighborhood derived client-side via the importer's existing helper
        neighborhood: d.address ? neighborhoodFromAddress(d.address) : '',
        website: d.website ?? '',
        instagram: d.instagram ?? '',
        lat: d.location_lat,
        lng: d.location_lng,
      })
      setDraftNotes(json.notes ?? [])
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e))
    } finally { setDraftBusy(false) }
  }

  // Duplicate guard: best similarity match against existing venues for the draft name.
  const draftSimilar = draft?.name
    ? allVenueOptions
        .map(v => ({ v, score: venueSimilarity(draft.name, v.name) }))
        .sort((a, b) => b.score - a.score)
        .find(({ score }) => score >= 0.5)?.v ?? null
    : null

  // Assign a venue id to every currently-needsVenue row in the checklist.
  function assignVenueToNeedsRows(venueId: string) {
    if (!adhocParsed?.events) return
    setAdhocVenueFix(prev => {
      const next = { ...prev }
      adhocParsed.events!.forEach((ev, i) => { if (ev.needsVenue && !next[i]) next[i] = venueId })
      return next
    })
    // Newly assignable rows become checkable defaults
    setAdhocChecked(prev => {
      const next = new Set(prev)
      adhocParsed.events!.forEach((ev, i) => { if (ev.needsVenue && !ev.duplicate) next.add(i) })
      return next
    })
  }

  async function handleCreateVenue() {
    if (!draft?.name.trim()) { setDraftError('Venue needs a name.'); return }
    setDraftBusy(true); setDraftError('')
    const { data, error } = await supabaseAdmin.from('venues').insert({
      name: draft.name.trim(),
      address: draft.address.trim() || null,
      neighborhood: draft.neighborhood || null,
      website: draft.website.trim() || null,
      instagram: draft.instagram.trim() || null,
      location_lat: draft.lat,
      location_lng: draft.lng,
    }).select('id, name').single()
    if (error) { setDraftError(error.message); setDraftBusy(false); return }
    setCreatedVenues(prev => [...prev, { id: data.id, name: data.name }])
    assignVenueToNeedsRows(data.id)
    setDraft(null)
    setDraftBusy(false)
    // Auto-relink: a draft seeded from an orphan group force-relinks that group;
    // any other create runs a fuzzy relink across all open orphans.
    if (pendingRelinkIds) {
      const ids = pendingRelinkIds
      setPendingRelinkIds(null)
      runRelink(`created:${data.id}`, data.id, ids, true)
    } else {
      runRelink(`created:${data.id}`, data.id, undefined, false)
    }
  }

  function renderResult(r: ScrapeResult | { error: string }) {
    if ('error' in r && r.error && !('found' in r)) {
      return <span style={{ color: '#fca5a5' }}>{r.error}</span>
    }
    const res = r as ScrapeResult
    return (
      <>
        {res.error && <span style={{ color: '#fca5a5' }}>{res.error} · </span>}
        <span>found {res.found}</span>
        {res.wouldInsert !== undefined && <span> · would insert {res.wouldInsert}</span>}
        {res.inserted !== undefined && <span> · inserted {res.inserted} · skipped {res.skipped}</span>}
        {!!res.beyondHorizon && <span> · {res.beyondHorizon} beyond horizon</span>}
        {!!res.past && <span> · {res.past} already past</span>}
        {!!res.enrichTried && <span> · enriched {res.enriched}/{res.enrichTried} from detail pages</span>}
        {!!res.rewriteFailures && <span style={{ color: '#fca5a5' }}> · {friendlyRewriteError(res.rewriteFailures, res.rewriteError)}</span>}
        {res.samples && res.samples.length > 0 && (
          <div style={{ marginTop: 2, color: 'var(--fg-40)' }}>
            {res.samples.map((s, i) => <div key={i}>· {s.title} — {s.date}</div>)}
          </div>
        )}
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Import from URL — one-off ingest of any event page, no registered source */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16, borderBottom: '1px solid var(--fg-08)' }}>
        <label style={labelStyle}>Import from URL</label>
        <input
          type="url" value={adhocUrl} onChange={e => setAdhocUrl(e.target.value)}
          placeholder="https://… any event page (venue site, Eventbrite…)" style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={adhocVenueId} onChange={e => setAdhocVenueId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Venue (optional — auto-match)</option>
            {allVenueOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={adhocMaxDays} onChange={e => setAdhocMaxDays(Number(e.target.value))} title="Ingest horizon" style={{ ...inputStyle, width: 110, flexShrink: 0 }}>
            {HORIZON_OPTIONS.map(h => <option key={h.days} value={h.days}>{h.label}</option>)}
          </select>
          <button onClick={handleEnrichVenue} disabled={draftBusy || !adhocUrl.trim()} style={{ ...smallBtn, opacity: draftBusy || !adhocUrl.trim() ? 0.5 : 1 }}>
            {draftBusy ? '…' : 'New venue from this site'}
          </button>
          <button onClick={handleAdhocFetch} disabled={adhocBusy} style={{ ...smallBtn, borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: adhocBusy ? 0.6 : 1 }}>
            {adhocBusy ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
        {adhocError && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#fca5a5' }}>{adhocError}</p>}
        {draftError && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#fca5a5' }}>{draftError}</p>}

        {/* New-venue draft — prefilled from the site, editable; nulls stay blank */}
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid var(--fg-15)', borderRadius: 8 }}>
            <label style={labelStyle}>New venue (prefilled from site — edit before creating)</label>
            <input value={draft.name} onChange={e => setDraft(d => d && { ...d, name: e.target.value })} placeholder="Name" style={inputStyle} />
            <input value={draft.address} onChange={e => setDraft(d => d && { ...d, address: e.target.value, neighborhood: e.target.value ? neighborhoodFromAddress(e.target.value) : d.neighborhood })} placeholder="Address" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={draft.neighborhood} onChange={e => setDraft(d => d && { ...d, neighborhood: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
                <option value="">Neighborhood…</option>
                {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', alignSelf: 'center', whiteSpace: 'nowrap' }}>
                {draft.lat != null && draft.lng != null ? `${draft.lat.toFixed(4)}, ${draft.lng.toFixed(4)}` : 'no coords'}
              </span>
            </div>
            <input value={draft.website} onChange={e => setDraft(d => d && { ...d, website: e.target.value })} placeholder="Website" style={inputStyle} />
            <input value={draft.instagram} onChange={e => setDraft(d => d && { ...d, instagram: e.target.value })} placeholder="Instagram" style={inputStyle} />
            {draftNotes.length > 0 && (
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>{draftNotes.join(' · ')}</p>
            )}
            {/* Duplicate guard — the warning renders BEFORE the create button */}
            {draftSimilar && (
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#fbbf24' }}>
                Did you mean <strong>{draftSimilar.name}</strong>?{' '}
                <button
                  onClick={() => { assignVenueToNeedsRows(draftSimilar.id); setAdhocVenueId(draftSimilar.id); setDraft(null) }}
                  style={{ ...smallBtn, padding: '2px 8px', fontSize: 11, color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)' }}
                >Use existing</button>
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreateVenue} disabled={draftBusy} style={{ ...smallBtn, borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: draftBusy ? 0.6 : 1 }}>
                {draftBusy ? 'Creating…' : draftSimilar ? 'Create anyway' : 'Create venue'}
              </button>
              <button onClick={() => setDraft(null)} style={{ ...smallBtn, color: 'var(--fg-40)' }}>Cancel</button>
            </div>
          </div>
        )}

        {adhocDone && (
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
            inserted {adhocDone.inserted} · skipped {adhocDone.skipped}
            {!!adhocDone.parked && <span style={{ color: '#fbbf24' }}> · parked {adhocDone.parked}</span>}
            {adhocDone.enrichTried !== undefined && adhocDone.enrichTried > 0 && (
              <span> · enriched {adhocDone.enriched}/{adhocDone.enrichTried} from detail pages</span>
            )}
            {!!adhocDone.rewriteFailures && (
              <span style={{ color: '#fca5a5' }}> · {friendlyRewriteError(adhocDone.rewriteFailures, adhocDone.rewriteError)}</span>
            )}
            {' · '}<a href="/staff" style={{ color: '#A855F7' }}>Review pending →</a>
          </p>
        )}

        {adhocParsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>
              {adhocParsed.method} · found {adhocParsed.found} · insertable {adhocParsed.wouldInsert}
              {!!adhocParsed.beyondHorizon && <> · {adhocParsed.beyondHorizon} beyond {adhocParsed.horizonLabel ?? ''} horizon</>}
              {!!adhocParsed.past && <> · {adhocParsed.past} already past</>}
              {adhocParsed.sourcePage && adhocParsed.sourcePage !== adhocParsed.url && <> · read {adhocParsed.sourcePage}</>}
              {(adhocParsed.notes ?? []).length > 0 && <> · {adhocParsed.notes!.join(' · ')}</>}
            </p>
            {/* Bulk assignment for unmatched rows */}
            {(adhocParsed.events ?? []).some((ev, i) => ev.needsVenue && !adhocVenueFix[i]) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', whiteSpace: 'nowrap' }}>Assign all unmatched to:</span>
                <select value={bulkVenueId} onChange={e => setBulkVenueId(e.target.value)} style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '4px 8px' }}>
                  <option value="">pick venue…</option>
                  {allVenueOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <button onClick={() => { if (bulkVenueId) assignVenueToNeedsRows(bulkVenueId) }} disabled={!bulkVenueId} style={{ ...smallBtn, opacity: bulkVenueId ? 1 : 0.5 }}>
                  Apply
                </button>
              </div>
            )}
            {(adhocParsed.events ?? []).map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--fg-08)' }}>
                <input
                  type="checkbox"
                  checked={adhocChecked.has(i)}
                  disabled={ev.duplicate}
                  onChange={e => setAdhocChecked(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(i); else next.delete(i)
                    return next
                  })}
                />
                {ev.image && (
                  <img src={ev.image} alt="" style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-80)' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {ev.title}
                    {ev.soldOut && (
                      <span style={{ marginLeft: 6, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', padding: '1px 5px', borderRadius: 3, verticalAlign: 'middle' }}>
                        SOLD OUT
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--fg-40)', fontSize: 11 }}>
                    {ev.portland_date} · {portlandTime(ev.starts_at)}
                    {ev.venue_name && !ev.needsVenue && <> · {ev.venue_name}</>}
                    {ev.duplicate && <span style={{ color: '#fbbf24' }}> · duplicate</span>}
                    {/* Informational only — new shows get announced inside covered
                        windows; the duplicate badge is the real verdict. */}
                    {!ev.duplicate && ev.venue_latest && ev.starts_at <= ev.venue_latest && (
                      <span style={{ color: 'var(--fg-30)' }}> · within covered range</span>
                    )}
                  </div>
                  {ev.needsVenue && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                      <select
                        value={adhocVenueFix[i] ?? ''}
                        onChange={e => setAdhocVenueFix(prev => ({ ...prev, [i]: e.target.value }))}
                        style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '4px 8px' }}
                      >
                        <option value="">⚠ needs venue{ev.venue_name ? ` ("${ev.venue_name}" unmatched)` : ''} — pick…</option>
                        {allVenueOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      {ev.suggested_venue_id && !adhocVenueFix[i] && (
                        <button
                          onClick={() => {
                            setAdhocVenueFix(prev => ({ ...prev, [i]: ev.suggested_venue_id! }))
                            if (!ev.duplicate) setAdhocChecked(prev => new Set([...prev, i]))
                          }}
                          style={{ ...smallBtn, fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap', color: '#c084fc', borderColor: 'rgba(168,85,247,0.4)' }}
                        >
                          → {ev.suggested_venue_name}?
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span style={{ flexShrink: 0, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ev.confidence >= 95 ? '#86efac' : '#fbbf24' }}>
                  {ev.confidence >= 95 ? 'high' : 'med'}
                </span>
              </div>
            ))}
            {(adhocParsed.events ?? []).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={handleAdhocImport} disabled={adhocBusy || adhocChecked.size === 0} style={{ ...smallBtn, padding: '8px 16px', borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: adhocBusy || adhocChecked.size === 0 ? 0.5 : 1 }}>
                  {adhocBusy ? 'Importing…' : `Import ${adhocChecked.size}`}
                </button>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)' }}>unmatched will be parked · duplicates re-checked on import</span>
              </div>
            )}
            {(adhocParsed.events ?? []).length === 0 && (
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>No upcoming events found on that page.</p>
            )}
          </div>
        )}
      </div>

      {/* Orphan queue — parked events at unknown venues; hidden when empty */}
      {orphans.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16, borderBottom: '1px solid var(--fg-08)' }}>
          <label style={labelStyle}>Orphans · {orphans.length} parked</label>
          {(() => {
            const groups = new Map<string, OrphanRow[]>()
            for (const o of orphans) {
              const key = o.raw_venue_name?.trim() || '(no venue name)'
              if (!groups.has(key)) groups.set(key, [])
              groups.get(key)!.push(o)
            }
            return [...groups.entries()].map(([key, group]) => {
              const busy = orphanBusy === key
              return (
                <div key={key} style={{ padding: '8px 0', borderBottom: '1px solid var(--fg-08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                      {key} <span style={{ color: 'var(--fg-40)', fontWeight: 500 }}>×{group.length}</span>
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          setPendingRelinkIds(group.map(o => o.id))
                          setDraft({ name: key === '(no venue name)' ? '' : key, address: '', neighborhood: '', website: '', instagram: '', lat: null, lng: null })
                          setDraftNotes([])
                        }}
                        disabled={busy}
                        style={{ ...smallBtn, borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: busy ? 0.5 : 1 }}
                      >
                        Create venue…
                      </button>
                      <select
                        value={orphanAssign[key] ?? ''}
                        onChange={e => setOrphanAssign(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ ...inputStyle, width: 150, padding: '4px 8px', fontSize: 11 }}
                      >
                        <option value="">Assign to existing…</option>
                        {allVenueOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <button
                        onClick={() => { const vid = orphanAssign[key]; if (vid) runRelink(key, vid, group.map(o => o.id), true) }}
                        disabled={busy || !orphanAssign[key]}
                        style={{ ...smallBtn, opacity: busy || !orphanAssign[key] ? 0.5 : 1 }}
                      >
                        {busy ? '…' : 'Apply'}
                      </button>
                      <button onClick={() => discardGroup(group.map(o => o.id))} disabled={busy} style={{ ...smallBtn, color: 'var(--fg-30)', borderColor: 'var(--fg-08)' }}>
                        Discard
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 4, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>
                    {group.slice(0, 3).map(o => o.title).join(' · ')}{group.length > 3 ? ' · …' : ''}
                  </div>
                  {orphanMsg[key] && (
                    <div style={{ marginTop: 4, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-65)' }}>{orphanMsg[key]}</div>
                  )}
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* Relink results from venue creation (keys created:<venueId>) — rendered
          outside the orphans block so they survive the queue emptying. */}
      {Object.entries(orphanMsg).filter(([k]) => k.startsWith('created:')).map(([k, msg]) => (
        <div key={k} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-65)' }}>relink: {msg}</div>
      ))}

      {/* Add-source row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={labelStyle}>Add source</label>
        <select value={addVenueId} onChange={e => handleVenuePick(e.target.value)} style={inputStyle}>
          <option value="">Pick a venue…</option>
          {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input
          type="url" value={addUrl} onChange={e => setAddUrl(e.target.value)}
          placeholder="https://venue.com/events" style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={addCategory} onChange={e => setAddCategory(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={addHorizon} onChange={e => setAddHorizon(Number(e.target.value))} title="Ingest horizon" style={{ ...inputStyle, width: 110, flexShrink: 0 }}>
            {HORIZON_OPTIONS.map(h => <option key={h.days} value={h.days}>{h.label}</option>)}
          </select>
          <button onClick={handleAdd} disabled={addBusy} style={{ ...smallBtn, borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: addBusy ? 0.6 : 1 }}>
            {addBusy ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addError && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#fca5a5' }}>{addError}</p>}
      </div>

      {/* Sources list */}
      {sources.length === 0 ? (
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>No sources yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sources.map(src => {
            const busy = busyIds.has(src.id) || busyIds.has('*')
            const result = rowResults[src.id]
            return (
              <div key={src.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--fg-08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: src.enabled ? 'var(--fg)' : 'var(--fg-40)' }}>
                    {src.venues?.name ?? '(venue)'}
                  </span>
                  <a href={ensureScheme(src.source_url)} target="_blank" rel="noreferrer"
                     style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', textDecoration: 'underline', textDecorationColor: 'var(--fg-18)' }}>
                    {shortUrl(src.source_url)}
                  </a>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={src.horizon_days}
                      onChange={e => handleHorizonChange(src, Number(e.target.value))}
                      title="Ingest horizon"
                      style={{ ...inputStyle, width: 96, padding: '3px 6px', fontSize: 11 }}
                    >
                      {HORIZON_OPTIONS.map(h => <option key={h.days} value={h.days}>{h.label}</option>)}
                      {!HORIZON_OPTIONS.some(h => h.days === src.horizon_days) && (
                        <option value={src.horizon_days}>{src.horizon_days}d</option>
                      )}
                    </select>
                    <button onClick={() => handleToggle(src)} style={{ ...smallBtn, color: src.enabled ? '#86efac' : 'var(--fg-40)' }}>
                      {src.enabled ? 'on' : 'off'}
                    </button>
                    <button onClick={() => runScrape(src.id, { sourceId: src.id, dryRun: true })} disabled={busy || !src.enabled} style={{ ...smallBtn, opacity: busy || !src.enabled ? 0.5 : 1 }}>
                      Test
                    </button>
                    <button onClick={() => runScrape(src.id, { sourceId: src.id, dryRun: false })} disabled={busy || !src.enabled} style={{ ...smallBtn, borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: busy || !src.enabled ? 0.5 : 1 }}>
                      {busy ? '…' : 'Run'}
                    </button>
                    <button onClick={() => handleDelete(src)} style={{ ...smallBtn, color: 'var(--fg-30)', borderColor: 'var(--fg-08)' }}>×</button>
                  </div>
                </div>
                <div style={{ marginTop: 4, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>
                  {src.last_run_note ? `${src.last_run_note} · ${relTime(src.last_run_at)}` : 'never run'}
                </div>
                {result && (
                  <div style={{ marginTop: 6, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-65)' }}>
                    {renderResult(result)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Run all + review link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => runScrape('*', { all: true, dryRun: false })}
          disabled={busyIds.has('*') || sources.every(s => !s.enabled)}
          style={{ ...smallBtn, padding: '8px 16px', borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: busyIds.has('*') ? 0.6 : 1 }}
        >
          {busyIds.has('*') ? 'Running all…' : 'Run all'}
        </button>
        <a href="/staff" style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: '#A855F7', textDecoration: 'underline', textDecorationColor: 'rgba(168,85,247,0.4)' }}>
          Review pending →
        </a>
      </div>
    </div>
  )
}
