import { useState, useEffect, useRef, useCallback } from 'react'
import { type CropRect, type CropHandle, applyHandleDrag, optimizeImage, sampleCornerColors } from '@/lib/cropUtils'

export function CropPreviewModal({
  imageSrc, imageFile, aiCrop, currentCrop, onCropChange, onClose,
}: {
  imageSrc: string; imageFile: File; aiCrop: CropRect; currentCrop: CropRect
  onCropChange: (c: CropRect) => void; onClose: () => void
}) {
  const [mode, setMode] = useState<'preview' | 'crop'>('preview')
  const [editCrop, setEditCrop] = useState<CropRect>(currentCrop)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewColors, setPreviewColors] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(true)
  const [smartSnap, setSmartSnap] = useState(true)
  const [smartCrop] = useState<CropRect | null>(null)

  const imgWrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef<{ handle: CropHandle; startX: number; startY: number; startCrop: CropRect } | null>(null)
  const smartCropRef = useRef<CropRect | null>(null)

  const genPreview = useCallback(async (crop: CropRect) => {
    setPreviewLoading(true)
    try {
      const blob = await optimizeImage(imageFile, crop)
      const url = URL.createObjectURL(blob)
      const colors = await sampleCornerColors(url)
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
      setPreviewColors(colors)
    } finally {
      setPreviewLoading(false)
    }
  }, [imageFile])

  // Entering crop mode: auto-apply smart snap if user hasn't manually adjusted
  const handleEnterCropMode = () => {
    const snap = smartCropRef.current
    const userHasAdjusted = currentCrop.x !== aiCrop.x || currentCrop.y !== aiCrop.y ||
      currentCrop.width !== aiCrop.width || currentCrop.height !== aiCrop.height
    if (smartSnap && snap && !userHasAdjusted) setEditCrop(snap)
    setMode('crop')
  }

  // Generate preview on mount
  useEffect(() => { genPreview(currentCrop) }, []) // eslint-disable-line

  // Cleanup blob URL
  useEffect(() => () => { setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return '' }) }, [])

  // Live canvas preview while in crop mode
  useEffect(() => {
    if (mode !== 'crop') return
    const canvas = canvasRef.current
    if (!canvas) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')!
      const cw = canvas.width, ch = canvas.height
      const sx = editCrop.x * img.naturalWidth
      const sy = editCrop.y * img.naturalHeight
      const sw = Math.max(1, editCrop.width * img.naturalWidth)
      const sh = Math.max(1, editCrop.height * img.naturalHeight)
      const scale = Math.min(cw / sw, ch / sh)
      const dw = sw * scale, dh = sh * scale
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, cw, ch)
      ctx.drawImage(img, sx, sy, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
    }
    img.src = imageSrc
  }, [mode, editCrop, imageSrc])

  // Global drag tracking
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const d = draggingRef.current
      if (!d || !imgWrapRef.current) return
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const rect = imgWrapRef.current.getBoundingClientRect()
      setEditCrop(applyHandleDrag(d.startCrop, d.handle, (clientX - d.startX) / rect.width, (clientY - d.startY) / rect.height))
    }
    const onUp = () => { draggingRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as EventListener, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as EventListener)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  const startDrag = (handle: CropHandle, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    draggingRef.current = { handle, startX: clientX, startY: clientY, startCrop: { ...editCrop } }
  }

  const handleApply = async () => {
    onCropChange(editCrop)
    setMode('preview')
    await genPreview(editCrop)
  }

  // [handle, left%, top%, cursor]
  const HANDLES: [CropHandle, number, number, string][] = [
    ['tl', 0, 0, 'nw-resize'], ['tc', 50, 0, 'n-resize'], ['tr', 100, 0, 'ne-resize'],
    ['ml', 0, 50, 'w-resize'],                             ['mr', 100, 50, 'e-resize'],
    ['bl', 0, 100, 'sw-resize'], ['bc', 50, 100, 's-resize'], ['br', 100, 100, 'se-resize'],
  ]

  // ── Preview mode ──────────────────────────────────────────
  if (mode === 'preview') {
    const [c0, c1, c2, c3] = previewColors.length >= 4 ? previewColors : ['#1a1a2e', '#16213e', '#0f3460', '#533483']
    const bg = `conic-gradient(from 0deg at 50% 50%, ${c0}, ${c1}, ${c3}, ${c2}, ${c0})`
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Grid card preview · 2-column</p>
        <div onClick={e => e.stopPropagation()} style={{ width: 200, height: 300, borderRadius: 6, overflow: 'hidden', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {previewLoading
            ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
            : <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
        </div>
        <button
          onClick={e => { e.stopPropagation(); handleEnterCropMode() }}
          style={{ padding: '9px 22px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer' }}
        >
          Adjust Crop
        </button>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: 0 }}>Tap anywhere to close</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Crop mode ─────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => setSmartSnap(v => !v)}
          style={{ padding: '5px 11px', background: smartSnap ? 'rgba(168,85,247,0.18)' : 'transparent', border: `1px solid ${smartSnap ? 'rgba(168,85,247,0.55)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: smartSnap ? '#c084fc' : 'rgba(255,255,255,0.3)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0 }}
        >
          Smart snap: {smartSnap ? 'ON' : 'OFF'}
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <button
            onClick={() => setEditCrop(smartSnap && smartCrop ? smartCrop : { x: 0, y: 0, width: 1, height: 1 })}
            style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.45)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, cursor: 'pointer' }}
          >
            Reset
          </button>
          <button onClick={handleApply} style={{ padding: '6px 16px', background: '#A855F7', border: 'none', borderRadius: 5, color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Apply Crop</button>
          <button onClick={onClose} style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Content: image editor + preview card */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, padding: 12, overflow: 'hidden' }}>

        {/* Image with drag handles */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
          <div ref={imgWrapRef} style={{ position: 'relative', display: 'inline-block', lineHeight: 0, maxWidth: '100%', maxHeight: '100%' }}>
            <img src={imageSrc} alt="Crop" draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 130px)', width: 'auto', height: 'auto', userSelect: 'none', pointerEvents: 'none' }} />

            {/* Dark masks outside crop */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${editCrop.y * 100}%`, background: 'rgba(0,0,0,0.62)' }} />
              <div style={{ position: 'absolute', top: `${(editCrop.y + editCrop.height) * 100}%`, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.62)' }} />
              <div style={{ position: 'absolute', top: `${editCrop.y * 100}%`, left: 0, width: `${editCrop.x * 100}%`, height: `${editCrop.height * 100}%`, background: 'rgba(0,0,0,0.62)' }} />
              <div style={{ position: 'absolute', top: `${editCrop.y * 100}%`, left: `${(editCrop.x + editCrop.width) * 100}%`, right: 0, height: `${editCrop.height * 100}%`, background: 'rgba(0,0,0,0.62)' }} />
            </div>

            {/* Crop rect + handles */}
            <div style={{ position: 'absolute', left: `${editCrop.x * 100}%`, top: `${editCrop.y * 100}%`, width: `${editCrop.width * 100}%`, height: `${editCrop.height * 100}%`, border: '1.5px solid rgba(255,255,255,0.85)', boxSizing: 'border-box' }}>
              {HANDLES.map(([h, lp, tp, cur]) => (
                <div key={h} onMouseDown={e => startDrag(h, e)} onTouchStart={e => startDrag(h, e)} style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: '1.5px solid rgba(0,0,0,0.4)', borderRadius: 2, cursor: cur, left: `${lp}%`, top: `${tp}%`, transform: 'translate(-50%,-50%)', touchAction: 'none' }} />
              ))}
            </div>
          </div>
        </div>

        {/* Live preview card */}
        <div style={{ width: 120, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Preview</span>
          <canvas ref={canvasRef} width={120} height={180} style={{ borderRadius: 5, display: 'block', background: '#111' }} />
        </div>
      </div>
    </div>
  )
}
