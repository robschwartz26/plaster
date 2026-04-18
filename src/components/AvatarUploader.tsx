import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY,
)

interface Props {
  userId: string
  onDone: (fullUrl: string, diamondUrl: string) => void
  onCancel: () => void
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function getTouchDist(touches: TouchList) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

const DISPLAY_SIZE = 200
const DIAMOND_OUT  = 400
const FULL_MAX     = 1200

export function AvatarUploader({ userId, onDone, onCancel }: Props) {
  const [step,       setStep]       = useState<'pick' | 'crop'>('pick')
  const [rawSrc,     setRawSrc]     = useState<string | null>(null)
  const [panX,       setPanX]       = useState(0)
  const [panY,       setPanY]       = useState(0)
  const [scale,      setScale]      = useState(1)
  const [busy,       setBusy]       = useState(false)
  const [flipBusy,   setFlipBusy]   = useState(false)

  const fileRef    = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef    = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const pinchRef   = useRef<{ dist: number; startScale: number } | null>(null)

  // Non-passive touchmove to allow preventDefault during drag
  useEffect(() => {
    if (step !== 'crop') return
    const el = previewRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && dragRef.current) {
        const dx = e.touches[0].clientX - dragRef.current.startX
        const dy = e.touches[0].clientY - dragRef.current.startY
        setPanX(clamp(dragRef.current.startPanX + dx, -120, 120))
        setPanY(clamp(dragRef.current.startPanY + dy, -120, 120))
      } else if (e.touches.length === 2 && pinchRef.current) {
        const newDist = getTouchDist(e.touches)
        setScale(clamp((newDist / pinchRef.current.dist) * pinchRef.current.startScale, 0.5, 4))
      }
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [step])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setRawSrc(URL.createObjectURL(file))
    setPanX(0); setPanY(0); setScale(1)
    setStep('crop')
  }

  function cancelCrop() {
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setRawSrc(null)
    setStep('pick')
  }

  // Rebake rawSrc as a horizontally flipped JPEG, replacing the blob URL.
  // This keeps save() simple — it always draws from whatever rawSrc currently is.
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

  async function save() {
    if (!rawSrc) return
    setBusy(true)

    const img = new Image()
    img.src = rawSrc
    await new Promise<void>(res => { img.onload = () => res() })

    // Diamond canvas — square crop at current pan/zoom
    const diamondCanvas = document.createElement('canvas')
    diamondCanvas.width = DIAMOND_OUT; diamondCanvas.height = DIAMOND_OUT
    const dctx = diamondCanvas.getContext('2d')!
    const coverScale = Math.max(DISPLAY_SIZE / img.naturalWidth, DISPLAY_SIZE / img.naturalHeight)
    const RATIO = DIAMOND_OUT / DISPLAY_SIZE
    const totalScale = coverScale * scale
    const sw = img.naturalWidth  * totalScale * RATIO
    const sh = img.naturalHeight * totalScale * RATIO
    dctx.drawImage(img, (DIAMOND_OUT - sw) / 2 + panX * RATIO, (DIAMOND_OUT - sh) / 2 + panY * RATIO, sw, sh)
    const diamondBlob = await new Promise<Blob>(res => diamondCanvas.toBlob(b => res(b!), 'image/jpeg', 0.9))

    // Full canvas — original scaled to max 1200px
    const fullCanvas = document.createElement('canvas')
    const longSide = Math.max(img.naturalWidth, img.naturalHeight)
    const fullScale = longSide > FULL_MAX ? FULL_MAX / longSide : 1
    fullCanvas.width  = Math.round(img.naturalWidth  * fullScale)
    fullCanvas.height = Math.round(img.naturalHeight * fullScale)
    fullCanvas.getContext('2d')!.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height)
    const fullBlob = await new Promise<Blob>(res => fullCanvas.toBlob(b => res(b!), 'image/jpeg', 0.9))

    const ts = Date.now()
    const diamondPath = `${userId}/diamond.jpg`
    const fullPath    = `${userId}/full.jpg`

    const [diamondUp, fullUp] = await Promise.all([
      supabaseAdmin.storage.from('avatars').upload(diamondPath, diamondBlob, { upsert: true, contentType: 'image/jpeg' }),
      supabaseAdmin.storage.from('avatars').upload(fullPath,    fullBlob,    { upsert: true, contentType: 'image/jpeg' }),
    ])

    if (diamondUp.error || fullUp.error) {
      console.error('[AvatarUploader] upload error', diamondUp.error ?? fullUp.error)
      setBusy(false)
      return
    }

    const diamondUrl = supabaseAdmin.storage.from('avatars').getPublicUrl(diamondPath).data.publicUrl + '?t=' + ts
    const fullUrl    = supabaseAdmin.storage.from('avatars').getPublicUrl(fullPath).data.publicUrl    + '?t=' + ts

