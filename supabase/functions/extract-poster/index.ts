import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const CATEGORY_FIELD = `"Live Music or Dance or Comedy or Drag or Jazz or Trivia or Karaoke or Theater or Burlesque or Classical or Film or Art or Literary or Spoken or Other. Pick the single best category based on the event's primary format. Prefer Live Music for bands and singer-songwriters playing instruments. Prefer Dance for DJ nights and themed dance parties. Prefer Jazz when jazz is the explicit featured genre. Prefer Classical for orchestras, chamber music, or opera. Prefer Comedy for stand-up or sketch. Prefer Theater for plays and musicals. Prefer Drag for drag-focused shows. Prefer Burlesque for burlesque shows specifically. Prefer Karaoke for karaoke nights. Prefer Trivia for pub quiz events. Prefer Film for screenings. Prefer Art for gallery/exhibition events. Prefer Literary for book clubs, book signings, and events centered on books as objects rather than performance. Prefer Spoken for live podcasts, author talks, storytelling shows, spoken word, and other events where the primary format is people speaking rather than singing or playing music. Only use Other if nothing fits."`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()

    // Support { images: [...] } (multi, new) or { base64, mimeType } (single, backward compat)
    const images: Array<{ base64: string; mimeType: string }> =
      Array.isArray(body.images) && body.images.length > 0
        ? body.images
        : [{ base64: body.base64, mimeType: body.mimeType || 'image/jpeg' }]

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY secret not set')

    const year = new Date().getFullYear()

    // Build one image content block per image
    const imageBlocks = images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType,
        data: img.base64,
      },
    }))

    const promptText = images.length > 1
      ? `You are reading event poster images. The FIRST image is the event poster art. Any ADDITIONAL images contain supplemental event information — they may be screenshots of ticket pages, venue websites, Instagram posts, or event listings with text details. Extract the most complete event information possible by reading ALL images together. Pay special attention to additional images for: exact ticket price, door time vs show time, supporting acts, age restrictions, website URLs, and any other details not visible on the main poster.

Return ONLY a JSON object, no markdown, no explanation:
{
  "title": "event or artist name",
  "venue_name": "venue name exactly as shown",
  "date": "YYYY-MM-DD, use ${year} if year not shown, empty string if no date visible",
  "time": "HH:MM 24-hour format, empty string if not found",
  "address": "street address if visible, empty string if not",
  "description": "Write 2-3 sentences in a warm, culturally informed Portland voice. Lead with what makes this event worth attending — the artist, the vibe, the occasion. Include one key practical detail (price, age restriction, or door time) woven in naturally. Write like a knowledgeable friend recommending the show, not a list of facts.",
  "category": ${CATEGORY_FIELD},
  "confidence": "high or medium or low",
  "uncertain_fields": ["fields you were unsure about"],
  "crop": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 }
}

For the "crop" field: applies only to the FIRST image (the poster art). Express bounds as fractions of that image's dimensions (0.0–1.0). If the first image IS the poster with no surrounding UI, use x=0, y=0, width=1, height=1.`
      : `Analyze this image carefully. It may be a clean poster, or a screenshot containing a poster alongside other content (website UI, event listing text, Instagram chrome, white borders, etc).

Return ONLY a JSON object, no markdown, no explanation:
{
  "title": "event or artist name",
  "venue_name": "venue name exactly as shown",
  "date": "YYYY-MM-DD, use ${year} if year not shown, empty string if no date visible",
  "time": "HH:MM 24-hour format, empty string if not found",
  "address": "street address if visible, empty string if not",
  "description": "Write 2-3 sentences in a warm, culturally informed Portland voice. Lead with what makes this event worth attending — the artist, the vibe, the occasion. Include one key practical detail (price, age restriction, or door time) woven in naturally. Write like a knowledgeable friend recommending the show, not a list of facts.",
  "category": ${CATEGORY_FIELD},
  "confidence": "high or medium or low",
  "uncertain_fields": ["fields you were unsure about"],
  "crop": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 }
}

For the "crop" field: express poster art bounds as fractions of the total image dimensions (0.0–1.0).
- If the image IS the poster (clean, no surrounding UI): use x=0, y=0, width=1, height=1
- If the poster is only PART of the image (webpage screenshot, white borders, etc): give the fractional coordinates of just the poster art rectangle.
- x and y are the top-left corner. width and height are the size of the crop area.
- Example: poster on right half → {"x":0.5,"y":0.0,"width":0.5,"height":1.0}
- Example: poster with white borders → {"x":0.05,"y":0.05,"width":0.9,"height":0.9}`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: promptText },
          ],
        }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`)
    }

    const anthropicData = await anthropicRes.json()
    const text = anthropicData.content?.[0]?.text ?? ''

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      throw new Error(`Failed to parse Claude response as JSON. Raw: ${text.slice(0, 300)}`)
    }

    // ── Venue enrichment (DB → Mapbox → AI) ─────────────────
    if (parsed.venue_name) {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
      const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const MAPBOX_TOKEN = Deno.env.get('MAPBOX_TOKEN')
      let resolved = false

      // 1. Check DB for existing venue (case-insensitive name match)
      if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        try {
          const params = new URLSearchParams()
          params.set('name', `ilike.%${parsed.venue_name}%`)
          params.set('select', 'id,name,address,location_lat,location_lng,website,instagram,hours')
          params.set('limit', '1')
          const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/venues?${params}`, {
            headers: {
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
          })
          if (dbRes.ok) {
            const rows = await dbRes.json()
            if (Array.isArray(rows) && rows.length > 0) {
              const v = rows[0]
              if (v.address)      parsed.address      = v.address
              if (v.location_lat) parsed.location_lat = v.location_lat
              if (v.location_lng) parsed.location_lng = v.location_lng
              if (v.website)      parsed.website      = v.website
              if (v.instagram)    parsed.instagram    = v.instagram
              if (v.hours)        parsed.hours        = v.hours
              parsed.address_source = 'db'
              resolved = true
            }
          }
        } catch { /* ignore DB failures */ }
      }

      // 2. Mapbox geocoding (only if no DB match and address still empty)
      if (!resolved && !parsed.address && MAPBOX_TOKEN) {
        try {
          const q = encodeURIComponent(`${parsed.venue_name} Portland Oregon`)
          const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1&proximity=-122.6784,45.5051`
          const mbRes = await fetch(mbUrl)
          if (mbRes.ok) {
            const mbData = await mbRes.json()
            const feature = mbData.features?.[0]
            if (feature && feature.relevance > 0.5) {
              parsed.address      = feature.place_name
              parsed.location_lat = feature.geometry.coordinates[1]
              parsed.location_lng = feature.geometry.coordinates[0]
              parsed.address_source = 'mapbox'
              resolved = true
            }
          }
        } catch { /* ignore Mapbox failures */ }
      }

      // 3. AI fallback — ask for address, hours, website, instagram
      if (!resolved && !parsed.address) {
        try {
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-opus-4-5',
              max_tokens: 256,
              messages: [{
                role: 'user',
                content: `For the venue "${parsed.venue_name}" in Portland, Oregon, return ONLY a JSON object (empty string for any field you are not confident about):
{
  "address": "street address like 1234 SE Morrison St Portland OR",
  "hours": "hours like Mon-Thu 5pm-2am, Fri-Sat 4pm-3am",
  "website": "full URL like https://example.com",
  "instagram": "handle without @ like venuename"
}`,
              }],
            }),
          })
          if (aiRes.ok) {
            const aiData = await aiRes.json()
            const aiText = (aiData.content?.[0]?.text ?? '').trim()
            try {
              const ai = JSON.parse(aiText.replace(/```json|```/g, '').trim())
              if (ai.address) {
                parsed.address = ai.address
                parsed.address_source = 'ai'
                if (!parsed.uncertain_fields) parsed.uncertain_fields = []
                if (!(parsed.uncertain_fields as string[]).includes('address')) {
                  (parsed.uncertain_fields as string[]).push('address')
                }
              }
              if (ai.hours)     parsed.hours     = ai.hours
              if (ai.website)   parsed.website   = ai.website
              if (ai.instagram) parsed.instagram = ai.instagram
              resolved = true
            } catch { /* ignore parse failure */ }
          }
        } catch { /* ignore AI failures */ }
      }

      if (!resolved) parsed.address_source = 'none'

      // ── Poster reuse — find existing event with matching title at same venue ──
      if (parsed.title && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        try {
          const titleWords = (s: string) =>
            new Set((s as string).toLowerCase().split(/\W+/).filter(w => w.length > 2))
          const titleSim = (a: string, b: string): number => {
            const wa = titleWords(a), wb = titleWords(b)
            if (wa.size === 0 || wb.size === 0) return 0
            let overlap = 0
            for (const w of wa) { if (wb.has(w)) overlap++ }
            return overlap / Math.max(wa.size, wb.size)
          }

          // Find venue_id for this venue
          const vParams = new URLSearchParams()
          vParams.set('name', `ilike.%${parsed.venue_name}%`)
          vParams.set('select', 'id')
          vParams.set('limit', '1')
          const vRes = await fetch(`${SUPABASE_URL}/rest/v1/venues?${vParams}`, {
            headers: {
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
          })
          if (vRes.ok) {
            const vRows = await vRes.json()
            if (Array.isArray(vRows) && vRows.length > 0) {
              const venueId = vRows[0].id
              // Fetch recent events at this venue that have a poster
              const eParams = new URLSearchParams()
              eParams.set('venue_id', `eq.${venueId}`)
              eParams.set('poster_url', 'not.is.null')
              eParams.set('select', 'title,poster_url')
              eParams.set('limit', '40')
              const eRes = await fetch(`${SUPABASE_URL}/rest/v1/events?${eParams}`, {
                headers: {
                  'apikey': SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                },
              })
              if (eRes.ok) {
                const events = await eRes.json()
                if (Array.isArray(events) && events.length > 0) {
                  const best = events
                    .filter(e => e.poster_url)
                    .map(e => ({ poster_url: e.poster_url as string, score: titleSim(e.title, parsed.title as string) }))
                    .sort((a, b) => b.score - a.score)[0]
                  if (best && best.score > 0.6) {
                    parsed.existing_poster_url = best.poster_url
                  }
                }
              }
            }
          }
        } catch { /* ignore poster reuse failures */ }
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
