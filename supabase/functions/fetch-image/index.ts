import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }

  let url: string
  try {
    const body = await req.json()
    url = body?.url
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS })
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response('Only http/https URLs are allowed', { status: 400, headers: CORS })
  }

  let imgRes: Response
  try {
    imgRes = await fetch(url, {
      headers: { 'User-Agent': 'Plaster/1.0 (poster import; +https://plasterthewall.com)' },
    })
  } catch (e) {
    return new Response(`Fetch failed: ${e}`, { status: 502, headers: CORS })
  }

  const contentType = imgRes.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    return new Response('Not an image', { status: 415, headers: CORS })
  }

  const mimeType = contentType.split(';')[0].trim()
  const buf = await imgRes.arrayBuffer()
  const bytes = new Uint8Array(buf)

  // Build binary string in chunks to avoid stack overflow, then encode once
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
