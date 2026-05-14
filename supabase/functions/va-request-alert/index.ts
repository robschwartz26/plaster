// deno-lint-ignore-file no-explicit-any
//
// va-request-alert — sends an admin email when a user requests VA account
// status during onboarding. Triggered by a DB webhook on profiles UPDATE.
//
// Filters: only fires when pending_account_type transitions from null/different
// to 'artist' or 'venue' (i.e. a fresh request, not a no-op or clearance).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const ALERT_EMAIL = 'plasterpdx@gmail.com'
const FROM_EMAIL = 'Plaster Alerts <noreply@plasterthewall.com>'

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record
    const oldRecord = payload.old_record

    if (!record) {
      return new Response(JSON.stringify({ error: 'no record in payload' }), { status: 400 })
    }

    // Filter: only fresh VA requests (transitioned from null/other to artist/venue)
    const newPending = record.pending_account_type
    const oldPending = oldRecord?.pending_account_type ?? null

    if (!newPending) {
      return new Response(JSON.stringify({ skipped: 'no pending value (cleared)' }), { status: 200 })
    }
    if (newPending === oldPending) {
      return new Response(JSON.stringify({ skipped: 'no change' }), { status: 200 })
    }
    if (newPending !== 'artist' && newPending !== 'venue') {
      return new Response(JSON.stringify({ skipped: 'not a VA type' }), { status: 200 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile } = await admin
      .from('profiles')
      .select('username, display_name, created_at')
      .eq('id', record.id)
      .single()

    const username = profile?.username ?? record.username ?? '(no username)'
    const displayName = profile?.display_name ?? '(no display name)'
    const created = profile?.created_at
      ? new Date(profile.created_at).toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'unknown'

    const subject = `[Plaster] VA request: @${username} (${newPending})`

    const textBody = `
A new VA account request was just submitted on Plaster.

USERNAME       @${username}
DISPLAY NAME   ${displayName}
REQUESTED      ${newPending}
USER ID        ${record.id}
SIGNED UP      ${created}

Review and approve/decline at:
https://the-plaster-wall.vercel.app/admin

—
This is an automated alert from Plaster.
`.trim()

    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin: 0 0 16px; font-family: 'Playfair Display', Georgia, serif; font-weight: 700;">New VA account request</h2>
  <p style="margin: 0 0 16px; color: #555;">A user just requested ${newPending} status during onboarding.</p>

  <table style="border-collapse: collapse; width: 100%; margin-bottom: 16px;">
    <tr><td style="padding: 6px 0; color: #888; width: 140px;">Username</td><td>@${escapeHtml(username)}</td></tr>
    <tr><td style="padding: 6px 0; color: #888;">Display name</td><td>${escapeHtml(displayName)}</td></tr>
    <tr><td style="padding: 6px 0; color: #888;">Requested</td><td><strong>${escapeHtml(newPending)}</strong></td></tr>
    <tr><td style="padding: 6px 0; color: #888;">Signed up</td><td>${escapeHtml(created)}</td></tr>
  </table>

  <p style="margin: 24px 0 0;">
    <a href="https://the-plaster-wall.vercel.app/admin" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Review in admin dashboard</a>
  </p>

  <p style="margin: 32px 0 0; color: #999; font-size: 12px;">
    This is an automated alert from Plaster.
  </p>
</div>
`.trim()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ALERT_EMAIL],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[va-request-alert] Resend send failed:', res.status, errBody)
      return new Response(JSON.stringify({ error: 'email send failed', status: res.status, body: errBody }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err: any) {
    console.error('[va-request-alert] error:', err?.message ?? err)
    return new Response(JSON.stringify({ error: err?.message ?? 'unknown' }), { status: 500 })
  }
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
