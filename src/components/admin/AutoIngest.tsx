import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_GRADIENTS, type CategoryName } from '@/lib/categories'

// ── Auto-Ingest (Firecrawl) ────────────────────────────────────────────────────
// Pick a venue → it fills in that venue's URL (editable) → Fetch renders the page
// with Firecrawl and extracts its events → review each one (poster + info) →
// Publish the good ones. Drives the firecrawl-ingest edge function. Admin only.

interface VenueRow { id: string; name: string; website: string | null; address: string | null; neighborhood: string | null }

interface FetchedEvent {
  title: string
  date: string
  starts_at: string
  time_display: string
  category: string
  poster_image_url: string | null
  ticket_url: string | null
  venue_name: string
  raw_description: string
  raw_notes: string
  description: string
  sold_out: boolean
  venue_id: string | null
  resolved_venue_name: string | null
  matched_venue: boolean
}

interface FetchResponse {
  url: string; method?: string; count: number; beyondHorizon: number; past: number; enriched: number; deepFetch: boolean
  committed: boolean; inserted?: number; failed?: number; skipped?: number; errors?: string[]
  parked?: number; parkedVenues?: string[]
  events: FetchedEvent[]
}

// Multi-URL batch: one row per URL, processed sequentially so each request stays
// small (a single page) — the safe granularity that never hits the 546 ceiling.
interface BatchRow {
  url: string
  status: 'queued' | 'running' | 'done' | 'error'
  detail: string
}

// Pull every http(s) URL out of pasted text — tolerates one-per-line, commas,
// bullets, or a whole Scout-report block.
function parseUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>\])]+/g) ?? []
  return [...new Set(found.map(u => u.replace(/[.,;]+$/, '')))]
}

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
  if (!res.ok) throw new Error((json as { error?: string }).error || `ingest failed: ${res.status}`)
  return json
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const wd = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' })
  const mo = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short' })
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', day: 'numeric' })
  return `${wd} ${mo} ${day}`.toUpperCase()
}

