import type { VercelRequest, VercelResponse } from '@vercel/node'
import { APP_STORE_URL, PLAY_STORE_URL, renderGetPage } from './_shared.js'

// GET /get  (rewritten to /api/get)
// Smart "get the app" redirect: sniff the User-Agent and send iOS → App Store,
// Android → Play Store, otherwise a desktop landing. While a store link is empty
// (apps not live yet) it degrades to the same graceful landing instead of a dead
// 302, so links are never broken.
export default function handler(req: VercelRequest, res: VercelResponse) {
  const ua = String(req.headers['user-agent'] ?? '')
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)

  const target = isIOS ? APP_STORE_URL : isAndroid ? PLAY_STORE_URL : ''

  if (target) {
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.redirect(302, target)
    return
  }

  // No store link yet (or desktop) → graceful landing / "coming soon".
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.status(200).send(renderGetPage())
}
