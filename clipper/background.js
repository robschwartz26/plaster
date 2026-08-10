// Plaster Clipper — service worker.
// Screenshot-only by design: Rob navigates and judges; this packages what he's
// looking at and ships it to the Plaster ingest function (Claude Vision reads
// the image; the pipeline dedupes, matches venues, and lands it in Review).
//
// Two-step clip: stage the POSTER first (right-click an image, or ⌘⇧P region),
// then capture the INFO (⌘⇧S region / ⌘⇧K page). The staged image becomes the
// event's poster; the info capture is only read for fields. Ingest clears the
// stage for the next event.

const DEFAULT_ENDPOINT = 'https://lhetwgdlpulgnjetuope.supabase.co/functions/v1/firecrawl-ingest'
// Public client key (the same one shipped in the Plaster web app) — needed only
// to pass Supabase's edge relay; all real auth is the x-clipper-token below.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZXR3Z2RscHVsZ25qZXR1b3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODM3MTAsImV4cCI6MjA5MTY1OTcxMH0.JxW96nBhEHDMBbaTswau_XaZACPLTp9LgXggWQn-iAQ'

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
  chrome.contextMenus.create({ id: 'plaster-stage', title: 'Stage as Plaster poster', contexts: ['image'] })
})

async function getSettings() {
  const s = await chrome.storage.local.get(['token', 'endpoint'])
  return { token: s.token || '', endpoint: s.endpoint || DEFAULT_ENDPOINT }
}

// ── badge ───────────────────────────────────────────────────────────────────
function badge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color })
  chrome.action.setBadgeText({ text })
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000)
}
const BADGE = {
  busy: () => badge('…', '#666666'),
  staged: () => badge('P', '#A855F7'),
  saved: () => badge('✓', '#16a34a'),
  duplicate: () => badge('DUP', '#b45309'),
  orphaned: () => badge('NEW', '#7c3aed'),
  error: () => badge('ERR', '#dc2626'),
}

// ── in-page toast ───────────────────────────────────────────────────────────
async function toast(tabId, text, ok) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [text, !!ok],
      func: (t, good) => {
        const el = document.createElement('div')
        el.textContent = t
        Object.assign(el.style, {
          position: 'fixed', top: '18px', right: '18px', zIndex: 2147483647,
          background: good ? '#16a34a' : '#dc2626', color: '#fff',
          padding: '10px 16px', borderRadius: '10px',
          font: '600 13px "Space Grotesk", system-ui, sans-serif',
          boxShadow: '0 6px 24px rgba(0,0,0,0.35)', transition: 'opacity 300ms',
        })
        if (t.startsWith('📌')) el.style.background = '#A855F7'
        document.documentElement.appendChild(el)
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350) }, 3200)
      },
    })
  } catch { /* injection-blocked page — panel still shows it */ }
}

// ── capture log ─────────────────────────────────────────────────────────────
async function logResult(entry) {
  const { log = [] } = await chrome.storage.local.get('log')
  log.unshift({ id: crypto.randomUUID(), at: Date.now(), ...entry })
  await chrome.storage.local.set({ log: log.slice(0, 40) })
}
async function updateLog(id, patch) {
  const { log = [] } = await chrome.storage.local.get('log')
  const i = log.findIndex(r => r.id === id)
  if (i >= 0) { log[i] = { ...log[i], ...patch }; await chrome.storage.local.set({ log }) }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}
async function thumbFromBitmap(bmp) {
  try {
    const w = 120, h = Math.max(1, Math.round((bmp.height / bmp.width) * 120))
    const c = new OffscreenCanvas(w, h)
    c.getContext('2d').drawImage(bmp, 0, 0, w, h)
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.6 })
    return 'data:image/jpeg;base64,' + bufToBase64(await blob.arrayBuffer())
  } catch { return null }
}

// ── staging (poster pending) ────────────────────────────────────────────────
async function stagePoster({ base64, mime, thumb, fromUrl, tabId }) {
  await chrome.storage.local.set({ staged: { b64: base64, mime, thumb, fromUrl, at: Date.now() } })
  BADGE.staged()
  if (tabId) toast(tabId, '📌 Poster staged — now grab the info (⌘⇧S)', true)
}

// ── ship a capture (uses the staged poster when present) ────────────────────
async function ingest({ imageBase64, mimeType, tab, thumb }) {
  const { token, endpoint } = await getSettings()
  if (!token) {
    BADGE.error()
    await logResult({ status: 'error', reason: 'No token set — open Options', url: tab?.url })
    return
  }
  const { staged } = await chrome.storage.local.get('staged')
  BADGE.busy()
  await logResult({ id: 'pending-marker', status: 'working', reason: 'Claude is reading the capture…', url: tab?.url, thumb: staged?.thumb ?? thumb })
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-clipper-token': token, 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
      body: JSON.stringify({
        clipper: {
          url: tab?.url || '', title: tab?.title || '',
          image_base64: imageBase64, mimeType: mimeType || 'image/png',
          ...(staged ? { poster_base64: staged.b64, poster_mime: staged.mime } : {}),
        },
      }),
    })
    const json = await res.json().catch(() => ({}))
    const { log = [] } = await chrome.storage.local.get('log')
    await chrome.storage.local.set({ log: log.filter(r => r.id !== 'pending-marker') })
    if (!res.ok) {
      BADGE.error()
      await logResult({ status: 'error', reason: json.error || json.reason || `HTTP ${res.status}`, url: tab?.url, thumb: staged?.thumb ?? thumb })
      if (tab?.id) toast(tab.id, '✗ Plaster: ' + (json.reason || json.error || 'failed'), false)
      return
    }
    ;(BADGE[json.status] || BADGE.error)()
    await logResult({ status: json.status, event: json.event_name, reason: json.reason, url: tab?.url, thumb: staged?.thumb ?? thumb, eventIds: json.event_ids || [] })
    if (json.status === 'saved' || json.status === 'orphaned' || json.status === 'duplicate') {
      await chrome.storage.local.remove('staged') // stage consumed — ready for the next event
    }
    if (tab?.id) {
      const msg = json.status === 'saved' ? `✓ Saved to Review — ${json.event_name ?? 'event'}`
        : json.status === 'duplicate' ? `Already on the wall — ${json.event_name ?? 'event'}`
        : json.status === 'orphaned' ? `Saved — new venue parked for approval`
        : `✗ ${json.reason ?? 'failed'}`
      toast(tab.id, msg, json.status === 'saved' || json.status === 'orphaned')
    }
  } catch (e) {
    const { log = [] } = await chrome.storage.local.get('log')
    await chrome.storage.local.set({ log: log.filter(r => r.id !== 'pending-marker') })
    BADGE.error()
    await logResult({ status: 'error', reason: String(e).slice(0, 120), url: tab?.url, thumb })
  }
}

