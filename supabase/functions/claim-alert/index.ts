// claim-alert — emails plasterpdx@gmail.com when someone files a claim.
//
// Invoked directly by the client (fire-and-forget) right after a successful
// claim insert:
//   • kind 'venue_claim' — a venue account requested attachment to a venue
//   • kind 'show_claim'  — an artist claimed a show (event_artists pending)
//
// Auth: default verify_jwt applies (claimants are signed in). The caller's
// user id is derived from the token — never trusted from the body — and the
// referenced claim row is loaded server-side so the email reflects the DB,
// not whatever the client claims.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const ALERT_EMAIL = 'plasterpdx@gmail.com'
const FROM_EMAIL = 'Plaster Alerts <noreply@plasterthewall.com>'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

serve(async (req) => {
  try {
    const { kind } = await req.json() as { kind?: string }
    if (kind !== 'venue_claim' && kind !== 'show_claim') {
      return new Response(JSON.stringify({ error: 'bad kind' }), { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Identify the caller from their JWT
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })

    const { data: profile } = await admin.from('profiles')
      .select('username, account_type').eq('id', user.id).single()
    const who = profile?.username ? `@${profile.username}` : user.id

    let subject = ''
    let body = ''

    if (kind === 'venue_claim') {
      // Load their live pending claim (source of truth)
      const { data: claim } = await admin.from('venue_claims')
        .select('id, requested_at, venues(name, neighborhood)')
        .eq('profile_id', user.id).eq('status', 'pending')
        .order('requested_at', { ascending: false }).limit(1).maybeSingle()
      if (!claim) return new Response(JSON.stringify({ error: 'no pending claim' }), { status: 404 })
      const v = (claim as unknown as { venues: { name?: string; neighborhood?: string } | null }).venues
      subject = `Venue claim: ${who} → ${v?.name ?? 'unknown venue'}`
      body = `
        <h2 style="margin:0 0 12px;">Venue claim request</h2>
        <p><strong>${esc(who)}</strong> (venue account) wants to claim
        <strong>${esc(v?.name ?? 'unknown')}</strong>${v?.neighborhood ? ` · ${esc(v.neighborhood)}` : ''}.</p>
        <p>Approve or reject it in the staff Review queue.</p>`
    } else {
      // Latest pending show claim by this artist
      const { data: claim } = await admin.from('event_artists')
        .select('id, requested_at, events(title, starts_at)')
        .eq('artist_id', user.id).eq('status', 'pending')
        .order('requested_at', { ascending: false }).limit(1).maybeSingle()
      if (!claim) return new Response(JSON.stringify({ error: 'no pending claim' }), { status: 404 })
      const e = (claim as unknown as { events: { title?: string; starts_at?: string } | null }).events
      subject = `Show claim: ${who} → ${e?.title ?? 'unknown show'}`
      body = `
        <h2 style="margin:0 0 12px;">Artist show claim</h2>
        <p><strong>${esc(who)}</strong> (artist account) claims they're playing
        <strong>${esc(e?.title ?? 'unknown')}</strong>${e?.starts_at ? ` (${esc(e.starts_at.slice(0, 10))})` : ''}.</p>
        <p>Approve or reject it in the staff Review queue.</p>`
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ALERT_EMAIL],
        subject,
        html: `<div style="font-family:sans-serif;max-width:520px;">${body}
          <a href="https://plasterthewall.com/staff" style="display:inline-block;margin-top:8px;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Open review queue</a></div>`,
      }),
    })
    if (!emailRes.ok) {
      console.error('[claim-alert] resend failed:', await emailRes.text())
      return new Response(JSON.stringify({ error: 'email failed' }), { status: 502 })
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[claim-alert] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
