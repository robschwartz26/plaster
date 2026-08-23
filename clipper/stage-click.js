// Plaster Clipper — always-on image picker.
// Double-click any image (or ⌥-click — works even when the poster is wrapped
// in a link) → stages it as the pending poster. Purple flash confirms.
;(() => {
  if (window.__plasterStageHook) return
  window.__plasterStageHook = true

  const pickImg = (el) => {
    if (!el) return null
    if (el.tagName === 'IMG') return el
    return el.closest ? el.closest('picture')?.querySelector('img') ?? null : null
  }

  function handler(e) {
    // plain click only counts with ⌥ held; dblclick always counts
    if (e.type === 'click' && !e.altKey) return
    const img = pickImg(e.target)
    if (!img) return
    const src = img.currentSrc || img.src
    if (!src || src.startsWith('data:')) return
    e.preventDefault()
    e.stopPropagation()
    const prev = img.style.outline
    img.style.outline = '4px solid #A855F7'
    img.style.outlineOffset = '-2px'
    setTimeout(() => { img.style.outline = prev; img.style.outlineOffset = '' }, 900)
    chrome.runtime.sendMessage({ type: 'plaster-stage-image', srcUrl: src })
  }

  window.addEventListener('dblclick', handler, true)
  window.addEventListener('click', handler, true)
})()
