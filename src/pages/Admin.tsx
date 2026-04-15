import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { PlasterHeader } from '@/components/PlasterHeader'
import { type CropRect, type CropHandle, applyHandleDrag, optimizeImage, sampleCornerColors } from '@/lib/cropUtils'

// ── Constants ────────────────────────────────────────────────

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD as string
const SESSION_KEY = 'plaster_admin_unlocked'
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const IS_DEV = window.location.hostname === 'localhost'

const NEIGHBORHOODS = [
  'Northeast', 'Southeast', 'North', 'Northwest', 'Southwest',
  'Downtown', 'Pearl', 'Alberta', 'Mississippi', 'Hawthorne',
  'Division', 'Burnside',
]

const CATEGORIES = [
  'Music', 'Drag', 'Dance', 'Comedy', 'Art', 'Film', 'Literary', 'Trivia', 'Other',
]

// ── Shared input styles ──────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(240,236,227,0.05)',
  border: '1px solid var(--fg-18)',
  borderRadius: 6,
  padding: '10px 12px',
  color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-55)',
  marginBottom: 6,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
}

// ── Geocoding ────────────────────────────────────────────────

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN) {
    console.warn('VITE_MAPBOX_TOKEN not set — skipping geocoding')
    return null
  }
  const query = encodeURIComponent(address + ', Portland, Oregon')
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1&proximity=-122.6784,45.5051`
  const res = await fetch(url)
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  const [lng, lat] = feature.geometry.coordinates
  return { lat, lng }
}

// ── Password gate ────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 320 }}>
        <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 28, fontWeight: 700, color: 'var(--fg)', marginBottom: 8 }}>plaster</p>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', marginBottom: 32, letterSpacing: '0.04em' }}>admin</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Password"
            value={value}
            autoFocus
            onChange={(e) => { setValue(e.target.value); setError(false) }}
            style={{ ...inputStyle, borderColor: error ? 'rgba(239,68,68,0.6)' : 'var(--fg-18)' }}
          />
          {error && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.8)', margin: 0 }}>Incorrect password.</p>}
          <button type="submit" style={{ background: '#A855F7', color: '#fff', border: 'none', borderRadius: 6, padding: '12px 0', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', letterSpacing: '0.04em' }}>
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Venue form ───────────────────────────────────────────────

function VenueForm({ onVenueAdded }: { onVenueAdded: () => void }) {
  const [form, setForm] = useState({ name: '', neighborhood: '', address: '', website: '', instagram: '', hours: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    let location_lat: number | null = null
    let location_lng: number | null = null

    if (form.address) {
      const coords = await geocodeAddress(form.address)
      if (coords) { location_lat = coords.lat; location_lng = coords.lng }
    }

    const { error } = await supabaseAdmin.from('venues').insert({
      name: form.name.trim(),
      neighborhood: form.neighborhood || null,
      address: form.address.trim() || null,
      website: form.website.trim() || null,
      instagram: form.instagram.replace(/^@/, '').trim() || null,
      hours: form.hours.trim() || null,
      location_lat,
      location_lng,
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('success')
      setForm({ name: '', neighborhood: '', address: '', website: '', instagram: '', hours: '' })
      onVenueAdded()
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={fieldStyle}>
        <label style={labelStyle}>Venue name *</label>
        <input style={inputStyle} value={form.name} onChange={set('name')} required placeholder="The Goodfoot" />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Neighborhood</label>
        <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.neighborhood} onChange={set('neighborhood')}>
          <option value="">— select —</option>
          {NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Address</label>
        <input style={inputStyle} value={form.address} onChange={set('address')} placeholder="2845 SE Stark St" />
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', marginTop: 4 }}>Auto-geocoded to lat/lng via Mapbox</p>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Hours</label>
        <input style={inputStyle} value={form.hours} onChange={set('hours')} placeholder="Mon-Thu 5pm-2am, Fri-Sat 4pm-3am" />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Website</label>
        <input style={inputStyle} value={form.website} onChange={set('website')} placeholder="https://goodfootlounge.com" />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Instagram</label>
        <input style={inputStyle} value={form.instagram} onChange={set('instagram')} placeholder="@goodfootpdx" />
      </div>
      {status === 'error' && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.8)', margin: 0 }}>{errorMsg}</p>}
      <button type="submit" disabled={status === 'loading'} style={{ background: status === 'success' ? 'rgba(34,197,94,0.8)' : '#A855F7', color: '#fff', border: 'none', borderRadius: 6, padding: '12px 0', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: status === 'loading' ? 'wait' : 'pointer', letterSpacing: '0.04em', transition: 'background 0.2s ease' }}>
        {status === 'loading' ? 'Saving…' : status === 'success' ? 'Venue saved ✓' : 'Add Venue'}
      </button>
    </form>
  )
}

// ── Event form ───────────────────────────────────────────────

interface Venue { id: string; name: string; neighborhood?: string }

function EventForm({ venues }: { venues: Venue[] }) {
  const [form, setForm] = useState({ venue_id: '', title: '', category: '', date: '', start_time: '', description: '', is_recurring: false, recurrence_rule: '' })
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setPosterFile(file)
    if (file) setPosterPreview(URL.createObjectURL(file))
    else setPosterPreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    let poster_url: string | null = null

    if (posterFile) {
      const ext = posterFile.name.split('.').pop()
      const filename = `${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabaseAdmin.storage.from('posters').upload(filename, posterFile, { contentType: posterFile.type, upsert: false })
      if (uploadError) { setStatus('error'); setErrorMsg(`Poster upload failed: ${uploadError.message}`); return }
      const { data: urlData } = supabaseAdmin.storage.from('posters').getPublicUrl(filename)
      poster_url = urlData.publicUrl
    }

    const starts_at = form.date && form.start_time
      ? new Date(`${form.date}T${form.start_time}:00`).toISOString()
      : form.date ? new Date(`${form.date}T20:00:00`).toISOString() : null

    if (!starts_at) { setStatus('error'); setErrorMsg('Date is required.'); return }

    const { error } = await supabaseAdmin.from('events').insert({
      venue_id: form.venue_id || null,
      title: form.title.trim(),
      category: form.category || null,
      description: form.description.trim() || null,
      poster_url,
      starts_at,
      is_recurring: form.is_recurring,
      recurrence_rule: form.is_recurring && form.recurrence_rule ? form.recurrence_rule : null,
    })

    if (error) {
      setStatus('error'); setErrorMsg(error.message)
    } else {
      setStatus('success')
      setForm({ venue_id: '', title: '', category: '', date: '', start_time: '', description: '', is_recurring: false, recurrence_rule: '' })
      setPosterFile(null); setPosterPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={fieldStyle}>
        <label style={labelStyle}>Venue</label>
        <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.venue_id} onChange={set('venue_id')}>
          <option value="">— no venue —</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Poster image</label>
        <div onClick={() => fileRef.current?.click()} style={{ border: '1px dashed var(--fg-25)', borderRadius: 6, padding: posterPreview ? 0 : '24px 0', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: posterPreview ? 'auto' : 64, background: 'rgba(240,236,227,0.03)' }}>
          {posterPreview
            ? <img src={posterPreview} alt="poster preview" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block' }} />
            : <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>Tap to choose image</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        {posterFile && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', marginTop: 4 }}>{posterFile.name}</p>}
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Event title *</label>
        <input style={inputStyle} value={form.title} onChange={set('title')} required placeholder="Late Night with DJ Hessa" />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Category</label>
        <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.category} onChange={set('category')}>
          <option value="">— select —</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Date *</label>
          <input style={inputStyle} type="date" value={form.date} onChange={set('date')} required />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Start time</label>
          <input style={inputStyle} type="time" value={form.start_time} onChange={set('start_time')} />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>Description</label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={set('description')} placeholder="Optional — ticket info, age restrictions, etc." />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => setForm((f) => ({ ...f, is_recurring: !f.is_recurring, recurrence_rule: '' }))} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', background: form.is_recurring ? '#A855F7' : 'var(--fg-18)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s ease' }}>
          <span style={{ position: 'absolute', top: 3, left: form.is_recurring ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease' }} />
        </button>
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>Recurring event</span>
      </div>
      {form.is_recurring && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Recurrence</label>
          <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.recurrence_rule} onChange={set('recurrence_rule')}>
            <option value="">— select —</option>
            <option value="FREQ=DAILY">Daily</option>
            <option value="FREQ=WEEKLY">Weekly</option>
            <option value="FREQ=MONTHLY">Monthly</option>
          </select>
        </div>
      )}
      {status === 'error' && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.8)', margin: 0 }}>{errorMsg}</p>}
      <button type="submit" disabled={status === 'loading'} style={{ background: status === 'success' ? 'rgba(34,197,94,0.8)' : '#A855F7', color: '#fff', border: 'none', borderRadius: 6, padding: '12px 0', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: status === 'loading' ? 'wait' : 'pointer', letterSpacing: '0.04em', transition: 'background 0.2s ease' }}>
        {status === 'loading' ? 'Saving…' : status === 'success' ? 'Event saved ✓' : 'Add Event'}
      </button>
    </form>
  )
}

