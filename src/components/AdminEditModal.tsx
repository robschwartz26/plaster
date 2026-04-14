import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { type WallEvent } from '@/types/event'
import { type CropRect, type CropHandle, applyHandleDrag, detectContentBounds, optimizeImage } from '@/lib/cropUtils'

const IS_DEV = import.meta.env.DEV

const CATEGORIES = ['Music', 'Drag', 'Dance', 'Comedy', 'Art', 'Film', 'Literary', 'Trivia', 'Other']

interface Venue { id: string; name: string; neighborhood?: string }

interface Props {
  event: WallEvent
  onClose: () => void
  onSaved: (newPosterUrl?: string) => void
}

const inputSt: React.CSSProperties = {
  width: '100%', background: 'rgba(240,236,227,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '10px 12px', color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const labelSt: React.CSSProperties = {
  display: 'block', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 6,
}

// 8 handles: [key, leftPercent, topPercent, cursor]
const HANDLES: [CropHandle, number, number, string][] = [
  ['tl', 0, 0, 'nw-resize'], ['tc', 50, 0, 'n-resize'], ['tr', 100, 0, 'ne-resize'],
  ['ml', 0, 50, 'w-resize'],                              ['mr', 100, 50, 'e-resize'],
  ['bl', 0, 100, 'sw-resize'], ['bc', 50, 100, 's-resize'], ['br', 100, 100, 'se-resize'],
]

