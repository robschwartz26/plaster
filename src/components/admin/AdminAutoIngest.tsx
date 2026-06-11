import { useState, useEffect, useCallback } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { CATEGORIES } from '@/lib/categories'
import { inputStyle, labelStyle, type Venue } from '@/components/admin/adminShared'

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
  last_run_at: string | null
  last_run_note: string | null
  venues: { name: string } | null
}

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
}

interface AdhocResponse {
  url: string
  method?: 'jsonld' | 'ai'
  found?: number
  wouldInsert?: number
  events?: AdhocEvent[]
  inserted?: number
  skipped?: number
}

async function callScrapeFn(body: Record<string, unknown>): Promise<{ results?: ScrapeResult[]; adhoc?: AdhocResponse }> {
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

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
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
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')
  // Per-source inline result / error / busy state, keyed by source id ('*' = run-all)
  const [rowResults, setRowResults] = useState<Record<string, ScrapeResult | { error: string }>>({})
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  // Ad-hoc "Import from URL" state
  const [adhocUrl, setAdhocUrl] = useState('')
  const [adhocVenueId, setAdhocVenueId] = useState('')
  const [adhocBusy, setAdhocBusy] = useState(false)
  const [adhocError, setAdhocError] = useState('')
  const [adhocParsed, setAdhocParsed] = useState<AdhocResponse | null>(null)
  const [adhocChecked, setAdhocChecked] = useState<Set<number>>(new Set())
  const [adhocVenueFix, setAdhocVenueFix] = useState<Record<number, string>>({})
  const [adhocDone, setAdhocDone] = useState<{ inserted: number; skipped: number } | null>(null)

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
      venue_id: addVenueId, source_url: addUrl.trim(), default_category: addCategory,
    })
    if (error) setAddError(error.message)
    else { setAddVenueId(''); setAddUrl(''); setAddCategory('Live Music'); fetchSources() }
    setAddBusy(false)
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
      const { adhoc } = await callScrapeFn({ adhocUrl: adhocUrl.trim(), venueId: adhocVenueId || undefined, dryRun: true })
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
    if (selection.some(ev => !ev.venue_id)) { setAdhocError('Assign a venue to every selected event first.'); return }
    setAdhocBusy(true); setAdhocError('')
    try {
      const { adhoc } = await callScrapeFn({ adhocUrl: adhocParsed.url, events: selection, dryRun: false })
      setAdhocDone({ inserted: adhoc?.inserted ?? 0, skipped: adhoc?.skipped ?? 0 })
      setAdhocParsed(null)
    } catch (e) {
      setAdhocError(e instanceof Error ? e.message : String(e))
    } finally { setAdhocBusy(false) }
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
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button onClick={handleAdhocFetch} disabled={adhocBusy} style={{ ...smallBtn, borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: adhocBusy ? 0.6 : 1 }}>
            {adhocBusy ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
        {adhocError && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#fca5a5' }}>{adhocError}</p>}

        {adhocDone && (
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
            inserted {adhocDone.inserted} · skipped {adhocDone.skipped} ·{' '}
            <a href="/staff" style={{ color: '#A855F7' }}>Review pending →</a>
          </p>
        )}

        {adhocParsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>
              {adhocParsed.method === 'ai' ? 'AI extraction' : 'JSON-LD'} · found {adhocParsed.found} · insertable {adhocParsed.wouldInsert}
            </p>
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
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ color: 'var(--fg-40)', fontSize: 11 }}>
                    {ev.portland_date} · {portlandTime(ev.starts_at)}
                    {ev.venue_name && !ev.needsVenue && <> · {ev.venue_name}</>}
                    {ev.duplicate && <span style={{ color: '#fbbf24' }}> · duplicate</span>}
                  </div>
                  {ev.needsVenue && (
                    <select
                      value={adhocVenueFix[i] ?? ''}
                      onChange={e => setAdhocVenueFix(prev => ({ ...prev, [i]: e.target.value }))}
                      style={{ ...inputStyle, marginTop: 4, fontSize: 11, padding: '4px 8px' }}
                    >
                      <option value="">⚠ needs venue{ev.venue_name ? ` ("${ev.venue_name}" unmatched)` : ''} — pick…</option>
                      {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  )}
                </div>
                <span style={{ flexShrink: 0, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ev.confidence >= 95 ? '#86efac' : '#fbbf24' }}>
                  {ev.confidence >= 95 ? 'high' : 'med'}
                </span>
              </div>
            ))}
            {(adhocParsed.events ?? []).length > 0 && (
              <button onClick={handleAdhocImport} disabled={adhocBusy || adhocChecked.size === 0} style={{ ...smallBtn, alignSelf: 'flex-start', padding: '8px 16px', borderColor: 'rgba(168,85,247,0.55)', color: '#c084fc', opacity: adhocBusy || adhocChecked.size === 0 ? 0.5 : 1 }}>
                {adhocBusy ? 'Importing…' : `Import selected (${adhocChecked.size})`}
              </button>
            )}
            {(adhocParsed.events ?? []).length === 0 && (
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>No upcoming events found on that page.</p>
            )}
          </div>
        )}
      </div>

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
                  <a href={src.source_url} target="_blank" rel="noreferrer"
                     style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', textDecoration: 'underline', textDecorationColor: 'var(--fg-18)' }}>
                    {shortUrl(src.source_url)}
                  </a>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
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
