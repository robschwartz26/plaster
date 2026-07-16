import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Image as ScriptImage } from "https://deno.land/x/imagescript@1.2.17/mod.ts"

// ── firecrawl-ingest ─────────────────────────────────────────────────────────
// A clean, Firecrawl-first auto-ingester. NOT the old scrape-sources pipeline —
// no venue_sources, no orphan queue, no JSON-LD probes. It does one thing well:
//
//   { url, dryRun: true }                 → render the page with Firecrawl,
//                                            structured-extract its events, and
//                                            return them for admin review. No writes.
//   { url, venueId, events[], publish? }  → for the admin-approved selection:
//                                            re-host each poster (EXIF-stripped),
//                                            rewrite the blurb into Plaster's voice,
//                                            and insert as published (or pending).
//
// Firecrawl renders from its own infra, so it reaches Cloudflare-fronted venue
// sites that 403 a plain server fetch — and it works for ANY venue platform, not
// just Etix. Keys come from edge secrets (FIRECRAWL_API_KEY, ANTHROPIC_API_KEY);
// never client-side, never committed. Gate: is_admin only.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BOT_UA = 'PlasterBot/0.1 (+https://plasterthewall.com)'
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_EVENTS = 60
const DEFAULT_HORIZON_DAYS = 90
const IMAGE_TOTAL_BUDGET_MS = 40000
const EXIF_STRIP_BUDGET_MS = 1500
// Absolute deadline for the extract+enrich phase. Kept well under the edge fn's
// ~150s hard limit because the commit flow ALSO re-hosts posters + inserts after
// this (see IMAGE_TOTAL_BUDGET_MS). The two-hop "follow ticket links" pass runs
// until this, then stops — un-enriched events keep the lineup-based blurb.
const DRYRUN_DEADLINE_MS = 90000
// Absolute cap (from request start) for the poster re-host + insert pass, so
// extract + enrich + insert together stay comfortably under the edge fn limit.
const INSERT_DEADLINE_MS = 135000
const REWRITE_MODEL = 'claude-haiku-4-5-20251001'

const CATEGORIES = ['Live Music','Dance','Comedy','Drag','Jazz','Trivia','Karaoke','Theater','Burlesque','Classical','Film','Art','Literary','Spoken','Other']

// ── time helpers (America/Los_Angeles) ───────────────────────────────────────
// Month heuristic for PT offset — exact DST boundary is irrelevant at event-time.
function portlandOffset(dateStr: string): string {
  const month = parseInt(dateStr.split('-')[1], 10)
  return month >= 3 && month <= 10 ? '-07:00' : '-08:00'
}
function ptTimestamp(date: string, time: string | null): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '20:00'
  const d = new Date(`${date}T${t}:00${portlandOffset(date)}`)
  return isNaN(d.getTime()) ? null : d
}
function portlandDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d)
}
function portlandToday(): string { return portlandDate(new Date()) }

// Pull a 24h "HH:MM" out of a free-text time string ("Doors: 7PM / Show: 8 PM").
// Prefer the time after the word "show" (door time comes first); else the last.
function parseShowTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/g
  const hits: { idx: number; hh: number; mm: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    let hh = parseInt(m[1], 10)
    const mm = m[2] ? parseInt(m[2], 10) : 0
    if (hh === 12) hh = 0
    if (m[3] === 'pm') hh += 12
    hits.push({ idx: m.index, hh, mm })
  }
  if (hits.length === 0) return null
  const showAt = s.indexOf('show')
  let pick = hits[hits.length - 1]
  if (showAt >= 0) {
    const after = hits.filter(h => h.idx >= showAt)
    if (after.length) pick = after[0]
  }
  return `${String(pick.hh).padStart(2, '0')}:${String(pick.mm).padStart(2, '0')}`
}

// Title-level sold-out detection + cleanup (strip "(sold out)" / "- sold out").
function detectSoldOut(rawTitle: string): { title: string; soldOut: boolean } {
  if (!/\bsold[\s-]?out\b/i.test(rawTitle)) return { title: rawTitle, soldOut: false }
  const cleaned = rawTitle
    .replace(/\s*[([]\s*sold[\s-]?out\s*[)\]]/gi, '')
    .replace(/\s*[-–—:|·]+\s*sold[\s-]?out\s*$/i, '')
    .replace(/\s{2,}/g, ' ').trim()
  return { title: cleaned || rawTitle, soldOut: true }
}

