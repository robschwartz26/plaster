// Plaster Clipper — region selector overlay (the ⌘⇧4 experience, in-page).
// Injected on demand; draws a crosshair + drag rectangle, reports the chosen
// rect to the service worker, and fully removes itself BEFORE the screenshot
// is taken so the overlay never appears in the capture.
;(() => {
  if (document.getElementById('plaster-clip-overlay')) return // already active

  const overlay = document.createElement('div')
  overlay.id = 'plaster-clip-overlay'
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647',
    cursor: 'crosshair', background: 'rgba(0,0,0,0.08)',
  })

  const box = document.createElement('div')
  Object.assign(box.style, {
    position: 'fixed', border: '1.5px dashed #A855F7',
    background: 'rgba(168,85,247,0.12)', display: 'none', pointerEvents: 'none',
    zIndex: '2147483647',
  })

  const hint = document.createElement('div')
  hint.textContent = 'Drag over the poster + info · Esc to cancel'
  Object.assign(hint.style, {
    position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)',
    background: '#A855F7', color: '#fff', padding: '6px 14px', borderRadius: '8px',
    font: '600 13px "Space Grotesk", system-ui, sans-serif', zIndex: '2147483647',
    pointerEvents: 'none',
  })

  document.documentElement.appendChild(overlay)
  document.documentElement.appendChild(box)
  document.documentElement.appendChild(hint)

  let startX = 0, startY = 0, dragging = false

  function cleanup() {
    overlay.remove(); box.remove(); hint.remove()
    window.removeEventListener('keydown', onKey, true)
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); cleanup() }
  }
  window.addEventListener('keydown', onKey, true)

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault()
    dragging = true
    startX = e.clientX; startY = e.clientY
    box.style.display = 'block'
    box.style.left = startX + 'px'; box.style.top = startY + 'px'
    box.style.width = '0px'; box.style.height = '0px'
  })

  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY)
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY)
    box.style.left = x + 'px'; box.style.top = y + 'px'
    box.style.width = w + 'px'; box.style.height = h + 'px'
  })

  overlay.addEventListener('mouseup', (e) => {
    if (!dragging) return
    dragging = false
    const rect = {
      x: Math.min(startX, e.clientX),
      y: Math.min(startY, e.clientY),
      w: Math.abs(e.clientX - startX),
      h: Math.abs(e.clientY - startY),
    }
    const dpr = window.devicePixelRatio || 1
    cleanup()
    // Two frames so the overlay is truly gone from the pixels before capture.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ type: 'plaster-region', rect, dpr })
    }))
  })
})()
