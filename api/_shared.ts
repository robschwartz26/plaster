// Shared helpers for the public share layer (Vercel serverless functions).
// Files prefixed with "_" are NOT routed by Vercel — this is a helper module.
//
// Reads Supabase with the ANON key only, relying on RLS so ONLY published/public
// events are ever returned. Never import or use the service-role key here.

// The anon URL + key are non-prefixed env (VITE_* vars aren't available to
// serverless functions at runtime). The anon key is public (it already ships in
// the client bundle), so these are safe to read here — but still keep them in env.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''

export const SITE_URL = 'https://plasterthewall.com'

// TODO(rob): paste the real store links once the apps are live. While empty, the
// smart /get redirect shows a graceful "coming soon" instead of 302-ing nowhere.
export const APP_STORE_URL = '' // iOS App Store URL
export const PLAY_STORE_URL = '' // Google Play URL

export interface ShareEvent {
  id: string
  title: string
  poster_url: string | null
  starts_at: string | null
  category: string | null
  description: string | null
  neighborhood: string | null
  address: string | null
  venue_id: string | null
  venues: { name: string | null; neighborhood: string | null } | null
}

export function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Fetch a single PUBLISHED event by id via the Supabase REST API with the anon
// key. RLS + the explicit status filter guarantee unpublished/private rows are
// never returned. Returns null on any miss/error (caller renders the graceful page).
export async function fetchPublishedEvent(id: string): Promise<ShareEvent | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  // Only accept a well-formed uuid; anything else can't be a real event id.
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null
  const sel = 'id,title,poster_url,starts_at,category,description,neighborhood,address,venue_id,venues(name,neighborhood)'
  const url = `${SUPABASE_URL}/rest/v1/events?select=${encodeURIComponent(sel)}&id=eq.${encodeURIComponent(id)}&status=eq.published&limit=1`
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as ShareEvent[]
    return Array.isArray(rows) && rows[0] ? rows[0] : null
  } catch {
    return null
  }
}

// Portland-local date stamp, e.g. "WED · SEP 4" + "7:00 PM".
export function fmtDate(iso: string | null): { stamp: string; time: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const tz = 'America/Los_Angeles'
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(d).toUpperCase()
  const mo = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: tz }).format(d).toUpperCase()
  const day = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: tz }).format(d)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(d)
  return { stamp: `${wd} · ${mo} ${day}`, time }
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Playfair+Display:wght@700;900&family=Space+Grotesk:wght@400;600&display=swap'