// ── venue matching (name-only; venues table has no slug) ──────────────────────
function normalizeName(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim()
}
function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a), nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const words = (s: string) => new Set(s.split(/\s+/).filter(w => w.length > 1))
  const wa = words(na), wb = words(nb)
  if (wa.size === 0 || wb.size === 0) return 0
  let overlap = 0
  for (const w of wa) if (wb.has(w)) overlap++
  return overlap / Math.max(wa.size, wb.size)
}
const VENUE_MATCH_THRESHOLD = 0.85

// ── poster re-host + EXIF strip ───────────────────────────────────────────────
async function stripMetadataBestEffort(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await Promise.race([
      (async () => { const img = await ScriptImage.decode(bytes); return await img.encodeJPEG(85) })(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), EXIF_STRIP_BUDGET_MS)),
    ])
  } catch { return null }
}
// deno-lint-ignore no-explicit-any
async function rehostImage(supabaseService: any, imageUrl: string | null, deadline: number): Promise<string | null> {
  if (!imageUrl) return null
  if (Date.now() > deadline) return imageUrl
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': BOT_UA },
      signal: AbortSignal.timeout(Math.max(1500, Math.min(15000, deadline - Date.now()))),
    })
    if (!res.ok) return imageUrl
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return imageUrl
    let outBytes = bytes
    let outType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    const stripped = await stripMetadataBestEffort(bytes)
    if (stripped && stripped.byteLength > 0) { outBytes = stripped; outType = 'image/jpeg' }
    const path = `ingest/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await supabaseService.storage.from('posters').upload(path, outBytes, { contentType: outType, upsert: false })
    if (upErr) return imageUrl
    return supabaseService.storage.from('posters').getPublicUrl(path).data.publicUrl
  } catch { return imageUrl }
}

// ── description → Plaster's voice (grounded; never invented) ──────────────────
// Calendar/listing pages almost never carry a real blurb inline (verified: 0/28
// on Mississippi), so when there's no source text we SYNTHESIZE a short blurb from
// the hard facts we did extract — headliner + support acts + category + venue —
// grounded only, never guessing genres/history/hometowns. When the page DID give a
// blurb we rewrite that instead. Either way the voice is Plaster's own, and this
// runs at Fetch time so the admin reviews the real info page before publishing.
interface DescFacts { title: string; venueName: string; category: string; timeDisplay: string; rawDescription: string; rawNotes: string; soldOut: boolean }
async function composeDescription(f: DescFacts): Promise<string | null> {
  const KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!KEY) return null
  const hasBlurb = !!f.rawDescription.trim()
  const facts: string[] = [`Headliner / event: ${f.title}`]
  if (f.rawNotes.trim()) facts.push(`Also on the bill: ${f.rawNotes.trim()}`)
  if (f.venueName) facts.push(`Venue: ${f.venueName}`)
  facts.push(`Category: ${f.category}`)
  if (f.soldOut) facts.push(`This show is sold out.`)
  const instruction = hasBlurb
    ? `Rewrite the SOURCE BLURB below into 1–3 sentences in a warm, plainspoken, slightly playful Portland-events voice. Use ONLY facts in the source and the fact list — never add genres, history, hometowns, or anything not stated. Do not copy 5+ consecutive words from the source.`
    : `There is no source blurb. Write 1–2 short sentences in a warm, plainspoken, slightly playful Portland-events voice using ONLY the fact list below. Name the headliner and, if present, the support acts. Do NOT invent genres, hometowns, history, prices, or any detail not in the facts. Short is fine — do not pad.`
  const prompt = `${instruction}\n\nFACTS:\n${facts.join('\n')}${hasBlurb ? `\n\nSOURCE BLURB:\n${f.rawDescription.slice(0, 1500)}` : ''}\n\nRespond with ONLY the blurb text — no quotes, no preamble, no commentary.`
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: REWRITE_MODEL, max_tokens: 220, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = (data.content?.[0]?.text ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
    return text || null
  } catch { return null }
}

// Run an async map with bounded concurrency (keeps Fetch fast without hammering the API).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

// ── Firecrawl structured extraction (the heart) ───────────────────────────────
// LEAN by design: only the light fields we need off the calendar page. The heavy
// free-text (raw_description, raw_notes) is intentionally NOT extracted here —
// asking for it made the model ~2.5x slower on long pages (157s vs 62s for 29
// shows) and risked the edge fn timeout. Those come from the ticket-page enrichment
// (deepFetch) or the facts-based blurb instead.
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title:            { type: 'string', description: 'Headliner / event name as printed' },
          date:             { type: 'string', description: 'Event date, YYYY-MM-DD' },
          time:             { type: 'string', description: 'Door/show time as printed (else empty)' },
          category_hint:    { type: 'string', enum: CATEGORIES },
          poster_image_url: { type: 'string', description: 'FULL-RESOLUTION event/gig poster or artwork image URL — never a thumbnail, sprite, logo, or placeholder' },
          ticket_url:       { type: 'string', description: 'Link to buy tickets / the event detail page (else empty)' },
          venue_name:       { type: 'string', description: 'The venue or room hosting THIS specific event, if the page names it (calendars sometimes list sister venues); else empty' },
          venue_address:    { type: 'string', description: 'Street address of the venue if the page shows it (else empty)' },
          venue_website:    { type: 'string', description: 'The venue’s own website URL if the page shows it (else empty)' },
          sold_out:         { type: 'boolean' },
        },
        required: ['title', 'date'],
      },
    },
  },
  required: ['events'],
}

interface RawEvent {
  title: string
  date: string
  portland_date: string
  starts_at: string
  time_display: string
  category: string
  poster_image_url: string | null
  ticket_url: string | null
  venue_name: string
  raw_description: string
  raw_notes: string
  sold_out: boolean
  venue_address: string  // scraped venue address (for new-venue intake pre-fill)
  venue_website: string  // scraped venue website (for new-venue intake pre-fill)
}

async function firecrawlExtract(url: string, now: number, maxOut: number): Promise<{ events: RawEvent[]; beyondHorizon: number; past: number }> {
  const KEY = Deno.env.get('FIRECRAWL_API_KEY')
  if (!KEY) throw new Error('FIRECRAWL_API_KEY secret not set')
  // deno-lint-ignore no-explicit-any
  let json: any = null
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      url,
      onlyMainContent: false,
      formats: [{ type: 'json', schema: EXTRACT_SCHEMA, prompt:
        `Extract EVERY upcoming event/show on this Portland, Oregon venue page. IMPORTANT: this page may list 30 OR MORE shows — do NOT stop early, do NOT summarize or truncate, and do NOT return only the featured ones. Enumerate ALL of them exhaustively, including sold-out shows and free shows, from the top of the list to the very bottom. Today is ${portlandToday()} — SKIP any event before today. Return one object per event DATE (a multi-night run = multiple objects). For poster_image_url, return the FULL-RESOLUTION event poster/gig artwork (prefer the largest srcset candidate, the og:image, or the image on the event's detail page); do NOT return tiny thumbnails, sprites, site logos, or placeholders. venue_name = the specific venue/room hosting THIS event if the page shows it. category_hint must be the closest value from the allowed list. NEVER invent data: if a field is not on the page, use an empty string. Dates must be real calendar dates in YYYY-MM-DD.` }],
    }),
    signal: AbortSignal.timeout(100000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Firecrawl ${res.status}: ${body.slice(0, 300)}`)
  }
  json = await res.json()
  const rows = json?.data?.json?.events ?? []
  const events: RawEvent[] = []
  let beyondHorizon = 0, past = 0
  for (const ev of rows) {
    const rawTitle = typeof ev.title === 'string' ? ev.title.trim() : ''
    const date = typeof ev.date === 'string' ? ev.date.trim() : ''
    if (!rawTitle || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const timeStr = typeof ev.time === 'string' ? ev.time.trim() : ''
    const start = ptTimestamp(date, parseShowTime(timeStr))
    if (!start) continue
    if (start.getTime() < now) { past++; continue }
    if (start.getTime() > maxOut) { beyondHorizon++; continue }
    const { title, soldOut: titleSold } = detectSoldOut(rawTitle)
    const category = typeof ev.category_hint === 'string' && CATEGORIES.includes(ev.category_hint) ? ev.category_hint : 'Live Music'
    events.push({
      title,
      date,
      portland_date: portlandDate(start),
      starts_at: start.toISOString(),
      time_display: timeStr,
      category,
      poster_image_url: typeof ev.poster_image_url === 'string' && ev.poster_image_url.trim() ? ev.poster_image_url.trim() : null,
      ticket_url: typeof ev.ticket_url === 'string' && ev.ticket_url.trim() ? ev.ticket_url.trim() : null,
      venue_name: typeof ev.venue_name === 'string' ? ev.venue_name.trim() : '',
      raw_description: typeof ev.raw_description === 'string' ? ev.raw_description.trim() : '',
      raw_notes: typeof ev.raw_notes === 'string' ? ev.raw_notes.trim() : '',
      sold_out: titleSold || ev.sold_out === true,
      venue_address: typeof ev.venue_address === 'string' ? ev.venue_address.trim() : '',
      venue_website: typeof ev.venue_website === 'string' ? ev.venue_website.trim() : '',
    })
  }
  return { events: events.slice(0, MAX_EVENTS), beyondHorizon, past }
}

// ── Bandsintown adapter (deterministic JSON-LD, no LLM extraction) ─────────────
// Bandsintown venue/city pages embed the full event list as schema.org MusicEvent
// objects in an "eventsJsonLd" array — name/startDate/url/location/image, all real
// and complete. Parsing that is instant and never truncates (the JSON-schema
// extractor timed out on the 100-event page). The show WRITE-UP isn't in this array
// (description is just the artist name), so it still comes from the two-hop to each
// event's /e/ page — which, unlike etix, returns real content.
function sliceJsonArray(html: string, key: string): string | null {
  const at = html.indexOf(`"${key}":`)
  if (at < 0) return null
  const start = html.indexOf('[', at)
  if (start < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let k = start; k < html.length; k++) {
    const c = html[k]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']') { depth--; if (depth === 0) return html.slice(start, k + 1) }
  }
  return null
}
async function extractBandsintown(url: string, now: number, maxOut: number): Promise<{ events: RawEvent[]; beyondHorizon: number; past: number }> {
  const KEY = Deno.env.get('FIRECRAWL_API_KEY')
  if (!KEY) throw new Error('FIRECRAWL_API_KEY secret not set')
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ url, formats: ['rawHtml'] }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Firecrawl ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const html = typeof data?.data?.rawHtml === 'string' ? data.data.rawHtml : ''
  const arrStr = sliceJsonArray(html, 'eventsJsonLd')
  if (!arrStr) return { events: [], beyondHorizon: 0, past: 0 }
  // deno-lint-ignore no-explicit-any
  let rows: any[] = []
  try { rows = JSON.parse(arrStr) } catch { return { events: [], beyondHorizon: 0, past: 0 } }
  const events: RawEvent[] = []
  let beyondHorizon = 0, past = 0
  for (const ev of rows) {
    const perf = Array.isArray(ev.performer) ? ev.performer.map((p: { name?: string }) => p?.name).filter(Boolean).join(', ') : (ev.performer?.name || '')
    const rawTitle = String(perf || (typeof ev.name === 'string' ? ev.name.split(' @ ')[0] : '')).trim()
    const sd = typeof ev.startDate === 'string' ? ev.startDate : ''
    const date = sd.slice(0, 10)
    if (!rawTitle || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const time = /T\d{2}:\d{2}/.test(sd) ? sd.slice(11, 16) : null
    const start = ptTimestamp(date, time)
    if (!start) continue
    if (start.getTime() < now) { past++; continue }
    if (start.getTime() > maxOut) { beyondHorizon++; continue }
    const { title, soldOut } = detectSoldOut(rawTitle)
    const image = Array.isArray(ev.image) ? ev.image[0] : ev.image
    const venueName = typeof ev.location?.name === 'string' ? ev.location.name.trim() : ''
    // Build a street address from the JSON-LD PostalAddress (for new-venue intake).
    const addr = ev.location?.address
    const venueAddress = addr && typeof addr === 'object'
      ? [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter((s: unknown) => typeof s === 'string' && s).join(', ')
      : ''
    const timeDisplay = time ? new Date(start).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true }) : ''
    events.push({
      title,
      date,
      portland_date: portlandDate(start),
      starts_at: start.toISOString(),
      time_display: timeDisplay,
      category: 'Live Music', // Bandsintown is music-only
      poster_image_url: typeof image === 'string' && image.trim() ? image.trim() : null,
      ticket_url: typeof ev.url === 'string' && ev.url.trim() ? ev.url.trim() : null,
      venue_name: venueName,
      raw_description: '', // the write-up comes from the two-hop to the /e/ page
      raw_notes: '',
      sold_out: soldOut,
      venue_address: venueAddress,
      venue_website: typeof ev.location?.sameAs === 'string' ? ev.location.sameAs.trim() : '',
    })
  }
  return { events: events.slice(0, MAX_EVENTS), beyondHorizon, past }
}

// ── two-hop enrichment: follow the "Get Tickets" / event detail page ──────────
// A venue's calendar page lists shows but rarely the blurb — the real description,
// full lineup, time, and best poster live on each event's ticket/detail page. So
// when an event has a ticket_url, we scrape THAT page for the show's real content.
const DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    description:      { type: 'string', description: 'The full show description/blurb — the paragraphs describing the artists and the event. Empty if none.' },
    support_acts:     { type: 'string', description: 'Opening / support acts (the "with…" lineup), comma-separated. Empty if none.' },
    time:             { type: 'string', description: 'Door/show time as printed. Empty if none.' },
    poster_image_url: { type: 'string', description: 'FULL-RESOLUTION event poster / gig artwork URL — never a thumbnail, logo, or placeholder. Empty if none.' },
    sold_out:         { type: 'boolean' },
  },
}
interface DetailData { description: string; support_acts: string; time: string; poster_image_url: string | null; sold_out: boolean }

// Ticket hosts that are bot-walled and return ZERO scrapable content — verified:
// etix.com /ticket/p/ pages come back as 0 chars. Hopping them wastes a scrape and,
// far worse, the JSON extractor HALLUCINATES a plausible-but-fake blurb on the empty
// page (observed: invented "The Echoes at The Grand Theatre"). So skip them outright.
const DEAD_DETAIL_HOSTS = /(^|\.)etix\.com$/i
// A detail page yielding less real text than this has no write-up worth trusting;
// below it, any "description" the extractor returns is fabrication, so we discard it.
const MIN_DETAIL_CHARS = 250

async function firecrawlScrapeDetail(url: string): Promise<DetailData | null> {
  const KEY = Deno.env.get('FIRECRAWL_API_KEY')
  if (!KEY) return null
  let host = ''
  try { host = new URL(url).hostname } catch { return null }
  if (DEAD_DETAIL_HOSTS.test(host)) return null // known-empty purchase page — don't hop
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        url,
        onlyMainContent: true,
        // Pull markdown too so we can PROVE the page has real content before trusting
        // the JSON extraction (guards against hallucination on empty/JS-walled pages).
        formats: [{ type: 'json', schema: DETAIL_SCHEMA, prompt:
          `This is a single live-event ticket/detail page. Extract the show's REAL description/blurb (the paragraphs describing the artists and the show — not boilerplate, nav, or ticket-policy text), the support/opening acts, the door/show time, and the full-resolution poster/gig image. NEVER invent anything: if a field is not present on the page, use an empty string.` }, 'markdown'],
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Anti-hallucination guard: only trust the extraction if the page actually
    // returned real text. An empty page → the model invents a generic concert blurb.
    const md = (typeof data?.data?.markdown === 'string' ? data.data.markdown : '').replace(/\s+/g, ' ').trim()
    if (md.length < MIN_DETAIL_CHARS) return null
    const j = data?.data?.json
    if (!j) return null
    return {
      description: typeof j.description === 'string' ? j.description.trim() : '',
      support_acts: typeof j.support_acts === 'string' ? j.support_acts.trim() : '',
      time: typeof j.time === 'string' ? j.time.trim() : '',
      poster_image_url: typeof j.poster_image_url === 'string' && j.poster_image_url.trim() ? j.poster_image_url.trim() : null,
      sold_out: j.sold_out === true,
    }
  } catch { return null }
}

