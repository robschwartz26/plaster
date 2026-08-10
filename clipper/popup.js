// Popup: action buttons + the recent-results log.
const LABELS = { saved: '✓ saved', duplicate: 'duplicate — already on the wall', orphaned: 'parked → New venues tab', error: '✗' }

async function renderLog() {
  const { log = [] } = await chrome.storage.local.get('log')
  const el = document.getElementById('log')
  el.innerHTML = ''
  for (const r of log) {
    const div = document.createElement('div')
    div.className = 'row'
    const s = document.createElement('span')
    s.className = 's-' + (r.status || 'error')
    s.textContent = LABELS[r.status] || r.status
    div.appendChild(s)
    if (r.event) div.appendChild(document.createTextNode(' — ' + r.event))
    if (r.reason) div.appendChild(document.createTextNode(' — ' + r.reason))
    const meta = document.createElement('div')
    meta.className = 'meta'
    try { meta.textContent = new URL(r.url).hostname + ' · ' + new Date(r.at).toLocaleTimeString() } catch { meta.textContent = new Date(r.at).toLocaleTimeString() }
    div.appendChild(meta)
    el.appendChild(div)
  }
}

function act(action) {
  chrome.runtime.sendMessage({ type: 'plaster-action', action }, () => {
    if (action !== 'sweep') window.close() // sweep: keep popup open, log updates live
  })
}

document.getElementById('region').addEventListener('click', () => act('region'))
document.getElementById('window').addEventListener('click', () => act('window'))
document.getElementById('sweep').addEventListener('click', () => act('sweep'))
document.getElementById('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage() })

renderLog()
chrome.storage.onChanged.addListener((changes) => { if (changes.log) renderLog() })
