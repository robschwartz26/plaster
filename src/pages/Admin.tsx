import { useState, useEffect, useRef } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { PlasterHeader } from '@/components/PlasterHeader'

// ── Constants ────────────────────────────────────────────────

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD as string
const SESSION_KEY = 'plaster_admin_unlocked'
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string

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
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 320 }}>
        <p
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--fg)',
            marginBottom: 8,
          }}
        >
          plaster
        </p>
        <p
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 13,
            color: 'var(--fg-40)',
            marginBottom: 32,
            letterSpacing: '0.04em',
          }}
        >
          admin
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Password"
            value={value}
            autoFocus
            onChange={(e) => { setValue(e.target.value); setError(false) }}
            style={{
              ...inputStyle,
              borderColor: error ? 'rgba(239,68,68,0.6)' : 'var(--fg-18)',
            }}
          />
          {error && (
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.8)', margin: 0 }}>
              Incorrect password.
            </p>
          )}
          <button
            type="submit"
            style={{
              background: '#A855F7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '12px 0',
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Venue form ───────────────────────────────────────────────

function VenueForm({ onVenueAdded }: { onVenueAdded: () => void }) {
  const [form, setForm] = useState({
    name: '',
    neighborhood: '',
    address: '',
    website: '',
    instagram: '',
  })
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
      if (coords) {
        location_lat = coords.lat
        location_lng = coords.lng
      }
    }

    const { error } = await supabaseAdmin.from('venues').insert({
      name: form.name.trim(),
      neighborhood: form.neighborhood || null,
      address: form.address.trim() || null,
      website: form.website.trim() || null,
      instagram: form.instagram.replace(/^@/, '').trim() || null,
      location_lat,
      location_lng,
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('success')
      setForm({ name: '', neighborhood: '', address: '', website: '', instagram: '' })
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
        <select
          style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          value={form.neighborhood}
          onChange={set('neighborhood')}
        >
          <option value="">— select —</option>
          {NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Address</label>
        <input
          style={inputStyle}
          value={form.address}
          onChange={set('address')}
          placeholder="2845 SE Stark St"
        />
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', marginTop: 4 }}>
          Auto-geocoded to lat/lng via Mapbox
        </p>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Website</label>
        <input style={inputStyle} value={form.website} onChange={set('website')} placeholder="https://goodfootlounge.com" />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Instagram</label>
        <input style={inputStyle} value={form.instagram} onChange={set('instagram')} placeholder="@goodfootpdx" />
      </div>

      {status === 'error' && (
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.8)', margin: 0 }}>
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        style={{
          background: status === 'success' ? 'rgba(34,197,94,0.8)' : '#A855F7',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '12px 0',
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 600,
          fontSize: 14,
          cursor: status === 'loading' ? 'wait' : 'pointer',
          letterSpacing: '0.04em',
          transition: 'background 0.2s ease',
        }}
      >
        {status === 'loading' ? 'Saving…' : status === 'success' ? 'Venue saved' : 'Add Venue'}
      </button>
    </form>
  )
}

// ── Event form ───────────────────────────────────────────────

interface Venue { id: string; name: string }

function EventForm({ venues }: { venues: Venue[] }) {
  const [form, setForm] = useState({
    venue_id: '',
    title: '',
    category: '',
    date: '',
    start_time: '',
    description: '',
    is_recurring: false,
    recurrence_rule: '',
  })
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setPosterFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPosterPreview(url)
    } else {
      setPosterPreview(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    let poster_url: string | null = null

    // Upload poster if provided
    if (posterFile) {
      const ext = posterFile.name.split('.').pop()
      const filename = `${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('posters')
        .upload(filename, posterFile, { contentType: posterFile.type, upsert: false })

      if (uploadError) {
        setStatus('error')
        setErrorMsg(`Poster upload failed: ${uploadError.message}`)
        return
      }

      const { data: urlData } = supabaseAdmin.storage.from('posters').getPublicUrl(filename)
      poster_url = urlData.publicUrl
    }

    // Build starts_at ISO string
    const starts_at = form.date && form.start_time
      ? new Date(`${form.date}T${form.start_time}:00`).toISOString()
      : form.date
        ? new Date(`${form.date}T20:00:00`).toISOString()
        : null

    if (!starts_at) {
      setStatus('error')
      setErrorMsg('Date is required.')
      return
    }

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
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('success')
      setForm({
        venue_id: '', title: '', category: '', date: '', start_time: '',
        description: '', is_recurring: false, recurrence_rule: '',
      })
      setPosterFile(null)
      setPosterPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={fieldStyle}>
        <label style={labelStyle}>Venue</label>
        <select
          style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          value={form.venue_id}
          onChange={set('venue_id')}
        >
          <option value="">— no venue —</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Poster image</label>

        {/* Drop zone / file button */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: '1px dashed var(--fg-25)',
            borderRadius: 6,
            padding: posterPreview ? 0 : '24px 0',
            cursor: 'pointer',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: posterPreview ? 'auto' : 64,
            background: 'rgba(240,236,227,0.03)',
          }}
        >
          {posterPreview ? (
            <img
              src={posterPreview}
              alt="poster preview"
              style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
              Tap to choose image
            </span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {posterFile && (
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', marginTop: 4 }}>
            {posterFile.name}
          </p>
        )}
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Event title *</label>
        <input style={inputStyle} value={form.title} onChange={set('title')} required placeholder="Late Night with DJ Hessa" />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Category</label>
        <select
          style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
          value={form.category}
          onChange={set('category')}
        >
          <option value="">— select —</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Date *</label>
          <input
            style={inputStyle}
            type="date"
            value={form.date}
            onChange={set('date')}
            required
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Start time</label>
          <input
            style={inputStyle}
            type="time"
            value={form.start_time}
            onChange={set('start_time')}
          />
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          value={form.description}
          onChange={set('description')}
          placeholder="Optional — ticket info, age restrictions, etc."
        />
      </div>

      {/* Recurring toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_recurring: !f.is_recurring, recurrence_rule: '' }))}
          style={{
            width: 40,
            height: 22,
            borderRadius: 11,
            border: 'none',
            background: form.is_recurring ? '#A855F7' : 'var(--fg-18)',
            position: 'relative',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.2s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: form.is_recurring ? 21 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
            }}
          />
        </button>
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
          Recurring event
        </span>
      </div>

      {form.is_recurring && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Recurrence</label>
          <select
            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
            value={form.recurrence_rule}
            onChange={set('recurrence_rule')}
          >
            <option value="">— select —</option>
            <option value="FREQ=DAILY">Daily</option>
            <option value="FREQ=WEEKLY">Weekly</option>
            <option value="FREQ=MONTHLY">Monthly</option>
          </select>
        </div>
      )}

      {status === 'error' && (
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.8)', margin: 0 }}>
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        style={{
          background: status === 'success' ? 'rgba(34,197,94,0.8)' : '#A855F7',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '12px 0',
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 600,
          fontSize: 14,
          cursor: status === 'loading' ? 'wait' : 'pointer',
          letterSpacing: '0.04em',
          transition: 'background 0.2s ease',
        }}
      >
        {status === 'loading' ? 'Saving…' : status === 'success' ? 'Event saved' : 'Add Event'}
      </button>
    </form>
  )
}

// ── Section wrapper ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        borderTop: '1px solid var(--fg-08)',
        paddingTop: 32,
        marginTop: 32,
      }}
    >
      <h2
        style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--fg)',
          margin: '0 0 24px 0',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

// ── Main admin dashboard ─────────────────────────────────────

function AdminDashboard() {
  const [venues, setVenues] = useState<Venue[]>([])

  const fetchVenues = async () => {
    const { data } = await supabaseAdmin
      .from('venues')
      .select('id, name')
      .order('name', { ascending: true })
    if (data) setVenues(data)
  }

  useEffect(() => { fetchVenues() }, [])

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PlasterHeader />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 24px 80px', width: '100%' }}>

        <Section title="Add a Venue">
          <VenueForm onVenueAdded={fetchVenues} />
        </Section>

        <Section title="Add an Event">
          <EventForm venues={venues} />
        </Section>
      </div>
    </div>
  )
}

// ── Entry point ──────────────────────────────────────────────

export function Admin() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />
  }

  return <AdminDashboard />
}
