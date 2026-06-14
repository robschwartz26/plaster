import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Submits a neighborhood community-wall post. AI moderation is authoritative and
// runs server-side: a clean image publishes immediately; anything flagged
// (sexual / violent / hateful / disturbing) drops to 'pending' for admin review.
// Moderation failures fail SAFE → 'pending' (never auto-publish unreviewed).

const MODERATE_MODEL = Deno.env.get('EXTRACT_MODEL') ?? 'claude-sonnet-4-6'
const POST_TYPES = ['personal', 'business', 'lost_pet']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const token = authHeader.replace('Bearer ', '')

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user }, error: authError } = await supa.auth.getUser(token)
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  // Author must have a declared neighborhood (the post is scoped to their region).
  const { data: profile } = await supa.from('profiles')
    .select('home_neighborhood, home_sextant').eq('id', user.id).single()
  if (!profile?.home_neighborhood || !profile?.home_sextant) {
    return json({ error: 'Set your neighborhood in your profile first.' }, 400)
  }

  let body: { image?: { base64: string; mimeType: string }; title?: string; body?: string; post_type?: string; expires_at?: string }
  try { body = await req.json() } catch { return json({ error: 'Bad request' }, 400) }
  if (!body.image?.base64) return json({ error: 'An image is required.' }, 400)

  const postType = POST_TYPES.includes(body.post_type ?? '') ? body.post_type! : 'personal'

  // ── AI moderation (fail safe to pending) ──────────────────
  let flagged = false
  let flagReason = ''
  let moderationOk = false
  try {
    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    const prompt = `You are a content moderator for a friendly neighborhood community board (think: lost pets, yard sales, free stuff, local notices, event flyers, community photos).

Look at this image and decide if it needs human review before going public.

FLAG it (needs review) only if it plausibly contains: nudity or sexual content, graphic violence or gore, hate symbols or hateful content, hard-drug use, or genuinely disturbing/upsetting imagery.

Do NOT flag ordinary, innocent community content — pets, animals, people at normal events, kids, food, yard-sale items, furniture, flyers, handwritten notes, storefronts, scenery. When in doubt about ordinary content, do NOT flag.

Return ONLY a JSON object, no markdown:
{ "flagged": true or false, "reason": "short reason if flagged, else empty string" }`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODERATE_MODEL,
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: body.image.mimeType || 'image/jpeg', data: body.image.base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}`)
    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    flagged = !!parsed.flagged
    flagReason = typeof parsed.reason === 'string' ? parsed.reason : ''
    moderationOk = true
  } catch (e) {
    // Fail safe: route to review rather than auto-publishing unmoderated content.
    console.error('[submit-community-post] moderation failed:', e)
    flagged = false
    flagReason = 'moderation unavailable — routed to review'
    moderationOk = false
  }

  // ── Upload the image (service role) ───────────────────────
  let imageUrl: string | null = null
  try {
    const bin = Uint8Array.from(atob(body.image.base64), c => c.charCodeAt(0))
    const path = `community/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await supa.storage.from('posters').upload(path, bin, { contentType: body.image.mimeType || 'image/jpeg', upsert: false })
    if (upErr) throw upErr
    imageUrl = supa.storage.from('posters').getPublicUrl(path).data.publicUrl
  } catch (e) {
    console.error('[submit-community-post] upload failed:', e)
    return json({ error: 'Image upload failed.' }, 500)
  }

  // Clean + moderation succeeded → publish; otherwise → pending review.
  const status = (moderationOk && !flagged) ? 'published' : 'pending'
  const expiresAt = body.expires_at ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: inserted, error: insErr } = await supa.from('community_posts').insert({
    author_id: user.id,
    neighborhood: profile.home_neighborhood,
    sextant: profile.home_sextant,
    post_type: postType,
    title: body.title?.slice(0, 120) || null,
    body: body.body?.slice(0, 1000) || null,
    image_url: imageUrl,
    status,
    flagged,
    flag_reason: flagReason || null,
    expires_at: expiresAt,
  }).select('id, status').single()

  if (insErr) {
    console.error('[submit-community-post] insert failed:', insErr)
    return json({ error: 'Could not save your post.' }, 500)
  }

  return json({ id: inserted.id, status, flagged, reason: flagReason })
})
