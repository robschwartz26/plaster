import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchPublishedEvent, renderEventPage, renderGenericPage } from './_shared.js'

// GET /e/:id  (rewritten to /api/event?id=:id)
// Server-rendered public share page for a single PUBLISHED show. Missing/
// unpublished/bogus ids fall back to a graceful generic page — no error, no leak.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.id
  const id = Array.isArray(raw) ? raw[0] : (raw ?? '')

  const event = id ? await fetchPublishedEvent(id) : null
  const html = event ? renderEventPage(event) : renderGenericPage()

  // Short shared cache so unfurls/crawlers are fast but updates propagate.
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  res.status(200).send(html)
}
