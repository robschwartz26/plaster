// deno-lint-ignore-file no-explicit-any
//
// push-notification — dispatches APNS pushes for new notification rows.
//
// Triggered by a DB webhook on notifications INSERT. Reads the notification
// row, queries device_tokens for the recipient's iOS tokens, signs an APNS
// JWT, and sends a push to each token.
//
// Notification kinds and how they map to push messages:
//   mention                  → "@<sender> mentioned you"
//   activity_like:rsvp       → "<sender> liked your attendance"
//   activity_like:wall_post  → "<sender> liked your wall post"
//   activity_like:venue_post → "<sender> liked your venue post"
//   warning                  → "An admin reviewed a report on your content"
//   reply                    → "@<sender> replied to your post"
//   follow                   → "@<sender> followed you"
//   message                  → "@<sender> sent you a message"
//   show_reminder            → "Show today: <title> at <venue>, <time>"

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.1/mod.ts'

const APNS_PROD    = 'https://api.push.apple.com'
const APNS_SANDBOX = 'https://api.development.push.apple.com'

interface NotificationRow {
  id: string
  recipient_id: string
  sender_id: string | null
  kind: string
  body_preview: string | null
  source_id: string | null
  target_event_id?: string | null
  created_at: string
}

interface DeviceToken {
  token: string
  platform: string
}

async function makeApnsJwt(keyId: string, teamId: string, privateKeyPem: string): Promise<string> {
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  return await create(
    { alg: 'ES256', kid: keyId, typ: 'JWT' },
    { iss: teamId, iat: getNumericDate(0) },
    cryptoKey,
  )
}

function buildPushBody(notif: NotificationRow, senderUsername: string | null): { title: string; body: string } {
  const sender = senderUsername ? `@${senderUsername}` : 'Someone'

  switch (notif.kind) {
    case 'mention':
      return { title: 'New mention', body: `${sender} mentioned you${notif.body_preview ? `: ${notif.body_preview}` : ''}` }
    case 'activity_like:wall_post':
      return { title: 'Plaster', body: `${sender} liked your wall post` }
    case 'activity_like:rsvp':
      return { title: 'Plaster', body: `${sender} likes that you're going` }
    case 'activity_like:venue_post':
      return { title: 'Plaster', body: `${sender} liked your venue post` }
    case 'warning':
      return { title: 'Notice from Plaster', body: notif.body_preview ?? 'Your content was reviewed.' }
    case 'reply':
      return { title: 'New reply', body: `${sender} replied${notif.body_preview ? `: ${notif.body_preview}` : ''}` }
    case 'follow':
      return { title: 'New follower', body: `${sender} followed you` }
    case 'message':
      return { title: sender, body: notif.body_preview ?? 'sent you a message' }
    case 'show_reminder':
      return { title: 'Show today', body: notif.body_preview ?? 'You have a show today' }
    default:
      return { title: 'Plaster', body: notif.body_preview ?? 'You have a new notification' }
  }
}

serve(async (req) => {
  try {
    const payload = await req.json()
    const record: NotificationRow = payload.record
    if (!record) {
      return new Response(JSON.stringify({ error: 'no record in payload' }), { status: 400 })
    }

    // Skip self-notifications
    if (record.sender_id === record.recipient_id) {
      return new Response(JSON.stringify({ skipped: 'self-notification' }), { status: 200 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const apnsKeyId   = Deno.env.get('APNS_KEY_ID')!
    const apnsTeamId  = Deno.env.get('APNS_TEAM_ID')!
    const apnsBundleId   = Deno.env.get('APNS_BUNDLE_ID')!
    const apnsPrivateKey = Deno.env.get('APNS_PRIVATE_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Fetch iOS device tokens for the recipient
    const { data: tokens, error: tokenError } = await admin
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', record.recipient_id)
      .eq('platform', 'ios')

    if (tokenError) {
      console.error('[push] device_tokens query failed:', tokenError)
      return new Response(JSON.stringify({ error: 'device_tokens query failed' }), { status: 500 })
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no device tokens' }), { status: 200 })
    }

    // Fetch sender username for human-readable push body
    let senderUsername: string | null = null
    if (record.sender_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('username')
        .eq('id', record.sender_id)
        .maybeSingle()
      senderUsername = profile?.username ?? null
    }

    const { title, body } = buildPushBody(record, senderUsername)

    const apnsPayload = {
      aps: {
        alert: { title, body },
        sound: 'default',
        badge: 1,
      },
      // Custom data for in-app navigation on tap
      notification_id: record.id,
      kind: record.kind,
      source_id: record.source_id,
      target_event_id: record.target_event_id,
    }

    const jwt = await makeApnsJwt(apnsKeyId, apnsTeamId, apnsPrivateKey)

    const sendToApns = async (host: string, deviceToken: string): Promise<{ status: number; body: string }> => {
      const res = await fetch(`${host}/3/device/${deviceToken}`, {
        method: 'POST',
        headers: {
          'authorization': `bearer ${jwt}`,
          'apns-topic': apnsBundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        },
        body: JSON.stringify(apnsPayload),
      })
      const body = res.status !== 200 ? await res.text() : ''
      return { status: res.status, body }
    }

    const results: any[] = []
    for (const t of tokens as DeviceToken[]) {
      const short = t.token.slice(0, 8) + '...'

      // Try production first
      let { status, body: errBody } = await sendToApns(APNS_PROD, t.token)
      console.log(`[push] prod → ${short}: ${status}${errBody ? ' ' + errBody : ''}`)

      // BadDeviceToken on prod means this is a sandbox token — retry on sandbox
      if (status === 400 && errBody.includes('BadDeviceToken')) {
        console.log(`[push] BadDeviceToken on prod, retrying sandbox → ${short}`)
        ;({ status, body: errBody } = await sendToApns(APNS_SANDBOX, t.token))
        console.log(`[push] sandbox → ${short}: ${status}${errBody ? ' ' + errBody : ''}`)
      }

      if (status !== 200) {
        console.error(`[push] final failure ${status} for ${short}: ${errBody}`)
        // 410 = token permanently invalid on both endpoints — clean it up
        if (status === 410) {
          await admin.from('device_tokens').delete().eq('token', t.token)
          console.log(`[push] removed expired token ${short}`)
        }
      }

      results.push({ token: short, status, error: errBody || null })
    }

    return new Response(JSON.stringify({ ok: true, results }), { status: 200 })
  } catch (err: any) {
    console.error('[push] error:', err?.message ?? err)
    return new Response(JSON.stringify({ error: err?.message ?? 'unknown' }), { status: 500 })
  }
})
