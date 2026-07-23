// Canonical public share URL for a show — the crawlable, unfurlable link that the
// /e/:id serverless page renders (see /api/event.ts). Phase 1: this helper exists
// for later in-app share buttons; nothing wires it into the UI yet.

const SITE_URL = 'https://plasterthewall.com'

/** https://plasterthewall.com/e/<event id> */
export function shareUrl(event: { id: string }): string {
  return `${SITE_URL}/e/${event.id}`
}

/** The smart "get the app" redirect URL (User-Agent → App Store / Play / landing). */
export function getAppUrl(): string {
  return `${SITE_URL}/get`
}