// Shared night-mode page shell with inline critical CSS. `head` carries the OG/
// Twitter meta; `body` is the visible content.
function shell(title: string, head: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
${head}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#0c0b0b;color:#f0ece3;font-family:"Space Grotesk",system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100%}
  body{display:flex;flex-direction:column;align-items:center;padding:24px 20px calc(24px + env(safe-area-inset-bottom));min-height:100vh}
  .wordmark{font-family:"Playfair Display",Georgia,serif;font-weight:900;font-size:22px;letter-spacing:-.02em;color:#f0ece3;align-self:flex-start;margin-bottom:8px}
  .card{width:100%;max-width:420px;margin:auto 0;display:flex;flex-direction:column;align-items:center}
  .hero{position:relative;width:100%;aspect-ratio:2/3;max-height:62vh;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#161514}
  .hero .halo{position:absolute;inset:-30% ;background-position:center;background-size:cover;filter:blur(48px) saturate(1.4) brightness(.65);transform:scale(1.25);z-index:0}
  .hero img{position:relative;z-index:1;max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.5)}
  .title{font-family:"Playfair Display",Georgia,serif;font-weight:900;font-size:26px;line-height:1.15;text-align:center;margin:22px 0 10px}
  .meta{font-family:"Space Grotesk",sans-serif;font-size:14px;color:rgba(240,236,227,.62);text-align:center;line-height:1.5;margin-bottom:6px}
  .stamp{display:inline-flex;align-items:center;gap:8px;font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:#f0ece3;border:1px solid rgba(240,236,227,.22);border-radius:0;padding:6px 12px;margin-top:6px}
  .cta{display:block;width:100%;max-width:320px;margin:28px auto 0;padding:15px 0;border-radius:14px;background:#A855F7;color:#fff;text-align:center;font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:15px;text-decoration:none;border:none;cursor:pointer}
  .sub{margin-top:12px;font-size:12px;color:rgba(240,236,227,.4);text-align:center}
  .generic{text-align:center;max-width:360px;margin:auto 0}
  .generic h1{font-family:"Playfair Display",Georgia,serif;font-weight:900;font-size:30px;margin-bottom:12px}
  .generic p{color:rgba(240,236,227,.6);font-size:15px;line-height:1.6}
</style>
</head>
<body>
<div class="wordmark">plaster</div>
${body}
</body>
</html>`
}

// The rich show share page — OG/Twitter meta + on-brand landing.
export function renderEventPage(e: ShareEvent): string {
  const venueName = e.venues?.name ?? null
  const hood = e.venues?.neighborhood ?? e.neighborhood ?? null
  const date = fmtDate(e.starts_at)
  const canonical = `${SITE_URL}/e/${e.id}`
  const ogDesc = [venueName, date ? `${date.stamp} · ${date.time}` : null, hood].filter(Boolean).join(' · ')
    || (e.description ? e.description.slice(0, 180) : 'A show on the Plaster wall.')
  const ogImage = e.poster_url ?? `${SITE_URL}/og-default.png`

  const head = `
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Plaster" />
<meta property="og:title" content="${esc(e.title)}" />
<meta property="og:description" content="${esc(ogDesc)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(e.title)}" />
<meta name="twitter:description" content="${esc(ogDesc)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<meta name="description" content="${esc(ogDesc)}" />
<link rel="canonical" href="${esc(canonical)}" />`

  const poster = e.poster_url
    ? `<div class="hero"><div class="halo" style="background-image:url('${esc(e.poster_url)}')"></div><img src="${esc(e.poster_url)}" alt="${esc(e.title)} poster" /></div>`
    : `<div class="hero"></div>`
  const metaLine = [venueName, hood].filter(Boolean).map(esc).join(' · ')

  const body = `
<div class="card">
  ${poster}
  <h1 class="title">${esc(e.title)}</h1>
  ${metaLine ? `<p class="meta">${metaLine}</p>` : ''}
  ${date ? `<div class="stamp">${esc(date.stamp)} &nbsp;·&nbsp; ${esc(date.time)}</div>` : ''}
  <a class="cta" href="/get">Get Plaster</a>
  <p class="sub">Portland's living wall of shows &amp; nights out.</p>
</div>`

  return shell(`${e.title} · Plaster`, head, body)
}

// Graceful generic page for a missing/unpublished id — no error, no data leak.
export function renderGenericPage(): string {
  const head = `
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Plaster" />
<meta property="og:title" content="Plaster — Portland's living event wall" />
<meta property="og:description" content="Discover shows, drag, film, and nights out across Portland." />
<meta property="og:image" content="${SITE_URL}/og-default.png" />
<meta property="og:url" content="${SITE_URL}" />
<meta name="twitter:card" content="summary_large_image" />`
  const body = `
<div class="generic">
  <h1>Portland's living wall</h1>
  <p>This show isn't here — but the wall is full of them. Get Plaster and see what's on tonight.</p>
  <a class="cta" href="/get">Get Plaster</a>
</div>`
  return shell('Plaster — Portland’s living event wall', head, body)
}

// The desktop / coming-soon "get the app" landing (used by /get).
export function renderGetPage(): string {
  const head = `<meta property="og:title" content="Get Plaster" /><meta property="og:url" content="${SITE_URL}/get" /><meta name="robots" content="noindex" />`
  const body = `
<div class="generic">
  <h1>Get Plaster</h1>
  <p>Portland's living wall of shows and nights out. The app is landing soon — open this link on your phone, or visit <a href="${SITE_URL}" style="color:#A855F7">plasterthewall.com</a>.</p>
  <a class="cta" href="${SITE_URL}">Open the wall</a>
</div>`
  return shell('Get Plaster', head, body)
}
