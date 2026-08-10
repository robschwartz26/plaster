// Side panel: capture actions + the live feed (status, thumbnails, erase).
const PILL = {
  working: 'reading…', saved: 'in review', duplicate: 'duplicate',
  orphaned: 'new venue', error: 'error', erased: 'erased',
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
document.getElementById('window').addEventListener('click', () => act('window'))
document.getElementById('sweep').addEventListener('click', () => act('sweep'))
document.getElementById('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage() })
document.getElementById('clear').addEventListener('click', async (e) => { e.preventDefault(); await chrome.storage.local.set({ log: [] }); render() })

render()
chrome.storage.onChanged.addListener((c) => { if (c.log) render() })
