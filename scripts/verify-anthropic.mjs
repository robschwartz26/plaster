// Verify the live Anthropic-backed edge function works with the current
// ANTHROPIC_API_KEY Supabase secret. Runs against PRODUCTION.
//
// Usage (in YOUR terminal): just run it and answer the two prompts —
//   cd ~/plaster && node scripts/verify-anthropic.mjs
// (No password on the command line, so no zsh "!" / history-expansion issues,
//  and nothing lands in shell history.) Env vars PLASTER_EMAIL / PLASTER_PASSWORD
// still work too if you prefer.
//
// It signs in as an admin/ingester user (required by the function's gate),
// posts a 1x1 test image to extract-schedule (which calls Claude), and prints
// PASS/FAIL. It never prints your password, token, or any API key.

import { readFileSync } from 'node:fs'
import readline from 'node:readline'

function ask(prompt, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => { if (!rl.muted) rl.output.write(s) }
    rl.question(prompt, (answer) => { if (rl.muted) rl.output.write('\n'); rl.close(); resolve(answer.trim()) })
    if (hidden) rl.muted = true
  })
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const email = process.env.PLASTER_EMAIL || await ask('Admin email: ')
const password = process.env.PLASTER_PASSWORD || await ask('Password (hidden): ', { hidden: true })

if (!email || !password) {
  console.error('Email and password are required. Nothing printed.')
  process.exit(2)
}

// 1x1 transparent PNG
const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const signin = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
if (!signin.ok) { console.error(`❌ Sign-in failed (HTTP ${signin.status}). Check the email/password.`); process.exit(1) }
const { access_token } = await signin.json()
if (!access_token) { console.error('❌ Sign-in returned no session.'); process.exit(1) }

const res = await fetch(`${URL_}/functions/v1/extract-schedule`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: { base64: PNG_1x1, mimeType: 'image/png' }, today: '2026-07-24' }),
})
const text = await res.text()

console.log(`\nedge function HTTP ${res.status}`)
if (res.ok) {
  console.log('✅ PASS — extract-schedule reached Claude and returned successfully.')
  console.log('   (An empty/near-empty schedule is expected for a blank test image.)')
  console.log('   response (first 300 chars):', text.slice(0, 300))
} else if (/authentication_error|invalid x-api-key|401[^0-9]*anthropic|Anthropic API error 401/i.test(text)) {
  console.log('❌ FAIL — the ANTHROPIC_API_KEY secret is rejected by Anthropic. Re-set the secret.')
  console.log('   detail:', text.slice(0, 300))
} else if (/Could not process image|invalid_request_error/i.test(text)) {
  console.log('✅ PASS (key OK) — Anthropic AUTHENTICATED the request and returned a request_id;')
  console.log('   it only rejected the blank 1x1 test image (invalid_request_error, not an auth error).')
  console.log('   A bad key would return 401 authentication_error. It did not.')
  console.log('   detail:', text.slice(0, 300))
} else if (res.status === 401 || res.status === 403) {
  console.log('⚠️  Auth/role gate rejected this account (needs is_admin or is_ingester). Key not tested.')
  console.log('   detail:', text.slice(0, 200))
} else {
  console.log('⚠️  Non-auth error — inspect below (not necessarily a key problem).')
  console.log('   detail:', text.slice(0, 400))
}