    await supabaseAdmin.from('profiles').update({
      avatar_url:         diamondUrl,
      avatar_diamond_url: diamondUrl,
      avatar_full_url:    fullUrl,
    }).eq('id', userId)

    setBusy(false)
    onDone(fullUrl, diamondUrl)
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(12,11,11,0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28,
    }}>

      {step === 'pick' && (
        <>
          <p style={labelStyle}>Choose a photo</p>

          <svg width={120} height={120} viewBox="0 0 120 120" fill="none">
            <polygon points="60,6 114,60 60,114 6,60" fill="none" stroke="rgba(240,236,227,0.2)" strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>

          <button onClick={() => fileRef.current?.click()} style={primaryBtn}>
            Choose from library
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

          <button onClick={onCancel} style={ghostBtn}>Cancel</button>
        </>
      )}

      {step === 'crop' && rawSrc && (
        <>
          <p style={labelStyle}>Position your photo</p>

          <div style={{ position: 'relative', width: DISPLAY_SIZE, height: DISPLAY_SIZE }}>
            {/* Draggable image preview */}
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
                setPanX(clamp(dragRef.current.startPanX + (e.clientX - dragRef.current.startX), -120, 120))
                setPanY(clamp(dragRef.current.startPanY + (e.clientY - dragRef.current.startY), -120, 120))
              }}
              onMouseUp={() => { dragRef.current = null }}
              onMouseLeave={() => { dragRef.current = null }}
              onWheel={e => { e.preventDefault(); setScale(prev => clamp(prev - e.deltaY * 0.003, 0.5, 4)) }}
              style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <img src={rawSrc} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(10px) brightness(0.4)', pointerEvents: 'none' }} />
              <img src={rawSrc} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: 'center', pointerEvents: 'none' }} />
            </div>

            {/* Diamond overlay — dark mask outside diamond, outline on edge */}
            <svg
              width={DISPLAY_SIZE} height={DISPLAY_SIZE}
              viewBox={`0 0 ${DISPLAY_SIZE} ${DISPLAY_SIZE}`}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
            >
              <defs>
                <mask id="av-diamond-mask">
                  <rect width={DISPLAY_SIZE} height={DISPLAY_SIZE} fill="white" />
                  <polygon points={`${DISPLAY_SIZE/2},4 ${DISPLAY_SIZE-4},${DISPLAY_SIZE/2} ${DISPLAY_SIZE/2},${DISPLAY_SIZE-4} 4,${DISPLAY_SIZE/2}`} fill="black" />
                </mask>
              </defs>
              <rect width={DISPLAY_SIZE} height={DISPLAY_SIZE} fill="rgba(12,11,11,0.72)" mask="url(#av-diamond-mask)" />
              <polygon
                points={`${DISPLAY_SIZE/2},4 ${DISPLAY_SIZE-4},${DISPLAY_SIZE/2} ${DISPLAY_SIZE/2},${DISPLAY_SIZE-4} 4,${DISPLAY_SIZE/2}`}
                fill="none" stroke="rgba(240,236,227,0.55)" strokeWidth="1.5"
              />
            </svg>
          </div>

          <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'var(--fg-30)' }}>
            Drag to reposition · Pinch or scroll to zoom
          </p>

          {/* Zoom slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 220 }}>
            <span style={scaleLabel}>−</span>
            <input type="range" min={0.5} max={4} step={0.01} value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#A855F7', cursor: 'pointer' }} />
            <span style={scaleLabel}>+</span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={cancelCrop} style={outlineBtn}>Back</button>
            <button
              onClick={flipHorizontal}
              disabled={flipBusy}
              aria-label="Flip horizontal"
              style={{ ...outlineBtn, display: 'flex', alignItems: 'center', gap: 6, opacity: flipBusy ? 0.5 : 1 }}
            >
              {/* Horizontal flip icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <path d="M3 9l4-4 4 4" />
                <path d="M3 15l4 4 4-4" />
                <path d="M21 9l-4-4-4 4" />
                <path d="M21 15l-4 4-4-4" />
              </svg>
              Flip
            </button>
            <button onClick={save} disabled={busy} style={{ ...saveBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-55)',
}

const primaryBtn: React.CSSProperties = {
  width: 220, padding: '13px 0', borderRadius: 12, border: 'none',
  background: 'var(--fg)', color: 'var(--bg)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-40)',
}

const outlineBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 8, border: '1.5px solid var(--fg-25)',
  background: 'transparent', color: 'var(--fg-55)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}

const saveBtn: React.CSSProperties = {
  padding: '11px 28px', borderRadius: 8, border: 'none',
  background: '#A855F7', color: '#fff',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, minWidth: 90,
}

const scaleLabel: React.CSSProperties = {
  fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, color: 'var(--fg-30)', letterSpacing: '0.08em',
}