export function AutoIngest({ community = false }: { community?: boolean } = {}) {
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [venueId, setVenueId] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<FetchResponse | null>(null)
  const [deepFetch, setDeepFetch] = useState(true)
  const [afterDate, setAfterDate] = useState('')  // only ingest events on/after this date
  const [backfill, setBackfill] = useState('')     // artist-name backfill status

  async function runBackfill() {
    setBackfill('Backfilling…')
    try {
      let total = 0, remaining = 1, guard = 0
      while (remaining > 0 && guard++ < 100) {
        const r = await callIngest({ backfillArtists: { limit: 40 } }) as { updated?: number; remaining?: number; processed?: number }
        total += r.updated ?? 0
        remaining = r.remaining ?? 0
        setBackfill(`Backfilling… ${total} named · ${remaining} left`)
        if ((r.processed ?? 0) === 0) break
      }
      setBackfill(`Done — ${total} artist names filled`)
    } catch (e) { setBackfill(e instanceof Error ? e.message : String(e)) }
  }

  // Vite DEV flag, not a hostname test — capacitor://localhost would match on device.
  const isLocal = import.meta.env.DEV

  useEffect(() => {
    supabase.from('venues').select('id, name, website, address, neighborhood').order('name')
      .then(({ data }) => setVenues((data ?? []) as VenueRow[]))
  }, [])

  const selectedVenue = useMemo(() => venues.find(v => v.id === venueId) ?? null, [venues, venueId])

  function onPickVenue(id: string) {
    setVenueId(id)
    const v = venues.find(x => x.id === id)
    if (v?.website) setUrl(v.website)
    setData(null); setError('')
  }

  const [batchRows, setBatchRows] = useState<BatchRow[]>([])
  const urlList = useMemo(() => parseUrls(url), [url])

  // Fetch = extract + write straight to Review (pending) in one server call, so the
  // findings land in the Review tab immediately and survive navigating away. The
  // server dedupes against existing events, so re-fetching a venue won't spam dupes.
  async function handleFetch() {
    const urls = urlList
    if (urls.length === 0) { setError('Pick a venue or paste at least one URL.'); return }
    setBusy(true); setError(''); setData(null); setBatchRows([])

    // Single URL → the original flow with the full event-card result view
    if (urls.length === 1) {
      try {
        const json = await callIngest({ url: urls[0], venueId: community ? undefined : (venueId || undefined), dryRun: true, commit: true, deepFetch: community ? false : deepFetch, afterDate: afterDate || undefined, community: community || undefined }) as unknown as FetchResponse
        setData(json)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally { setBusy(false) }
      return
    }

    // Multi-URL batch: sequential, one small request per URL. A failure marks
    // its row and moves on — the batch never dies on one bad page.
    const rows: BatchRow[] = urls.map(u => ({ url: u, status: 'queued', detail: '' }))
    setBatchRows([...rows])
    for (let i = 0; i < rows.length; i++) {
      rows[i].status = 'running'; setBatchRows([...rows])
      try {
        const r = await callIngest({ url: rows[i].url, venueId: community ? undefined : (venueId || undefined), dryRun: true, commit: true, deepFetch: community ? false : deepFetch, afterDate: afterDate || undefined, community: community || undefined }) as unknown as FetchResponse
        const bits = [`${r.inserted ?? 0} to Review`]
        if ((r.skipped ?? 0) > 0) bits.push(`${r.skipped} already had`)
        if ((r.parked ?? 0) > 0) bits.push(`${r.parked} parked (new venue)`)
        if ((r.failed ?? 0) > 0) bits.push(`${r.failed} failed`)
        if (r.method === 'jsonld-free') bits.push('⚡ free')
        rows[i].status = 'done'; rows[i].detail = bits.join(' · ')
      } catch (e) {
        rows[i].status = 'error'; rows[i].detail = e instanceof Error ? e.message : String(e)
      }
      setBatchRows([...rows])
    }
    setBusy(false)
  }

  return (
    <div style={{ fontFamily: '"Space Grotesk", sans-serif', color: 'var(--fg)' }}>
      {/* ── Source picker ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {!community && (
          <div>
            <label style={labelStyle}>Venue</label>
            <select value={venueId} onChange={e => onPickVenue(e.target.value)} style={inputStyle}>
              <option value="">— select a venue —</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}{v.website ? '' : '  (no URL on file)'}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={labelStyle}>{community ? 'EverOut URL' : <>Events URL {selectedVenue && !selectedVenue.website && <span style={{ color: 'var(--fg-40)' }}>— none saved, paste one</span>}</>}</label>
          <textarea value={url} onChange={e => setUrl(e.target.value)} rows={url.includes('\n') || urlList.length > 1 ? 5 : 1}
            placeholder={community ? 'https://everout.com/portland/articles/…  or  /events/?category=…' : 'https://venue.com/calendar  ·  or paste a LIST of URLs (one per line) — e.g. a Scout report'}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 38, lineHeight: 1.5 }} />
          {community ? (
            <p style={{ fontSize: 11, color: 'var(--fg-40)', marginTop: 5, lineHeight: 1.45 }}>
              Paste an EverOut roundup or category page (festivals, street fairs, markets). Every event lands in Review <strong style={{ color: 'var(--fg-55)' }}>with no photo — you add the art</strong>. Unknown venues (markets, parks) park in <strong style={{ color: 'var(--fg-55)' }}>New venues</strong> to become reusable venue rows. Their images are never used.
            </p>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--fg-40)', marginTop: 5, lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--fg-55)' }}>Tip:</strong> a Bandsintown venue page (<span style={{ color: 'var(--fg-55)' }}>bandsintown.com/v/…</span>) pulls real artist write-ups and never times out. Etix/venue calendars work too, but descriptions come out thin (those sites don't publish them).
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleFetch} disabled={busy || urlList.length === 0} style={{ ...primaryBtn, opacity: busy || urlList.length === 0 ? 0.5 : 1 }}>
            {busy
              ? (batchRows.length > 1
                  ? `Importing ${batchRows.filter(r => r.status === 'done' || r.status === 'error').length}/${batchRows.length}…`
                  : (community ? 'Reading EverOut…' : deepFetch ? 'Following ticket links…' : 'Fetching…'))
              : urlList.length > 1 ? `Fetch ${urlList.length} URLs → send to Review` : 'Fetch → send to Review'}
          </button>
          {isLocal && !community && (
            <button onClick={() => { setUrl('https://mississippistudios.com/'); }} style={devBtn}>DEV · Mississippi</button>
          )}
          {busy && <span style={{ fontSize: 12, color: 'var(--fg-40)' }}>{community ? 'extracts the roundup — up to ~1 min' : deepFetch ? 'reads each show’s ticket page for the full description — up to ~2 min' : 'renders the page + extracts — ~30s'}</span>}
        </div>
        {/* Admin utility: backfill clean artist names for existing music/comedy events */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-40)', flexWrap: 'wrap' }}>
          <button onClick={runBackfill} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--fg-18)', background: 'transparent', color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Backfill artist names</button>
          {backfill && <span>{backfill}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-55)', flexWrap: 'wrap' }}>
          <label htmlFor="ingest-after" style={{ fontWeight: 600 }}>Only events on/after</label>
          <input id="ingest-after" type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--fg-18)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12 }} />
          {afterDate
            ? <button onClick={() => setAfterDate('')} style={{ background: 'none', border: 'none', color: '#A855F7', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>clear</button>
            : <span style={{ color: 'var(--fg-30)' }}>optional — defaults to today</span>}
        </div>
        <label style={{ display: community ? 'none' : 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.4 }}>
          <input type="checkbox" checked={deepFetch} onChange={e => setDeepFetch(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>Follow each show&rsquo;s &ldquo;Get Tickets&rdquo; link for the full description <span style={{ color: 'var(--fg-30)' }}>— richer info pages, but slower and uses more Firecrawl credits. Off = fast, blurb built from the lineup only.</span></span>
        </label>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,80,80,0.1)', border: '1px solid rgba(220,80,80,0.3)', color: 'var(--fg)', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      {/* ── Multi-URL batch progress: one row per URL, live status ── */}
      {batchRows.length > 0 && (
        <div style={{ borderRadius: 8, border: '1px solid var(--fg-15)', marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--fg-08)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Batch import — {batchRows.filter(r => r.status === 'done').length} done · {batchRows.filter(r => r.status === 'error').length} failed · {batchRows.filter(r => r.status === 'queued' || r.status === 'running').length} left</span>
            {!busy && <span style={{ color: '#4ade80' }}>everything imported is in Review</span>}
          </div>
          {batchRows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 12px', borderBottom: i < batchRows.length - 1 ? '1px solid var(--fg-08)' : 'none', fontSize: 12 }}>
              <span style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>
                {r.status === 'queued' ? '·' : r.status === 'running' ? '⏳' : r.status === 'done' ? '✓' : '✗'}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-55)', fontFamily: 'monospace', fontSize: 11 }}>{r.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
              <span style={{ flexShrink: 0, color: r.status === 'error' ? '#e05555' : r.status === 'done' ? 'var(--fg)' : 'var(--fg-40)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Result banner: everything found is already in the Review tab ── */}
      {data && (
        <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(120,200,120,0.1)', border: '1px solid rgba(120,200,120,0.3)', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          <strong>{data.inserted ?? 0}</strong> event{(data.inserted ?? 0) !== 1 ? 's' : ''} sent to the <strong>Review</strong> tab (pending).
          {community && (data.inserted ?? 0) > 0 ? <span style={{ color: '#e0a050', fontWeight: 600 }}> · each awaiting a photo before it can publish</span> : null}
          {data.parked ? <span style={{ color: '#c084fc', fontWeight: 600 }}> · {data.parked} parked as {data.parkedVenues?.length ?? 0} NEW venue{(data.parkedVenues?.length ?? 0) !== 1 ? 's' : ''} → see “New venues” tab</span> : null}
          {data.skipped ? <span style={{ color: 'var(--fg-55)' }}> · {data.skipped} skipped (already in the system)</span> : null}
          {data.enriched ? <span style={{ color: 'var(--fg-55)' }}> · {data.enriched} enriched from ticket pages</span> : null}
          {data.failed ? <span style={{ color: 'var(--fg-55)' }}> · {data.failed} failed</span> : null}
          {(data.beyondHorizon || data.past) ? <span style={{ color: 'var(--fg-40)' }}> · {data.beyondHorizon ? `${data.beyondHorizon} beyond 90 days` : ''}{data.beyondHorizon && data.past ? ', ' : ''}{data.past ? `${data.past} already past` : ''} (not imported)</span> : null}
          {data.errors?.length ? <div style={{ marginTop: 6, color: 'var(--fg-55)', fontSize: 12 }}>{data.errors.join(' · ')}</div> : null}
          <div style={{ marginTop: 6, color: 'var(--fg-55)', fontSize: 12 }}>Open the <strong>Review</strong> tab to approve, reject, or preview each info page.</div>
        </div>
      )}

      {/* ── Read-only confirmation list of what was just ingested ── */}
      {data && data.events.length > 0 && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.events.map((ev, i) => {
              const grad = CATEGORY_GRADIENTS[ev.category as CategoryName] ?? CATEGORY_GRADIENTS['Other']
              return (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: 10, borderRadius: 10,
                  border: '1px solid var(--fg-15)', background: 'transparent',
                }}>
                  {/* poster */}
                  <div style={{ width: 60, height: 90, flexShrink: 0, borderRadius: 4, overflow: 'hidden', background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {ev.poster_image_url
                      ? <img src={ev.poster_image_url} alt={ev.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textAlign: 'center', padding: 4 }}>no image</span>}
                  </div>
                  {/* info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff', background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})` }}>{ev.category}</span>
                      {ev.sold_out && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>Sold out</span>}
                      {ev.matched_venue && ev.resolved_venue_name && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#c084fc' }}>↳ {ev.resolved_venue_name}</span>
                      )}
                    </div>
                    <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 16, fontWeight: 900, lineHeight: 1.15, marginBottom: 2 }}>{ev.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-65)' }}>
                      {ev.resolved_venue_name ?? selectedVenue?.name ?? '—'} · {fmtDate(ev.starts_at)}{ev.time_display ? ` · ${ev.time_display}` : ''}
                    </div>
                    {ev.description ? (
                      <div style={{ fontSize: 12, color: 'var(--fg-55)', marginTop: 4, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {ev.description}
                      </div>
                    ) : ev.raw_notes ? (
                      <div style={{ fontSize: 12, color: 'var(--fg-40)', marginTop: 4, lineHeight: 1.45 }}>With {ev.raw_notes}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--fg-30)', marginTop: 4, fontStyle: 'italic' }}>no description</div>
                    )}
                    {!ev.venue_id && <div style={{ fontSize: 11, color: '#e0a050', marginTop: 3 }}>⚠ no venue matched — used the selected venue</div>}
                  </div>
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--fg-30)', marginTop: 10, lineHeight: 1.5 }}>
            These are now pending in the <strong>Review</strong> tab. Blurbs are written in Plaster's voice — grounded in the real lineup, never invented. Posters are re-hosted (EXIF-stripped) and address + neighborhood come from the venue, so each info page reads complete.
          </p>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', marginBottom: 5 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--fg-18)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }
const primaryBtn: React.CSSProperties = { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#A855F7', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const devBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.4)', background: 'transparent', color: '#A855F7', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
