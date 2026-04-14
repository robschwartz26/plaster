import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { base64, mimeType } = await req.json()
  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')

  const year = new Date().getFullYear()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          {
            type: 'text',
            text: `Analyze this image carefully. It may be a clean poster, or it may be a screenshot containing a poster alongside other content (website UI, event listing text, Instagram chrome, white borders, etc).

Return ONLY a JSON object, no markdown, no explanation:
{
  "title": "event or artist name",
  "venue_name": "venue name exactly as shown",
  "date": "YYYY-MM-DD, use ${year} if year not shown, empty string if no date visible",
  "time": "HH:MM 24-hour format, empty string if not found",
  "address": "street address if visible, empty string if not",
  "description": "supporting acts, ticket price, ages, other details — max 2 sentences",
  "category": "Music or Drag or Dance or Comedy or Art or Film or Literary or Trivia or Other",
  "confidence": "high or medium or low",
  "uncertain_fields": ["fields you were unsure about"],
  "crop": {
    "x": 0.0,
    "y": 0.0,
    "width": 1.0,
    "height": 1.0
  }
}

For the "crop" field: express the poster art bounds as fractions of the total image dimensions (0.0 to 1.0).
- If the image IS the poster (clean, no surrounding UI): use x=0, y=0, width=1, height=1
- If the poster art is only PART of the image (e.g. right half of a webpage screenshot, or surrounded by white borders/UI): give the fractional coordinates of just the poster art rectangle.
- x and y are the top-left corner. width and height are the size of the crop area.
- Example: poster on right half of image → {"x": 0.5, "y": 0.0, "width": 0.5, "height": 1.0}
- Example: poster centered with white borders → {"x": 0.05, "y": 0.05, "width": 0.9, "height": 0.9}`
          }
        ]
      }]
    })
  })

  if (!response.ok) {
    const err = await response.text()
    return new Response(JSON.stringify({ error: err }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

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
            }
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
          const q = encodeURIComponent(parsed.venue_name + ' Portland Oregon')
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
              'x-api-key': ANTHROPIC_KEY!,
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
}`
              }]
            })
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
                if (!parsed.uncertain_fields.includes('address')) parsed.uncertain_fields.push('address')
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
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: text }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
