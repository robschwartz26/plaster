const DEFAULT_ENDPOINT = 'https://lhetwgdlpulgnjetuope.supabase.co/functions/v1/firecrawl-ingest'

async function load() {
  const s = await chrome.storage.local.get(['token', 'endpoint'])
  document.getElementById('token').value = s.token || ''
  document.getElementById('endpoint').value = s.endpoint || DEFAULT_ENDPOINT
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    token: document.getElementById('token').value.trim(),
    endpoint: document.getElementById('endpoint').value.trim() || DEFAULT_ENDPOINT,
  })
  const msg = document.getElementById('msg')
  msg.textContent = 'Saved ✓'
  setTimeout(() => { msg.textContent = '' }, 2500)
})

load()