// ── captures ────────────────────────────────────────────────────────────────
async function windowGrab(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    const blob = await (await fetch(dataUrl)).blob()
    const bmp = await createImageBitmap(blob)
    const thumb = await thumbFromBitmap(bmp)
    await ingest({ imageBase64: dataUrl.split(',')[1], mimeType: 'image/png', tab, thumb })
  } catch (e) {
    BADGE.error()
    await logResult({ status: 'error', reason: 'capture failed: ' + String(e).slice(0, 100), url: tab?.url })
  }
}

// region select, two modes: 'info' (ingest) | 'poster' (stage)
async function startRegion(tab, mode) {
  await chrome.storage.session.set({ regionMode: mode })
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['select.js'] })
  } catch {
    BADGE.error()
    await logResult({ status: 'error', reason: 'cannot select on this page (browser-internal pages are off-limits)', url: tab?.url })
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'plaster-region') {
    ;(async () => {
      const tab = sender.tab
      const { regionMode = 'info' } = await chrome.storage.session.get('regionMode')
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
        const cropBmp = await createImageBitmap(out)
        const thumb = await thumbFromBitmap(cropBmp)
        const base64 = bufToBase64(await out.arrayBuffer())
        if (regionMode === 'poster') {
          await stagePoster({ base64, mime: 'image/png', thumb, fromUrl: tab?.url, tabId: tab?.id })
        } else {
          await ingest({ imageBase64: base64, mimeType: 'image/png', tab, thumb })
        }
      } catch (e) {
        BADGE.error()
        await logResult({ status: 'error', reason: 'region capture failed: ' + String(e).slice(0, 100), url: tab?.url })
      }
    })()
    return
  }

  if (msg?.type === 'plaster-action') {
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (msg.action === 'region') await startRegion(tab, 'info')
      if (msg.action === 'poster-region') await startRegion(tab, 'poster')
      if (msg.action === 'window') await windowGrab(tab)
      if (msg.action === 'sweep') await sweepTabs(tab.windowId)
      if (msg.action === 'reject-staged') { await chrome.storage.local.remove('staged'); chrome.action.setBadgeText({ text: '' }) }
      sendResponse({ ok: true })
    })()
    return true
  }

  if (msg?.type === 'plaster-erase') {
    ;(async () => {
      const { token, endpoint } = await getSettings()
      let deleted = 0
      try {
        for (const id of msg.eventIds || []) {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-clipper-token': token, 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
            body: JSON.stringify({ clipper_delete: { event_id: id } }),
          })
          const j = await res.json().catch(() => ({}))
          deleted += j.deleted ?? 0
        }
        await updateLog(msg.logId, { status: 'erased', reason: deleted ? undefined : 'already gone (approved or removed)' })
      } catch (e) {
        await updateLog(msg.logId, { reason: 'erase failed: ' + String(e).slice(0, 80) })
      }
      sendResponse({ deleted })
    })()
    return true
  }
})

// ── hotkeys ─────────────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  if (command === 'region-grab') startRegion(tab, 'info')
  if (command === 'poster-grab') startRegion(tab, 'poster')
  if (command === 'window-grab') windowGrab(tab)
})

// ── right-click an image → STAGE it as the poster ───────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'plaster-stage' || !info.srcUrl) return
  try {
    const res = await fetch(info.srcUrl)
    const blob = await res.blob()
    if (blob.size > 6 * 1024 * 1024) { BADGE.error(); await logResult({ status: 'error', reason: 'image too large (>6MB)', url: tab?.url }); return }
    const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png'
    const bmp = await createImageBitmap(blob).catch(() => null)
    const thumb = bmp ? await thumbFromBitmap(bmp) : null
    await stagePoster({ base64: bufToBase64(await blob.arrayBuffer()), mime, thumb, fromUrl: tab?.url, tabId: tab?.id })
  } catch (e) {
    BADGE.error()
    await logResult({ status: 'error', reason: 'image fetch failed: ' + String(e).slice(0, 100), url: tab?.url })
  }
})

// ── sweep ───────────────────────────────────────────────────────────────────
async function sweepTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId })
  const targets = tabs.filter(t => t.url && /^https?:\/\//.test(t.url))
  for (const t of targets) {
    await chrome.tabs.update(t.id, { active: true })
    await new Promise(r => setTimeout(r, 800))
    await windowGrab(t)
    await new Promise(r => setTimeout(r, 400))
  }
}
