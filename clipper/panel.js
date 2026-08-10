// Side panel: venue picker, staged-poster slot, expandable capture feed.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZXR3Z2RscHVsZ25qZXR1b3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODM3MTAsImV4cCI6MjA5MTY1OTcxMH0.JxW96nBhEHDMBbaTswau_XaZACPLTp9LgXggWQn-iAQ'

const PILL = {
  working: 'reading…', saved: 'in review', duplicate: 'duplicate',
  orphaned: 'new venue', error: 'error', erased: 'erased',
}
const openCards = new Set() // expanded log ids (survives re-renders)

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

// ── staged poster slot ──────────────────────────────────────────────────────
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

// ── feed ────────────────────────────────────────────────────────────────────
async function removeLogEntry(id) {
  const { log = [] } = await chrome.storage.local.get('log')
  await chrome.storage.local.set({ log: log.filter(r => r.id !== id) })
}

async function render() {
  const { log = [] } = await chrome.storage.local.get('log')
  const feed = document.getElementById('feed')
  feed.innerHTML = ''
  if (!log.length) { feed.innerHTML = '<div class="empty">Captures show up here</div>'; return }
  for (const r of log) {
    const card = document.createElement('div')
    card.className = 'card' + (openCards.has(r.id) ? ' open' : '')

    const head = document.createElement('div'); head.className = 'head'
    if (r.thumb) { const img = document.createElement('img'); img.className = 'thumb'; img.src = r.thumb; head.appendChild(img) }
    else { const ph = document.createElement('div'); ph.className = 'noimg'; head.appendChild(ph) }
    const body = document.createElement('div'); body.className = 'body'
    const pill = document.createElement('span')
    pill.className = 'pill p-' + (r.status || 'error')
    pill.textContent = PILL[r.status] || r.status
    body.appendChild(pill)
    const title = r.event || r.preview?.title
    if (title) { const n = document.createElement('div'); n.className = 'name'; n.textContent = title; body.appendChild(n) }
    if (r.reason) { const rs = document.createElement('div'); rs.className = 'reason'; rs.textContent = r.reason; body.appendChild(rs) }
    const meta = document.createElement('div'); meta.className = 'meta'
    try { meta.textContent = new URL(r.url).hostname + ' · ' + new Date(r.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { meta.textContent = new Date(r.at).toLocaleTimeString() }
    body.appendChild(meta)
    head.appendChild(body)

    // per-card dismiss (removes from this list only — touches nothing remote)
    const x = document.createElement('button'); x.className = 'dismiss'; x.textContent = '✕'; x.title = 'Remove from list'
    x.addEventListener('click', (e) => { e.stopPropagation(); openCards.delete(r.id); removeLogEntry(r.id) })
    head.appendChild(x)

    head.addEventListener('click', () => {
      if (openCards.has(r.id)) openCards.delete(r.id); else openCards.add(r.id)
      card.classList.toggle('open')
    })
    card.appendChild(head)

    // expandable detail: the composed blurb + fields
    const detail = document.createElement('div'); detail.className = 'detail'
    const p = r.preview
    if (p) {
      const add = (label, val) => {
        if (!val) return
        const f = document.createElement('div'); f.className = 'field'; f.textContent = label
        const v = document.createElement('div'); v.textContent = val
        detail.appendChild(f); detail.appendChild(v)
      }
      add('When', [p.date, p.time].filter(Boolean).join(' · '))
      add('Venue', p.venue)
      add('Category', p.category + (p.sold_out ? ' · SOLD OUT' : ''))
      add('Info blurb', p.description)
    } else {
      const none = document.createElement('div'); none.textContent = 'No preview available for this capture.'
      detail.appendChild(none)
    }
    const row = document.createElement('div'); row.className = 'btnrow'
    if (r.status === 'duplicate' && r.retryPayload) {
      const force = document.createElement('button'); force.className = 'mini go'; force.textContent = 'Send to Review anyway'
      force.addEventListener('click', () => {
        force.disabled = true; force.textContent = 'Sending…'
        chrome.runtime.sendMessage({ type: 'plaster-force', logId: r.id })
      })
      row.appendChild(force)
    }
    if (r.status === 'saved' && Array.isArray(r.eventIds) && r.eventIds.length) {
      const btn = document.createElement('button'); btn.className = 'mini warn'; btn.textContent = 'Erase from queue'
      btn.addEventListener('click', () => {
        btn.disabled = true; btn.textContent = 'Erasing…'
        chrome.runtime.sendMessage({ type: 'plaster-erase', eventIds: r.eventIds, logId: r.id })
      })
      row.appendChild(btn)
    }
    if (row.children.length) detail.appendChild(row)
    card.appendChild(detail)

    feed.appendChild(card)
  }
}

function act(action) { chrome.runtime.sendMessage({ type: 'plaster-action', action }) }
document.getElementById('poster').addEventListener('click', () => act('poster-region'))
document.getElementById('sweep').addEventListener('click', (e) => { e.preventDefault(); act('sweep') })
document.getElementById('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage() })
document.getElementById('clear').addEventListener('click', async (e) => { e.preventDefault(); openCards.clear(); await chrome.storage.local.set({ log: [] }); render() })
document.getElementById('info-btn').addEventListener('click', () => document.getElementById('cheat').classList.toggle('open'))

render(); renderStaged(); initVenues()
chrome.storage.onChanged.addListener((c) => { if (c.log) render(); if (c.staged) renderStaged() })
