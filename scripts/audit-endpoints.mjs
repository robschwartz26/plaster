#!/usr/bin/env node
/**
 * Plaster — Tier 1.5 endpoint audit (read-only probe; NO DB writes, NO AI).
 *
 * The JSON-LD audit (2026-06-10) showed Portland venue calendars are client-
 * rendered — so each page fetches its events as JSON from somewhere. This script
 * hunts those endpoints per venue:
 *   1. WordPress: /wp-json/ (is it WP?) + /wp-json/tribe/events/v1/events (The
 *      Events Calendar REST API — structured events if the plugin is active).
 *   2. Squarespace: events page + ?format=json (native collection JSON).
 *   3. Platform-embed sniff: grep the events page HTML for ticketing fingerprints
 *      (etix, dice.fm, eventbrite, ticketweb, seetickets, tixr, prekindle,
 *      showclix, squarespace) + any visible venue/organizer IDs in embed URLs.
 *
 * Usage: node scripts/audit-endpoints.mjs
 * Bot UA first; one retry with a browser UA on 403/404/network-fail (noted).
 */

const BOT_UA = 'PlasterBot/0.1 (+https://plasterthewall.com)'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const TIMEOUT_MS = 15000
const CONCURRENCY = 4

// Reused from the JSON-LD audit: site root + the events/calendar page we probed.
const VENUES = [
  { name: 'Mississippi Studios',   site: 'https://mississippistudios.com',     events: 'https://mississippistudios.com/calendar/' },
  { name: 'Revolution Hall',       site: 'https://www.revolutionhall.com',     events: 'https://www.revolutionhall.com/shows/' },
  { name: 'Aladdin Theater',       site: 'https://www.aladdin-theater.com',    events: 'https://www.aladdin-theater.com/events' },
  { name: 'Polaris Hall',          site: 'https://polarishall.com',            events: 'https://polarishall.com/events/' },
  { name: 'Alberta Rose Theatre',  site: 'https://albertarosetheatre.com',     events: 'https://albertarosetheatre.com/calendar/' },
  { name: 'Hawthorne Theatre',     site: 'https://www.hawthornetheatre.com',   events: 'https://www.hawthornetheatre.com/events/' },
  { name: 'Holocene',              site: 'https://holocene.org',               events: 'https://holocene.org/' },
  { name: 'Crystal Ballroom',      site: 'https://www.mcmenamins.com',         events: 'https://www.mcmenamins.com/crystal-ballroom' },
  { name: 'Wonder Ballroom',       site: 'https://wonderballroom.com',         events: 'https://wonderballroom.com/events/' },
  { name: 'Doug Fir Lounge',       site: 'https://www.dougfirlounge.com',      events: 'https://www.dougfirlounge.com/' },
  { name: "Portland'5",            site: 'https://www.portland5.com',          events: 'https://www.portland5.com/events' },
  { name: 'The Get Down',          site: 'https://thegetdownpdx.com',          events: 'https://thegetdownpdx.com/' },
  { name: 'Star Theater',          site: 'https://startheaterportland.com',    events: 'https://startheaterportland.com/' },
  { name: 'The Old Church',        site: 'https://www.theoldchurch.org',       events: 'https://www.theoldchurch.org/concerts' },
  { name: 'Jack London Revue',     site: 'https://jacklondonrevue.com',        events: 'https://jacklondonrevue.com/' },
  { name: 'Goodfoot',              site: 'https://thegoodfoot.com',            events: 'https://thegoodfoot.com/calendar' },
  { name: "Kelly's Olympian",      site: 'https://www.kellysolympian.com',     events: 'https://www.kellysolympian.com/' },
  { name: 'Turn Turn Turn',        site: 'https://turnturnturnpdx.com',        events: 'https://turnturnturnpdx.com/calendar' },
  { name: 'Alberta Street Pub',    site: 'https://www.albertastreetpub.com',   events: 'https://www.albertastreetpub.com/events' },
  { name: 'The Spare Room',        site: 'https://www.thespareroompdx.com',    events: 'https://www.thespareroompdx.com/events' },
  { name: 'The 1905',              site: 'https://www.the1905.org',            events: 'https://www.the1905.org/calendar' },
  { name: 'Showbar',               site: 'https://www.showbarpdx.com',         events: 'https://www.showbarpdx.com/' },
  { name: 'Secret Society',        site: 'https://www.secretsociety.net',      events: 'https://www.secretsociety.net/calendar' },
]

