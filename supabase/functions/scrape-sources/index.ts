import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── scrape-sources ─────────────────────────────────────────────────────────────
// Auto-ingest pilot: scrape venue_sources rows (JSON-LD) for structured event
// data and insert as status='pending' into the existing review pipeline.
// Gate: is_admin ONLY (not ingester). Deployed with --no-verify-jwt; the JWT +
// role check below is the real gate (same pattern as extract-poster).
// Request body: { sourceId?: string, all?: boolean, dryRun?: boolean }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USER_AGENT = 'PlasterBot/0.1 (+https://plasterthewall.com)'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_DAYS_OUT = 120
const FETCH_TIMEOUT_MS = 15000

interface ScrapedEvent {
  title: string
  starts_at: string // ISO
  portland_date: string // YYYY-MM-DD in America/Los_Angeles
  event_url: string
  image: string | null
  description: string | null
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
    const sourceId: string | undefined = body.sourceId
    const all: boolean = body.all === true
    const dryRun: boolean = body.dryRun === true

    if (!sourceId && !all) {
      return new Response(JSON.stringify({ error: 'Pass sourceId or all:true' }), {
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
    const now = Date.now()
    const maxOut = now + MAX_DAYS_OUT * 24 * 60 * 60 * 1000

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
            event_url: resolveUrl(ev.url, src.source_url),
            image: pickImage(ev.image),
            description: desc || null,
          })
        }

        // 3. Dedupe — venue_id + Portland calendar date + case-insensitive title,
        // against existing rows of ANY status AND within this batch. Idempotent:
        // a second run with no site changes inserts zero.
        const { data: existing } = await supabaseService
          .from('events')
          .select('title, starts_at')
          .eq('venue_id', src.venue_id)
          .gte('starts_at', new Date(now - 24 * 60 * 60 * 1000).toISOString())
        const seen = new Set(
          (existing ?? []).map(e => `${portlandDate(new Date(e.starts_at))}|${e.title.trim().toLowerCase()}`),
        )
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

        // 5. Real run: re-host image (mirror scripts/ingest.js) + insert pending
        let inserted = 0
        for (const ev of fresh) {
          let posterUrl: string | null = ev.image
          if (ev.image) {
            try {
              const imgRes = await fetch(ev.image, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
              })
              if (imgRes.ok) {
                const bytes = new Uint8Array(await imgRes.arrayBuffer())
                if (bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_BYTES) {
                  const path = `scrape/${crypto.randomUUID()}.jpg`
                  const contentType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
                  const { error: upErr } = await supabaseService.storage
                    .from('posters').upload(path, bytes, { contentType, upsert: false })
                  if (!upErr) {
                    posterUrl = supabaseService.storage.from('posters').getPublicUrl(path).data.publicUrl
                  }
                }
              }
            } catch { /* re-host failed — fall back to the remote URL */ }
          }

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
            ai_confidence: 95, // 'high' — column is numeric (ImportForm maps high→95)
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