export function AdminEditModal({ event, onClose, onSaved }: Props) {
  // ── Crop state ─────────────────────────────────────────────
  const [cropMode, setCropMode] = useState(false)
  const [editCrop, setEditCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 })
  const [smartSnap, setSmartSnap] = useState(true)
  const [smartCrop, setSmartCrop] = useState<CropRect | null>(null)
  const smartCropRef = useRef<CropRect | null>(null)
  const [isSnapAnimating, setIsSnapAnimating] = useState(false)
  const [snapToast, setSnapToast] = useState<string | null>(null)

  const imgWrapRef = useRef<HTMLDivElement>(null)
  // Cached loaded image — avoids re-fetching on every drag for the preview canvas
  const imgCacheRef = useRef<HTMLImageElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [previewBackdrop, setPreviewBackdrop] = useState<string | null>(null)
  const draggingRef = useRef<{ handle: CropHandle; startX: number; startY: number; startCrop: CropRect } | null>(null)

  // ── Image fetch (needed for Save Crop upload) ──────────────
  const [imageFile, setImageFile] = useState<File | null>(null)

  // ── Details form ───────────────────────────────────────────
  const [venues, setVenues] = useState<Venue[]>([])
  const [form, setForm] = useState({
    title: event.title,
    venue_id: event.venue_id ?? '',
    date: event.starts_at.slice(0, 10),
    time: event.starts_at.slice(11, 16),
    category: event.category,
    description: '',
  })

  // ── Save / delete state ────────────────────────────────────
  const [saving, setSaving] = useState<'crop' | 'details' | 'delete' | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── On mount: fetch event details + venues + poster blob + cached img + smart bounds ─
  useEffect(() => {
    supabase.from('events').select('description, venue_id').eq('id', event.id).single()
      .then(({ data }) => {
        if (data) setForm(f => ({
          ...f,
          description: data.description ?? '',
          venue_id: data.venue_id ?? f.venue_id,
        }))
      })
  }, [event.id])

  useEffect(() => {
    supabase.from('venues').select('id, name, neighborhood').order('name')
      .then(({ data }) => { if (data) setVenues(data as Venue[]) })
  }, [])

  useEffect(() => {
    if (!event.poster_url) return
    fetch(event.poster_url)
      .then(r => r.blob())
      .then(blob => setImageFile(new File([blob], 'poster.jpg', { type: blob.type || 'image/jpeg' })))
      .catch(() => { /* save crop will be disabled */ })
  }, [event.poster_url])

  // Cache a loaded HTMLImageElement for the live preview canvas (avoids re-fetching on every drag)
  useEffect(() => {
    if (!event.poster_url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgCacheRef.current = img }
    img.src = event.poster_url
  }, [event.poster_url])

  // Detect solid borders on mount; store result for smart snap
  useEffect(() => {
    if (!event.poster_url) return
    console.log('[SmartSnap] Mount: calling detectContentBounds for', event.poster_url)
    detectContentBounds(event.poster_url).then(detected => {
      if (!detected) { console.log('[SmartSnap] Mount: no solid borders detected'); return }
      console.log('[SmartSnap] Mount: detected bounds:', detected)
      smartCropRef.current = detected
      setSmartCrop(detected)
    })
  }, [event.poster_url])

  // ── Live preview canvas: redraws on every editCrop change using cached image ──
  useEffect(() => {
    if (!cropMode) return
    const canvas = previewCanvasRef.current
    const img = imgCacheRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')!
    const cw = canvas.width, ch = canvas.height
    const sx = editCrop.x * img.naturalWidth
    const sy = editCrop.y * img.naturalHeight
    const sw = Math.max(1, editCrop.width * img.naturalWidth)
    const sh = Math.max(1, editCrop.height * img.naturalHeight)
    const scale = Math.min(cw / sw, ch / sh)
    const dw = sw * scale, dh = sh * scale
    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(img, sx, sy, sw, sh, (cw - dw) / 2, (ch - dh) / 2, dw, dh)

    // Sample the 4 corners of the cropped region to generate a live backdrop
    try {
      const SIZE = 40
      const sc = document.createElement('canvas')
      sc.width = SIZE; sc.height = SIZE
      const sctx = sc.getContext('2d')!
      sctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE)
      const d = sctx.getImageData(0, 0, SIZE, SIZE).data
      const px = (x: number, y: number) => { const i = (y * SIZE + x) * 4; return `${d[i]},${d[i+1]},${d[i+2]}` }
      const tl = px(2, 2), tr = px(SIZE-3, 2), bl = px(2, SIZE-3), br = px(SIZE-3, SIZE-3)
      setPreviewBackdrop(`conic-gradient(from 0deg at 50% 50%, rgb(${tl}), rgb(${tr}), rgb(${br}), rgb(${bl}), rgb(${tl}))`)
    } catch { /* CORS taint — no backdrop */ }
  }, [cropMode, editCrop])

  // ── Global drag tracking (passive:false so we can preventDefault on touch) ──
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const d = draggingRef.current
      if (!d || !imgWrapRef.current) return
      if ('touches' in e) e.preventDefault() // prevent page scroll while dragging
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const rect = imgWrapRef.current.getBoundingClientRect()
      setEditCrop(applyHandleDrag(d.startCrop, d.handle, (clientX - d.startX) / rect.width, (clientY - d.startY) / rect.height))
    }
    const onUp = () => { draggingRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as EventListener, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as EventListener)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  // ── Crop handlers ──────────────────────────────────────────
  const startDrag = (handle: CropHandle, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    draggingRef.current = { handle, startX: clientX, startY: clientY, startCrop: { ...editCrop } }
  }

  const handleEnterCrop = () => {
    const snap = smartCropRef.current
    console.log('[SmartSnap] Entering crop mode. smartSnap:', smartSnap, '| cached bounds:', snap)
    setEditCrop(smartSnap && snap ? snap : { x: 0, y: 0, width: 1, height: 1 })
    setCropMode(true)
  }

  const applySnap = (bounds: CropRect) => {
    setIsSnapAnimating(true)
    setEditCrop(bounds)
    setTimeout(() => setIsSnapAnimating(false), 250)
  }

  const handleSmartSnapToggle = () => {
    const turningOn = !smartSnap
    console.log('[SmartSnap] Toggle clicked, calling detectContentBounds. Turning ON:', turningOn)
    setSmartSnap(turningOn)
    if (turningOn) {
      if (smartCropRef.current) {
        console.log('[SmartSnap] Applying cached bounds:', smartCropRef.current)
        applySnap(smartCropRef.current)
      } else if (event.poster_url) {
        detectContentBounds(event.poster_url).then(detected => {
          if (!detected) {
            console.log('[SmartSnap] No borders detected')
            setSnapToast('No borders detected')
            setTimeout(() => setSnapToast(null), 2500)
            setSmartSnap(false)
            return
          }
          console.log('[SmartSnap] Re-detected bounds:', detected)
          smartCropRef.current = detected
          setSmartCrop(detected)
          applySnap(detected)
        })
      }
    }
  }

  // ── Save Crop ──────────────────────────────────────────────
  const handleSaveCrop = async () => {
    if (!imageFile) { console.warn('[SaveCrop] No imageFile — aborting'); return }
    setSaving('crop'); setSaveError('')
    console.log('[SaveCrop] Starting. Event ID:', event.id, '| imageFile size:', imageFile.size, '| crop:', editCrop)
    try {
      const optimized = await optimizeImage(imageFile, editCrop)
      console.log('[SaveCrop] optimizeImage complete. Blob size:', optimized.size)

      const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      const filename = `${Date.now()}-${slug}.jpg`
      console.log('[SaveCrop] Uploading to storage bucket "posters":', filename)
      const { error: storageError, data: storageData } = await supabase.storage
        .from('posters').upload(filename, optimized, { contentType: 'image/jpeg', upsert: false })
      if (storageError) { console.error('[SaveCrop] Storage upload error:', storageError); throw storageError }
      console.log('[SaveCrop] Storage upload success:', storageData)

      const { data: urlData } = supabase.storage.from('posters').getPublicUrl(filename)
      console.log('[SaveCrop] Public URL:', urlData.publicUrl)

      console.log('[SaveCrop] Updating events table for event id:', event.id)
      const { error: updateError, data: updateData } = await supabase.from('events')
        .update({ poster_url: urlData.publicUrl }).eq('id', event.id)
        .select('id, poster_url')
      if (updateError) { console.error('[SaveCrop] DB update error:', updateError); throw updateError }
      console.log('[SaveCrop] DB update success:', updateData)

      setCropMode(false)
      console.log('[SaveCrop] Calling onSaved with new URL')
      onSaved(urlData.publicUrl)
    } catch (e) {
      console.error('[SaveCrop] Caught error:', e)
      setSaveError(String(e))
    } finally {
      setSaving(null)
    }
  }

  // ── Save Details ───────────────────────────────────────────
  const handleSaveDetails = async () => {
    if (!form.title) return
    setSaving('details'); setSaveError('')
    try {
      const timeStr = form.time || '20:00'
      const starts_at = new Date(`${form.date}T${timeStr}:00`).toISOString()
      const { error } = await supabase.from('events').update({
        title: form.title,
        venue_id: form.venue_id || null,
        starts_at,
        category: form.category,
        description: form.description,
      }).eq('id', event.id)
      if (error) throw error
      onSaved()
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(null)
    }
  }

  // ── Delete Event ───────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setSaving('delete'); setSaveError('')
    try {
      const { error } = await supabase.from('events').delete().eq('id', event.id)
      if (error) throw error
      onSaved()
    } catch (e) {
      setSaveError(String(e))
      setSaving(null)
    }
  }

  // ── CSS transition string for animated snap ────────────────
  const snapTransition = isSnapAnimating ? 'all 0.2s ease' : 'none'

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, background: '#0a0a0a', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
          Edit Event
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {IS_DEV && (
            <button
              onClick={() => setForm(f => ({
                ...f,
                title: 'DEV: Neon Wolves',
                category: 'Music',
                description: 'With special guests The Static Age. $15 adv / $18 door. All ages.',
              }))}
              style={{ padding: '4px 10px', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4, color: 'rgba(234,179,8,0.8)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer' }}
            >
              DEV
            </button>
          )}
          <button
            onClick={onClose}
            style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Poster + Crop section */}
      <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
        {event.poster_url ? (
          <>
            {/* Image with drag handles */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              {/* Image wrap — crop overlay is positioned relative to this */}
              <div
                ref={imgWrapRef}
                style={{ flex: 1, position: 'relative', lineHeight: 0, maxWidth: '100%', overflow: 'visible' }}
              >
                <img
                  src={event.poster_url}
                  alt={event.title}
                  draggable={false}
                  style={{ display: 'block', width: '100%', maxHeight: '42vh', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
                />

                {cropMode && (
                  <>
                    {/* Full-image dark overlay — 4 rects surrounding the crop window */}
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      {/* top strip */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${editCrop.y * 100}%`, background: 'rgba(0,0,0,0.55)', transition: snapTransition }} />
                      {/* bottom strip */}
                      <div style={{ position: 'absolute', top: `${(editCrop.y + editCrop.height) * 100}%`, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', transition: snapTransition }} />
                      {/* left strip */}
                      <div style={{ position: 'absolute', top: `${editCrop.y * 100}%`, left: 0, width: `${editCrop.x * 100}%`, height: `${editCrop.height * 100}%`, background: 'rgba(0,0,0,0.55)', transition: snapTransition }} />
                      {/* right strip */}
                      <div style={{ position: 'absolute', top: `${editCrop.y * 100}%`, left: `${(editCrop.x + editCrop.width) * 100}%`, right: 0, height: `${editCrop.height * 100}%`, background: 'rgba(0,0,0,0.55)', transition: snapTransition }} />
                    </div>

                    {/* Crop rect border + 8 handles */}
                    <div style={{
                      position: 'absolute',
                      left: `${editCrop.x * 100}%`,
                      top: `${editCrop.y * 100}%`,
                      width: `${editCrop.width * 100}%`,
                      height: `${editCrop.height * 100}%`,
                      border: '1.5px solid rgba(255,255,255,0.9)',
                      boxSizing: 'border-box',
                      transition: snapTransition,
                    }}>
                      {HANDLES.map(([h, lp, tp, cur]) => (
                        // Outer div = 20×20 touch target (invisible)
                        // Inner div = 12×12 visible white square
                        <div
                          key={h}
                          onMouseDown={e => startDrag(h, e)}
                          onTouchStart={e => startDrag(h, e)}
                          style={{
                            position: 'absolute',
                            width: 20, height: 20,
                            left: `${lp}%`, top: `${tp}%`,
                            transform: 'translate(-50%, -50%)',
                            touchAction: 'none',
                            cursor: cur,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <div style={{
                            width: 12, height: 12,
                            background: '#fff',
                            border: '1.5px solid rgba(0,0,0,0.45)',
                            borderRadius: 2,
                            pointerEvents: 'none',
                          }} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Live preview card */}
              {cropMode && (
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 2 }}>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Preview</span>
                  {/* Backdrop behind canvas */}
                  <div style={{ position: 'relative', width: 72, height: 108, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, background: previewBackdrop ?? '#111' }} />
                    <canvas
                      ref={previewCanvasRef}
                      width={72}
                      height={108}
                      style={{ position: 'relative', display: 'block', width: 72, height: 108 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Crop controls */}
            {cropMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {/* Toast */}
                {snapToast && (
                  <div style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.85)' }}>
                    {snapToast}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleSmartSnapToggle}
                    style={{ padding: '5px 11px', background: smartSnap ? 'rgba(168,85,247,0.18)' : 'transparent', border: `1px solid ${smartSnap ? 'rgba(168,85,247,0.55)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: smartSnap ? '#c084fc' : 'rgba(255,255,255,0.3)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0 }}
                  >
                    Smart snap: {smartSnap ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => setEditCrop(smartSnap && smartCrop ? smartCrop : { x: 0, y: 0, width: 1, height: 1 })}
                    style={{ padding: '5px 11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.45)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                  >
                    Reset
                  </button>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button
                      onClick={() => { setCropMode(false); setEditCrop({ x: 0, y: 0, width: 1, height: 1 }) }}
                      style={{ padding: '5px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.35)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveCrop}
                      disabled={saving === 'crop' || !imageFile}
                      style={{ padding: '5px 16px', background: '#A855F7', border: 'none', borderRadius: 5, color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: saving === 'crop' || !imageFile ? 'default' : 'pointer', opacity: saving === 'crop' || !imageFile ? 0.6 : 1 }}
                    >
                      {saving === 'crop' ? 'Saving…' : 'Save Crop'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={handleEnterCrop}
                style={{ marginBottom: 16, padding: '7px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer' }}
              >
                Adjust Crop
              </button>
            )}
          </>
        ) : (
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 16 }}>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>No poster image</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px', flexShrink: 0 }} />

      {/* Details form */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>

        {/* Title */}
        <div>
          <label style={labelSt}>Title</label>
          <input
            style={inputSt}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </div>

        {/* Venue */}
        <div>
          <label style={labelSt}>Venue</label>
          <select
            style={{ ...inputSt, appearance: 'auto' }}
            value={form.venue_id}
            onChange={e => setForm(f => ({ ...f, venue_id: e.target.value }))}
          >
            <option value="">— select venue —</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>

        {/* Date + Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelSt}>Date</label>
            <input
              type="date"
              style={inputSt}
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label style={labelSt}>Time</label>
            <input
              type="time"
              style={inputSt}
              value={form.time}
              onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label style={labelSt}>Category</label>
          <select
            style={{ ...inputSt, appearance: 'auto' }}
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Description */}
        <div>
          <label style={labelSt}>Description</label>
          <textarea
            style={{ ...inputSt, minHeight: 72, resize: 'vertical' }}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        {saveError && (
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.8)' }}>
            {saveError}
          </p>
        )}

        {/* Save Details */}
        <button
          onClick={handleSaveDetails}
          disabled={saving === 'details' || !form.title}
          style={{ width: '100%', padding: '13px', borderRadius: 10, background: '#A855F7', border: 'none', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 600, cursor: saving === 'details' || !form.title ? 'default' : 'pointer', opacity: saving === 'details' || !form.title ? 0.6 : 1 }}
        >
          {saving === 'details' ? 'Saving…' : 'Save Details'}
        </button>

        {/* Delete Event */}
        <button
          onClick={handleDelete}
          disabled={saving === 'delete'}
          style={{ width: '100%', padding: '13px', borderRadius: 10, background: deleteConfirm ? 'rgba(239,68,68,0.85)' : 'transparent', border: `1px solid ${deleteConfirm ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`, color: deleteConfirm ? '#fff' : 'rgba(239,68,68,0.55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 600, cursor: saving === 'delete' ? 'default' : 'pointer', opacity: saving === 'delete' ? 0.6 : 1 }}
        >
          {saving === 'delete' ? 'Deleting…' : deleteConfirm ? 'Tap again to confirm delete' : 'Delete Event'}
        </button>
      </div>
    </div>
  )
}