// ── Import section ───────────────────────────────────────────

type ImportPhase = 'idle' | 'extracting' | 'review' | 'duplicate' | 'uploading' | 'done' | 'error'
type Category = 'Music' | 'Drag' | 'Dance' | 'Comedy' | 'Art' | 'Film' | 'Literary' | 'Trivia' | 'Other'

interface ExtractedEvent {
  title: string
  venue_name: string
  date: string
  time: string
  address: string
  description: string
  category: Category
  confidence: 'high' | 'medium' | 'low'
  uncertain_fields: string[]
  crop?: CropRect
  location_lat?: number
  location_lng?: number
  address_source?: 'db' | 'mapbox' | 'ai' | 'none'
  website?: string
  instagram?: string
  hours?: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function extractEventFromImage(base64: string, mimeType: string): Promise<ExtractedEvent> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-poster`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ base64, mimeType }),
  })

  if (!response.ok) throw new Error(`Extraction failed: ${response.status}`)
  return await response.json() as ExtractedEvent
}

// ── Utility: title similarity (word-overlap ratio) ──────────

function titleSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 2))
  const wa = words(a), wb = words(b)
  if (wa.size === 0 || wb.size === 0) return 0
  return [...wa].filter(w => wb.has(w)).length / Math.max(wa.size, wb.size)
}

// ── Utility: neighborhood from Portland street address ───────

function neighborhoodFromAddress(address: string): string {
  const a = address.toUpperCase()
  if (/\bNE\b/.test(a)) return 'Northeast'
  if (/\bSE\b/.test(a)) return 'Southeast'
  if (/\bNW\b/.test(a)) return 'Northwest'
  if (/\bSW\b/.test(a)) return 'Southwest'
  if (/\bN\b/.test(a) && !/\bNE\b|\bNW\b/.test(a)) return 'North'
  return ''
}

// ── Crop preview modal ────────────────────────────────────────

function CropPreviewModal({
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

function ImportForm({ venues }: { venues: Venue[] }) {
  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [extracted, setExtracted] = useState<ExtractedEvent | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const [successTitle, setSuccessTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [userCrop, setUserCrop] = useState<CropRect | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [duplicateEvent, setDuplicateEvent] = useState<{ id: string; title: string; poster_url: string | null; starts_at: string } | null>(null)

  const [form, setForm] = useState({ title: '', venue_id: '', venue_name_manual: '', date: '', time: '', address: '', description: '', category: 'Music' as Category, neighborhood: '', website: '', instagram: '', hours: '' })

  const isUncertain = (field: string) => extracted?.uncertain_fields?.includes(field) ?? false

  const uncertainInput: React.CSSProperties = { ...inputStyle, borderColor: 'rgba(234,179,8,0.5)', background: 'rgba(234,179,8,0.04)' }

  const handleFile = useCallback(async (file: File) => {
    setImageFile(file)
    setPhase('extracting')
    setErrorMsg('')
    try {
      const [dataURL, base64] = await Promise.all([fileToDataURL(file), fileToBase64(file)])
      setImagePreview(dataURL)
      const result = await extractEventFromImage(base64, file.type || 'image/jpeg')
      setExtracted(result)
      const match = venues.find(v => v.name.toLowerCase().includes(result.venue_name.toLowerCase()) || result.venue_name.toLowerCase().includes(v.name.toLowerCase()))
      const detectedNeighborhood = neighborhoodFromAddress(result.address)
      setForm({ title: result.title, venue_id: match?.id ?? '', venue_name_manual: match ? '' : result.venue_name, date: result.date, time: result.time, address: result.address, description: result.description, category: result.category, neighborhood: detectedNeighborhood || match?.neighborhood || '', website: result.website ?? '', instagram: result.instagram ?? '', hours: result.hours ?? '' })
      setPhase('review')
    } catch (e) {
      setErrorMsg(String(e)); setPhase('error')
    }
  }, [venues])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleFile(file)
  }

  const doUpload = async (updateExistingId?: string) => {
    if (!imageFile || !form.title || !form.date) return
    setPhase('uploading')
    try {
      const optimized = await optimizeImage(imageFile, userCrop ?? extracted?.crop)
      const filename = `${Date.now()}-${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`
      const { error: storageError } = await supabaseAdmin.storage.from('posters').upload(filename, optimized, { contentType: 'image/jpeg', upsert: false })
      if (storageError) throw storageError
      const { data: urlData } = supabaseAdmin.storage.from('posters').getPublicUrl(filename)
      const poster_url = urlData.publicUrl

      if (updateExistingId) {
        const { error } = await supabaseAdmin.from('events').update({ poster_url }).eq('id', updateExistingId)
        if (error) throw error
      } else {
        let venue_id = form.venue_id
        if (!venue_id && form.venue_name_manual) {
          const { data: newVenue, error: venueError } = await supabaseAdmin.from('venues').insert({ name: form.venue_name_manual, neighborhood: form.neighborhood || 'Portland', address: form.address || '', website: form.website || null, instagram: form.instagram.replace(/^@/, '') || null, hours: form.hours || null }).select('id').single()
          if (venueError) throw venueError
          venue_id = newVenue.id
        }
        if (!venue_id) throw new Error('A venue is required')
        const timeStr = form.time || '20:00'
        const starts_at = new Date(`${form.date}T${timeStr}:00`).toISOString()
        const { error: eventError } = await supabaseAdmin.from('events').insert({ venue_id, title: form.title, category: form.category, poster_url, starts_at, neighborhood: form.neighborhood || venues.find(v => v.id === venue_id)?.neighborhood || '', address: form.address, description: form.description, view_count: 0, like_count: 0 })
        if (eventError) throw eventError
      }

      setSuccessTitle(form.title)
      setPhase('done')
    } catch (e) {
      setErrorMsg(String(e)); setPhase('error')
    }
  }

  const handleSubmit = async () => {
    if (!imageFile || !form.title || !form.date) return

    // Duplicate detection: same venue + date ±1 day + similar title
    if (form.venue_id && form.date) {
      const center = new Date(`${form.date}T12:00:00`)
      const lo = new Date(center); lo.setDate(lo.getDate() - 1)
      const hi = new Date(center); hi.setDate(hi.getDate() + 1)
      const { data: candidates } = await supabaseAdmin
        .from('events')
        .select('id, title, poster_url, starts_at')
        .eq('venue_id', form.venue_id)
        .gte('starts_at', lo.toISOString())
        .lte('starts_at', hi.toISOString())
      if (candidates?.length) {
        const match = candidates.find(e => titleSimilarity(e.title, form.title) > 0.5)
        if (match) { setDuplicateEvent(match); setPhase('duplicate'); return }
      }
    }

    await doUpload()
  }

  const handlePreview = () => setShowPreviewModal(true)

  const reset = () => {
    setPhase('idle'); setImageFile(null); setImagePreview(''); setExtracted(null); setErrorMsg(''); setSuccessTitle('')
    setForm({ title: '', venue_id: '', venue_name_manual: '', date: '', time: '', address: '', description: '', category: 'Music', neighborhood: '', website: '', instagram: '', hours: '' })
    setUserCrop(null); setShowPreviewModal(false); setDuplicateEvent(null)
  }

  // DEV: generate a mock test poster
  const loadDevPoster = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 400; canvas.height = 600
    const ctx = canvas.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 600)
    g.addColorStop(0, '#7c3aed'); g.addColorStop(1, '#db2777')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 400, 600)
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'
    ctx.font = 'bold 28px sans-serif'; ctx.fillText('DEV TEST — The Neon Wolves', 200, 180)
    ctx.font = '22px sans-serif'; ctx.fillText('@ Mississippi Studios', 200, 240)
    ctx.fillText('Friday Apr 18, 2026 · 9PM', 200, 290)
    ctx.fillText('$15 advance / $18 door · All ages', 200, 330)
    canvas.toBlob(blob => {
      if (blob) handleFile(new File([blob], 'dev-poster.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg')
  }

  if (phase === 'idle') return (
    <div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? 'var(--fg)' : 'var(--fg-25)'}`, borderRadius: 10, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', background: dragging ? 'rgba(240,236,227,0.04)' : 'transparent', transition: 'all 0.15s ease' }}
      >
        <span style={{ fontSize: 36 }}>🖼</span>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg)', margin: 0, textAlign: 'center' }}>Drop a poster image here</p>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', margin: 0 }}>or click to browse · JPG, PNG, WEBP</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      {IS_DEV && (
        <button onClick={loadDevPoster} style={{ marginTop: 12, padding: '6px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em' }}>
          DEV — Load Test Poster
        </button>
      )}
    </div>
  )

  if (phase === 'extracting') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
      {imagePreview && <img src={imagePreview} alt="" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--fg-18)', borderTopColor: 'var(--fg)', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>Asking Claude Vision…</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (phase === 'uploading') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--fg-18)', borderTopColor: 'var(--fg)', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>Optimising &amp; uploading…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (phase === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0', textAlign: 'center' }}>
      <span style={{ fontSize: 40 }}>✓</span>
      <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 20, color: 'var(--fg)', margin: 0 }}>{successTitle}</p>
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', margin: 0 }}>Posted to the wall</p>
      <button onClick={reset} style={{ marginTop: 8, padding: '10px 28px', background: '#A855F7', color: 'white', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
        Import Another
      </button>
    </div>
  )

  if (phase === 'error') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0', textAlign: 'center' }}>
      <span style={{ fontSize: 32 }}>⚠️</span>
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'rgba(239,68,68,0.9)', margin: 0 }}>{errorMsg}</p>
      <button onClick={reset} style={{ padding: '10px 24px', background: 'rgba(240,236,227,0.08)', border: '1px solid var(--fg-18)', borderRadius: 6, color: 'var(--fg)', cursor: 'pointer', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
        Try Again
      </button>
    </div>
  )

  // ── Duplicate phase ──
  if (phase === 'duplicate' && duplicateEvent) {
    const existingDate = duplicateEvent.starts_at ? new Date(duplicateEvent.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Possible duplicate found</span>
        </div>
        <div style={{ border: '1px solid var(--fg-18)', borderRadius: 8, overflow: 'hidden', display: 'flex', gap: 14, padding: 12, alignItems: 'flex-start', background: 'rgba(240,236,227,0.03)' }}>
          {duplicateEvent.poster_url && (
            <img src={duplicateEvent.poster_url} alt="" style={{ width: 60, height: 90, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
          )}
          <div>
            <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px 0' }}>{duplicateEvent.title}</p>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', margin: 0 }}>{existingDate}</p>
          </div>
        </div>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', margin: 0 }}>
          This event already exists at this venue on or near the same date. Do you want to update its poster, or post as a new event?
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => doUpload(duplicateEvent.id)}
            style={{ flex: 1, padding: '11px 0', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Update existing poster
          </button>
          <button
            onClick={() => doUpload()}
            style={{ flex: 1, padding: '11px 0', background: 'transparent', color: 'var(--fg-65)', border: '1px solid var(--fg-18)', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer' }}
          >
            Post as new
          </button>
        </div>
        <button
          onClick={() => { setDuplicateEvent(null); setPhase('review') }}
          style={{ padding: '8px 0', background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
        >
          ← Back to review
        </button>
      </div>
    )
  }

  // ── Review form ──
  const confidenceColors = { high: '#4ade80', medium: '#facc15', low: '#f87171' }
  const confidenceLabels = { high: 'AI confident', medium: 'Review carefully', low: 'Fill manually' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>Review &amp; Confirm</span>
          {extracted && (
            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: '"Space Grotesk", sans-serif', color: confidenceColors[extracted.confidence], background: `${confidenceColors[extracted.confidence]}18`, border: `1px solid ${confidenceColors[extracted.confidence]}44` }}>
              {confidenceLabels[extracted.confidence]}
            </span>
          )}
        </div>
        <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}>✕</button>
      </div>

      {/* Preview + form */}
      <div style={{ display: 'grid', gridTemplateColumns: imagePreview ? '1fr 1.5fr' : '1fr', gap: 20, alignItems: 'start' }}>
        {imagePreview && (() => {
          const displayCrop = userCrop ?? extracted?.crop ?? { x: 0, y: 0, width: 1, height: 1 }
          const hasDisplayCrop = !(displayCrop.x === 0 && displayCrop.y === 0 && displayCrop.width === 1 && displayCrop.height === 1)
          return (
            <div>
              <div style={{ borderRadius: 8, overflow: 'hidden', background: '#111', maxHeight: 420 }}>
                {hasDisplayCrop ? (
                  <div style={{ position: 'relative', width: '100%', paddingBottom: `${(displayCrop.height / displayCrop.width) * 100}%`, overflow: 'hidden' }}>
                    <img src={imagePreview} alt="Poster" style={{ position: 'absolute', width: `${100 / displayCrop.width}%`, height: `${100 / displayCrop.height}%`, left: `${-displayCrop.x / displayCrop.width * 100}%`, top: `${-displayCrop.y / displayCrop.height * 100}%`, objectFit: 'cover' }} />
                  </div>
                ) : (
                  <img src={imagePreview} alt="Poster" style={{ width: '100%', objectFit: 'contain', maxHeight: 420, display: 'block' }} />
                )}
              </div>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', marginTop: 6, textAlign: 'center' }}>
                {userCrop ? '✂ Cropped (adjusted) · max 1200px · JPEG' : hasDisplayCrop ? '✂ Cropped by AI · max 1200px · JPEG' : 'Will be resized to max 1200px · JPEG'}
              </p>
            </div>
          )
        })()}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Title */}
          <div style={fieldStyle}>
            <label style={{ ...labelStyle, color: isUncertain('title') ? '#facc15' : 'var(--fg-55)' }}>Event Title {isUncertain('title') && '⚠'} *</label>
            <input style={isUncertain('title') ? uncertainInput : inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Artist or event name" />
          </div>

          {/* Venue */}
          <div style={fieldStyle}>
            <label style={{ ...labelStyle, color: isUncertain('venue_name') ? '#facc15' : 'var(--fg-55)' }}>Venue {isUncertain('venue_name') && '⚠'} *</label>
            <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.venue_id} onChange={e => setForm(f => ({ ...f, venue_id: e.target.value, venue_name_manual: '' }))}>
              <option value="">— Select existing venue —</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {form.venue_id && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#4ade80', margin: '4px 0 0 0' }}>matched existing venue</p>
            )}
            {!form.venue_id && (
              <input style={{ ...inputStyle, marginTop: 8 }} value={form.venue_name_manual} onChange={e => setForm(f => ({ ...f, venue_name_manual: e.target.value }))} placeholder="Or type new venue name (will be created)" />
            )}
          </div>

          {/* Neighborhood — only if new venue */}
          {!form.venue_id && form.venue_name_manual && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Neighborhood</label>
              <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.neighborhood} onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}>
                <option value="">— select —</option>
                {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          {/* Enriched venue fields — only for new venues */}
          {!form.venue_id && form.venue_name_manual && (
            <>
              <div style={fieldStyle}>
                <label style={labelStyle}>Hours</label>
                <input style={inputStyle} value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="Mon-Thu 5pm-2am, Fri-Sat 4pm-3am" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Website</label>
                <input style={inputStyle} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://example.com" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Instagram</label>
                <input style={inputStyle} value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="venuename" />
              </div>
            </>
          )}

          {/* Date + Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={fieldStyle}>
              <label style={{ ...labelStyle, color: isUncertain('date') ? '#facc15' : 'var(--fg-55)' }}>Date {isUncertain('date') && '⚠'} *</label>
              <input type="date" style={isUncertain('date') ? uncertainInput : inputStyle} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={fieldStyle}>
              <label style={{ ...labelStyle, color: isUncertain('time') ? '#facc15' : 'var(--fg-55)' }}>Time {isUncertain('time') && '⚠'}</label>
              <input type="time" style={isUncertain('time') ? uncertainInput : inputStyle} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
          </div>

          {/* Category */}
          <div style={fieldStyle}>
            <label style={{ ...labelStyle, color: isUncertain('category') ? '#facc15' : 'var(--fg-55)' }}>Category {isUncertain('category') && '⚠'}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => setForm(f => ({ ...f, category: cat as Category }))} style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${form.category === cat ? 'var(--fg)' : 'var(--fg-18)'}`, background: form.category === cat ? 'var(--fg)' : 'transparent', color: form.category === cat ? 'var(--bg)' : 'var(--fg-55)', fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div style={fieldStyle}>
            <label style={{ ...labelStyle, color: isUncertain('address') ? '#facc15' : 'var(--fg-55)' }}>Address {isUncertain('address') && '⚠'}</label>
            <input style={isUncertain('address') ? uncertainInput : inputStyle} value={form.address} onChange={e => { const addr = e.target.value; const nbhd = neighborhoodFromAddress(addr); setForm(f => ({ ...f, address: addr, ...(nbhd ? { neighborhood: nbhd } : {}) })) }} placeholder="Street address (optional)" />
            {extracted?.address_source === 'db' && form.address && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#4ade80', margin: '4px 0 0 0' }}>from your database</p>
            )}
            {extracted?.address_source === 'mapbox' && form.address && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#60a5fa', margin: '4px 0 0 0' }}>via Mapbox</p>
            )}
            {extracted?.address_source === 'ai' && form.address && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#facc15', margin: '4px 0 0 0' }}>via AI — verify</p>
            )}
          </div>

          {/* Description */}
          <div style={fieldStyle}>
            <label style={{ ...labelStyle, color: isUncertain('description') ? '#facc15' : 'var(--fg-55)' }}>Description {isUncertain('description') && '⚠'}</label>
            <textarea style={{ ...(isUncertain('description') ? uncertainInput : inputStyle), minHeight: 72, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Supporting acts, price, ages…" />
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!imageFile}
              style={{ padding: '12px 14px', background: 'transparent', border: '1px solid var(--fg-25)', borderRadius: 6, color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
            >
              Preview
            </button>
            <button
              onClick={handleSubmit}
              disabled={!form.title || !form.date || (!form.venue_id && !form.venue_name_manual)}
              style={{ flex: 1, padding: '12px 0', background: (form.title && form.date && (form.venue_id || form.venue_name_manual)) ? '#A855F7' : 'var(--fg-18)', color: (form.title && form.date && (form.venue_id || form.venue_name_manual)) ? '#fff' : 'var(--fg-30)', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: (form.title && form.date) ? 'pointer' : 'not-allowed', transition: 'all 0.15s ease' }}
            >
              Post to Wall →
            </button>
            <button onClick={reset} style={{ padding: '12px 16px', background: 'transparent', border: '1px solid var(--fg-18)', borderRadius: 6, color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
              Cancel
            </button>
          </div>

        </div>
      </div>

      {showPreviewModal && imageFile && (
        <CropPreviewModal
          imageSrc={imagePreview}
          imageFile={imageFile}
          aiCrop={extracted?.crop ?? { x: 0, y: 0, width: 1, height: 1 }}
          currentCrop={userCrop ?? extracted?.crop ?? { x: 0, y: 0, width: 1, height: 1 }}
          onCropChange={c => { setUserCrop(c); setShowPreviewModal(true) }}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid var(--fg-08)', paddingTop: 32, marginTop: 32 }}>
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 24px 0' }}>{title}</h2>
      {children}
    </section>
  )
}

// ── Admin bottom nav (mirrors BottomNav exactly, Wall always active) ─────────

const ADMIN_NAV = [
  { label: 'Tonight', path: '/tonight', center: false, icon: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg> },
  { label: 'Map',     path: '/map',     center: false, icon: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg> },
  { label: 'Wall',    path: '/',        center: true,  icon: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
  { label: 'Venues',  path: '/venues',  center: false, icon: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> },
  { label: 'You',     path: '/you',     center: false, icon: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg> },
]

function AdminBottomNav() {
  const navigate = useNavigate()
  return (
    <nav
      className="shrink-0 flex items-center justify-around"
      style={{ height: 'var(--nav-height)', background: 'var(--bg)', borderTop: '1px solid var(--fg-08)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {ADMIN_NAV.map(({ label, path, center, icon }) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className="flex flex-col items-center gap-1"
          style={{ opacity: label === 'Wall' ? 1 : 0.3, color: 'var(--fg)', minWidth: center ? 56 : 44 }}
        >
          {icon(center ? 26 : 20)}
          <span className="font-body font-medium uppercase" style={{ fontSize: 9, letterSpacing: '0.08em' }}>{label}</span>
        </button>
      ))}
    </nav>
  )
}

// ── Main admin dashboard ─────────────────────────────────────

function AdminDashboard() {
  const [venues, setVenues] = useState<Venue[]>([])

  const fetchVenues = async () => {
    const { data } = await supabaseAdmin.from('venues').select('id, name, neighborhood').order('name', { ascending: true })
    if (data) setVenues(data)
  }

  useEffect(() => { fetchVenues() }, [])

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PlasterHeader />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 24px 32px', width: '100%' }}>

          <Section title="Add a Venue">
            <VenueForm onVenueAdded={fetchVenues} />
          </Section>

          <Section title="Add an Event">
            <EventForm venues={venues} />
          </Section>

          <Section title="Import Poster">
            <ImportForm venues={venues} />
          </Section>

        </div>
      </div>
      <AdminBottomNav />
    </div>
  )
}

// ── Entry point ──────────────────────────────────────────────

export function Admin() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />
  return <AdminDashboard />
}
