// Plaster Clipper — service worker.
// Screenshot-only by design: Rob navigates and judges; this packages what he's
// looking at and ships it to the Plaster ingest function (Claude Vision reads
// the image; the pipeline dedupes, matches venues, and lands it in Review).
// No scraping, no Firecrawl, no page parsing.

const DEFAULT_ENDPOINT = 'https://lhetwgdlpulgnjetuope.supabase.co/functions/v1/firecrawl-ingest'
// Public client key (the same one shipped in the Plaster web app) — needed only
// to pass Supabase's edge relay; all real auth is the x-clipper-token below.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZXR3Z2RscHVsZ25qZXR1b3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODM3MTAsImV4cCI6MjA5MTY1OTcxMH0.JxW96nBhEHDMBbaTswau_XaZACPLTp9LgXggWQn-iAQ'

// ── settings ────────────────────────────────────────────────────────────────
async function getSettings() {
  const s = await chrome.storage.local.get(['token', 'endpoint'])
  return { token: s.token || '', endpoint: s.endpoint || DEFAULT_ENDPOINT }
}

// ── badge feedback ──────────────────────────────────────────────────────────
function badge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color })
  chrome.action.setBadgeText({ text })
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000)
}
const BADGE = {
  busy: () => badge('…', '#666666'),
  saved: () => badge('✓', '#16a34a'),
  duplicate: () => badge('DUP', '#b45309'),
  orphaned: () => badge('NEW', '#7c3aed'), // parked under a new venue — check New venues tab
  error: () => badge('ERR', '#dc2626'),
}

// ── result log (popup reads this) ───────────────────────────────────────────
async function logResult(entry) {
  const { log = [] } = await chrome.storage.local.get('log')
  log.unshift({ ...entry, at: Date.now() })
  await chrome.storage.local.set({ log: log.slice(0, 25) })
}

// ── base64 helper (service workers have no FileReader) ──────────────────────
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// ── ship a capture to the ingest function ───────────────────────────────────
async function ingest({ imageBase64, mimeType, tab }) {
  const { token, endpoint } = await getSettings()
  if (!token) {
    BADGE.error()
    await logResult({ status: 'error', reason: 'No token set — open the extension Options page', url: tab?.url })
    return
  }
  BADGE.busy()
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-clipper-token': token, 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
      body: JSON.stringify({
        clipper: {
          url: tab?.url || '',
          title: tab?.title || '',
          image_base64: imageBase64,
          mimeType: mimeType || 'image/png',
        },
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      BADGE.error()
      await logResult({ status: 'error', reason: json.error || json.reason || `HTTP ${res.status}`, url: tab?.url })
      return
    }
    ;(BADGE[json.status] || BADGE.error)()
    await logResult({ status: json.status, event: json.event_name, reason: json.reason, url: tab?.url })
  } catch (e) {
    BADGE.error()
    await logResult({ status: 'error', reason: String(e).slice(0, 120), url: tab?.url })
  }
}

// ── capture: whole visible page ─────────────────────────────────────────────
async function windowGrab(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    const base64 = dataUrl.split(',')[1]
    await ingest({ imageBase64: base64, mimeType: 'image/png', tab })
  } catch (e) {
    BADGE.error()
    await logResult({ status: 'error', reason: 'capture failed: ' + String(e).slice(0, 100), url: tab?.url })
  }
}

// ── capture: region (inject the crosshair overlay, then crop) ───────────────
async function regionGrab(tab) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['select.js'] })
  } catch (e) {
    BADGE.error()
    await logResult({ status: 'error', reason: 'cannot select on this page (browser-internal pages are off-limits)', url: tab?.url })
  }
}

// select.js reports the drag rectangle here
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'plaster-region') return
  ;(async () => {
    const tab = sender.tab
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
      const blob = await (await fetch(dataUrl)).blob()
      const bmp = await createImageBitmap(blob)
      const { rect, dpr } = msg
      const sx = Math.max(0, Math.round(rect.x * dpr))
      const sy = Math.max(0, Math.round(rect.y * dpr))
      const sw = Math.min(bmp.width - sx, Math.round(rect.w * dpr))
      const sh = Math.min(bmp.height - sy, Math.round(rect.h * dpr))
      if (sw < 20 || sh < 20) { BADGE.error(); await logResult({ status: 'error', reason: 'selection too small', url: tab?.url }); return }
      const canvas = new OffscreenCanvas(sw, sh)
      canvas.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh)
      const out = await canvas.convertToBlob({ type: 'image/png' })
      const base64 = bufToBase64(await out.arrayBuffer())
      await ingest({ imageBase64: base64, mimeType: 'image/png', tab })
    } catch (e) {
      BADGE.error()
      await logResult({ status: 'error', reason: 'region capture failed: ' + String(e).slice(0, 100), url: tab?.url })
    }
  })()
})

// ── hotkeys ─────────────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  if (command === 'region-grab') regionGrab(tab)
  if (command === 'window-grab') windowGrab(tab)
})

// ── right-click an image → send that exact image ────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'plaster-image',
    title: 'Send image to Plaster',
    contexts: ['image'],
  })
})
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'plaster-image' || !info.srcUrl) return
  BADGE.busy()
  try {
    const res = await fetch(info.srcUrl)
    const blob = await res.blob()
    if (blob.size > 6 * 1024 * 1024) { BADGE.error(); await logResult({ status: 'error', reason: 'image too large (>6MB)', url: tab?.url }); return }
    const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png'
    const base64 = bufToBase64(await blob.arrayBuffer())
    await ingest({ imageBase64: base64, mimeType: mime, tab })
  } catch (e) {
    BADGE.error()
    await logResult({ status: 'error', reason: 'image fetch failed: ' + String(e).slice(0, 100), url: tab?.url })
  }
})

// ── popup asks for actions ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'plaster-action') {
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (msg.action === 'region') await regionGrab(tab)
      if (msg.action === 'window') await windowGrab(tab)
      if (msg.action === 'sweep') await sweepTabs(tab.windowId)
      sendResponse({ ok: true })
    })()
    return true // async response
  }
})

// ── sweep: flip through every tab in the window, window-grab each ───────────
async function sweepTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId })
  const targets = tabs.filter(t => t.url && /^https?:\/\//.test(t.url))
  for (const t of targets) {
    await chrome.tabs.update(t.id, { active: true })
    await new Promise(r => setTimeout(r, 800)) // let it paint
    await windowGrab(t)
    await new Promise(r => setTimeout(r, 400))
  }
}
