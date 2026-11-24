// ── appstore-metrics ──────────────────────────────────────────────────────────
// Pulls daily iOS download counts from Apple's Sales and Trends API into
// metrics_daily. Apple hands back one gzipped TSV per calendar day; there is no
// range endpoint, so a backfill is one request per day, sequential and polite.
//
// Auth: an ES256 JWT signed with the App Store Connect private key (APPSTORE_P8),
// valid 20 minutes max per Apple's rules. Audience is always "appstoreconnect-v1".
//
// Two things about this data that shape the whole design:
//   • It lags. Yesterday's report is usually there; today's never is.
//   • It expires. Apple keeps roughly 365 days of daily reports, so the download
//     series can never reach as far back as Plaster's own history.
// A day with no report is written as NULL, never 0 — "Apple has no report" and
// "nobody downloaded it" are different facts and the chart must not merge them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })

// ── JWT (ES256) ──────────────────────────────────────────────────────────────
const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function appleJwt(): Promise<string> {
  const issuer = Deno.env.get('APPSTORE_ISSUER_ID')
  const keyId  = Deno.env.get('APPSTORE_KEY_ID')
  const p8     = Deno.env.get('APPSTORE_P8')
  if (!issuer || !keyId || !p8) throw new Error('APPSTORE_ISSUER_ID / APPSTORE_KEY_ID / APPSTORE_P8 not set')

  // PEM → DER. Tolerates the literal "\n" that survives some copy-paste routes.
  const pem = p8.replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )

  const now = Math.floor(Date.now() / 1000)
  const header  = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  // 20 minutes is Apple's ceiling for this audience; anything longer is rejected.
  const payload = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }))
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${b64url(sig)}`
}

// ── One day's report ─────────────────────────────────────────────────────────
// Product type identifiers: 1/1F/1T are app purchases (free app = a download),
// 7/7F/7T are updates, 3/IA* are in-app purchases. Updates are counted but kept
// out of the download number — conflating them is how download charts start
// lying upward after a popular release.
type DayCounts = { downloads: number; redownloads: number; updates: number } | null

async function fetchDay(jwt: string, vendor: string, day: string, sku: string | null): Promise<DayCounts> {
  const qs = new URLSearchParams({
    'filter[frequency]': 'DAILY',
    'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY',
    'filter[vendorNumber]': vendor,
    'filter[reportDate]': day,
    'filter[version]': '1_1',
  })
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${qs}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/a-gzip' },
  })

  // 404 = no report for that date. Normal for today, for days before the app
  // shipped, and for anything past Apple's ~365-day retention.
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Apple ${res.status} for ${day}: ${(await res.text()).slice(0, 200)}`)

  const stream = res.body?.pipeThrough(new DecompressionStream('gzip'))
  if (!stream) return null
  const tsv = await new Response(stream).text()

  const lines = tsv.split('\n').filter(Boolean)
  if (lines.length < 2) return null
  const cols = lines[0].split('\t').map(h => h.trim())
  const iType = cols.indexOf('Product Type Identifier')
  const iUnits = cols.indexOf('Units')
  const iSku = cols.indexOf('SKU')
  if (iType < 0 || iUnits < 0) throw new Error(`unexpected report columns: ${cols.join(',')}`)

  let downloads = 0, redownloads = 0, updates = 0
  for (const line of lines.slice(1)) {
    const f = line.split('\t')
    if (sku && iSku >= 0 && f[iSku]?.trim() !== sku) continue   // ignore other apps on the account
    const t = (f[iType] ?? '').trim()
    const n = parseInt((f[iUnits] ?? '0').trim(), 10) || 0
    if (/^7/.test(t)) updates += n
    else if (/^(1|1F|1T|1E|1EP|1EU)$/.test(t)) downloads += n
    else if (/^(IA1|1R)$/.test(t)) redownloads += n
  }
  return { downloads, redownloads, updates }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Caller must be a real admin — this burns Apple API quota and writes metrics.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)
    const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await asCaller.auth.getUser()
    if (!user) return json({ error: 'Not signed in' }, 401)
    // Read the flag off profiles, the way create-venue-account and
    // extract-schedule already do, rather than the is_admin() RPC — one less
    // signature to keep in step.
    const { data: callerProfile } = await admin
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!callerProfile?.is_admin) return json({ error: 'Admin only' }, 403)

    const vendor = Deno.env.get('APPSTORE_VENDOR')
    if (!vendor) return json({ error: 'APPSTORE_VENDOR not set' }, 500)
    const sku = Deno.env.get('APPSTORE_SKU') ?? 'plaster-001'

    const body = await req.json().catch(() => ({}))
    const days = Math.min(Math.max(Number(body.days) || 30, 1), 365)

    const jwt = await appleJwt()
    const today = new Date()
    const written: string[] = []
    const missing: string[] = []
    let failed: string | null = null

    // Walk backwards from yesterday; today's report never exists.
    for (let i = 1; i <= days; i++) {
      const d = new Date(today); d.setUTCDate(d.getUTCDate() - i)
      const day = d.toISOString().slice(0, 10)
      try {
        const counts = await fetchDay(jwt, vendor, day, sku)
        if (!counts) { missing.push(day); continue }
        const { error } = await admin.from('metrics_daily').update({
          downloads_ios: counts.downloads,
          redownloads_ios: counts.redownloads,
          updates_ios: counts.updates,
          downloads_fetched_at: new Date().toISOString(),
        }).eq('day', day)
        if (error) throw error
        written.push(day)
      } catch (e) {
        // One bad day must not abandon the rest of the range.
        failed = e instanceof Error ? e.message : String(e)
        break
      }
    }

    return json({ ok: !failed, written: written.length, missing: missing.length, failed, days })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