// Enrich events in place from their detail pages (bounded concurrency + hard deadline).
async function enrichFromDetailPages(events: RawEvent[], now: number, maxOut: number, deadline: number): Promise<number> {
  const targets = events.filter(e => e.ticket_url && !e.raw_description.trim()) // skip ones that already have a blurb
  let enriched = 0
  await mapLimit(targets, 8, async (e) => {
    if (Date.now() > deadline) return
    const d = await firecrawlScrapeDetail(e.ticket_url!)
    if (!d) return
    let touched = false
    if (d.description) { e.raw_description = d.description; touched = true }
    if (d.support_acts && !e.raw_notes) { e.raw_notes = d.support_acts; touched = true }
    if (d.poster_image_url && !e.poster_image_url) { e.poster_image_url = d.poster_image_url; touched = true }
    if (d.sold_out) e.sold_out = true
    if (d.time) {
      const refined = ptTimestamp(e.date, parseShowTime(d.time))
      if (refined && refined.getTime() >= now && refined.getTime() <= maxOut) {
        e.starts_at = refined.toISOString(); e.time_display = e.time_display || d.time
      }
    }
    if (touched) enriched++
  })
  return enriched
}

// ── request handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
  const supabaseService = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user }, error: authError } = await supabaseService.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
  const { data: profile } = await supabaseService.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // ═══ RELINK: parked orphans → pending Review events for a (new/existing) venue ══
    // Handled FIRST — a relink request carries no url, so it must run before the url
    // check below. Self-contained (no scrape-sources): re-hosts the stored poster,
    // keeps the already-composed description + real category, attaches the venue's
    // neighborhood/address, inserts as PENDING (→ Review), marks the orphan linked.
    if (body.relink && typeof body.relink === 'object') {
      const rl = body.relink as { venueId?: string; rawVenueName?: string; orphanIds?: unknown }
      const venueId = typeof rl.venueId === 'string' ? rl.venueId : ''
      const rawVenueName = typeof rl.rawVenueName === 'string' ? rl.rawVenueName : ''
      const orphanIds = Array.isArray(rl.orphanIds) ? rl.orphanIds.filter((x): x is string => typeof x === 'string') : null
      if (!venueId) throw new Error('relink: venueId required')
      const { data: venue } = await supabaseService.from('venues').select('id, name, neighborhood, address').eq('id', venueId).single()
      if (!venue) throw new Error('relink: venue not found')
      let q = supabaseService.from('ingest_orphans').select('*').eq('status', 'open')
      if (orphanIds && orphanIds.length) q = q.in('id', orphanIds)
      else if (rawVenueName) q = q.eq('raw_venue_name', rawVenueName)
      else throw new Error('relink: orphanIds or rawVenueName required')
      const { data: orphans } = await q
      // deno-lint-ignore no-explicit-any
      const list = (orphans ?? []) as any[]
      const relinkNow = Date.now()
      const imageDeadline = relinkNow + IMAGE_TOTAL_BUDGET_MS
      let relinked = 0, failed = 0
      const errs: string[] = []
      for (const o of list) {
        const posterUrl = await rehostImage(supabaseService, o.image_url ?? null, imageDeadline)
        const cat = typeof o.category === 'string' && CATEGORIES.includes(o.category) ? o.category : 'Live Music'
        const { data: ins, error: insErr } = await supabaseService.from('events').insert({
          venue_id: venueId,
          title: o.title,
          category: cat,
          poster_url: posterUrl,
          starts_at: o.starts_at,
          description: o.description ?? null,
          neighborhood: venue.neighborhood,
          address: venue.address,
          view_count: 0,
          like_count: 0,
          status: 'pending', // → Review (passed_review defaults false)
          sold_out: o.sold_out ?? false,
          created_by: user.id,
          source_url: o.event_url || o.source_url || null,
          ai_confidence: typeof o.confidence === 'number' ? o.confidence : 90,
        }).select('id').single()
        if (insErr) { failed++; errs.push(insErr.message); continue }
        await supabaseService.from('ingest_orphans').update({ status: 'linked', linked_venue_id: venueId, linked_event_id: ins?.id ?? null }).eq('id', o.id)
        relinked++
      }
      return new Response(JSON.stringify({ relinked, failed, found: list.length, ...(errs.length ? { errors: errs.slice(0, 5) } : {}) }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
    if (!rawUrl) throw new Error('Pass a url')
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const now = Date.now()
    const horizonDays = Number.isFinite(body.maxDays) ? Math.min(365, Math.max(1, Math.round(body.maxDays))) : DEFAULT_HORIZON_DAYS
    // Optional "only events on/after this date" (YYYY-MM-DD, Portland time). Defaults to
    // now. `floor` is the lower bound for which events to keep; the horizon window
    // extends horizonDays from whichever is later (now or the chosen start date).
    const afterMs = typeof body.afterDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.afterDate)
      ? (ptTimestamp(body.afterDate, '00:00')?.getTime() ?? now)
      : now
    const floor = afterMs
    const maxOut = Math.max(now, floor) + horizonDays * 24 * 60 * 60 * 1000

    // Venue list for per-event resolution (handles sister-venue calendars).
    const { data: allVenues } = await supabaseService.from('venues').select('id, name, neighborhood, address')
    const venueList = (allVenues ?? []) as Array<{ id: string; name: string; neighborhood: string | null; address: string | null }>
    // Resolve an extracted venue name to one of our venues.
    //   named + matches ≥ threshold → that venue
    //   named + NO match            → NEW venue: orphanName set, id null → PARK (never fall back)
    //   NOT named                   → fall back to the dropdown venue (single-venue-page case)
    function resolveVenue(extractedName: string, fallbackId: string | null): { id: string | null; name: string | null; meta: { neighborhood: string | null; address: string | null }; orphanName: string | null } {
      if (extractedName && extractedName.trim()) {
        const exact = venueList.find(v => normalizeName(v.name) === normalizeName(extractedName))
        const best = exact ?? venueList.map(v => ({ v, s: nameSimilarity(extractedName, v.name) })).sort((a, b) => b.s - a.s)[0]?.v
        const scored = exact ? 1 : (best ? nameSimilarity(extractedName, best.name) : 0)
        if (best && scored >= VENUE_MATCH_THRESHOLD) return { id: best.id, name: best.name, meta: { neighborhood: best.neighborhood, address: best.address }, orphanName: null }
        // Named on the page but unknown to us → park as a NEW venue. Do NOT misattribute.
        return { id: null, name: null, meta: { neighborhood: null, address: null }, orphanName: extractedName.trim() }
      }
      const fb = fallbackId ? venueList.find(v => v.id === fallbackId) : null
      return { id: fb?.id ?? fallbackId ?? null, name: fb?.name ?? null, meta: { neighborhood: fb?.neighborhood ?? null, address: fb?.address ?? null }, orphanName: null }
    }

    // Insert a batch of extracted events. Dedupes against events already in the
    // table (ANY status) at the same venue + Portland date with a matching title,
    // so re-running a fetch doesn't spam duplicate pendings. Also dedupes within
    // the batch. Returns counts + first errors.
    async function insertEvents(rows: Array<RawEvent & { description?: string }>, fallbackId: string | null, publish: boolean) {
      const status = publish ? 'published' : 'pending'
      // Cap re-hosting by an absolute request deadline; any posters not re-hosted in
      // time keep their remote URL (still works, just not EXIF-stripped/re-hosted).
      const imageDeadline = Math.min(Date.now() + IMAGE_TOTAL_BUDGET_MS, now + INSERT_DEADLINE_MS)
      // Dedupe index vs existing events (any status).
      const index = new Set<string>()
      const candVenueIds = [...new Set(rows.map(r => resolveVenue(r.venue_name ?? '', fallbackId).id).filter((x): x is string => !!x))]
      if (candVenueIds.length) {
        const { data: existing } = await supabaseService.from('events')
          .select('title, starts_at, venue_id')
          .in('venue_id', candVenueIds)
          .gte('starts_at', new Date(now - 24 * 60 * 60 * 1000).toISOString())
        for (const ex of (existing ?? []) as Array<{ title: string; starts_at: string; venue_id: string }>) {
          index.add(`${ex.venue_id}|${portlandDate(new Date(ex.starts_at))}|${normalizeName(ex.title)}`)
        }
      }
      // Dedupe index vs already-parked open orphans (so re-fetching doesn't re-park).
      const orphanIndex = new Set<string>()
      {
        const { data: openO } = await supabaseService.from('ingest_orphans').select('title, starts_at, raw_venue_name').eq('status', 'open')
        for (const o of (openO ?? []) as Array<{ title: string; starts_at: string; raw_venue_name: string | null }>) {
          orphanIndex.add(`${normalizeName(o.raw_venue_name ?? '')}|${portlandDate(new Date(o.starts_at))}|${normalizeName(o.title)}`)
        }
      }
      let inserted = 0, failed = 0, skipped = 0, parked = 0
      const parkedVenues = new Set<string>()
      const errors: string[] = []
      for (const ev of rows.slice(0, MAX_EVENTS)) {
        if (!ev?.title || !ev?.starts_at) { failed++; continue }
        const rv = resolveVenue(ev.venue_name ?? '', fallbackId)
        const category = typeof ev.category === 'string' && CATEGORIES.includes(ev.category) ? ev.category : 'Live Music'
        // Prefer the blurb composed at extract time; only compose here if missing.
        const description = (typeof ev.description === 'string' && ev.description.trim())
          ? ev.description.trim()
          : await composeDescription({
              title: ev.title, venueName: rv.name ?? ev.venue_name ?? '', category,
              timeDisplay: ev.time_display ?? '', rawDescription: ev.raw_description ?? '', rawNotes: ev.raw_notes ?? '', soldOut: ev.sold_out ?? false,
            })

        // NEW VENUE (named on the page but unknown to us): park, never misattribute.
        if (rv.orphanName) {
          const okey = `${normalizeName(rv.orphanName)}|${portlandDate(new Date(ev.starts_at))}|${normalizeName(ev.title)}`
          if (orphanIndex.has(okey)) { skipped++; continue }
          const { error: orphErr } = await supabaseService.from('ingest_orphans').insert({
            title: ev.title,
            starts_at: ev.starts_at,
            raw_venue_name: rv.orphanName,
            image_url: ev.poster_image_url ?? null, // raw; re-hosted at relink
            description,                              // already composed in Plaster's voice
            source_url: url,
            event_url: ev.ticket_url ?? null,
            sold_out: ev.sold_out ?? false,
            confidence: 90,
            created_by: user.id,
            category,
            raw_venue_address: ev.venue_address || null,
            raw_venue_website: ev.venue_website || null,
          })
          if (orphErr) { failed++; errors.push(`${ev.title}: ${orphErr.message}`) }
          else { parked++; parkedVenues.add(rv.orphanName); orphanIndex.add(okey) }
          continue
        }
        if (!rv.id) { failed++; errors.push(`${ev.title}: no venue`); continue }

        const key = `${rv.id}|${portlandDate(new Date(ev.starts_at))}|${normalizeName(ev.title)}`
        if (index.has(key)) { skipped++; continue }
        const posterUrl = await rehostImage(supabaseService, ev.poster_image_url ?? null, imageDeadline)
        const { error: insErr } = await supabaseService.from('events').insert({
          venue_id: rv.id,
          title: ev.title,
          category,
          poster_url: posterUrl,
          starts_at: ev.starts_at,
          description,
          neighborhood: rv.meta.neighborhood,
          address: rv.meta.address,
          view_count: 0,
          like_count: 0,
          status, // service role bypasses the ingest-status trigger — set explicitly
          sold_out: ev.sold_out ?? false,
          created_by: user.id,
          source_url: ev.ticket_url || url,
          ai_confidence: 90,
        })
        if (insErr) { failed++; errors.push(`${ev.title}: ${insErr.message}`) }
        else { inserted++; index.add(key) }
      }
      return { inserted, failed, skipped, parked, parkedVenues: [...parkedVenues], errors }
    }

    // ═══ DRY RUN: extract → (optionally) commit to pending → return for review ══
    if (body.dryRun === true) {
      let bitHost = ''
      try { bitHost = new URL(url).hostname } catch { /* keep empty */ }
      const isBandsintown = /(^|\.)bandsintown\.com$/i.test(bitHost)
      const { events, beyondHorizon, past } = isBandsintown
        ? await extractBandsintown(url, floor, maxOut)   // deterministic JSON-LD parse
        : await firecrawlExtract(url, floor, maxOut)
      const fallbackId: string | null = typeof body.venueId === 'string' && body.venueId ? body.venueId : null
      // Follow each event's "Get Tickets" / detail page for the real show description
      // (the calendar page rarely has one). On by default; the admin can skip it.
      const deepFetch = body.deepFetch !== false
      const enriched = deepFetch ? await enrichFromDetailPages(events, floor, maxOut, now + DRYRUN_DEADLINE_MS) : 0
      const resolved = events.map(e => ({ e, rv: resolveVenue(e.venue_name, fallbackId) }))
      // Compose the Plaster-voice info-page blurb NOW (parallelized) so the admin
      // reviews the real, complete info page — poster + description — before publishing.
      const descriptions = await mapLimit(resolved, 8, ({ e, rv }) => composeDescription({
        title: e.title, venueName: rv.name ?? '', category: e.category,
        timeDisplay: e.time_display, rawDescription: e.raw_description, rawNotes: e.raw_notes, soldOut: e.sold_out,
      }))
      const out = resolved.map(({ e, rv }, idx) => ({
        ...e, description: descriptions[idx] ?? '',
        venue_id: rv.id, resolved_venue_name: rv.name,
        matched_venue: !!e.venue_name && rv.name != null && normalizeName(rv.name) !== normalizeName(venueList.find(v => v.id === fallbackId)?.name ?? ''),
      }))
      // commit (default for the admin Fetch flow): write everything to PENDING now so
      // findings land in the Review tab immediately and survive navigating away. The
      // pure preview (commit:false) still returns without writing.
      if (body.commit === true) {
        const ins = await insertEvents(out, fallbackId, false)
        return new Response(JSON.stringify({ url, count: out.length, beyondHorizon, past, enriched, deepFetch, committed: true, ...ins, events: out }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      }
      return new Response(JSON.stringify({ url, count: out.length, beyondHorizon, past, enriched, deepFetch, committed: false, events: out }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // ═══ IMPORT: insert an explicit selection (legacy path) ════════════════════
    const selected: Array<RawEvent & { description?: string }> = Array.isArray(body.events) ? body.events : []
    if (selected.length === 0) throw new Error('No events selected')
    const fallbackId: string | null = typeof body.venueId === 'string' && body.venueId ? body.venueId : null
    const publish: boolean = body.publish !== false // default: publish (admin already reviewed)
    const { inserted, failed, skipped, errors } = await insertEvents(selected, fallbackId, publish)
    return new Response(JSON.stringify({ inserted, failed, skipped, status: publish ? 'published' : 'pending', ...(errors.length ? { errors: errors.slice(0, 10) } : {}) }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
})
