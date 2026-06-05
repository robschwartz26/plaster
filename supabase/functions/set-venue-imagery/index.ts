// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Auth guard: caller must be a real admin ──────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonRes({ error: 'Missing authorization header' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return jsonRes({ error: 'Invalid or expired session' }, 401)

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!callerProfile?.is_admin) return jsonRes({ error: 'Admin only' }, 403)

    // ── Parse body ───────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as {
      account_id?: string
      diamondBase64?: string
      bannerBase64?: string
      bannerFocalY?: number
    }

    const { account_id, diamondBase64, bannerBase64, bannerFocalY } = body

    if (!account_id) return jsonRes({ error: 'account_id is required' }, 400)
    if (!diamondBase64 && !bannerBase64) return jsonRes({ error: 'At least one of diamondBase64 or bannerBase64 is required' }, 400)

    // Confirm target profile exists
    const { data: targetProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', account_id)
      .single()

    if (profileErr || !targetProfile) return jsonRes({ error: 'Profile not found' }, 404)

    const updates: Record<string, unknown> = {}
    const result: Record<string, string | null> = {}

    // ── Diamond upload ───────────────────────────────────────────
    if (diamondBase64) {
      const bytes = base64ToBytes(diamondBase64)
      const path  = `${account_id}/diamond.jpg`

      const { error: uploadErr } = await adminClient.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true })

      if (uploadErr) {
        console.error('[set-venue-imagery] diamond upload failed:', uploadErr.message)
        return jsonRes({ error: 'Diamond upload failed', details: uploadErr.message }, 500)
      }

      const { data: urlData } = adminClient.storage.from('avatars').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      updates.avatar_url         = url
      updates.avatar_diamond_url = url
      result.avatar_diamond_url  = url
    }

    // ── Banner upload ────────────────────────────────────────────
    if (bannerBase64) {
      const bytes = base64ToBytes(bannerBase64)
      const path  = `${account_id}/banner.jpg`

      const { error: uploadErr } = await adminClient.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true })

      if (uploadErr) {
        console.error('[set-venue-imagery] banner upload failed:', uploadErr.message)
        return jsonRes({ error: 'Banner upload failed', details: uploadErr.message }, 500)
      }

      const { data: urlData } = adminClient.storage.from('avatars').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      updates.banner_url     = url
      updates.banner_focal_y = bannerFocalY ?? 0.5
      result.banner_url      = url
    }

    // ── Apply profile update ─────────────────────────────────────
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update(updates)
      .eq('id', account_id)

    if (updateErr) {
      console.error('[set-venue-imagery] profile update failed:', updateErr.message)
      return jsonRes({ error: 'Profile update failed', details: updateErr.message }, 500)
    }

    return jsonRes({ ok: true, ...result })
  } catch (err: any) {
    console.error('[set-venue-imagery] uncaught:', err)
    return jsonRes({ error: 'Internal error', details: String(err) }, 500)
  }
})
