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

/** Lowercase alphanum slug from a venue name. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28) || 'venue'
}

/** Cryptographically random password (24 chars, URL-safe). */
function randomPassword(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
    const body = await req.json().catch(() => ({}))
    const { venue_id } = body as { venue_id?: string }
    if (!venue_id) return jsonRes({ error: 'venue_id is required' }, 400)

    // ── Load venue ───────────────────────────────────────────────
    const { data: venue, error: venueErr } = await adminClient
      .from('venues')
      .select('id, name, neighborhood, address')
      .eq('id', venue_id)
      .single()

    if (venueErr || !venue) return jsonRes({ error: 'Venue not found' }, 404)

    // ── Idempotency: already has an account? ─────────────────────
    const { data: existing } = await adminClient
      .from('profiles')
      .select('id, username')
      .eq('venue_id', venue_id)
      .maybeSingle()

    if (existing) {
      return jsonRes({
        ok: true,
        already_exists: true,
        profile_id: existing.id,
        username: existing.username,
      }, 200)
    }

    // ── Build collision-safe username slug ───────────────────────
    const base = slugify(venue.name)
    let username = base
    let suffix = 2
    while (true) {
      const { data: clash } = await adminClient
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()
      if (!clash) break
      username = `${base}${suffix++}`
    }

    // ── Generate credentials (password never logged) ─────────────
    const password = randomPassword()
    const email    = `venue-${username}@plasterthewall.com`

    // ── Create auth user ─────────────────────────────────────────
    const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    } as any)

    if (createErr || !authData?.user) {
      console.error('[create-venue-account] createUser failed:', createErr?.message)
      return jsonRes({ error: 'Failed to create auth user', details: createErr?.message }, 500)
    }

    const newUserId = authData.user.id

    // ── Build initial-letter SVG avatar ──────────────────────────
    const initial = venue.name.trim()[0]?.toUpperCase() ?? '?'
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#0c0b0b"/>
  <clipPath id="diamond"><polygon points="200,20 380,200 200,380 20,200"/></clipPath>
  <rect width="400" height="400" fill="#1a1918" clip-path="url(#diamond)"/>
  <text x="200" y="230" font-family="Georgia, serif" font-size="160" font-weight="700"
    fill="#f0ece3" text-anchor="middle" dominant-baseline="middle">${initial}</text>
</svg>`
    const svgBytes  = new TextEncoder().encode(svgContent)
    const avatarPath = `${newUserId}/venue-initial.svg`

    const { error: uploadErr } = await adminClient.storage
      .from('avatars')
      .upload(avatarPath, svgBytes, {
        contentType: 'image/svg+xml',
        upsert: true,
      })

    let avatarUrl: string | null = null
    if (!uploadErr) {
      const { data: urlData } = adminClient.storage.from('avatars').getPublicUrl(avatarPath)
      avatarUrl = urlData.publicUrl ?? null
    } else {
      console.error('[create-venue-account] avatar upload failed:', uploadErr.message)
      // Non-fatal — continue without avatar
    }

    // ── Upsert profile (trigger may have already created row) ────
    const bio = [venue.name, venue.neighborhood].filter(Boolean).join(' · ')
    const { error: profileErr } = await adminClient
      .from('profiles')
      .upsert({
        id:                 newUserId,
        username,
        account_type:       'venue',
        venue_id:           venue.id,
        bio,
        is_public:          true,
        avatar_url:         avatarUrl,
        avatar_diamond_url: avatarUrl,
      }, { onConflict: 'id' })

    if (profileErr) {
      console.error('[create-venue-account] profile upsert failed:', profileErr.message)
      // Attempt cleanup
      await adminClient.auth.admin.deleteUser(newUserId).catch(() => {})
      return jsonRes({ error: 'Failed to create profile', details: profileErr.message }, 500)
    }

    return jsonRes({
      ok:         true,
      profile_id: newUserId,
      username,
      email,
      password, // shown once — admin must record
    })
  } catch (err) {
    console.error('[create-venue-account] uncaught:', err)
    return jsonRes({ error: 'Internal error', details: String(err) }, 500)
  }
})