const PLATFORM_PATTERNS = {
  etix:        /https?:\/\/[^"'\s]*etix\.com[^"'\s]*/i,
  'dice.fm':   /https?:\/\/[^"'\s]*dice\.fm[^"'\s]*/i,
  eventbrite:  /https?:\/\/[^"'\s]*eventbrite\.[^"'\s]*/i,
  ticketweb:   /https?:\/\/[^"'\s]*ticketweb\.[^"'\s]*/i,
  seetickets:  /https?:\/\/[^"'\s]*seetickets\.[^"'\s]*/i,
  tixr:        /https?:\/\/[^"'\s]*tixr\.com[^"'\s]*/i,
  prekindle:   /https?:\/\/[^"'\s]*prekindle\.com[^"'\s]*/i,
  showclix:    /https?:\/\/[^"'\s]*showclix\.com[^"'\s]*/i,
  squarespace: /squarespace(?:\.com|-cdn)/i,
}

async function get(url, ua) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    return { status: res.status, text: await res.text().catch(() => '') }
  } catch {
    return { status: 0, text: '' }
  }
}

// Bot UA first; retry once with a browser UA on 403/404/network-fail. Notes which worked.
async function getWithRetry(url) {
  const first = await get(url, BOT_UA)
  if (first.status !== 0 && first.status !== 403 && first.status !== 404) {
    return { ...first, ua: 'bot' }
  }
  const second = await get(url, BROWSER_UA)
  return { ...second, ua: second.status ? 'browser' : 'none' }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function entities(s) {
  return String(s).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'").trim()
}

async function auditVenue(v) {
  // 1. WordPress + Tribe Events REST
  const wpRoot = await getWithRetry(`${v.site}/wp-json/`)
  const isWp = wpRoot.status === 200 && !!parseJson(wpRoot.text)
  const tribe = await getWithRetry(`${v.site}/wp-json/tribe/events/v1/events?per_page=5`)
  let tribeCount = null, tribeSample = ''
  if (tribe.status === 200) {
    const json = parseJson(tribe.text)
    const evs = json?.events
    if (Array.isArray(evs)) {
      tribeCount = json.total ?? evs.length
      if (evs[0]) tribeSample = `${entities(evs[0].title ?? '?').slice(0, 30)} @ ${(evs[0].start_date ?? '').slice(0, 10)}`
    }
  }

  // 2. Squarespace collection JSON
  const sq = await getWithRetry(`${v.events}${v.events.includes('?') ? '&' : '?'}format=json`)
  let sqResult = `HTTP ${sq.status}`
  if (sq.status === 200) {
    const json = parseJson(sq.text)
    const items = json?.upcoming ?? json?.items ?? json?.collection?.items
    if (Array.isArray(items)) sqResult = `YES · ${items.length} items`
    else if (json) sqResult = 'json, no items'
    else sqResult = 'not json'
  }

  // 3. Platform-embed sniff on the events page HTML
  const page = await getWithRetry(v.events)
  const platforms = []
  if (page.status === 200) {
    for (const [name, re] of Object.entries(PLATFORM_PATTERNS)) {
      const m = page.text.match(re)
      if (m) platforms.push(name === 'squarespace' ? name : `${name} (${String(m[0]).slice(0, 60)})`)
    }
  }

  // 4. Best candidate heuristic
  let best = '—'
  if (tribeCount !== null && tribeCount > 0) best = 'WP Tribe REST API'
  else if (sqResult.startsWith('YES')) best = 'Squarespace ?format=json'
  else if (platforms.some(p => p.startsWith('dice.fm'))) best = 'dice.fm embed/API'
  else if (platforms.some(p => p.startsWith('etix'))) best = 'etix links (detail-page scrape)'
  else if (platforms.some(p => p.startsWith('eventbrite'))) best = 'eventbrite API'
  else if (platforms.some(p => p.startsWith('ticketweb'))) best = 'ticketweb links'
  else if (platforms.some(p => p.startsWith('seetickets'))) best = 'seetickets links'
  else if (platforms.some(p => p.startsWith('tixr'))) best = 'tixr embed'
  else if (platforms.some(p => p.startsWith('prekindle'))) best = 'prekindle embed'
  else if (platforms.some(p => p.startsWith('showclix'))) best = 'showclix embed'
  else if (page.status !== 200) best = `unreachable (HTTP ${page.status})`

  return {
    venue: v.name,
    wp: isWp ? 'WP' : '—',
    tribe: tribe.status === 200 && tribeCount !== null
      ? `200 · ${tribeCount}${tribeSample ? ` · ${tribeSample}` : ''}`
      : `${tribe.status}${tribe.ua === 'browser' ? ' (browser UA)' : ''}`,
    squarespace: sqResult + (sq.ua === 'browser' ? ' (browser UA)' : ''),
    platforms: platforms.join('; ') || '—',
    best,
    pageUa: page.ua,
  }
}

// Limited-concurrency runner — polite to the venues, fast enough for 23 sites.
async function run() {
  const results = []
  let i = 0
  async function worker() {
    while (i < VENUES.length) {
      const v = VENUES[i++]
      process.stderr.write(`probing ${v.name}…\n`)
      results.push(await auditVenue(v))
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  results.sort((a, b) => a.venue.localeCompare(b.venue))

  const W = { venue: 22, wp: 4, tribe: 44, squarespace: 26, best: 30 }
  const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n)
  console.log('\n' + pad('VENUE', W.venue) + pad('WP', W.wp) + pad('TRIBE EVENTS API', W.tribe) + pad('SQUARESPACE JSON', W.squarespace) + pad('BEST CANDIDATE', W.best))
  console.log('─'.repeat(W.venue + W.wp + W.tribe + W.squarespace + W.best))
  for (const r of results) {
    console.log(pad(r.venue, W.venue) + pad(r.wp, W.wp) + pad(r.tribe, W.tribe) + pad(r.squarespace, W.squarespace) + pad(r.best, W.best))
    if (r.platforms !== '—') console.log(' '.repeat(W.venue) + `↳ platforms: ${r.platforms}`)
  }
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
