import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── scrape-sources ─────────────────────────────────────────────────────────────
// Auto-ingest: scrape structured event data into the pending review pipeline.
// Two modes:
//   Registered sources: { sourceId?: string, all?: boolean, dryRun?: boolean }
//   Ad-hoc URL import:  { adhocUrl: string, venueId?: string, dryRun?: boolean,
//                         events?: AdhocEvent[] }  ← import step posts back the
//                         dryRun-parsed selection (avoids re-running AI extraction)
// Gate: is_admin ONLY. Deployed with --no-verify-jwt; the JWT + role check below
// is the real gate (same pattern as extract-poster).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USER_AGENT = 'PlasterBot/0.1 (+https://plasterthewall.com)'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_DAYS_OUT = 120
const FETCH_TIMEOUT_MS = 15000
const AI_TEXT_CAP = 20000
const EXTRACT_MODEL = Deno.env.get('EXTRACT_MODEL') ?? 'claude-sonnet-4-6'
// ai_confidence is NUMERIC in this schema (ImportForm maps high→95):
const CONFIDENCE_JSONLD = 95
const CONFIDENCE_AI = 70

interface ScrapedEvent {
  title: string
  starts_at: string // ISO
  portland_date: string // YYYY-MM-DD in America/Los_Angeles
  event_url: string
  image: string | null
  description: string | null
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

// Portland is UTC-7 mid-March..early-Nov, else UTC-8 (month heuristic, same as
// scripts/ingest.js — exact DST boundary doesn't matter at event-time precision).
function portlandOffset(dateStr: string): string {
  const month = parseInt(dateStr.split('-')[1], 10)
  return month >= 3 && month <= 10 ? '-07:00' : '-08:00'
}

// startDate → ISO. Date-only = assume 7pm Portland; zone-less ISO = assume Portland.
function parseStartDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  let d: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(`${s}T19:00:00${portlandOffset(s)}`)
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    d = new Date(`${s}${portlandOffset(s)}`)
  } else {
    d = new Date(s)
  }
  return isNaN(d.getTime()) ? null : d
}

function portlandDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d)
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

// Walk a parsed block (object, array, @graph) collecting Event-typed objects.
function collectEvents(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) { node.forEach(n => collectEvents(n, out)); return }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (isEventType(obj['@type'])) out.push(obj)
  if (Array.isArray(obj['@graph'])) collectEvents(obj['@graph'], out)
}

// image: string | array | ImageObject {url}
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

// Map raw JSON-LD Event objects → ScrapedEvents within the ingest window.
function mapJsonLdEvents(rawEvents: Record<string, unknown>[], baseUrl: string, now: number, maxOut: number): ScrapedEvent[] {
  const mapped: ScrapedEvent[] = []
  for (const ev of rawEvents) {
    const title = typeof ev.name === 'string' ? ev.name.trim() : ''
    const start = parseStartDate(ev.startDate)
    if (!title || !start) continue
    if (start.getTime() < now || start.getTime() > maxOut) continue // past or >120d out
    const desc = typeof ev.description === 'string' ? ev.description.trim().slice(0, 400) : null
    mapped.push({
      title,
      starts_at: start.toISOString(),
      portland_date: portlandDate(start),
      event_url: resolveUrl(ev.url, baseUrl),
      image: pickImage(ev.image),
      description: desc || null,
    })
  }
  return mapped
}

// Strip HTML to readable text for the AI fallback: drop script/style/nav chrome,
// then all tags, collapse whitespace, cap length.
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

function ogImage(html: string): string | null {
  const m = html.match(/<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i)
  return m ? m[1] : null
}

// AI fallback: extract events from page text (no usable JSON-LD).
async function aiExtractEvents(pageText: string, pageUrl: string, now: number, maxOut: number): Promise<ScrapedEvent[]> {
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY secret not set')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())

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
        content: `Today is ${today} (Portland, Oregon). The following is the readable text of an events web page (${pageUrl}). Extract every distinct UPCOMING event as a JSON array — respond with ONLY the JSON array, no markdown fences, no commentary:

[{"title": string, "date": "YYYY-MM-DD", "time": "HH:mm" | null, "venue_name": string | null, "description": string | null, "image_url": string | null}]

Rules: only real events (no nav/footer/membership junk); description ≤ 2 sentences; date must be a real calendar date — if the year is missing assume the next occurrence from today; skip events with no discernible date. If there are no events, return [].

PAGE TEXT:
${pageText}`,
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
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const time = typeof ev.time === 'string' && /^\d{2}:\d{2}$/.test(ev.time) ? ev.time : null
    const start = parseStartDate(time ? `${date}T${time}` : date)
    if (!start) continue
    if (start.getTime() < now || start.getTime() > maxOut) continue
    mapped.push({
      title,
      starts_at: start.toISOString(),
      portland_date: portlandDate(start),
      event_url: pageUrl,
      image: typeof ev.image_url === 'string' && ev.image_url.trim() ? resolveUrl(ev.image_url, pageUrl) : null,
      description: typeof ev.description === 'string' ? ev.description.trim().slice(0, 400) || null : null,
      // venue_name carried separately by the caller
      ...(typeof ev.venue_name === 'string' && ev.venue_name.trim() ? { _venue_name: ev.venue_name.trim() } : {}),
    } as ScrapedEvent)
  }
  return mapped
}

