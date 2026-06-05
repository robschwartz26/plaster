import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  onConfirm: (blob: Blob, focalY: number) => void
  currentBannerUrl?: string | null
  currentFocalY?: number  // kept for API compat — new exports always bake at 0.5
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function getTouchDist(touches: TouchList) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

const PREVIEW_W = 300
const PREVIEW_H = 120  // 5:2
const OUT_W     = 1200
const OUT_H     = 480  // 5:2
const FULL_MAX  = 2400

export function BannerUploader({ onConfirm, currentBannerUrl }: Props) {
  const [rawSrc,       setRawSrc]       = useState<string | null>(null)
  const [panX,         setPanX]         = useState(0)
  const [panY,         setPanY]         = useState(0)
  const [scale,        setScale]        = useState(1)
  const [busy,         setBusy]         = useState(false)
  const [flipBusy,     setFlipBusy]     = useState(false)
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(currentBannerUrl ?? null)

  const fileRef    = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef    = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const pinchRef   = useRef<{ dist: number; startScale: number } | null>(null)

  // Non-passive touchmove so we can preventDefault during drag/pinch
  useEffect(() => {
    if (!rawSrc) return
    const el = previewRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && dragRef.current) {
        const dx = e.touches[0].clientX - dragRef.current.startX
        const dy = e.touches[0].clientY - dragRef.current.startY
        setPanX(clamp(dragRef.current.startPanX + dx, -200, 200))
        setPanY(clamp(dragRef.current.startPanY + dy, -150, 150))
      } else if (e.touches.length === 2 && pinchRef.current) {
        const newDist = getTouchDist(e.touches)
        setScale(clamp((newDist / pinchRef.current.dist) * pinchRef.current.startScale, 0.5, 4))
      }
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [rawSrc])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setRawSrc(URL.createObjectURL(file))
    setPanX(0); setPanY(0); setScale(1)
  }

  function cancelCrop() {
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setRawSrc(null)
  }

  async function flipHorizontal() {
    if (!rawSrc || flipBusy) return
    setFlipBusy(true)
    const img = new Image()
    img.src = rawSrc
    await new Promise<void>(res => { img.onload = () => res() })

    const longSide = Math.max(img.naturalWidth, img.naturalHeight)
    const s = longSide > FULL_MAX ? FULL_MAX / longSide : 1
    const w = Math.round(img.naturalWidth  * s)
    const h = Math.round(img.naturalHeight * s)

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.95))
    URL.revokeObjectURL(rawSrc)
    setRawSrc(URL.createObjectURL(blob))
    setPanX(0); setPanY(0)
    setFlipBusy(false)
  }

  async function handleConfirm() {
    if (!rawSrc || busy) return
    setBusy(true)

    const img = new Image()
    img.src = rawSrc
    await new Promise<void>(res => { img.onload = () => res() })

    // Bake the framed result into a 1200×480 canvas — same math as AvatarUploader's diamond export
    const canvas = document.createElement('canvas')
    canvas.width = OUT_W; canvas.height = OUT_H
    const ctx = canvas.getContext('2d')!

    const coverScale = Math.max(PREVIEW_W / img.naturalWidth, PREVIEW_H / img.naturalHeight)
    const RATIO      = OUT_W / PREVIEW_W  // 4.0 — same factor in both axes (both are 5:2)
    const totalScale = coverScale * scale
    const sw = img.naturalWidth  * totalScale * RATIO
    const sh = img.naturalHeight * totalScale * RATIO
    ctx.drawImage(img, (OUT_W - sw) / 2 + panX * RATIO, (OUT_H - sh) / 2 + panY * RATIO, sw, sh)

    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.9))

    // Update inline thumbnail with the baked blob
    const newUrl = URL.createObjectURL(blob)
    if (confirmedUrl && confirmedUrl !== currentBannerUrl) URL.revokeObjectURL(confirmedUrl)
    setConfirmedUrl(newUrl)

    URL.revokeObjectURL(rawSrc)
    setRawSrc(null)
    setBusy(false)

    // focalY = 0.5 because framing is baked into the image — objectPosition: center 50% is correct
    onConfirm(blob, 0.5)
  }

  const displayUrl = confirmedUrl ?? currentBannerUrl ?? null

  return (
    <>
      {/* ── Inline: thumbnail + pick button ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          width: '100%', aspectRatio: '5/2', borderRadius: 8, overflow: 'hidden',
          background: '#1a1918', border: '1px solid rgba(240,236,227,0.12)',
          position: 'relative',
        }}>
          {displayUrl ? (
            <img src={displayUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'rgba(240,236,227,0.35)',
            }}>
              No banner image
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

        <button
          onClick={() => fileRef.current?.click()}
          style={{
            padding: '10px 0', borderRadius: 8, border: '1.5px solid var(--fg-25)',
            background: 'transparent', color: 'var(--fg-65)',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {displayUrl ? 'Change banner' : 'Choose photo'}
        </button>
      </div>

      {/* ── Portal: full-screen crop editor ── */}
      {rawSrc && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(12,11,11,1)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 24,
        }}>
          <p style={labelStyle}>Position your banner</p>

          <div style={{ position: 'relative', width: PREVIEW_W, height: PREVIEW_H }}>
            <div
              ref={previewRef}
              onTouchStart={e => {
                if (e.touches.length === 1) {
                  dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: panX, startPanY: panY }
                  pinchRef.current = null
                } else if (e.touches.length === 2) {
                  pinchRef.current = { dist: getTouchDist(e.nativeEvent.touches), startScale: scale }
                  dragRef.current = null
                }
              }}
              onTouchEnd={() => { dragRef.current = null; pinchRef.current = null }}
              onMouseDown={e => { e.preventDefault(); dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY } }}
              onMouseMove={e => {
                if (!dragRef.current) return
                setPanX(clamp(dragRef.current.startPanX + (e.clientX - dragRef.current.startX), -200, 200))
                setPanY(clamp(dragRef.current.startPanY + (e.clientY - dragRef.current.startY), -150, 150))
              }}
              onMouseUp={() => { dragRef.current = null }}
              onMouseLeave={() => { dragRef.current = null }}
              onWheel={e => { e.preventDefault(); setScale(prev => clamp(prev - e.deltaY * 0.003, 0.5, 4)) }}
              style={{
                position: 'absolute', inset: 0, overflow: 'hidden',
                cursor: 'grab', userSelect: 'none', touchAction: 'none', borderRadius: 4,
              }}
            >
              {/* Blurred atmosphere */}
              <img src={rawSrc} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(10px) brightness(0.4)', pointerEvents: 'none' }} />
              {/* Live preview — objectFit:cover establishes coverScale; transform applies pan+zoom on top */}
              <img src={rawSrc} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: 'center', pointerEvents: 'none' }} />
            </div>
            {/* Frame outline */}
            <div style={{
              position: 'absolute', inset: 0,
              border: '1.5px solid rgba(240,236,227,0.45)',
              borderRadius: 4, pointerEvents: 'none',
            }} />
          </div>

          <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'rgba(240,236,227,0.45)' }}>
            Drag to reposition · Pinch or scroll to zoom
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: PREVIEW_W }}>
            <span style={scaleLabel}>−</span>
            <input type="range" min={0.5} max={4} step={0.01} value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#A855F7', cursor: 'pointer' }} />
            <span style={scaleLabel}>+</span>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={cancelCrop} style={outlineBtn}>Back</button>
            <button
              onClick={flipHorizontal}
              disabled={flipBusy}
              aria-label="Flip horizontal"
              style={{ ...outlineBtn, display: 'flex', alignItems: 'center', gap: 6, opacity: flipBusy ? 0.5 : 1 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <path d="M3 9l4-4 4 4" />
                <path d="M3 15l4 4 4-4" />
                <path d="M21 9l-4-4-4 4" />
                <path d="M21 15l-4 4-4-4" />
              </svg>
              Flip
            </button>
            <button onClick={handleConfirm} disabled={busy} style={{ ...saveBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Saving…' : 'Use this'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,236,227,0.55)',
}

const outlineBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 8, border: '1.5px solid rgba(240,236,227,0.30)',
  background: 'transparent', color: 'rgba(240,236,227,0.85)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}

const saveBtn: React.CSSProperties = {
  padding: '11px 28px', borderRadius: 8, border: 'none',
  background: '#A855F7', color: '#fff',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, minWidth: 90,
}

const scaleLabel: React.CSSProperties = {
  fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11,
  color: 'rgba(240,236,227,0.45)', letterSpacing: '0.08em',
}
