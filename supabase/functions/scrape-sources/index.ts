import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── scrape-sources ─────────────────────────────────────────────────────────────
// Auto-ingest: scrape structured event data into the pending review pipeline.
// Modes:
//   Registered sources: { sourceId?: string, all?: boolean, dryRun?: boolean }
//   Ad-hoc URL import:  { adhocUrl: string, venueId?: string, dryRun?: boolean,
//                         events?: AdhocEvent[] }  ← import step posts back the
//                         dryRun-parsed selection (avoids re-running AI extraction)
//   Venue enrichment:   { enrichVenueFromUrl: string } → venue draft, NO inserts
// Ad-hoc extraction pipeline (most Portland calendars are client-rendered, so
// plain HTML often shows zero events):
//   JSON-LD → hidden-endpoint probes (WP Tribe REST + Squarespace ?format=json)
//   → one-hop link hunt to a calendar-ish page (re-running JSON-LD + probes there)
//   → AI text fallback → empty.
// Gate: is_admin ONLY. Deployed with --no-verify-jwt; the JWT + role check below
// is the real gate (same pattern as extract-poster).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BOT_UA = 'PlasterBot/0.1 (+https://plasterthewall.com)'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_DAYS_OUT = 120
const PAGE_TIMEOUT_MS = 10000
const PAGE_FETCH_BUDGET = 5
const IMAGE_TOTAL_BUDGET_MS = 25000
const MAX_ADHOC_EVENTS = 40
const AI_TEXT_CAP = 20000
const EXTRACT_MODEL = Deno.env.get('EXTRACT_MODEL') ?? 'claude-sonnet-4-6'
// ai_confidence is NUMERIC in this schema (ImportForm maps high→95):
const CONFIDENCE_STRUCTURED = 95
const CONFIDENCE_AI = 70

interface ScrapedEvent {
  title: string
  starts_at: string // ISO
  portland_date: string // YYYY-MM-DD in America/Los_Angeles
  event_url: string
  image: string | null
  description: string | null
  _venue_name?: string
}

interface AdhocEvent extends ScrapedEvent {
  venue_id: string | null
  venue_name: string | null
  needsVenue: boolean
  confidence: number
}

interface SourceResult {
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

// Budgeted page fetcher: PlasterBot UA first; ONE browser-UA retry on
// 403/404/network-fail. A logical fetch (incl. its retry) costs 1 budget unit.
class PageFetcher {
  remaining = PAGE_FETCH_BUDGET
  notes: string[] = []
  async get(url: string): Promise<{ status: number; text: string } | null> {
    if (this.remaining <= 0) { this.notes.push(`budget exhausted, skipped ${url}`); return null }
    this.remaining--
    const attempt = async (ua: string) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': ua, 'Accept': '*/*' },
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
          redirect: 'follow',
        })
        return { status: res.status, text: await res.text().catch(() => '') }
      } catch { return { status: 0, text: '' } }
    }
    const first = await attempt(BOT_UA)
    if (first.status !== 0 && first.status !== 403 && first.status !== 404) return first
    const second = await attempt(BROWSER_UA)
    if (second.status > 0 && second.status < 400) this.notes.push(`${url} needed browser UA`)
    return second
  }
}

// Portland is UTC-7 mid-March..early-Nov, else UTC-8 (month heuristic, same as
// scripts/ingest.js — exact DST boundary doesn't matter at event-time precision).
function portlandOffset(dateStr: string): string {
  const month = parseInt(dateStr.split('-')[1], 10)
  return month >= 3 && month <= 10 ? '-07:00' : '-08:00'
}

// Combine extracted date (+ optional time) AS America/Los_Angeles — never a naive
// new Date() in the UTC runtime. Default show time 20:00.
function ptTimestamp(date: string, time: string | null): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '20:00'
  const d = new Date(`${date}T${t}:00${portlandOffset(date)}`)
  return isNaN(d.getTime()) ? null : d
}

// JSON-LD startDate → Date. Date-only / zone-less ISO = assume Portland.
function parseStartDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return ptTimestamp(s, null)
  let d: Date
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    d = new Date(`${s}${portlandOffset(s)}`)
  } else {
    d = new Date(s)
  }
  return isNaN(d.getTime()) ? null : d
}

function portlandDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d)
}

function portlandToday(): string {
  return portlandDate(new Date())
}

function inWindow(d: Date, now: number, maxOut: number): boolean {
  return d.getTime() >= now && d.getTime() <= maxOut
}

// Pull every <script type="application/ld+json"> block and parse tolerantly.
function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try { blocks.push(JSON.parse(m[1].trim())) } catch { /* skip unparseable block */ }
  }
  return blocks
}

function isEventType(t: unknown): boolean {
  if (typeof t === 'string') return t === 'Event' || t.endsWith('Event')
  if (Array.isArray(t)) return t.some(isEventType)
  return false
}

function collectEvents(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) { node.forEach(n => collectEvents(n, out)); return }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (isEventType(obj['@type'])) out.push(obj)
  if (Array.isArray(obj['@graph'])) collectEvents(obj['@graph'], out)
}

function pickImage(img: unknown): string | null {
  if (typeof img === 'string') return img
  if (Array.isArray(img) && img.length) return pickImage(img[0])
  if (img && typeof img === 'object' && typeof (img as Record<string, unknown>).url === 'string') {
    return (img as Record<string, string>).url
  }
  return null
}

function resolveUrl(maybe: unknown, base: string): string {
  if (typeof maybe !== 'string' || !maybe.trim()) return base
  try { return new URL(maybe, base).href } catch { return base }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

// JSON-LD on a page → ScrapedEvents within the ingest window.
function mapJsonLdEvents(html: string, baseUrl: string, now: number, maxOut: number): ScrapedEvent[] {
  const rawEvents: Record<string, unknown>[] = []
  for (const block of extractJsonLdBlocks(html)) collectEvents(block, rawEvents)
  const mapped: ScrapedEvent[] = []
  for (const ev of rawEvents) {
    const title = typeof ev.name === 'string' ? ev.name.trim() : ''
    const start = parseStartDate(ev.startDate)
    if (!title || !start || !inWindow(start, now, maxOut)) continue
    const desc = typeof ev.description === 'string' ? stripTags(ev.description).slice(0, 400) : null
    const loc = ev.location as Record<string, unknown> | undefined
    const venueName = loc && typeof loc.name === 'string' ? loc.name.trim() : undefined
    mapped.push({
      title,
      starts_at: start.toISOString(),
      portland_date: portlandDate(start),
      event_url: resolveUrl(ev.url, baseUrl),
      image: pickImage(ev.image),
      description: desc || null,
      ...(venueName ? { _venue_name: venueName } : {}),
    })
  }
  return mapped
}

// Hidden endpoint probe 1: WP The Events Calendar REST API.
async function probeTribe(fetcher: PageFetcher, origin: string, now: number, maxOut: number): Promise<ScrapedEvent[]> {
  const res = await fetcher.get(`${origin}/wp-json/tribe/events/v1/events?per_page=50`)
  if (!res || res.status !== 200) return []
  let json: { events?: Array<Record<string, unknown>> } | null = null
  try { json = JSON.parse(res.text) } catch { return [] }
  const out: ScrapedEvent[] = []
  for (const ev of json?.events ?? []) {
    const title = typeof ev.title === 'string' ? stripTags(ev.title) : ''
    // Tribe start_date is venue-local ("YYYY-MM-DD HH:MM:SS") — Portland venues → PT.
    const sd = typeof ev.start_date === 'string' ? ev.start_date : ''
    const [date, timeFull] = sd.split(' ')
    const start = date ? ptTimestamp(date, timeFull ? timeFull.slice(0, 5) : null) : null
    if (!title || !start || !inWindow(start, now, maxOut)) continue
    const img = ev.image as Record<string, unknown> | undefined
    const venue = ev.venue as Record<string, unknown> | undefined
    out.push({
      title,
      starts_at: start.toISOString(),
      portland_date: portlandDate(start),
      event_url: typeof ev.url === 'string' ? ev.url : origin,
      image: img && typeof img.url === 'string' ? img.url : null,
      description: typeof ev.description === 'string' ? stripTags(ev.description).slice(0, 400) || null : null,
      ...(venue && typeof venue.venue === 'string' ? { _venue_name: venue.venue } : {}),
    })
  }
  return out
}

// Hidden endpoint probe 2: Squarespace collection JSON (?format=json).
async function probeSquarespace(fetcher: PageFetcher, pageUrl: string, now: number, maxOut: number): Promise<ScrapedEvent[]> {
  const probeUrl = `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}format=json`
  const res = await fetcher.get(probeUrl)
  if (!res || res.status !== 200) return []
  let json: Record<string, unknown> | null = null
  try { json = JSON.parse(res.text) } catch { return [] }
  const items = (json?.upcoming ?? json?.items ?? (json?.collection as Record<string, unknown> | undefined)?.items) as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(items)) return []
  const origin = new URL(pageUrl).origin
  const out: ScrapedEvent[] = []
  for (const it of items) {
    const title = typeof it.title === 'string' ? it.title.trim() : ''
    // Squarespace startDate is epoch milliseconds.
    const start = typeof it.startDate === 'number' ? new Date(it.startDate) : null
    if (!title || !start || isNaN(start.getTime()) || !inWindow(start, now, maxOut)) continue
    out.push({
      title,
      starts_at: start.toISOString(),
      portland_date: portlandDate(start),
      event_url: typeof it.fullUrl === 'string' ? resolveUrl(it.fullUrl, origin) : pageUrl,
      image: typeof it.assetUrl === 'string' ? it.assetUrl : null,
      description: typeof it.excerpt === 'string' ? stripTags(it.excerpt).slice(0, 400) || null : null,
    })
  }
  return out
}

// One-hop link hunt: find the most calendar-ish same-host link on the page.
function huntEventsLink(html: string, pageUrl: string): string | null {
  const base = new URL(pageUrl)
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi
  const KEYWORDS = /(events?|calendar|shows?|schedule|upcoming)/i
  let best: { url: string; score: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let url: URL
    try { url = new URL(m[1], base) } catch { continue }
    if (url.host !== base.host) continue
    if (url.pathname === base.pathname) continue
    const pathHit = KEYWORDS.test(url.pathname)
    const textHit = KEYWORDS.test(stripTags(m[2]))
    if (!pathHit && !textHit) continue
    // Prefer path matches, then shorter paths (closer to a root calendar page).
    const score = (pathHit ? 100 : 0) + (textHit ? 10 : 0) - url.pathname.length
    if (!best || score > best.score) best = { url: url.href, score }
  }
  return best?.url ?? null
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AI_TEXT_CAP)
}

function ogMeta(html: string, property: string): string | null {
  const re1 = new RegExp(`<meta[^>]*property\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i')
  const re2 = new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*property\\s*=\\s*["']${property}["']`, 'i')
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null
}

// AI text fallback. Returns [] when the page genuinely has no events — never invents.
async function aiExtractEvents(pageText: string, pageUrl: string, now: number, maxOut: number): Promise<ScrapedEvent[]> {
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY secret not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: EXTRACT_MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Today is ${portlandToday()} in Portland, Oregon. The following is the readable text of an events web page (${pageUrl}). Extract every distinct UPCOMING event as a JSON array — respond with ONLY the JSON array, no markdown fences, no commentary:

[{"title": string, "date": "YYYY-MM-DD", "time": "HH:mm" | null, "venue_name": string | null, "description": string | null, "image_url": string | null}]

Rules:
- Only real events — no nav/footer/membership/newsletter junk.
- description ≤ 2 sentences.
- Dates without a year roll FORWARD to the next future occurrence from today.
- Skip anything without a discernible calendar date.
- If the page has no events, return [] — never invent events.`,
      }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''
  let parsed: unknown
  try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) } catch {
    throw new Error(`AI response was not valid JSON: ${text.slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) return []

  const mapped: ScrapedEvent[] = []
  for (const ev of parsed as Record<string, unknown>[]) {
    const title = typeof ev.title === 'string' ? ev.title.trim() : ''
    const date = typeof ev.date === 'string' ? ev.date.trim() : ''
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue // discard rows without a parseable date
    const time = typeof ev.time === 'string' && /^\d{2}:\d{2}$/.test(ev.time) ? ev.time : null
    const start = ptTimestamp(date, time)
    if (!start || !inWindow(start, now, maxOut)) continue
    mapped.push({
      title,
      starts_at: start.toISOString(),
      portland_date: portlandDate(start),
      event_url: pageUrl,
      image: typeof ev.image_url === 'string' && ev.image_url.trim() ? resolveUrl(ev.image_url, pageUrl) : null,
      description: typeof ev.description === 'string' ? ev.description.trim().slice(0, 400) || null : null,
      ...(typeof ev.venue_name === 'string' && ev.venue_name.trim() ? { _venue_name: ev.venue_name.trim() } : {}),
    })
  }
  return mapped
}

// Re-host an image into posters/scrape/{uuid}.jpg. Sequential callers share a
// deadline (IMAGE_TOTAL_BUDGET_MS): past it, fall back to the remote URL so
// posters can never time out the whole request.
// deno-lint-ignore no-explicit-any
async function rehostImage(supabaseService: any, imageUrl: string | null, deadline: number): Promise<string | null> {
  if (!imageUrl) return null
  if (Date.now() > deadline) return imageUrl
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': BOT_UA },
      signal: AbortSignal.timeout(Math.max(1000, Math.min(PAGE_TIMEOUT_MS, deadline - Date.now()))),
    })
    if (!imgRes.ok) return imageUrl
    const bytes = new Uint8Array(await imgRes.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return imageUrl
    const path = `scrape/${crypto.randomUUID()}.jpg`
    const contentType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    const { error: upErr } = await supabaseService.storage
      .from('posters').upload(path, bytes, { contentType, upsert: false })
    if (upErr) return imageUrl
    return supabaseService.storage.from('posters').getPublicUrl(path).data.publicUrl
  } catch { return imageUrl }
}

// Dedupe key set for a venue: ANY-status events from yesterday onward.
// deno-lint-ignore no-explicit-any
async function existingKeys(supabaseService: any, venueId: string, now: number): Promise<Set<string>> {
  const { data: existing } = await supabaseService
    .from('events')
    .select('title, starts_at')
    .eq('venue_id', venueId)
    .gte('starts_at', new Date(now - 24 * 60 * 60 * 1000).toISOString())
  return new Set(
    ((existing ?? []) as Array<{ title: string; starts_at: string }>)
      .map(e => `${portlandDate(new Date(e.starts_at))}|${e.title.trim().toLowerCase()}`),
  )
}

// Ad-hoc extraction pipeline for one page: JSON-LD → endpoint probes → (caller
// handles the link-hunt hop) → AI is also caller-driven. Returns events + method.
async function extractFromPage(fetcher: PageFetcher, url: string, html: string, now: number, maxOut: number):
  Promise<{ events: ScrapedEvent[]; method: string }> {
  const jsonld = mapJsonLdEvents(html, url, now, maxOut)
  if (jsonld.length > 0) return { events: jsonld, method: 'jsonld' }
  const origin = new URL(url).origin
  const tribe = await probeTribe(fetcher, origin, now, maxOut)
  if (tribe.length > 0) return { events: tribe, method: 'wp-tribe' }
  const sq = await probeSquarespace(fetcher, url, now, maxOut)
  if (sq.length > 0) return { events: sq, method: 'squarespace' }
  return { events: [], method: 'none' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── JWT + is_admin check (admin ONLY — not ingester) ─────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
  const token = authHeader.replace('Bearer ', '')

  const supabaseService = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user }, error: authError } = await supabaseService.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const { data: profile } = await supabaseService
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const now = Date.now()
    const maxOut = now + MAX_DAYS_OUT * 24 * 60 * 60 * 1000

    // ═══ VENUE ENRICHMENT MODE: draft a venue from its site, NO inserts ══════
    if (typeof body.enrichVenueFromUrl === 'string' && body.enrichVenueFromUrl.trim()) {
      const url = body.enrichVenueFromUrl.trim()
      const fetcher = new PageFetcher()
      const page = await fetcher.get(url)
      if (!page || page.status !== 200) throw new Error(`page fetch ${page?.status ?? 'failed'}`)
      const html = page.text
      const origin = new URL(url).origin
      const notes: string[] = [...fetcher.notes]

      // name: og:site_name → JSON-LD Organization/Place name → cleaned <title>
      let name: string | null = ogMeta(html, 'og:site_name')
      if (!name) {
        for (const block of extractJsonLdBlocks(html)) {
          const stack = [block]
          while (stack.length && !name) {
            const node = stack.pop()
            if (Array.isArray(node)) { stack.push(...node); continue }
            if (!node || typeof node !== 'object') continue
            const obj = node as Record<string, unknown>
            const t = obj['@type']
            const typeStr = Array.isArray(t) ? t.join(' ') : String(t ?? '')
            if (/Organization|Place|LocalBusiness|MusicVenue/i.test(typeStr) && typeof obj.name === 'string') {
              name = obj.name.trim()
            }
            if (Array.isArray(obj['@graph'])) stack.push(obj['@graph'])
          }
          if (name) break
        }
      }
      if (!name) {
        const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        if (t) name = stripTags(t).split(/\s*[|–—·-]\s+/)[0].trim() || null
      }

      // instagram: first PROFILE link (exclude /p/, /reel(s)/, /explore/, /stories/…)
      let instagram: string | null = null
      const igRe = /instagram\.com\/([A-Za-z0-9_.]+)/gi
      let igm: RegExpExecArray | null
      while ((igm = igRe.exec(html)) !== null) {
        const handle = igm[1].replace(/\.$/, '')
        if (/^(p|reel|reels|explore|stories|accounts|share)$/i.test(handle)) continue
        instagram = `https://instagram.com/${handle}`
        break
      }

      // address: JSON-LD PostalAddress → street-pattern scan of page text
      let address: string | null = null
      for (const block of extractJsonLdBlocks(html)) {
        const stack = [block]
        while (stack.length && !address) {
          const node = stack.pop()
          if (Array.isArray(node)) { stack.push(...node); continue }
          if (!node || typeof node !== 'object') continue
          const obj = node as Record<string, unknown>
          const addr = obj.address as Record<string, unknown> | string | undefined
          if (typeof addr === 'string' && addr.trim()) address = addr.trim()
          else if (addr && typeof addr === 'object' && typeof addr.streetAddress === 'string') {
            address = [addr.streetAddress, addr.addressLocality, addr.addressRegion]
              .filter(p => typeof p === 'string' && p).join(', ')
          }
          if (Array.isArray(obj['@graph'])) stack.push(obj['@graph'])
        }
        if (address) break
      }
      if (!address) {
        const text = htmlToText(html)
        const m = text.match(/\b\d{2,5}\s+(?:[NSEW]{1,2}\.?\s+)?[A-Za-z0-9'.]+(?:\s+[A-Za-z0-9'.]+){0,3}\s+(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|R(?:oa)?d|Way|Dr(?:ive)?|Pl(?:ace)?|L(?:a)?ne?)\b\.?(?:,?\s*(?:Portland|OR)[^.]{0,15})?/i)
        if (m) address = m[0].trim()
      }

      // geocode (server-side, MAPBOX_TOKEN secret) — same flow the importer uses
      let location_lat: number | null = null
      let location_lng: number | null = null
      if (address) {
        const MAPBOX_TOKEN = Deno.env.get('MAPBOX_TOKEN')
        if (!MAPBOX_TOKEN) {
          notes.push('MAPBOX_TOKEN secret not set — skipped geocode (set via supabase secrets)')
        } else {
          try {
            const q = encodeURIComponent(`${address}, Portland, OR`)
            const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1&proximity=-122.6784,45.5051`, {
              signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
            })
            const geo = await geoRes.json()
            const center = geo?.features?.[0]?.center
            if (Array.isArray(center) && center.length === 2) {
              location_lng = center[0]; location_lat = center[1]
            }
          } catch { notes.push('geocode failed') }
        }
      }

      return new Response(JSON.stringify({
        venueDraft: { name, website: origin, instagram, address, location_lat, location_lng },
        notes,
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // ═══ AD-HOC MODE: paste any event page URL ═══════════════════════════════
    if (typeof body.adhocUrl === 'string' && body.adhocUrl.trim()) {
      const adhocUrl = body.adhocUrl.trim()
      const forcedVenueId: string | null = typeof body.venueId === 'string' && body.venueId ? body.venueId : null
      const dryRun: boolean = body.dryRun === true
      const postedEvents: AdhocEvent[] | null = Array.isArray(body.events) ? body.events : null

      // ── Import step: insert the posted-back selection (no re-parse/AI) ──
      if (!dryRun && postedEvents) {
        let inserted = 0, skipped = 0
        const imageDeadline = Date.now() + IMAGE_TOTAL_BUDGET_MS
        const keysByVenue = new Map<string, Set<string>>()
        for (const ev of postedEvents.slice(0, MAX_ADHOC_EVENTS)) {
          const venueId = ev.venue_id || forcedVenueId
          if (!venueId || !ev.title || !ev.starts_at) { skipped++; continue }
          if (!keysByVenue.has(venueId)) keysByVenue.set(venueId, await existingKeys(supabaseService, venueId, now))
          const keys = keysByVenue.get(venueId)!
          const pDate = portlandDate(new Date(ev.starts_at))
          const key = `${pDate}|${ev.title.trim().toLowerCase()}`
          if (keys.has(key)) { skipped++; continue }
          keys.add(key)

          const posterUrl = await rehostImage(supabaseService, ev.image ?? null, imageDeadline)
          const { error: insErr } = await supabaseService.from('events').insert({
            venue_id: venueId,
            title: ev.title.trim(),
            category: 'Live Music',
            poster_url: posterUrl,
            starts_at: ev.starts_at,
            description: ev.description ?? null,
            view_count: 0,
            like_count: 0,
            status: 'pending', // explicit — service role bypasses the 063 trigger
            created_by: user.id,
            source_url: ev.event_url || adhocUrl,
            ai_confidence: typeof ev.confidence === 'number' ? ev.confidence : CONFIDENCE_AI,
          })
          if (insErr) throw new Error(`insert: ${insErr.message}`)
          inserted++
        }
        return new Response(JSON.stringify({ adhoc: { url: adhocUrl, inserted, skipped } }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      // ── Parse step: JSON-LD → probes → one-hop hunt → AI → empty ──
      const fetcher = new PageFetcher()
      const page = await fetcher.get(adhocUrl)
      if (!page || page.status !== 200) throw new Error(`page fetch ${page?.status ?? 'failed'}`)

      let sourcePage = adhocUrl
      let html = page.text
      let { events: scraped, method } = await extractFromPage(fetcher, adhocUrl, html, now, maxOut)

      // One-hop link hunt when the page itself yields nothing structured.
      if (scraped.length === 0) {
        const hunted = huntEventsLink(html, adhocUrl)
        if (hunted) {
          const huntedPage = await fetcher.get(hunted)
          if (huntedPage && huntedPage.status === 200) {
            const result = await extractFromPage(fetcher, hunted, huntedPage.text, now, maxOut)
            if (result.events.length > 0) {
              scraped = result.events
              method = `${result.method} (hunted)`
              sourcePage = hunted
              html = huntedPage.text
            } else {
              // keep the hunted page as the AI target — it's the events page
              sourcePage = hunted
              html = huntedPage.text
            }
          }
        }
      }

      // AI text fallback — only after structured paths come up empty.
      let confidence = CONFIDENCE_STRUCTURED
      if (scraped.length === 0) {
        scraped = await aiExtractEvents(htmlToText(html), sourcePage, now, maxOut)
        confidence = CONFIDENCE_AI
        method = sourcePage === adhocUrl ? 'ai' : 'ai (hunted)'
      }

      scraped = scraped.slice(0, MAX_ADHOC_EVENTS)

      // Poster fallback: page og:image when the event carries none.
      const pageOg = ogMeta(html, 'og:image')
      // Venue resolution: forced venueId, else case-insensitive name MATCH
      // (never create). Unmatched → needsVenue (insert blocked until chosen).
      const { data: allVenues } = await supabaseService.from('venues').select('id, name')
      const venueByName = new Map<string, { id: string; name: string }>(
        ((allVenues ?? []) as Array<{ id: string; name: string }>).map(v => [v.name.trim().toLowerCase(), v]),
      )

      const adhocEvents: AdhocEvent[] = scraped.map(ev => {
        const rawVenueName = ev._venue_name ?? null
        let venue_id: string | null = forcedVenueId
        let venue_name: string | null = rawVenueName
        if (!venue_id && rawVenueName) {
          const match = venueByName.get(rawVenueName.trim().toLowerCase())
          if (match) { venue_id = match.id; venue_name = match.name }
        }
        return {
          ...ev,
          image: ev.image ?? pageOg,
          venue_id,
          venue_name,
          needsVenue: !venue_id,
          confidence,
        }
      })

      // Dedupe annotation (per resolved venue)
      const keysByVenue = new Map<string, Set<string>>()
      let wouldInsert = 0
      const annotated = [] as Array<AdhocEvent & { duplicate: boolean }>
      for (const ev of adhocEvents) {
        let duplicate = false
        if (ev.venue_id) {
          if (!keysByVenue.has(ev.venue_id)) keysByVenue.set(ev.venue_id, await existingKeys(supabaseService, ev.venue_id, now))
          const keys = keysByVenue.get(ev.venue_id)!
          const key = `${ev.portland_date}|${ev.title.toLowerCase()}`
          duplicate = keys.has(key)
          if (!duplicate) { keys.add(key); wouldInsert++ }
        }
        annotated.push({ ...ev, duplicate })
      }

      if (dryRun) {
        return new Response(JSON.stringify({
          adhoc: { url: adhocUrl, sourcePage, method, found: annotated.length, wouldInsert, events: annotated, notes: fetcher.notes },
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      }

      // Real run without a posted selection: insert every resolved, non-dup event
      let inserted = 0, skipped = 0
      const imageDeadline = Date.now() + IMAGE_TOTAL_BUDGET_MS
      for (const ev of annotated) {
        if (ev.needsVenue || ev.duplicate) { skipped++; continue }
        const posterUrl = await rehostImage(supabaseService, ev.image, imageDeadline)
        const { error: insErr } = await supabaseService.from('events').insert({
          venue_id: ev.venue_id,
          title: ev.title,
          category: 'Live Music',
          poster_url: posterUrl,
          starts_at: ev.starts_at,
          description: ev.description,
          view_count: 0,
          like_count: 0,
          status: 'pending',
          created_by: user.id,
          source_url: ev.event_url || sourcePage,
          ai_confidence: ev.confidence,
        })
        if (insErr) throw new Error(`insert: ${insErr.message}`)
        inserted++
      }
      return new Response(JSON.stringify({ adhoc: { url: adhocUrl, sourcePage, method, inserted, skipped, notes: fetcher.notes } }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ═══ REGISTERED-SOURCES MODE (unchanged behavior) ════════════════════════
    const sourceId: string | undefined = body.sourceId
    const all: boolean = body.all === true
    const dryRun: boolean = body.dryRun === true

    if (!sourceId && !all) {
      return new Response(JSON.stringify({ error: 'Pass adhocUrl, enrichVenueFromUrl, sourceId, or all:true' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    let q = supabaseService
      .from('venue_sources')
      .select('id, venue_id, source_url, source_type, default_category, enabled, venues(name)')
      .eq('enabled', true)
      .eq('source_type', 'jsonld')
    if (sourceId) q = q.eq('id', sourceId)
    const { data: sources, error: srcError } = await q
    if (srcError) throw srcError

    const results: SourceResult[] = []

    for (const src of sources ?? []) {
      const venueName = (src as unknown as { venues: { name: string } | null }).venues?.name ?? '(unknown venue)'
      const result: SourceResult = { sourceId: src.id, venue: venueName, url: src.source_url, found: 0 }
      results.push(result)

      try {
        // 1. Fetch + extract JSON-LD events (each source gets its own fetch budget)
        const fetcher = new PageFetcher()
        const pageRes = await fetcher.get(src.source_url)
        if (!pageRes || pageRes.status !== 200) throw new Error(`page fetch ${pageRes?.status ?? 'failed'}`)
        const mapped = mapJsonLdEvents(pageRes.text, src.source_url, now, maxOut)
        const rawCount: Record<string, unknown>[] = []
        for (const block of extractJsonLdBlocks(pageRes.text)) collectEvents(block, rawCount)
        result.found = rawCount.length

        // 2. Dedupe — venue_id + Portland calendar date + case-insensitive title,
        // against existing rows of ANY status AND within this batch. Idempotent.
        const seen = await existingKeys(supabaseService, src.venue_id, now)
        const fresh: ScrapedEvent[] = []
        let skipped = 0
        for (const ev of mapped) {
          const key = `${ev.portland_date}|${ev.title.toLowerCase()}`
          if (seen.has(key)) { skipped++; continue }
          seen.add(key)
          fresh.push(ev)
        }

        // 3. Dry run: report only
        if (dryRun) {
          result.wouldInsert = fresh.length
          result.samples = fresh.slice(0, 3).map(e => ({ title: e.title, date: e.portland_date }))
          continue
        }

        // 4. Real run: re-host image + insert pending
        let inserted = 0
        const imageDeadline = Date.now() + IMAGE_TOTAL_BUDGET_MS
        for (const ev of fresh) {
          const posterUrl = await rehostImage(supabaseService, ev.image, imageDeadline)
          const { error: insErr } = await supabaseService.from('events').insert({
            venue_id: src.venue_id,
            title: ev.title,
            category: src.default_category,
            poster_url: posterUrl,
            starts_at: ev.starts_at,
            description: ev.description,
            view_count: 0,
            like_count: 0,
            // Service-role inserts BYPASS the 063 staging trigger — set explicitly:
            status: 'pending',
            created_by: user.id, // the calling admin, so review groups under them
            source_url: ev.event_url,
            ai_confidence: CONFIDENCE_STRUCTURED,
          })
          if (insErr) { result.error = `insert: ${insErr.message}`; break }
          inserted++
        }

        result.inserted = inserted
        result.skipped = skipped

        // 5. Stamp the source row
        await supabaseService.from('venue_sources').update({
          last_run_at: new Date().toISOString(),
          last_run_note: `inserted ${inserted} · skipped ${skipped} · found ${result.found}`,
        }).eq('id', src.id)
      } catch (err) {
        // Per-source failure is a note, not a batch failure
        result.error = err instanceof Error ? err.message : String(err)
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
