import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { optimizeImage, resizeForExtraction, blobToBase64 } from '@/lib/cropUtils'
import { CATEGORY_GRADIENTS } from '@/lib/categories'
import { EventInfoFace } from '@/components/admin/EventInfoFace'
import { pendingToWallEvent, type PendingEvent } from '@/components/admin/reviewShared'

// The editable face of a Review-stage event: text fields + a poster re-upload drop
// zone, with a live preview of the resulting info page. Save writes straight to the
// events row (admin RLS permits). Used inside each expanded Review row.

const CATEGORY_OPTIONS = Object.keys(CATEGORY_GRADIENTS)

function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface VenueLite { id: string; name: string; neighborhood: string | null; address: string | null }

export function ReviewRowEditor({ row, venues, onSaved }: { row: PendingEvent; venues: VenueLite[]; onSaved: () => void }) {
  const [title, setTitle] = useState(row.title)
  const [venueId, setVenueId] = useState(row.venue_id ?? '')
  const [category, setCategory] = useState(row.category ?? 'Other')
  const [startsAt, setStartsAt] = useState(isoToLocalInput(row.starts_at))
  const [description, setDescription] = useState(row.description ?? '')
  const [soldOut, setSoldOut] = useState(!!row.sold_out)
  const [posterUrl, setPosterUrl] = useState(row.poster_url)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const [infoBusy, setInfoBusy] = useState(false)
  const [infoDrag, setInfoDrag] = useState(false)
  const [infoErr, setInfoErr] = useState('')

  function takeFile(f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return
    setPosterFile(f)
    setPosterPreview(URL.createObjectURL(f))
    setSaved(false)
  }

  // Drop a screenshot of the event info → Claude Vision writes a Plaster-voice blurb
  // (grounded in what's visible) → fills the description field for you to tweak.
  async function describeFromScreenshot(f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return
    setInfoBusy(true); setInfoErr('')
    try {
      const blob = await resizeForExtraction(f)
      const base64 = await blobToBase64(blob)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in')
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ describeImage: { base64, mimeType: 'image/jpeg', title, venue: venues.find(v => v.id === venueId)?.name ?? row.venue_name ?? '' } }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error || `failed: ${res.status}`)
      const blurb = ((json as { blurb?: string }).blurb ?? '').trim()
      if (!blurb || blurb.toUpperCase() === 'NONE') throw new Error("Couldn't read event details from that image — try a clearer screenshot.")
      setDescription(blurb); setSaved(false)
    } catch (e) {
      setInfoErr(e instanceof Error ? e.message : String(e))
    } finally { setInfoBusy(false) }
  }

  async function save() {
    setSaving(true); setErr(''); setSaved(false)
    try {
      let newPosterUrl = posterUrl
      if (posterFile) {
        const optimized = await optimizeImage(posterFile)
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
        const filename = `${Date.now()}-${slug || 'poster'}.jpg`
        const { error: upErr } = await supabase.storage.from('posters').upload(filename, optimized, { contentType: 'image/jpeg', upsert: false })
        if (upErr) throw upErr
        newPosterUrl = supabase.storage.from('posters').getPublicUrl(filename).data.publicUrl
      }
      const venue = venues.find(v => v.id === venueId)
      const { error: updErr } = await supabase.from('events').update({
        title: title.trim(),
        venue_id: venueId || null,
        category,
        description: description.trim() || null,
        sold_out: soldOut,
        starts_at: new Date(startsAt).toISOString(),
        poster_url: newPosterUrl,
        // keep address/neighborhood in step with the chosen venue; clearing the
        // venue clears them too (no stale address from the previous venue)
        neighborhood: venue?.neighborhood ?? null,
        address: venue?.address ?? null,
      }).eq('id', row.id)
      if (updErr) throw updErr
      setPosterUrl(newPosterUrl); setPosterFile(null)
      setSaved(true)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  const selectedVenue = venues.find(v => v.id === venueId)
  const previewEvent = pendingToWallEvent({
    id: row.id, title, venue_id: venueId || null, venue_name: selectedVenue?.name ?? row.venue_name,
    starts_at: new Date(startsAt).toISOString(), category, poster_url: posterPreview ?? posterUrl, sold_out: soldOut,
  })

  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 4, fontFamily: '"Space Grotesk", sans-serif' }}>
      {/* Left: poster + drop zone */}
      <div style={{ width: 150, flexShrink: 0 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); takeFile(e.dataTransfer.files?.[0]) }}
          onClick={() => document.getElementById(`review-poster-${row.id}`)?.click()}
          style={{ position: 'relative', paddingBottom: '150%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--fg-08)', border: dragging ? '2px dashed #A855F7' : '1px solid var(--fg-15)' }}
        >
          {(posterPreview ?? posterUrl)
            ? <img src={posterPreview ?? posterUrl!} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-30)', fontSize: 11 }}>no poster</div>}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 6px', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9, textAlign: 'center', letterSpacing: '0.04em' }}>
            {dragging ? 'drop to replace' : 'drop / click to replace'}
          </div>
        </div>
        <input id={`review-poster-${row.id}`} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => takeFile(e.target.files?.[0] ?? undefined)} />
      </div>

      {/* Middle: fields */}
      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={lbl}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={lbl}>Venue</label>
            <select value={venueId} onChange={e => setVenueId(e.target.value)} style={inp}>
              <option value="">— none —</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label style={lbl}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={lbl}>Date &amp; time</label>
            <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={inp} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-65)', paddingBottom: 8 }}>
            <input type="checkbox" checked={soldOut} onChange={e => setSoldOut(e.target.checked)} /> Sold out
          </label>
        </div>
        <div>
          <label style={lbl}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          {/* Drop a screenshot → AI writes the blurb */}
          <div
            onDragOver={e => { e.preventDefault(); setInfoDrag(true) }}
            onDragLeave={() => setInfoDrag(false)}
            onDrop={e => { e.preventDefault(); setInfoDrag(false); describeFromScreenshot(e.dataTransfer.files?.[0]) }}
            onClick={() => document.getElementById(`info-shot-${row.id}`)?.click()}
            style={{ marginTop: 6, padding: '9px 11px', borderRadius: 7, cursor: infoBusy ? 'wait' : 'pointer', textAlign: 'center', fontSize: 11.5, lineHeight: 1.4, color: infoBusy ? 'var(--fg-40)' : 'var(--fg-55)', border: infoDrag ? '1.5px dashed #A855F7' : '1.5px dashed var(--fg-18)', background: infoDrag ? 'rgba(168,85,247,0.06)' : 'transparent' }}
          >
            {infoBusy ? 'Reading screenshot…' : <>📄 Drop a <strong>screenshot of the event info</strong> → AI writes the blurb</>}
          </div>
          <input id={`info-shot-${row.id}`} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => describeFromScreenshot(e.target.files?.[0] ?? undefined)} />
          {infoErr && <span style={{ fontSize: 11, color: '#e05555' }}>{infoErr}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#A855F7', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>Saved ✓</span>}
          {err && <span style={{ fontSize: 12, color: '#e05555' }}>{err}</span>}
        </div>
      </div>

      {/* Right: live info-page preview */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-30)', marginBottom: 6 }}>Info-page preview</div>
        <EventInfoFace event={previewEvent} description={description.trim() || null} address={selectedVenue?.address ?? row.address} />
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--fg-18)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }
