import { useState } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { NEIGHBORHOODS, inputStyle, labelStyle, fieldStyle, geocodeAddress } from '@/components/admin/adminShared'
import { callScrapeFn } from '@/components/admin/AdminAutoIngest'

type VenueFormFields = { name: string; neighborhood: string; address: string; website: string; instagram: string; hours: string }

export function VenueForm({ onVenueAdded, initial, onCreated }: {
  onVenueAdded: () => void
  initial?: Partial<VenueFormFields>            // seed values (e.g. from a scraped orphan)
  onCreated?: (venueId: string) => void | Promise<void>  // caller handles relink; skips the legacy scrape-sources relink
}) {
  const [form, setForm] = useState<VenueFormFields>({ name: '', neighborhood: '', address: '', website: '', instagram: '', hours: '', ...initial })
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

    const { data, error } = await supabaseAdmin.from('venues').insert({
      name: form.name.trim(),
      neighborhood: form.neighborhood || null,
      address: form.address.trim() || null,
      website: form.website.trim() || null,
      instagram: form.instagram.replace(/^@/, '').trim() || null,
      hours: form.hours.trim() || null,
      location_lat,
      location_lng,
    }).select('id').single()

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('success')
      setForm({ name: '', neighborhood: '', address: '', website: '', instagram: '', hours: '' })
      onVenueAdded()
      setTimeout(() => setStatus('idle'), 3000)
      if (data?.id) {
        if (onCreated) {
          // New-venue intake flow: the caller relinks this venue's orphans via the
          // new firecrawl-ingest function (no scrape-sources dependency).
          await Promise.resolve(onCreated(data.id))
        } else {
          // Legacy path: fuzzy-relink any parked scrape-sources orphans (fire-and-forget).
          callScrapeFn({ relinkOrphans: { venueId: data.id } })
            .catch(err => console.warn('[VenueForm] orphan relink failed', err))
        }
      }
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
