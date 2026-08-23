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

const CATEGORIES = ['Live Music','Dance','Comedy','Drag','Jazz','Trivia','Karaoke','Theater','Burlesque','Classical','Film','Festivals','Markets','Art','Literary','Spoken','Other']

// ── time helpers (America/Los_Angeles) ───────────────────────────────────────
// Exact PT offset for a given date via Intl (handles DST boundaries precisely).
// The old month heuristic was wrong for ~3 weeks/year around the March/Nov
// switches, storing starts_at an hour off — which could flip a late show's
// portland_date (also the dedupe key) and double-insert it.
function portlandOffset(dateStr: string): string {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`) // midday → unambiguous re: the 2am transition
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })
    .formatToParts(noonUtc).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-8'
  const m = tzName.match(/GMT([+-]?\d{1,2})/)
  const hrs = m ? parseInt(m[1], 10) : -8
  return `${hrs < 0 ? '-' : '+'}${String(Math.abs(hrs)).padStart(2, '0')}:00`
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
  // Already ours (e.g. a clipper screenshot uploaded moments ago) — keep as-is.
  if (imageUrl.startsWith(Deno.env.get('SUPABASE_URL') ?? '\u0000')) return imageUrl
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
      signal: AbortSignal.timeout(30000), // a hung connection here strands a half-inserted batch
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = (data.content?.[0]?.text ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
    return text || null
  } catch { return null }
}

// Derive the clean headliner name from an event title (for the backfill). Returns
// the name, or '' when the title is not a single act (festival/market/generic) or
// on any error — '' means "processed, no artist" so the rail falls back to the title.
async function extractArtistName(title: string, KEY: string): Promise<string> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: REWRITE_MODEL, max_tokens: 40, messages: [{ role: 'user', content:
        `Extract the clean headliner/act name from this event title — a band, musician, comedian, or performer. Return ONLY the name: no tour name, no "presented by", no support acts, no all-caps styling (e.g. "Pigeons Playing Ping Pong", not "PIGEONS PLAYING PING PONG - FALL TOUR 2026"). If the title is NOT a single act (a festival, market, trivia night, or generic event), respond with only the word NONE.\n\nTitle: ${title}` }] }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return ''
    const data = await res.json()
    const t = (data.content?.[0]?.text ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
    return (!t || t.toUpperCase() === 'NONE') ? '' : t
  } catch { return '' }
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
          artist_name:      { type: 'string', description: 'The clean headliner/act name ONLY — no tour name, no "presented by", no support acts, no all-caps styling (e.g. "Pigeons Playing Ping Pong", not "PIGEONS PLAYING PING PONG - FALL TOUR"). Empty if not a single act.' },
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
  artist_name: string    // clean headliner name for the media rail ('' if unknown)
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
      artist_name: typeof ev.artist_name === 'string' ? ev.artist_name.trim() : '',
    })
  }
  return { events: events.slice(0, MAX_EVENTS), beyondHorizon, past }
}

// ── Fetch-first JSON-LD extractor (FREE — no Firecrawl, no LLM) ───────────────
// Most ticketing/venue platforms (Eventbrite, TicketWeb, Squarespace, WordPress
// event plugins…) embed schema.org Event objects as <script type="application/
// ld+json"> in the RAW HTML — no JS rendering needed. A plain fetch + parse gets
// everything deterministically. Returns null when the page has no Event JSON-LD
// (or the fetch fails/bot-walls) → caller falls back to Firecrawl. When the page
// DOES have Event JSON-LD, we trust it fully — even if all events fall outside
// the window — because Firecrawl would only re-read the same data for money.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const LD_TYPE_CATEGORY: Record<string, string> = {
  MusicEvent: 'Live Music', ComedyEvent: 'Comedy', TheaterEvent: 'Theater',
  DanceEvent: 'Dance', ScreeningEvent: 'Film', Festival: 'Festivals',
  VisualArtsEvent: 'Art', LiteraryEvent: 'Literary',
}
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', nbsp: ' ', quot: '"', apos: "'", rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d',
  hellip: '\u2026', ndash: '\u2013', mdash: '\u2014', eacute: '\u00e9', egrave: '\u00e8', agrave: '\u00e0',
  ouml: '\u00f6', uuml: '\u00fc', ntilde: '\u00f1', ccedil: '\u00e7',
}
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return m } })
    .replace(/&#(\d+);/g, (m, dec) => { try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return m } })
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}
function stripTags(x: string): string { return x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
// deno-lint-ignore no-explicit-any
function ldFirst(x: any): any { return Array.isArray(x) ? x[0] : x }
// deno-lint-ignore no-explicit-any
function ldImageUrl(img: any, base: string): string | null {
  const one = ldFirst(img)
  const raw = typeof one === 'string' ? one : (one && typeof one.url === 'string' ? one.url : null)
  if (!raw) return null
  try { return new URL(raw, base).href } catch { return null }
}
async function jsonLdExtract(url: string, now: number, maxOut: number): Promise<{ events: RawEvent[]; beyondHorizon: number; past: number } | null> {
  let html = ''
  try {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html' }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    html = await res.text()
  } catch { return null }
  if (!html || html.length > 5_000_000) return null
  return jsonLdFromHtml(html, url, now, maxOut)
}

// Same parser, but on HTML we already hold (the clipper ships the rendered DOM).
function jsonLdFromHtml(html: string, url: string, now: number, maxOut: number): { events: RawEvent[]; beyondHorizon: number; past: number } | null {

  // Collect every ld+json block → flatten @graph/arrays → keep schema.org Events
  // deno-lint-ignore no-explicit-any
  const nodes: any[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim())
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        if (item && Array.isArray(item['@graph'])) nodes.push(...item['@graph'])
        else if (item) nodes.push(item)
      }
    } catch { /* malformed block — skip */ }
  }
  if (nodes.length === 0) return null

  // deno-lint-ignore no-explicit-any
  const eventNodes: any[] = []
  for (const n of nodes) {
    const types = (Array.isArray(n?.['@type']) ? n['@type'] : [n?.['@type']]).filter((t: unknown) => typeof t === 'string') as string[]
    if (types.some(t => /Event$/.test(t) || t === 'Festival') && !types.includes('EventSeries')) eventNodes.push(n)
    // EventSeries → its subEvents are the real dated occurrences
    if (types.includes('EventSeries') && Array.isArray(n?.subEvent)) eventNodes.push(...n.subEvent)
  }
  if (eventNodes.length === 0) return null

  const events: RawEvent[] = []
  const nodeUrls: string[] = []  // canonical url of each event's own node (parallel to events)
  const seen = new Set<string>()
  let beyondHorizon = 0, past = 0
  for (const n of eventNodes) {
    const rawTitle = typeof n?.name === 'string' ? decodeEntities(n.name).trim() : ''
    const startRaw = typeof n?.startDate === 'string' ? n.startDate.trim() : ''
    if (!rawTitle || !startRaw) continue
    // startDate: full ISO w/ offset → trust it; date-or-naive-time → Portland rules
    let start: Date | null = null
    let timePart = ''
    const dateOnly = startRaw.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) continue
    if (/[+-]\d{2}:?\d{2}$|Z$/.test(startRaw)) {
      const d = new Date(startRaw)
      if (!isNaN(d.getTime())) { start = d; timePart = startRaw.slice(11, 16) }
    } else if (/T\d{2}:\d{2}/.test(startRaw)) {
      timePart = startRaw.slice(11, 16)
      start = ptTimestamp(dateOnly, timePart)
    } else {
      start = ptTimestamp(dateOnly, null)
    }
    if (!start) continue
    if (start.getTime() < now) { past++; continue }
    if (start.getTime() > maxOut) { beyondHorizon++; continue }
    const key = `${normalizeName(rawTitle)}|${portlandDate(start)}`
    if (seen.has(key)) continue
    seen.add(key)

    const { title, soldOut: titleSold } = detectSoldOut(rawTitle)
    const types = (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]).filter((t: unknown) => typeof t === 'string') as string[]
    const category = types.map(t => LD_TYPE_CATEGORY[t]).find(Boolean) ?? 'Live Music'
    const offers = ldFirst(n.offers)
    const offerUrl = offers && typeof offers.url === 'string' ? offers.url : null
    const pageEventUrl = typeof n.url === 'string' ? n.url : null
    let ticketUrl: string | null = null
    try { ticketUrl = offerUrl ? new URL(offerUrl, url).href : (pageEventUrl ? new URL(pageEventUrl, url).href : null) } catch { ticketUrl = null }
    const soldOut = titleSold || (offers && typeof offers.availability === 'string' && /SoldOut/i.test(offers.availability))
    const loc = ldFirst(n.location)
    const venueName = loc && typeof loc.name === 'string' ? decodeEntities(loc.name).trim() : ''
    let venueAddress = ''
    if (loc?.address) {
      const a = ldFirst(loc.address)
      if (typeof a === 'string') venueAddress = a.trim()
      else if (a && typeof a === 'object') venueAddress = [a.streetAddress, a.addressLocality].filter((x: unknown) => typeof x === 'string' && x).join(', ')
    }
    const perf = ldFirst(n.performer)
    const artistName = perf && typeof perf.name === 'string' ? perf.name.trim() : ''

    nodeUrls.push(pageEventUrl ? (() => { try { return new URL(pageEventUrl, url).href } catch { return '' } })() : '')
    events.push({
      title,
      date: dateOnly,
      portland_date: portlandDate(start),
      starts_at: start.toISOString(),
      time_display: timePart,
      category,
      poster_image_url: ldImageUrl(n.image, url),
      ticket_url: ticketUrl,
      venue_name: venueName,
      raw_description: typeof n.description === 'string' ? decodeEntities(stripTags(n.description)).slice(0, 2000) : '',
      raw_notes: '',
      sold_out: !!soldOut,
      venue_address: venueAddress,
      venue_website: '',
      artist_name: artistName,
    })
  }
  // Page-scope filter: ticketing hubs (merctickets, etc.) embed a CITY-WIDE
  // event graph on every page. If one parsed event's canonical URL IS the page
  // we were asked to import, the admin meant THAT event — keep it plus its own
  // venue's other events (useful same-venue backfill, e.g. Holocene/Crystal),
  // and drop the cross-venue spray. Calendar pages (no node matches the page
  // URL) keep everything.
  const canon = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '')
  const pageCanon = canon(url)
  const matchIdx = nodeUrls.findIndex(u => u && canon(u) === pageCanon)
  let out = events
  if (matchIdx >= 0) {
    const targetVenue = normalizeName(events[matchIdx].venue_name || '')
    out = events.filter((e, i) => i === matchIdx || !e.venue_name || normalizeName(e.venue_name) === targetVenue)
  }
  // A page whose JSON-LD held real Events is authoritative even when everything
  // fell outside the window — return counts so the caller reports honestly.
  return { events: out.slice(0, MAX_EVENTS), beyondHorizon, past }
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
      artist_name: title, // Bandsintown title IS the clean performer name
    })
  }
  return { events: events.slice(0, MAX_EVENTS), beyondHorizon, past }
}

// ── EverOut adapter (community events; LLM extraction, NO images) ──────────────
// EverOut (Portland Mercury) roundup/category pages are prose — no JSON-LD — so we
// LLM-extract. City-wide: every event a different venue (→ orphan flow). We keep the
// editorial write-up (rewritten into Plaster's voice downstream) but NEVER their
// images: community events land with poster_image_url null and the admin supplies
// the art in Review. Dates arrive as concrete short ranges ("July 24–26") which we
// expand to one row per day, capped.
const EVEROUT_PER_EVENT_CAP = 12
const EVEROUT_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title:              { type: 'string' },
          artist_name:        { type: 'string', description: 'The clean performer/act name if this is a single act (comedian, band, author) — no tour name or extra words. Empty for multi-act festivals, markets, or non-performer events.' },
          description:        { type: 'string', description: 'A 1–3 sentence summary of the event in your own words (do NOT copy the article verbatim). Empty if none.' },
          venue_name:         { type: 'string', description: 'Venue/location name — the part before the comma in the italic footer like "Venue, Neighborhood (date)"' },
          venue_neighborhood: { type: 'string', description: 'Neighborhood shown after the venue (else empty)' },
          date_start:         { type: 'string', description: 'Start date YYYY-MM-DD' },
          date_end:           { type: 'string', description: 'End date YYYY-MM-DD (same as start for a single day)' },
          category_hint:      { type: 'string', enum: CATEGORIES },
          detail_url:         { type: 'string', description: 'The everout.com event link for this item (else empty)' },
          is_past:            { type: 'boolean', description: 'true if the item is marked "Past Event"' },
        },
        required: ['title'],
      },
    },
  },
  required: ['events'],
}
function expandDates(ds: string, de: string, cap: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return []
  const start = new Date(`${ds}T12:00:00Z`)
  const end = /^\d{4}-\d{2}-\d{2}$/.test(de) ? new Date(`${de}T12:00:00Z`) : start
  if (isNaN(start.getTime())) return []
  if (isNaN(end.getTime()) || end < start) return [ds]
  const out: string[] = []
  const cur = new Date(start)
  while (cur <= end && out.length < cap) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}
async function extractEverout(url: string, floor: number, maxOut: number): Promise<{ events: RawEvent[]; beyondHorizon: number; past: number }> {
  const KEY = Deno.env.get('FIRECRAWL_API_KEY')
  if (!KEY) throw new Error('FIRECRAWL_API_KEY secret not set')
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      formats: [{ type: 'json', schema: EVEROUT_SCHEMA, prompt:
        `This is a Portland, Oregon events page (a Mercury/EverOut roundup or category list). Today is ${portlandToday()}. Extract EVERY event featured. For each item: title; a 1–3 sentence description IN YOUR OWN WORDS (never copy the article text verbatim); the venue/location name and neighborhood (from the italic footer like "Venue, Neighborhood (date)"); the closest category from the allowed list; the everout.com detail link; and the date as date_start/date_end in YYYY-MM-DD — infer the year so it is the upcoming occurrence, a single day has date_start == date_end, and a range like "July 24–26" spans those days. Set is_past=true for anything marked "Past Event". Do NOT extract images. NEVER invent data — empty string if a field is absent.` }],
    }),
    signal: AbortSignal.timeout(100000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Firecrawl ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const rows = data?.data?.json?.events ?? []
  const events: RawEvent[] = []
  let beyondHorizon = 0, past = 0
  for (const ev of rows) {
    if (ev.is_past === true) { past++; continue }
    const rawTitle = typeof ev.title === 'string' ? ev.title.trim() : ''
    if (!rawTitle) continue
    const ds = typeof ev.date_start === 'string' ? ev.date_start.trim() : ''
    const de = typeof ev.date_end === 'string' ? ev.date_end.trim() : ds
    const dates = expandDates(ds, de, EVEROUT_PER_EVENT_CAP)
    if (dates.length === 0) continue // no confident date → skip rather than guess
    const { title, soldOut } = detectSoldOut(rawTitle)
    const category = typeof ev.category_hint === 'string' && CATEGORIES.includes(ev.category_hint) ? ev.category_hint : 'Other'
    const venueName = typeof ev.venue_name === 'string' ? ev.venue_name.trim() : ''
    const nbhdHint = typeof ev.venue_neighborhood === 'string' && ev.venue_neighborhood.trim() ? `EverOut neighborhood: ${ev.venue_neighborhood.trim()}` : ''
    const detailUrl = typeof ev.detail_url === 'string' && ev.detail_url.trim() ? ev.detail_url.trim() : url
    const desc = typeof ev.description === 'string' ? ev.description.trim() : ''
    for (const d of dates) {
      const start = ptTimestamp(d, null)
      if (!start) continue
      if (start.getTime() < floor) { past++; continue }
      if (start.getTime() > maxOut) { beyondHorizon++; continue }
      events.push({
        title,
        date: d,
        portland_date: portlandDate(start),
        starts_at: start.toISOString(),
        time_display: '',
        category,
        poster_image_url: null,        // community events NEVER use scraped images
        ticket_url: detailUrl,         // everout link → source_url + the needs-photo signal
        venue_name: venueName,
        raw_description: desc,          // rewritten into Plaster's voice downstream
        raw_notes: nbhdHint,
        sold_out: soldOut,
        venue_address: '',
        venue_website: '',
        artist_name: typeof ev.artist_name === 'string' ? ev.artist_name.trim() : '',
      })
    }
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

  const supabaseService = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Clipper auth: dedicated bearer secret, honored ONLY for the clipper
  // branch (enforced below). The browser extension never holds Supabase keys.
  const clipperHeader = req.headers.get('x-clipper-token')
  let user: { id: string } | null = null
  let clipperAuthed = false
  if (clipperHeader) {
    const expect = Deno.env.get('CLIPPER_TOKEN')
    if (!expect || clipperHeader !== expect) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }
    const { data: adminRow } = await supabaseService.from('profiles').select('id').eq('is_admin', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!adminRow?.id) {
      return new Response(JSON.stringify({ error: 'no admin profile' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }
    user = { id: adminRow.id }
    clipperAuthed = true
  } else {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }
    const { data: { user: jwtUser }, error: authError } = await supabaseService.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !jwtUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }
    const { data: profile } = await supabaseService.from('profiles').select('is_admin').eq('id', jwtUser.id).single()
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }
    user = jwtUser
  }

  const authedUser = user!  // assigned on every surviving path above

  try {
    const body = await req.json().catch(() => ({}))
    // The clipper token unlocks NOTHING except the clipper branch.
    // deno-lint-ignore no-explicit-any
    if (clipperAuthed && !((body as any)?.clipper || (body as any)?.clipper_delete || (body as any)?.clipper_schedule)) {
      return new Response(JSON.stringify({ error: 'clipper token only permits clipper captures' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

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
          created_by: authedUser.id,
          source_url: o.event_url || o.source_url || null,
          ai_confidence: typeof o.confidence === 'number' ? o.confidence : 90,
          artist_name: o.artist_name ?? null,
        }).select('id').single()
        if (insErr) { failed++; errs.push(insErr.message); continue }
        await supabaseService.from('ingest_orphans').update({ status: 'linked', linked_venue_id: venueId, linked_event_id: ins?.id ?? null }).eq('id', o.id)
        relinked++
      }
      return new Response(JSON.stringify({ relinked, failed, found: list.length, ...(errs.length ? { errors: errs.slice(0, 5) } : {}) }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // ═══ DESCRIBE IMAGE: Claude Vision reads a screenshot → Plaster-voice blurb ══
    // Also url-less, so handled before the url check. Used by the Review editor's
    // "drop a screenshot of the event info" zone: grounded in what's visible only.
    if (body.describeImage && typeof body.describeImage === 'object') {
      const di = body.describeImage as { base64?: string; mimeType?: string; title?: string; venue?: string }
      const base64 = typeof di.base64 === 'string' ? di.base64 : ''
      if (!base64) throw new Error('describeImage: base64 required')
      const KEY = Deno.env.get('ANTHROPIC_API_KEY')
      if (!KEY) throw new Error('ANTHROPIC_API_KEY secret not set')
      const title = typeof di.title === 'string' ? di.title.trim() : ''
      const venue = typeof di.venue === 'string' ? di.venue.trim() : ''
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: REWRITE_MODEL,
          max_tokens: 400,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: di.mimeType || 'image/jpeg', data: base64 } },
            { type: 'text', text: `This image is a screenshot of event information${title ? ` for "${title}"` : ''}${venue ? ` at ${venue}` : ''}. Today is ${portlandToday()} (America/Los_Angeles). Read the details in the image and respond with ONLY a JSON object (no preamble, no code fences) of this exact shape: {"blurb": string|null, "title": string|null, "date": string|null, "time": string|null}. blurb: a 1–3 sentence event blurb for a Portland events app in a warm, plainspoken, slightly playful voice, using ONLY facts visible in the image (plus the title/venue given) — never invent genres, prices, times, lineups, or anything not shown; null if no real event details are readable. title: the event's actual title/headliner as shown in the image, ONLY if clearly visible — null otherwise. date: the event date as YYYY-MM-DD, ONLY if clearly visible; if the year is not shown, use the next occurrence of that date on or after today — null if no date is visible. time: the START time as 24-hour HH:MM, ONLY if clearly visible (prefer the show/start time over doors; if only doors is shown, use doors) — null otherwise.` },
          ] }],
        }),
        signal: AbortSignal.timeout(45000),
      })
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Anthropic ${res.status}: ${t.slice(0, 200)}`) }
      const data = await res.json()
      const raw = (data.content?.[0]?.text ?? '').trim()
      // Parse the structured reply; tolerate stray text/fences around the JSON.
      let blurb = '', exTitle: string | null = null, exDate: string | null = null, exTime: string | null = null
      try {
        const m = raw.match(/\{[\s\S]*\}/)
        const j = JSON.parse(m ? m[0] : raw)
        blurb = typeof j.blurb === 'string' ? j.blurb.trim() : ''
        exTitle = typeof j.title === 'string' && j.title.trim() ? j.title.trim() : null
        exDate = typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null
        exTime = typeof j.time === 'string' && /^\d{2}:\d{2}$/.test(j.time) ? j.time : null
      } catch {
        // Model fell back to plain text — treat it as the blurb (legacy behavior)
        blurb = raw.replace(/^["'\s]+|["'\s]+$/g, '').trim()
        if (blurb.toUpperCase() === 'NONE') blurb = ''
      }
      return new Response(JSON.stringify({ blurb, title: exTitle, date: exDate, time: exTime }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // ═══ BACKFILL ARTIST NAMES: one-time (batched) — derive artist_name from title ══
    // Run repeatedly until { remaining: 0 }. Only touches rail categories; marks
    // non-acts with '' so they aren't rescanned. url-less, so handled before the check.
    if (body.backfillArtists) {
      const KEY = Deno.env.get('ANTHROPIC_API_KEY')
      if (!KEY) throw new Error('ANTHROPIC_API_KEY secret not set')
      const RAIL_CATS = ['Live Music', 'Jazz', 'Classical', 'Dance', 'Comedy']
      const limit = (typeof body.backfillArtists === 'object' && Number.isFinite(body.backfillArtists.limit)) ? Math.min(60, Math.max(1, Math.round(body.backfillArtists.limit))) : 40
      const { data: rows } = await supabaseService.from('events').select('id, title').is('artist_name', null).in('category', RAIL_CATS).limit(limit)
      const list = (rows ?? []) as Array<{ id: string; title: string }>
      let updated = 0
      await mapLimit(list, 8, async (e) => {
        const name = await extractArtistName(e.title, KEY)
        await supabaseService.from('events').update({ artist_name: name }).eq('id', e.id) // '' marks processed
        if (name) updated++
      })
      const { count } = await supabaseService.from('events').select('id', { count: 'exact', head: true }).is('artist_name', null).in('category', RAIL_CATS)
      return new Response(JSON.stringify({ processed: list.length, updated, remaining: count ?? 0 }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // ═══ CLIPPER ERASE: pull a just-captured event back out of the queue ═══════
    // Token-scoped destructive op, deliberately narrow: deletes ONLY rows still
    // status='pending' (never anything published/live on the wall).
    if (body.clipper_delete && typeof body.clipper_delete === 'object') {
      const cd = body.clipper_delete as { event_id?: string }
      const id = typeof cd.event_id === 'string' ? cd.event_id : ''
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('clipper_delete: event_id required')
      const { data: del, error: delErr } = await supabaseService.from('events')
        .delete().eq('id', id).eq('status', 'pending').select('id')
      if (delErr) throw delErr
      return new Response(JSON.stringify({ deleted: del?.length ?? 0 }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // ═══ CLIPPER SCHEDULE: highlight a printed run of dates → clone the event ══
    // {clipper_schedule:{event_id, image_base64, mimeType}} — Claude Vision reads
    // the highlighted schedule; each date becomes a pending COPY of the source
    // event (same poster/blurb/venue), deduped against existing rows.
    if (body.clipper_schedule && typeof body.clipper_schedule === 'object') {
      const cs = body.clipper_schedule as { event_id?: string; image_base64?: string; mimeType?: string }
      const srcId = typeof cs.event_id === 'string' ? cs.event_id : ''
      if (!/^[0-9a-f-]{36}$/i.test(srcId)) throw new Error('clipper_schedule: event_id required')
      if (typeof cs.image_base64 !== 'string' || cs.image_base64.length < 100) throw new Error('clipper_schedule: image required')
      const { data: src } = await supabaseService.from('events').select('*').eq('id', srcId).maybeSingle()
      if (!src) return new Response(JSON.stringify({ status: 'error', reason: 'source event not found' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })

      const KEY2 = Deno.env.get('ANTHROPIC_API_KEY')
      if (!KEY2) throw new Error('ANTHROPIC_API_KEY secret not set')
      const mime2 = typeof cs.mimeType === 'string' && /^image\//.test(cs.mimeType) ? cs.mimeType : 'image/png'
      const schedRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY2, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: Deno.env.get('EXTRACT_MODEL') ?? 'claude-sonnet-4-6', max_tokens: 1000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mime2, data: cs.image_base64 } },
            { type: 'text', text: `This screenshot shows a schedule of dates (and possibly times) for the event "${src.title}". Today is ${portlandToday()}. List EVERY performance date shown, expanding shorthand: a range like "Aug 14\u201317" means EACH day in the range; weekday patterns like "Thursdays\u2013Saturdays through Oct 4" or "every Friday in September" mean each matching calendar date; a calendar grid means each marked day. If different dates show different times (e.g. "2pm & 7:30pm Sundays"), emit one occurrence per date+time. Respond with ONLY JSON: {"occurrences":[{"date":"YYYY-MM-DD","time":"8:00 PM"|null}]}. If a year is missing or would be in the past, use the next upcoming occurrence. Expand only what is actually printed — never invent dates beyond what the text implies. If no real dates are visible, respond {"occurrences":[]}.` },
          ] }],
          signal: undefined,
        }),
        signal: AbortSignal.timeout(60000),
      })
      if (!schedRes.ok) { const t = await schedRes.text().catch(() => ''); throw new Error(`Anthropic ${schedRes.status}: ${t.slice(0, 200)}`) }
      const schedData = await schedRes.json()
      const rawTxt = (schedData.content?.[0]?.text ?? '').trim()
      let occurrences: Array<{ date?: string; time?: string | null }> = []
      try { const m = rawTxt.match(/\{[\s\S]*\}/); occurrences = (JSON.parse(m ? m[0] : rawTxt).occurrences ?? []) } catch { occurrences = [] }
      if (!occurrences.length) {
        return new Response(JSON.stringify({ status: 'error', reason: 'no dates found in that selection' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      }

      // dedupe vs this venue's existing rows (any status) + the source's own date
      const idx = new Set<string>()
      if (src.venue_id) {
        const { data: existing } = await supabaseService.from('events')
          .select('title, starts_at').eq('venue_id', src.venue_id)
          .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        for (const ex of (existing ?? []) as Array<{ title: string; starts_at: string }>) {
          idx.add(`${portlandDate(new Date(ex.starts_at))}|${normalizeName(ex.title)}`)
        }
      }
      const nowMs = Date.now()
      const clipMax = nowMs + 365 * 24 * 60 * 60 * 1000
      const srcTime = new Date(src.starts_at)
      const srcHHMM = `${String(srcTime.getUTCHours()).padStart(2, '0')}:${String(srcTime.getUTCMinutes()).padStart(2, '0')}`
      let added = 0, skippedN = 0, updatedSrc = 0
      const newIds: string[] = []
      const addedDates: string[] = []

      // Resolve every occurrence to an instant, then GROUP BY Portland date —
      // "2pm & 7:30pm" on one date becomes ONE row with show_times (a single
      // poster listing both times), never two rows / never a dropped time.
      const byDate = new Map<string, Set<string>>()
      for (const oc of occurrences.slice(0, 40)) {
        const d = typeof oc.date === 'string' ? oc.date.trim() : ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
        const t = typeof oc.time === 'string' && oc.time ? parseShowTime(oc.time) : null
        let start = ptTimestamp(d, t)
        if (!start) continue
        if (!t) { // no time printed → reuse the source event's time of day (UTC-preserved)
          const dd = new Date(`${d}T00:00:00Z`)
          start = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate(), srcTime.getUTCHours(), srcTime.getUTCMinutes()))
        }
        // phantom +1-year guard: a schedule item ~a year+ out whose previous-
        // year date is still upcoming is a model year slip — snap it back
        if (start.getTime() - nowMs > 300 * 24 * 60 * 60 * 1000) {
          const back = `${parseInt(d.slice(0, 4), 10) - 1}${d.slice(4)}`
          const backStart = ptTimestamp(back, t)
          if (backStart && backStart.getTime() >= nowMs) start = backStart
        }
        if (start.getTime() < nowMs || start.getTime() > clipMax) { skippedN++; continue }
        const pd = portlandDate(start)
        if (!byDate.has(pd)) byDate.set(pd, new Set())
        byDate.get(pd)!.add(start.toISOString())
      }

      const srcOwnDate = portlandDate(srcTime)
      for (const [pd, timeSet] of byDate) {
        const times = [...timeSet].sort()
        const key = `${pd}|${normalizeName(src.title)}`
        if (idx.has(key)) {
          // The schedule revealed extra times for the source event's OWN day —
          // fold them into it instead of silently dropping them.
          if (pd === srcOwnDate && times.length >= 2) {
            const { error: updErr } = await supabaseService.from('events')
              .update({ starts_at: times[0], show_times: times }).eq('id', srcId)
            if (!updErr) { updatedSrc++; continue }
          }
          skippedN++
          continue
        }
        const { data: ins2, error: insErr2 } = await supabaseService.from('events').insert({
          venue_id: src.venue_id, title: src.title, category: src.category,
          poster_url: src.poster_url, starts_at: times[0],
          show_times: times.length >= 2 ? times : null,
          description: src.description, neighborhood: src.neighborhood, address: src.address,
          view_count: 0, like_count: 0, status: 'pending', sold_out: false,
          created_by: src.created_by ?? authedUser.id, source_url: src.source_url,
          ai_confidence: src.ai_confidence ?? 90, artist_name: src.artist_name,
        }).select('id')
        if (!insErr2 && ins2?.[0]?.id) { added++; newIds.push(ins2[0].id as string); addedDates.push(pd); idx.add(key) }
      }
      return new Response(JSON.stringify({ status: (added > 0 || updatedSrc > 0) ? 'saved' : 'duplicate', added, updated: updatedSrc, skipped: skippedN, event_ids: newIds, dates: addedDates }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    const clipperUrl = (body.clipper && typeof body.clipper === 'object' && typeof (body.clipper as { url?: string }).url === 'string') ? ((body.clipper as { url: string }).url).trim() : ''
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : clipperUrl
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
    async function insertEvents(rows: Array<RawEvent & { description?: string }>, fallbackId: string | null, publish: boolean, skipDedupe = false) {
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
      const insertedIds: string[] = []

      // Same-day repeat showings (a movie's 2pm + 7:30pm) collapse into ONE
      // row carrying show_times — the wall renders a single poster listing
      // every time. Without this, the dedupe below silently dropped all but
      // the first same-day time.
      const byShowing = new Map<string, RawEvent & { description?: string; show_times?: string[] | null }>()
      let badRows = 0
      for (const ev of rows.slice(0, MAX_EVENTS)) {
        if (!ev?.title || !ev?.starts_at) { badRows++; continue }
        const gkey = `${normalizeName(ev.venue_name ?? '')}|${portlandDate(new Date(ev.starts_at))}|${normalizeName(ev.title)}`
        const prev = byShowing.get(gkey)
        if (!prev) {
          byShowing.set(gkey, { ...ev })
        } else {
          const times = [...new Set([...(prev.show_times ?? [prev.starts_at]), ev.starts_at])].sort()
          prev.starts_at = times[0]
          prev.show_times = times.length >= 2 ? times : null
          if (!prev.poster_image_url && ev.poster_image_url) prev.poster_image_url = ev.poster_image_url
        }
      }
      failed += badRows

      for (const ev of byShowing.values()) {
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
            created_by: authedUser.id,
            category,
            raw_venue_address: ev.venue_address || null,
            raw_venue_website: ev.venue_website || null,
            artist_name: ev.artist_name?.trim() || null,
          })
          if (orphErr) { failed++; errors.push(`${ev.title}: ${orphErr.message}`) }
          else { parked++; parkedVenues.add(rv.orphanName); orphanIndex.add(okey) }
          continue
        }
        if (!rv.id) { failed++; errors.push(`${ev.title}: no venue`); continue }

        const key = `${rv.id}|${portlandDate(new Date(ev.starts_at))}|${normalizeName(ev.title)}`
        if (!skipDedupe && index.has(key)) { skipped++; continue }
        const posterUrl = await rehostImage(supabaseService, ev.poster_image_url ?? null, imageDeadline)
        const { data: insData, error: insErr } = await supabaseService.from('events').insert({
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
          created_by: authedUser.id,
          source_url: ev.ticket_url || url,
          ai_confidence: 90,
          artist_name: ev.artist_name?.trim() || null,
          show_times: ev.show_times ?? null,
        }).select('id')
        if (insErr) { failed++; errors.push(`${ev.title}: ${insErr.message}`) }
        else { inserted++; index.add(key); if (insData?.[0]?.id) insertedIds.push(insData[0].id as string) }
      }
      return { inserted, failed, skipped, parked, parkedVenues: [...parkedVenues], errors, insertedIds }
    }

    // ═══ CLIPPER: capture from the browser extension — Rob navigates, we package ══
    // {clipper:{url, title, html?}} → parse the RENDERED DOM he was looking at
    //   (JSON-LD first — free; LLM on the page text as fallback).
    // {clipper:{url, title, image_base64, mimeType}} → his ⌘⇧4 workflow: the
    //   screenshot IS the poster; Claude Vision reads the fields off it.
    // Everything lands in pending Review via the same insertEvents (dedupe,
    // venue fuzzy-match, orphan parking) as every other ingest path.
    if (body.clipper && typeof body.clipper === 'object') {
      const c = body.clipper as { url?: string; title?: string; html?: string; image_base64?: string; mimeType?: string; poster_url?: string; poster_base64?: string; poster_mime?: string; venue_id?: string }
      // Panel-selected venue: used as the FALLBACK — a venue named in the
      // capture still wins (resolveVenue), but a nameless grab attributes here.
      const clipperFallbackId = typeof c.venue_id === 'string' && /^[0-9a-f-]{36}$/i.test(c.venue_id) ? c.venue_id : null
      const clipperForce = (body.clipper as { force?: boolean }).force === true
      const clipperAllowFar = (body.clipper as { allow_far?: boolean }).allow_far === true
      const clipperAssumeVenue = (body.clipper as { assume_venue?: boolean }).assume_venue === true
      const clipperParkOk = (body.clipper as { park_ok?: boolean }).park_ok === true
      // LOCKED venue: the admin decided — every capture files here, no
      // fuzzy-matching, no confirm-venue detour, and the AI is told the venue
      // so the blurb can use it.
      const clipperVenueLock = (body.clipper as { venue_lock?: boolean }).venue_lock === true && !!clipperFallbackId
      const lockedVenueName = clipperVenueLock ? (venueList.find(v => v.id === clipperFallbackId)?.name ?? '') : ''
      // Scraper runs cap the window (~90d) to keep Review sane; a CLIP is a
      // deliberate human choice — accept anything up to a year out, or up to
      // 3 years when the admin explicitly confirmed a far-future date.
      const clipMaxOut = Math.max(now, floor) + (clipperAllowFar ? 3 * 365 : 365) * 24 * 60 * 60 * 1000
      const pageTitle = typeof c.title === 'string' ? c.title.slice(0, 300) : ''
      const KEY = Deno.env.get('ANTHROPIC_API_KEY')
      if (!KEY) throw new Error('ANTHROPIC_API_KEY secret not set')

      const CLIP_FIELDS = `Respond with ONLY a JSON object (no fences): {"none": false, "title": string, "date": "YYYY-MM-DD", "year_printed": boolean, "time": string ("8:00 PM" style, "" if not shown), "venue_name": string, "venue_address": string, "category": string, "description": string, "sold_out": boolean}. category MUST be one of: ${CATEGORIES.join(', ')}. Today is ${portlandToday()}. year_printed: true ONLY if a 4-digit year is actually visible in the capture. If the year is not shown, set year_printed false and use any year in the date — the server derives the real year. If the printed year would place the event in the PAST, it is reused/stale artwork for a recurring event — use the next upcoming occurrence of that month and day instead. When BOTH a date inside poster artwork AND a date in the page's own listing text are visible, trust the LISTING date — reused poster art often carries a previous edition's date. description: 1–3 sentences using ONLY facts visible; plain prose. NEVER invent anything — empty string for anything not present. If no real single event is identifiable, respond {"none": true}.`

      // deno-lint-ignore no-explicit-any
      async function askClaude(content: any[]): Promise<Record<string, unknown> | null> {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: Deno.env.get('EXTRACT_MODEL') ?? 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content }] }),
          signal: AbortSignal.timeout(60000),
        })
        if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Anthropic ${res.status}: ${t.slice(0, 200)}`) }
        const data = await res.json()
        const raw = (data.content?.[0]?.text ?? '').trim()
        try { const m = raw.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : raw) } catch { return null }
      }

      function rowFromClip(j: Record<string, unknown>, posterUrl: string | null): RawEvent | { error: string } {
        const title = typeof j.title === 'string' ? decodeEntities(j.title).trim() : ''
        const date = typeof j.date === 'string' ? j.date.trim() : ''
        if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'could not read a title + date' }
        const timeStr = typeof j.time === 'string' ? j.time.trim() : ''
        let start = ptTimestamp(date, parseShowTime(timeStr))
        if (!start) return { error: `unusable date ${date}` }
        let rolledDate = date
        // NO YEAR PRINTED → never trust model year math (observed systematic
        // +1-year slips). Derive deterministically: this year's occurrence of
        // that month/day, or next year's if it already passed.
        if (j.year_printed !== true) {
          const md = date.slice(5)
          const todayStr = portlandToday()
          const thisYear = parseInt(todayStr.slice(0, 4), 10)
          let candDate = `${thisYear}-${md}`
          let cand = ptTimestamp(candDate, parseShowTime(timeStr))
          if (cand && portlandDate(cand) < todayStr) {
            candDate = `${thisYear + 1}-${md}`
            cand = ptTimestamp(candDate, parseShowTime(timeStr))
          }
          if (cand) { rolledDate = candDate; start = cand }
        }
        // Reused poster art (recurring nights) often prints an old year. The
        // clipper is a live human capture, so a past date = stale year: roll
        // the month/day forward to the next occurrence on/after today.
        for (let bump = 0; start.getTime() < floor && bump < 3; bump++) {
          const y = parseInt(rolledDate.slice(0, 4), 10) + 1
          rolledDate = `${y}${rolledDate.slice(4)}`
          const next = ptTimestamp(rolledDate, parseShowTime(timeStr))
          if (!next) break
          start = next
        }
        if (start.getTime() < floor) return { error: `event date ${date} is in the past` }
        if (start.getTime() > clipMaxOut) return { error: `dated ${rolledDate} — more than a year out`, needsConfirm: true, farTitle: title, farDate: rolledDate }
        const { title: cleanTitle, soldOut: titleSold } = detectSoldOut(title)
        return {
          title: cleanTitle, date: rolledDate, portland_date: portlandDate(start), starts_at: start.toISOString(),
          time_display: timeStr, category: typeof j.category === 'string' && CATEGORIES.includes(j.category) ? j.category : 'Live Music',
          poster_image_url: posterUrl, ticket_url: null,
          venue_name: typeof j.venue_name === 'string' ? decodeEntities(j.venue_name).trim() : '',
          raw_description: typeof j.description === 'string' ? j.description.trim() : '',
          raw_notes: '', sold_out: titleSold || j.sold_out === true,
          venue_address: typeof j.venue_address === 'string' ? j.venue_address.trim() : '',
          venue_website: '', artist_name: '',
        }
      }

      let events: RawEvent[] = []
      let method = ''

      // Staged poster (two-step clip): Rob picks the poster image FIRST, then
      // captures the info. When present, the staged image is the event's
      // poster and the info capture is only read for fields.
      let stagedPosterUrl: string | null = null
      if (typeof c.poster_base64 === 'string' && c.poster_base64.length > 100) {
        try {
          const pmime = typeof c.poster_mime === 'string' && /^image\//.test(c.poster_mime) ? c.poster_mime : 'image/png'
          const bin = atob(c.poster_base64)
          if (bin.length <= MAX_IMAGE_BYTES) {
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const path = `clipper/${crypto.randomUUID()}.${pmime === 'image/jpeg' ? 'jpg' : 'png'}`
            const { error: upErr } = await supabaseService.storage.from('posters').upload(path, bytes, { contentType: pmime, upsert: false })
            if (!upErr) stagedPosterUrl = supabaseService.storage.from('posters').getPublicUrl(path).data.publicUrl
          }
        } catch { /* staged upload is best-effort */ }
      }

      if (typeof c.image_base64 === 'string' && c.image_base64.length > 100) {
        // ── Screenshot mode (⌘⇧E region / ⌘⇧F window) ──
        method = 'clipper-shot'
        const mime = typeof c.mimeType === 'string' && /^image\//.test(c.mimeType) ? c.mimeType : 'image/png'
        const j = await askClaude([
          { type: 'image', source: { type: 'base64', media_type: mime, data: c.image_base64 } },
          { type: 'text', text: `${lockedVenueName ? `KNOWN FACT: this event is at "${lockedVenueName}" (the admin confirmed the venue — use it for venue_name and feel free to reference it in the description). ` : ''}This screenshot shows a live-event listing (poster and/or details)${pageTitle ? ` from a page titled "${pageTitle}"` : ''}. Read the event's details from the image. ${CLIP_FIELDS}` },
        ])
        if (!j || j.none === true) {
          return new Response(JSON.stringify({ status: 'error', reason: 'no event found in the screenshot' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
        }
        // Staged poster wins; otherwise the screenshot itself is the poster
        // (the classic ⌘⇧4 workflow).
        let posterUrl: string | null = stagedPosterUrl
        try {
          if (posterUrl) throw 'staged' // skip uploading the info shot as art
          const bin = atob(c.image_base64)
          if (bin.length <= MAX_IMAGE_BYTES) {
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            const path = `clipper/${crypto.randomUUID()}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`
            const { error: upErr } = await supabaseService.storage.from('posters').upload(path, bytes, { contentType: mime, upsert: false })
            if (!upErr) posterUrl = supabaseService.storage.from('posters').getPublicUrl(path).data.publicUrl
          }
        } catch { /* poster upload is best-effort; the event still lands */ }
        const row = rowFromClip(j, posterUrl)
        if ('error' in row) {
          const st = (row as { needsConfirm?: boolean }).needsConfirm ? 'confirm' : 'error'
          return new Response(JSON.stringify({ status: st, reason: row.error, event_name: (row as { farTitle?: string }).farTitle ?? null }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
        }
        events = [row]
      } else if (typeof c.html === 'string' && c.html.trim().length > 0) {
        // ── Tab mode (⌘⇧S): the rendered DOM is the one-page-with-everything ──
        const html = c.html.slice(0, 1_500_000)
        const parsed = jsonLdFromHtml(html, url, floor, clipMaxOut)
        if (parsed && parsed.events.length > 0) {
          method = 'clipper-jsonld'
          events = parsed.events
          if ((stagedPosterUrl || c.poster_url) && events.length === 1) events[0].poster_image_url = stagedPosterUrl ?? c.poster_url ?? null
        } else {
          method = 'clipper-llm'
          const text = decodeEntities(stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '))).slice(0, 15000)
          if (text.replace(/\s+/g, ' ').trim().length < MIN_DETAIL_CHARS) {
            return new Response(JSON.stringify({ status: 'error', reason: 'page has too little readable text — try the region screenshot instead' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
          }
          const j = await askClaude([{ type: 'text', text: `${lockedVenueName ? `KNOWN FACT: this event is at "${lockedVenueName}" (admin-confirmed — use it for venue_name and feel free to reference it in the description). ` : ''}This is the visible text of a live-event page${pageTitle ? ` titled "${pageTitle}"` : ''} (${url}). Extract THE event this page is about. ${CLIP_FIELDS}\n\nPAGE TEXT:\n${text}` }])
          if (!j || j.none === true) {
            return new Response(JSON.stringify({ status: 'error', reason: 'no event found on the page — try the region screenshot' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
          }
          const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
          let ogImage: string | null = null
          try { ogImage = ogMatch ? new URL(ogMatch[1], url).href : null } catch { ogImage = null }
          const row = rowFromClip(j, stagedPosterUrl ?? c.poster_url ?? ogImage)
          if ('error' in row) {
            const st = (row as { needsConfirm?: boolean }).needsConfirm ? 'confirm' : 'error'
            return new Response(JSON.stringify({ status: st, reason: row.error, event_name: (row as { farTitle?: string }).farTitle ?? null }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
          }
          events = [row]
        }
      } else {
        return new Response(JSON.stringify({ status: 'error', reason: 'clipper: html or image_base64 required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      }

      // Locked venue: attribution is decided — blank any read name so
      // resolution + the blurb both use the locked venue.
      if (clipperVenueLock) for (const ev of events) ev.venue_name = ''

      // Pre-compose the Plaster-voice blurb so (a) the panel can PREVIEW it and
      // (b) insertEvents uses it verbatim. Resolve the venue for voice context.
      const rv0 = events[0] ? resolveVenue(events[0].venue_name ?? '', clipperFallbackId) : null
      if (events[0]) {
        const composed = await composeDescription({
          title: events[0].title, venueName: rv0?.name ?? events[0].venue_name ?? '', category: events[0].category,
          timeDisplay: events[0].time_display, rawDescription: events[0].raw_description, rawNotes: events[0].raw_notes, soldOut: events[0].sold_out,
        })
        ;(events[0] as RawEvent & { description?: string }).description = composed
      }
      // Venue didn't resolve but the panel has a venue selected → ask the human
      // instead of parking a misread ("The 1/50") as a brand-new venue.
      if (rv0?.orphanName && clipperFallbackId && !clipperAssumeVenue && !clipperParkOk && !clipperVenueLock) {
        const sel = venueList.find(v => v.id === clipperFallbackId)
        const e0c = events[0] as (RawEvent & { description?: string })
        return new Response(JSON.stringify({
          status: 'confirm-venue',
          reason: `capture reads venue as \u201c${rv0.orphanName}\u201d`,
          confirm_venue_name: sel?.name ?? 'the selected venue',
          event_name: e0c.title,
          preview: { title: e0c.title, date: e0c.date, time: e0c.time_display || null, venue: rv0.orphanName, category: e0c.category, description: e0c.description ?? null, sold_out: e0c.sold_out },
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      }
      // Confirmed: the picker venue is correct — drop the misread name so the
      // fallback attributes it there.
      if (clipperAssumeVenue && events[0]) events[0].venue_name = ''
      const ins = await insertEvents(events, clipperFallbackId, false, clipperForce)
      const status = (ins.inserted ?? 0) > 0 ? 'saved' : (ins.parked ?? 0) > 0 ? 'orphaned' : (ins.skipped ?? 0) > 0 ? 'duplicate' : 'error'
      const e0 = events[0] as (RawEvent & { description?: string }) | undefined
      return new Response(JSON.stringify({
        status, method, count: events.length,
        inserted: ins.inserted, skipped: ins.skipped, parked: ins.parked, failed: ins.failed,
        event_name: e0?.title ?? null,
        event_ids: ins.insertedIds ?? [],
        preview: e0 ? {
          title: e0.title, date: e0.date, time: e0.time_display || null,
          venue: rv0?.name ?? e0.venue_name ?? null, category: e0.category,
          description: e0.description ?? null, sold_out: e0.sold_out,
        } : null,
        reason: status === 'error' ? (ins.errors?.[0] ?? 'insert failed') : undefined,
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // ═══ DRY RUN: extract → (optionally) commit to pending → return for review ══
    if (body.dryRun === true) {
      let bitHost = ''
      try { bitHost = new URL(url).hostname } catch { /* keep empty */ }
      const isBandsintown = /(^|\.)bandsintown\.com$/i.test(bitHost)
      const isEverout = /(^|\.)everout\.com$/i.test(bitHost)
      // Community mode (EverOut, or an explicit flag): city-wide source → NO dropdown
      // fallback (nothing may be misattributed), and events land with no image.
      const community = body.community === true || isEverout
      // Fetch-first: try a FREE plain fetch + schema.org JSON-LD parse before
      // paying for Firecrawl. Covers Eventbrite/TicketWeb/Squarespace/WordPress
      // and most venue sites; Firecrawl remains the fallback for JS-walled pages.
      let method = 'firecrawl'
      let extractResult: { events: RawEvent[]; beyondHorizon: number; past: number }
      if (isBandsintown) {
        method = 'bandsintown'
        extractResult = await extractBandsintown(url, floor, maxOut)   // deterministic JSON-LD parse
      } else if (isEverout) {
        method = 'everout'
        extractResult = await extractEverout(url, floor, maxOut)        // LLM extraction, no images
      } else {
        const free = await jsonLdExtract(url, floor, maxOut).catch(() => null)
        if (free && (free.events.length > 0 || free.beyondHorizon > 0 || free.past > 0)) {
          method = 'jsonld-free'
          extractResult = free
        } else {
          extractResult = await firecrawlExtract(url, floor, maxOut)
        }
      }
      const { events, beyondHorizon, past } = extractResult
      // Community mode ignores the venue dropdown entirely — unmatched venues park.
      const fallbackId: string | null = community ? null : (typeof body.venueId === 'string' && body.venueId ? body.venueId : null)
      // Follow each event's "Get Tickets" / detail page for the real show description
      // (the calendar page rarely has one). On by default; the admin can skip it.
      // Community/EverOut never two-hops (their detail pages aren't the write-up
      // source and hopping risks hallucination) — enforce server-side, not just UI.
      const deepFetch = community ? false : body.deepFetch !== false
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
        return new Response(JSON.stringify({ url, method, count: out.length, beyondHorizon, past, enriched, deepFetch, committed: true, ...ins, events: out }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      }
      return new Response(JSON.stringify({ url, method, count: out.length, beyondHorizon, past, enriched, deepFetch, committed: false, events: out }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
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
