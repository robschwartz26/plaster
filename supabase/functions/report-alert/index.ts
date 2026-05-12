// deno-lint-ignore-file no-explicit-any
//
// report-alert — sends an email notification to plasterpdx@gmail.com
// when a new content report is filed.
//
// Triggered by a DB webhook on content_reports INSERT (configured
// in Supabase dashboard, not code).
//
// Receives a webhook payload like:
//   {
//     type: 'INSERT',
//     table: 'content_reports',
//     schema: 'public',
//     record: { id, reporter_id, target_kind, target_id, target_user_id, reason, notes, status, created_at },
//     old_record: null
//   }
//
// Resolves reporter + target usernames from profiles, formats a
// human-readable email, posts to Resend.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const ALERT_EMAIL = 'plasterpdx@gmail.com'
const FROM_EMAIL = 'Plaster Alerts <onboarding@resend.dev>'

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  sexual_content: 'Sexual or inappropriate',
  violence: 'Violence or threats',
  self_harm: 'Self-harm or suicide',
  other: 'Other',
}

const KIND_LABELS: Record<string, string> = {
  profile: 'Profile',
  wall_post: 'Wall post',
  message: 'Message',
}

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record
    if (!record) {
      return new Response(
        JSON.stringify({ error: 'no record in payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')!

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve reporter + target usernames
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, username')
      .in('id', [record.reporter_id, record.target_user_id])

    const profMap = new Map<string, string>()
    for (const p of profiles ?? []) {
      profMap.set(p.id, p.username ?? '(no username)')
    }

    const reporterUsername = profMap.get(record.reporter_id) ?? '(unknown)'
    const targetUsername = profMap.get(record.target_user_id) ?? '(unknown)'

    // Optional content body for inline preview
    let contentBody = ''
    if (record.target_kind === 'wall_post') {
      const { data } = await adminClient
        .from('event_wall_posts')
        .select('body')
        .eq('id', record.target_id)
        .maybeSingle()
      contentBody = data?.body ?? '(no text body)'
    } else if (record.target_kind === 'message') {
      const { data } = await adminClient
        .from('messages')
        .select('body')
        .eq('id', record.target_id)
        .maybeSingle()
      contentBody = data?.body ?? '(no text body)'
    }

    const reasonLabel = REASON_LABELS[record.reason] ?? record.reason
    const kindLabel = KIND_LABELS[record.target_kind] ?? record.target_kind
    const submittedAt = new Date(record.created_at).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const subject = `[Plaster] New report: ${kindLabel} from @${targetUsername} — ${reasonLabel}`

    const textBody = `
A new content report was just filed on Plaster.

REPORTER       @${reporterUsername}
TARGET USER    @${targetUsername}
KIND           ${kindLabel}
REASON         ${reasonLabel}
SUBMITTED      ${submittedAt}

${record.notes ? `REPORTER NOTES\n${record.notes}\n` : ''}${contentBody ? `REPORTED CONTENT\n${contentBody}\n` : ''}
Review and act on this report:
https://the-plaster-wall.vercel.app/admin

—
This is an automated alert from Plaster moderation.
`.trim()

    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin: 0 0 16px; font-family: 'Playfair Display', Georgia, serif; font-weight: 700;">New Plaster report</h2>
  <p style="margin: 0 0 16px; color: #555;">A new content report was just filed.</p>

  <table style="border-collapse: collapse; width: 100%; margin-bottom: 16px;">
    <tr><td style="padding: 6px 0; color: #888; width: 140px;">Reporter</td><td>@${escapeHtml(reporterUsername)}</td></tr>
    <tr><td style="padding: 6px 0; color: #888;">Target user</td><td>@${escapeHtml(targetUsername)}</td></tr>
    <tr><td style="padding: 6px 0; color: #888;">Kind</td><td>${escapeHtml(kindLabel)}</td></tr>
    <tr><td style="padding: 6px 0; color: #888;">Reason</td><td><strong>${escapeHtml(reasonLabel)}</strong></td></tr>
    <tr><td style="padding: 6px 0; color: #888;">Submitted</td><td>${escapeHtml(submittedAt)}</td></tr>
  </table>

  ${record.notes ? `
  <div style="margin: 16px 0;">
    <div style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Reporter notes</div>
    <div style="padding: 10px 12px; background: #f6f4ef; border-radius: 6px; font-size: 14px;">${escapeHtml(record.notes)}</div>
  </div>` : ''}

  ${contentBody ? `
  <div style="margin: 16px 0;">
    <div style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Reported content</div>
    <div style="padding: 10px 12px; background: #f6f4ef; border-radius: 6px; font-size: 14px;">${escapeHtml(contentBody)}</div>
  </div>` : ''}

  <p style="margin: 24px 0 0;">
    <a href="https://the-plaster-wall.vercel.app/admin" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Review in admin dashboard</a>
  </p>

  <p style="margin: 32px 0 0; color: #999; font-size: 12px;">
    This is an automated alert from Plaster moderation.
  </p>
</div>
`.trim()

    const emailRes = await fetch('https://api.resend.com/emails', {
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

    if (!emailRes.ok) {
      const errBody = await emailRes.text()
      console.error('[report-alert] Resend send failed:', emailRes.status, errBody)
      return new Response(
        JSON.stringify({ error: 'email send failed', status: emailRes.status, body: errBody }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[report-alert] error', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: err?.message ?? 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
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
