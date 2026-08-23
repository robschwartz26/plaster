import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FETCH_TIMEOUT_MS = 8000
const MAX_BYTES = 12 * 1024 * 1024 // 12MB — posters are images, not archives

// Block SSRF into private/internal networks. This is an admin poster-import
// helper, not a general proxy: only public web image hosts are legitimate.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '169.254.169.254') return true // cloud metadata endpoint
  // IPv4 literal in a private / loopback / link-local range
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a >= 224) return true // multicast / reserved
  }
  // IPv6 loopback / link-local / unique-local
  if (h === '::1' || h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd') || h === '[::1]') return true
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // Admin-only: this helper acts server-side and must not be an open proxy.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return new Response('Unauthorized', { status: 401, headers: CORS })
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!prof?.is_admin) return new Response('Forbidden', { status: 403, headers: CORS })

  let url: string
  try {
    url = (await req.json())?.url
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS })
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response('Only http/https URLs are allowed', { status: 400, headers: CORS })
  }

  let parsed: URL
  try { parsed = new URL(url) } catch { return new Response('Bad URL', { status: 400, headers: CORS }) }
  if (isBlockedHost(parsed.hostname)) {
    return new Response('Host not allowed', { status: 403, headers: CORS })
  }

  let imgRes: Response
  try {
    imgRes = await fetch(url, {
      headers: { 'User-Agent': 'Plaster/1.0 (poster import; +https://plasterthewall.com)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (e) {
    return new Response(`Fetch failed: ${e}`, { status: 502, headers: CORS })
  }

  const contentType = imgRes.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    return new Response('Not an image', { status: 415, headers: CORS })
  }
  const declaredLen = parseInt(imgRes.headers.get('content-length') ?? '0', 10)
  if (declaredLen && declaredLen > MAX_BYTES) {
    return new Response('Image too large', { status: 413, headers: CORS })
  }

  const mimeType = contentType.split(';')[0].trim()
  const buf = await imgRes.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length > MAX_BYTES) {
    return new Response('Image too large', { status: 413, headers: CORS })
  }

  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  const base64 = btoa(binary)

  return new Response(JSON.stringify({ base64, mimeType }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
