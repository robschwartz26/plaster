import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// resolve-music-embed (Layer 1.5)
// Turns a plain Bandcamp album/track PAGE url into an EmbeddedPlayer link by fetching
// the page and extracting the numeric item id (which isn't in the url). SSRF-guarded:
// only bandcamp.com / *.bandcamp.com hosts are ever fetched, redirects must stay on
// Bandcamp, the fetch is time- and size-bounded. We construct the player src ourselves;
// the client re-validates it with parseMusicEmbed() before storing/rendering.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FETCH_TIMEOUT_MS = 6000
const MAX_BYTES = 1_500_000

function bandcampHost(host: string): boolean {
  return host === 'bandcamp.com' || host.endsWith('.bandcamp.com')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const body = await req.json().catch(() => ({}))
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) return json({ error: 'Missing url' }, 400)

    let u: URL
    try { u = new URL(url) } catch { return json({ error: 'Invalid url' }, 400) }
    if (u.protocol !== 'https:' || !bandcampHost(u.hostname)) {
      return json({ error: 'Only Bandcamp links are supported here.' }, 400)
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(u.toString(), {
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'PlasterBot/1.0 (+https://plasterthewall.com)' },
      })
    } finally {
      clearTimeout(timer)
    }

    // Redirect must have stayed on Bandcamp.
    let finalHost = ''
    try { finalHost = new URL(res.url).hostname } catch { /* ignore */ }
    if (!bandcampHost(finalHost)) return json({ error: 'That link redirected off Bandcamp.' }, 400)
    if (!res.ok) return json({ error: 'Could not load that Bandcamp page.' }, 200)

    const buf = new Uint8Array(await res.arrayBuffer())
    const html = new TextDecoder().decode(buf.subarray(0, MAX_BYTES))

    let kind: string | null = null
    let id: string | null = null

    // Primary: any EmbeddedPlayer reference on the page (og:video meta, etc.).
    const m = html.match(/EmbeddedPlayer\/[^"'<>\s]*?(album|track)=(\d+)/)
    if (m) { kind = m[1]; id = m[2] }

    // Fallback: the bc-page-properties meta (entity-encoded JSON).
    if (!kind) {
      const mp = html.match(/name="bc-page-properties"\s+content="([^"]+)"/)
      if (mp) {
        try {
          const decoded = mp[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
          const props = JSON.parse(decoded)
          if (props && props.item_id != null) {
            id = String(props.item_id)
            kind = props.item_type === 't' ? 'track' : props.item_type === 'a' ? 'album' : null
          }
        } catch { /* ignore */ }
      }
    }

    if (!kind || !id || !/^\d{3,20}$/.test(id)) {
      return json({ error: 'Could not find a player on that Bandcamp page.' }, 200)
    }

    const embedSrc = `https://bandcamp.com/EmbeddedPlayer/${kind}=${id}/size=large/bgcol=333333/linkcol=ffffff/tracklist=false/transparent=true/`
    return json({ embedSrc, kind, id })
  } catch {
    return json({ error: 'Resolve failed.' }, 200)
  }
})
