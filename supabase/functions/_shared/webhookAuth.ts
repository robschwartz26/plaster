// Shared caller-auth for DB-webhook-triggered functions.
//
// These functions trust `payload.record` verbatim and act with the service
// role (send pushes, email private content, look up any user). The Supabase
// gateway only checks that SOME valid JWT is present — the ANON key (public,
// shipped in the client bundle) passes it. So without this, anyone could
// forge a payload and drive these functions.
//
// Auth = a shared WEBHOOK_SECRET we control on both ends: set as a function
// secret (Deno env) AND sent by the DB triggers in an `x-webhook-secret`
// header. Not derivable from anything public. (The runtime-injected
// SUPABASE_SERVICE_ROLE_KEY is NOT usable for this — on projects migrated to
// the new API-key system it differs from the legacy JWT the old triggers
// still send — so we don't depend on it.)

// Constant-time string compare — avoids leaking length/prefix via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Returns a 401 Response if the caller didn't present the webhook secret,
// or null if authorized. Usage:
//   const denied = requireWebhookSecret(req); if (denied) return denied
export function requireWebhookSecret(req: Request): Response | null {
  const secret = Deno.env.get('WEBHOOK_SECRET') ?? ''
  const given = (req.headers.get('x-webhook-secret') ?? '').trim()
  if (secret && given && timingSafeEqual(given, secret)) return null
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Back-compat alias — the functions import this name.
export const requireServiceRole = requireWebhookSecret
