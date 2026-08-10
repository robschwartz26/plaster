// Side panel: capture actions + the live feed (status, thumbnails, erase).
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZXR3Z2RscHVsZ25qZXR1b3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODM3MTAsImV4cCI6MjA5MTY1OTcxMH0.JxW96nBhEHDMBbaTswau_XaZACPLTp9LgXggWQn-iAQ'

// ── venue picker: sets the fallback venue for captures ──────────────────────
async function initVenues() {
  const sel = document.getElementById('venue')
  const { endpoint, venueId, venueCache } = await chrome.storage.local.get(['endpoint', 'venueId', 'venueCache'])
  const origin = new URL(endpoint || 'https://lhetwgdlpulgnjetuope.supabase.co/functions/v1/x').origin
  const fill = (venues) => {
    for (const v of venues) {
      const o = document.createElement('option')
      o.value = v.id; o.textContent = 'venue: ' + v.name
      sel.appendChild(o)
    }
    if (venueId) { sel.value = venueId; sel.classList.toggle('set', !!sel.value) }
  }
  if (Array.isArray(venueCache) && venueCache.length) fill(venueCache)
  try {
    const res = await fetch(origin + '/rest/v1/venues?select=id,name&order=name.asc&limit=500', {
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
    })
    const venues = await res.json()
    if (Array.isArray(venues) && venues.length) {
      await chrome.storage.local.set({ venueCache: venues })
      const keep = sel.value
      while (sel.options.length > 1) sel.remove(1)
      fill(venues)
      if (keep) sel.value = keep
    }
  } catch { /* offline — cached list stands */ }
  sel.addEventListener('change', async () => {
    await chrome.storage.local.set({ venueId: sel.value || null })
    sel.classList.toggle('set', !!sel.value)
  })
}
const PILL = {
  working: 'reading…', saved: 'in review', duplicate: 'duplicate',
  orphaned: 'new venue', error: 'error', erased: 'erased',
}

async function renderStaged() {
  const { staged } = await chrome.storage.local.get('staged')
  const el = document.getElementById('staged')
  el.innerHTML = ''
  if (!staged) return
  const slot = document.createElement('div'); slot.className = 'slot'
  if (staged.thumb) { const img = document.createElement('img'); img.src = staged.thumb; slot.appendChild(img) }
  const t = document.createElement('div'); t.className = 't'
  const label = document.createElement('div'); label.className = 'label'; label.textContent = 'Poster pending'
  const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Now grab the info (⌘⇧S) — this image becomes the poster.'
  const rej = document.createElement('button'); rej.className = 'reject'; rej.textContent = 'Reject — pick another'
  rej.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'plaster-action', action: 'reject-staged' }))
  t.appendChild(label); t.appendChild(hint); t.appendChild(rej)
  slot.appendChild(t)
  el.appendChild(slot)
}

async function render() {
  const { log = [] } = await chrome.storage.local.get('log')
  const feed = document.getElementById('feed')
  feed.innerHTML = ''
  if (!log.length) { feed.innerHTML = '<div class="empty">Captures show up here</div>'; return }
  for (const r of log) {
    const card = document.createElement('div')
    card.className = 'card'
    if (r.thumb) {
      const img = document.createElement('img'); img.src = r.thumb; card.appendChild(img)
    } else {
      const ph = document.createElement('div'); ph.className = 'noimg'; card.appendChild(ph)
    }
    const body = document.createElement('div'); body.className = 'body'
    const pill = document.createElement('span')
    pill.className = 'pill p-' + (r.status || 'error')
    pill.textContent = PILL[r.status] || r.status
    body.appendChild(pill)
    if (r.event) { const n = document.createElement('div'); n.className = 'name'; n.textContent = r.event; body.appendChild(n) }
    if (r.reason) { const rs = document.createElement('div'); rs.className = 'reason'; rs.textContent = r.reason; body.appendChild(rs) }
    const meta = document.createElement('div'); meta.className = 'meta'
    try { meta.textContent = new URL(r.url).hostname + ' · ' + new Date(r.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { meta.textContent = new Date(r.at).toLocaleTimeString() }
    body.appendChild(meta)
    if (r.status === 'saved' && Array.isArray(r.eventIds) && r.eventIds.length) {
      const btn = document.createElement('button')
      btn.className = 'erase'
      btn.textContent = 'Erase from queue'
      btn.addEventListener('click', () => {
        btn.disabled = true; btn.textContent = 'Erasing…'
        chrome.runtime.sendMessage({ type: 'plaster-erase', eventIds: r.eventIds, logId: r.id })
      })
      body.appendChild(btn)
    }
    card.appendChild(body)
    feed.appendChild(card)
  }
}

function act(action) { chrome.runtime.sendMessage({ type: 'plaster-action', action }) }
document.getElementById('region').addEventListener('click', () => act('region'))
document.getElementById('poster').addEventListener('click', () => act('poster-region'))
document.getElementById('window').addEventListener('click', () => act('window'))
document.getElementById('sweep').addEventListener('click', () => act('sweep'))
document.getElementById('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage() })
document.getElementById('clear').addEventListener('click', async (e) => { e.preventDefault(); await chrome.storage.local.set({ log: [] }); render() })

render(); renderStaged(); initVenues()
chrome.storage.onChanged.addListener((c) => { if (c.log) render(); if (c.staged) renderStaged() })
