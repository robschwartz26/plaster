import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
  const { data: profile } = await supabaseService.from('profiles').select('is_admin, is_ingester').eq('id', user.id).single()
  if (!profile?.is_admin && !profile?.is_ingester) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    const body = await req.json()
    const { image, today } = body as { image: { base64: string; mimeType: string }; today: string }

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY secret not set')

    const prompt = `You are parsing a show schedule image for a Portland event listings app. Today is ${today}.

Return ONLY valid JSON with no markdown, no explanation:
{ "occurrences": [ { "date": "YYYY-MM-DD", "time": "HH:MM" } ] }

Rules:
- One entry PER showtime. A day with a matinee and an evening show = two entries with the same date.
- Expand date ranges (e.g. "June 16–21") into one entry per day (using the showtime for all days if given, or omitting time if not).
- Resolve partial or relative dates using today (${today}); pick the nearest future year if the year is ambiguous or missing.
- "time" is 24-hour "HH:MM". If a showtime has no explicit time, omit the "time" field entirely.
- Sort all entries chronologically by date then time.
- If no dates are visible at all, return { "occurrences": [] }.`

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
          content: [{
            type: 'image',
            source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
          }, {
            type: 'text',
            text: prompt,
          }],
        }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      throw new Error(`Anthropic error: ${anthropicRes.status} ${err}`)
    }

    const anthropicData = await anthropicRes.json()
    const raw = anthropicData.content?.[0]?.text ?? '{}'
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(jsonStr)

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
