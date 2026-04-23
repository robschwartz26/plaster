import { useState, useRef } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { CATEGORIES } from '@/lib/categories'
import { inputStyle, labelStyle, fieldStyle, type Venue } from '@/components/admin/adminShared'

export function EventForm({ venues }: { venues: Venue[] }) {
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
