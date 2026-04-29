// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SENTINEL_USER_ID = '00000000-0000-0000-0000-000000000000'
const SENTINEL_EMAIL = 'deleted-user-sentinel@plaster.internal'
const SENTINEL_USERNAME = 'deleted_user'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Service role client for admin operations
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Authenticated client to validate caller's identity (uses their JWT)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    // Validate user
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Don't let anyone delete the sentinel itself
    if (user.id === SENTINEL_USER_ID) {
      return new Response(
        JSON.stringify({ error: 'Sentinel user cannot be deleted via this endpoint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Step 1: Ensure sentinel exists. Idempotent — does nothing after first run.
    const { data: existingSentinel } = await adminClient.auth.admin.getUserById(SENTINEL_USER_ID)
    if (!existingSentinel?.user) {
      const { error: createSentinelErr } = await adminClient.auth.admin.createUser({
        user_id: SENTINEL_USER_ID,
        email: SENTINEL_EMAIL,
        email_confirm: true,
        user_metadata: { is_sentinel: true },
      } as any)
      if (createSentinelErr) {
        // Non-fatal: RPC will skip anonymization gracefully if sentinel absent
        console.error('[delete-my-account] sentinel creation warning:', createSentinelErr.message)
      } else {
        // Update the profile row that the trigger created with the sentinel username
        await adminClient.from('profiles')
          .update({ username: SENTINEL_USERNAME })
          .eq('id', SENTINEL_USER_ID)
      }
    }

    // Step 2: Scrub the user's public data (anonymize wall posts, hard-delete attendees/post_likes).
    const { error: scrubErr } = await userClient.rpc('scrub_my_account_data')
    if (scrubErr) {
      console.error('[delete-my-account] scrub failed:', scrubErr.message)
      return new Response(
        JSON.stringify({ error: 'Failed to scrub account data', details: scrubErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Step 3: Delete auth.users row. This cascades to profile + all FK'd tables.
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteErr) {
      console.error('[delete-my-account] auth.users delete failed:', deleteErr.message)
      return new Response(
        JSON.stringify({ error: 'Failed to delete account', details: deleteErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, deletedUserId: user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[delete-my-account] uncaught error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