// Re-host an image into posters/scrape/{uuid}.jpg; returns the public URL, or the
// original remote URL on size-cap / fetch failure, or null if no image.
// deno-lint-ignore no-explicit-any
async function rehostImage(supabaseService: any, imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

    // ═══ AD-HOC MODE: paste any event page URL ═══════════════════════════════
    if (typeof body.adhocUrl === 'string' && body.adhocUrl.trim()) {
      const adhocUrl = body.adhocUrl.trim()
      const forcedVenueId: string | null = typeof body.venueId === 'string' && body.venueId ? body.venueId : null
      const dryRun: boolean = body.dryRun === true
      const postedEvents: AdhocEvent[] | null = Array.isArray(body.events) ? body.events : null

      // ── Import step: insert the posted-back selection (no re-parse/AI) ──
      if (!dryRun && postedEvents) {
        let inserted = 0, skipped = 0
        const keysByVenue = new Map<string, Set<string>>()
        for (const ev of postedEvents) {
          const venueId = ev.venue_id || forcedVenueId
          if (!venueId || !ev.title || !ev.starts_at) { skipped++; continue }
          if (!keysByVenue.has(venueId)) keysByVenue.set(venueId, await existingKeys(supabaseService, venueId, now))
          const keys = keysByVenue.get(venueId)!
          const pDate = portlandDate(new Date(ev.starts_at))
          const key = `${pDate}|${ev.title.trim().toLowerCase()}`
          if (keys.has(key)) { skipped++; continue }
          keys.add(key)

          const posterUrl = await rehostImage(supabaseService, ev.image ?? null)
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

      // ── Parse step (dryRun, or real run without a posted selection) ──
      const pageRes = await fetch(adhocUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!pageRes.ok) throw new Error(`page fetch ${pageRes.status}`)
      const html = await pageRes.text()

      // 1. JSON-LD first
      const rawEvents: Record<string, unknown>[] = []
      for (const block of extractJsonLdBlocks(html)) collectEvents(block, rawEvents)
      let scraped = mapJsonLdEvents(rawEvents, adhocUrl, now, maxOut)
      let confidence = CONFIDENCE_JSONLD
      let method = 'jsonld'

      // 2. AI fallback when no usable JSON-LD events
      if (scraped.length === 0) {
        scraped = await aiExtractEvents(htmlToText(html), adhocUrl, now, maxOut)
        confidence = CONFIDENCE_AI
        method = 'ai'
      }

      // 3. Poster fallback: page og:image when the event carries none
      const pageOg = ogImage(html)
      // 4. Venue resolution: forced venueId, else case-insensitive name MATCH
      //    (never create). Unmatched → needsVenue (insert blocked until chosen).
      const { data: allVenues } = await supabaseService.from('venues').select('id, name')
      const venueByName = new Map<string, { id: string; name: string }>(
        ((allVenues ?? []) as Array<{ id: string; name: string }>).map(v => [v.name.trim().toLowerCase(), v]),
      )

      const adhocEvents: AdhocEvent[] = scraped.map(ev => {
        const rawVenueName = (ev as ScrapedEvent & { _venue_name?: string })._venue_name ?? null
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

      // Dedupe annotation for the dry-run list (per resolved venue)
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
          adhoc: { url: adhocUrl, method, found: annotated.length, wouldInsert, events: annotated },
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      }

      // Real run without a posted selection: insert every resolved, non-dup event
      let inserted = 0, skipped = 0
      for (const ev of annotated) {
        if (ev.needsVenue || ev.duplicate) { skipped++; continue }
        const posterUrl = await rehostImage(supabaseService, ev.image)
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
          source_url: ev.event_url || adhocUrl,
          ai_confidence: ev.confidence,
        })
        if (insErr) throw new Error(`insert: ${insErr.message}`)
        inserted++
      }
      return new Response(JSON.stringify({ adhoc: { url: adhocUrl, method, inserted, skipped } }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // ═══ REGISTERED-SOURCES MODE (unchanged behavior) ════════════════════════
    const sourceId: string | undefined = body.sourceId
    const all: boolean = body.all === true
    const dryRun: boolean = body.dryRun === true

    if (!sourceId && !all) {
      return new Response(JSON.stringify({ error: 'Pass adhocUrl, sourceId, or all:true' }), {
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
        // 1. Fetch + extract JSON-LD events
        const pageRes = await fetch(src.source_url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!pageRes.ok) throw new Error(`page fetch ${pageRes.status}`)
        const html = await pageRes.text()
        const rawEvents: Record<string, unknown>[] = []
        for (const block of extractJsonLdBlocks(html)) collectEvents(block, rawEvents)
        result.found = rawEvents.length

        // 2. Map + window-filter
        const mapped = mapJsonLdEvents(rawEvents, src.source_url, now, maxOut)

        // 3. Dedupe — venue_id + Portland calendar date + case-insensitive title,
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

        // 4. Dry run: report only
        if (dryRun) {
          result.wouldInsert = fresh.length
          result.samples = fresh.slice(0, 3).map(e => ({ title: e.title, date: e.portland_date }))
          continue
        }

        // 5. Real run: re-host image + insert pending
        let inserted = 0
        for (const ev of fresh) {
          const posterUrl = await rehostImage(supabaseService, ev.image)
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
            ai_confidence: CONFIDENCE_JSONLD,
          })
          if (insErr) { result.error = `insert: ${insErr.message}`; break }
          inserted++
        }

        result.inserted = inserted
        result.skipped = skipped

        // 6. Stamp the source row
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
