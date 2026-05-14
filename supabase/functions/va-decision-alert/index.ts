// deno-lint-ignore-file no-explicit-any
//
// va-decision-alert — emails a user when their VA account request
// is approved or declined. Triggered by a DB webhook on notifications
// INSERT. Filters internally to fire only for va_approved / va_declined.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const FROM_EMAIL = 'Plaster <noreply@plasterthewall.com>'

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record
    if (!record) {
      return new Response(JSON.stringify({ error: 'no record' }), { status: 400 })
    }

    if (record.kind !== 'va_approved' && record.kind !== 'va_declined') {
      return new Response(JSON.stringify({ skipped: 'not a VA decision' }), { status: 200 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve recipient's email + username
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(record.recipient_id)
    if (userErr || !userData?.user?.email) {
      console.error('[va-decision-alert] could not resolve user email:', userErr?.message)
      return new Response(JSON.stringify({ error: 'no user email' }), { status: 500 })
    }
    const recipientEmail = userData.user.email

    const { data: profile } = await admin
      .from('profiles')
      .select('username')
      .eq('id', record.recipient_id)
      .single()

    const username = profile?.username ?? 'there'
    const accountType = record.body_preview ?? 'account'

    let subject: string
    let textBody: string
    let htmlBody: string

    if (record.kind === 'va_approved') {
      subject = `Your ${accountType} account has been approved`
      textBody = `
Hi @${username},

Your Plaster ${accountType} account has been approved. You're all set.

Open Plaster: https://plasterthewall.com

—
The Plaster team
`.trim()

      htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin: 0 0 16px; font-family: 'Playfair Display', Georgia, serif; font-weight: 700;">Your ${escapeHtml(accountType)} account is approved</h2>
  <p style="margin: 0 0 16px; color: #555;">Hi @${escapeHtml(username)},</p>
  <p style="margin: 0 0 16px;">Your Plaster <strong>${escapeHtml(accountType)}</strong> account has been approved. You're all set.</p>
  <p style="margin: 24px 0;">
    <a href="https://plasterthewall.com" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Open Plaster</a>
  </p>
  <p style="margin: 32px 0 0; color: #999; font-size: 12px;">— The Plaster team</p>
</div>
`.trim()
    } else {
      subject = `About your ${accountType} account request`
      textBody = `
Hi @${username},

Thanks for your interest in a Plaster ${accountType} account. After review, we weren't able to approve your request at this time.

If you think this was a mistake, feel free to reply to this email and share more context.

—
The Plaster team
`.trim()

      htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin: 0 0 16px; font-family: 'Playfair Display', Georgia, serif; font-weight: 700;">About your ${escapeHtml(accountType)} account request</h2>
  <p style="margin: 0 0 16px; color: #555;">Hi @${escapeHtml(username)},</p>
  <p style="margin: 0 0 16px;">Thanks for your interest in a Plaster <strong>${escapeHtml(accountType)}</strong> account. After review, we weren't able to approve your request at this time.</p>
  <p style="margin: 0 0 16px;">If you think this was a mistake, feel free to reply to this email and share more context.</p>
  <p style="margin: 32px 0 0; color: #999; font-size: 12px;">— The Plaster team</p>
</div>
`.trim()
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipientEmail],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[va-decision-alert] Resend failed:', res.status, errBody)
      return new Response(JSON.stringify({ error: 'send failed', status: res.status, body: errBody }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err: any) {
    console.error('[va-decision-alert] error:', err?.message ?? err)
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
