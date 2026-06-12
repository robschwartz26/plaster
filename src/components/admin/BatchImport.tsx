import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { CATEGORIES } from '@/lib/categories'
import { type CropRect, resizeForExtraction, blobToBase64, optimizeImage } from '@/lib/cropUtils'
import { useAuth } from '@/contexts/AuthContext'
import {
  inputStyle,
  extractEventFromImage, friendlyExtractionError,
  venueSimilarity, titleSimilarity,
  type Venue, type ExtractedEvent, type ExtractPayload, type Category,
} from '@/components/admin/adminShared'

// Batch handles poster + one optional info image per event. Multi-date run/tour
// schedules stay in single mode (that's what the schedule dropzone is for).

const MAX_GROUPS = 30
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'

const CONFIDENCE_COLORS = { high: '#4ade80', medium: 'rgba(217,119,6,0.95)', low: '#f87171' } as const
const CONFIDENCE_LABELS = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' } as const

function isImage(f: File): boolean {
  return f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)
}

function findVenueMatch(venues: Venue[], venueName: string): Venue | undefined {
  const name = venueName?.trim().toLowerCase()
  if (!name || name.length < 3) return undefined
  return venues.find(v => {
    const vn = v.name.toLowerCase()
    return vn.includes(name) || name.includes(vn)
  })
}

interface PairGroup {
  id: string
  poster: File
  info: File | null
  posterPreview: string
  infoPreview: string | null
}

type RowStatus = 'pending' | 'extracting' | 'done' | 'failed' | 'submitted'

interface BatchRow {
  id: string
  poster: File
  posterPreview: string
  status: RowStatus
  error?: string
  // editable parsed fields
  title: string
  date: string
  time: string
  description: string
  category: Category
  venue_id: string
  venue_name: string
  suggested_venue_id?: string
  suggested_venue_name?: string
  sold_out: boolean
  crop?: CropRect
  uncertain: string[]
  confidence?: 'high' | 'medium' | 'low'
  duplicateOf?: { id: string; title: string; starts_at: string } | null
  checked: boolean
  descExpanded: boolean
}

type Phase = 'idle' | 'pairing' | 'processing' | 'review' | 'submitting' | 'done'

export function BatchImport({ staffMode = false }: { staffMode?: boolean } = {}) {
  void staffMode // batch always submits as 'pending'; the trigger handles role
  const { user } = useAuth()
  const [venues, setVenues] = useState<Venue[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [groups, setGroups] = useState<PairGroup[]>([])
  const [rows, setRows] = useState<BatchRow[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [submittedCount, setSubmittedCount] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [bulkVenue, setBulkVenue] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabaseAdmin.from('venues')
      .select('id, name, neighborhood, address, location_lat, location_lng, website, instagram, hours')
      .order('name', { ascending: true })
      .then(({ data }) => { if (data) setVenues(data) })
  }, [])

  // Folder picker uses non-standard attributes — set them on the DOM node directly.
  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute('webkitdirectory', '')
      folderRef.current.setAttribute('directory', '')
    }
  }, [phase])

  // ── Auto-pairing: sort by lastModified (tiebreak filename), pair every two ──
  const buildGroups = useCallback((files: File[]) => {
    const imgs = files.filter(isImage)
    if (!imgs.length) return
    const sorted = [...imgs].sort((a, b) => (a.lastModified - b.lastModified) || a.name.localeCompare(b.name))
    const next: PairGroup[] = []
    for (let i = 0; i < sorted.length; i += 2) {
      next.push({
        id: crypto.randomUUID(),
        poster: sorted[i],
        info: sorted[i + 1] ?? null,
        posterPreview: URL.createObjectURL(sorted[i]),
        infoPreview: sorted[i + 1] ? URL.createObjectURL(sorted[i + 1]) : null,
      })
    }
    setGroups(next)
    setPhase('pairing')
  }, [])

  function reset() {
    groups.forEach(g => { URL.revokeObjectURL(g.posterPreview); if (g.infoPreview) URL.revokeObjectURL(g.infoPreview) })
    setGroups([]); setRows([]); setPhase('idle'); setProgress({ done: 0, total: 0 }); setSubmittedCount(0); setBulkVenue('')
  }

  // ── Pairing edits ──
  function splitGroup(idx: number) {
    setGroups(prev => {
      const g = prev[idx]
      if (!g.info) return prev
      const newGroup: PairGroup = { id: crypto.randomUUID(), poster: g.info, info: null, posterPreview: g.infoPreview!, infoPreview: null }
      const updated: PairGroup = { ...g, info: null, infoPreview: null }
      return [...prev.slice(0, idx), updated, newGroup, ...prev.slice(idx + 1)]
    })
  }
  function mergeWithPrevious(idx: number) {
    setGroups(prev => {
      if (idx === 0) return prev
      const cur = prev[idx], pre = prev[idx - 1]
      if (pre.info || cur.info) return prev // only a lone poster into an info-less previous group
      const merged: PairGroup = { ...pre, info: cur.poster, infoPreview: cur.posterPreview }
      return [...prev.slice(0, idx - 1), merged, ...prev.slice(idx + 1)]
    })
  }

  // ── Duplicate check: same venue + date ±1 day + similar title ──
  async function checkDuplicate(venue_id: string, date: string, title: string) {
    const center = new Date(`${date}T12:00:00`)
    const lo = new Date(center); lo.setDate(lo.getDate() - 1)
    const hi = new Date(center); hi.setDate(hi.getDate() + 1)
    const { data } = await supabaseAdmin.from('events')
      .select('id, title, starts_at')
      .eq('venue_id', venue_id)
      .gte('starts_at', lo.toISOString())
      .lte('starts_at', hi.toISOString())
    return data?.find(e => titleSimilarity(e.title, title) > 0.5) ?? null
  }

  // ── Confirm pairing → sequential extraction (per-group failure tolerant) ──
  async function processBatch() {
    const capped = groups.slice(0, MAX_GROUPS)
    const initial: BatchRow[] = capped.map(g => ({
      id: g.id, poster: g.poster, posterPreview: g.posterPreview, status: 'pending',
      title: '', date: '', time: '', description: '', category: 'Live Music' as Category,
      venue_id: '', venue_name: '', sold_out: false, uncertain: [], checked: false, descExpanded: false, duplicateOf: null,
    }))
    setRows(initial)
    setPhase('processing')
    setProgress({ done: 0, total: capped.length })

    for (let i = 0; i < capped.length; i++) {
      const g = capped[i]
      setProgress({ done: i, total: capped.length })
      setRows(prev => prev.map(r => r.id === g.id ? { ...r, status: 'extracting' } : r))
      try {
        const posterB64 = await resizeForExtraction(g.poster).then(blobToBase64)
        const payload: ExtractPayload = g.info
          ? { images: [
              { base64: posterB64, mimeType: 'image/jpeg' },
              { base64: await resizeForExtraction(g.info).then(blobToBase64), mimeType: 'image/jpeg' },
            ] }
          : { base64: posterB64, mimeType: 'image/jpeg' }
        const result: ExtractedEvent = await extractEventFromImage(payload)
        const match = findVenueMatch(venues, result.venue_name)
        const suggested = !match ? venues.find(v => venueSimilarity(v.name, result.venue_name) > 0.7) : undefined
        const venue_id = match?.id ?? ''
        const dup = (venue_id && result.date) ? await checkDuplicate(venue_id, result.date, result.title) : null
        setRows(prev => prev.map(r => r.id === g.id ? {
          ...r,
          status: 'done',
          title: result.title, date: result.date, time: result.time, description: result.description,
          category: result.category, venue_id, venue_name: result.venue_name,
          suggested_venue_id: suggested?.id, suggested_venue_name: suggested?.name,
          sold_out: result.sold_out ?? false, crop: result.crop,
          uncertain: result.uncertain_fields ?? [], confidence: result.confidence,
          duplicateOf: dup,
          checked: !!venue_id && !dup, // default-check resolved, non-duplicate rows
        } : r))
      } catch (e) {
        setRows(prev => prev.map(r => r.id === g.id ? { ...r, status: 'failed', error: friendlyExtractionError(e) } : r))
      }
    }
    setProgress({ done: capped.length, total: capped.length })
    setPhase('review')
  }

  // ── Submit selected → insert each as pending via the single-form shape ──
  async function submitSelected() {
    const selected = rows.filter(r => r.status === 'done' && r.checked && r.venue_id && r.title && r.date)
    if (!selected.length) return
    setPhase('submitting')
    setProgress({ done: 0, total: selected.length })
    const confidenceMap: Record<string, number> = { high: 95, medium: 65, low: 35 }
    let ok = 0
    for (let i = 0; i < selected.length; i++) {
      const r = selected[i]
      setProgress({ done: i, total: selected.length })
      try {
        const optimized = await optimizeImage(r.poster, r.crop)
        const filename = `${Date.now()}-${i}-${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.jpg`
        const { error: se } = await supabaseAdmin.storage.from('posters').upload(filename, optimized, { contentType: 'image/jpeg', upsert: false })
        if (se) throw se
        const { data: urlData } = supabaseAdmin.storage.from('posters').getPublicUrl(filename)
        const venue = venues.find(v => v.id === r.venue_id)
        const startDate = new Date(`${r.date}T${r.time || '20:00'}:00`)
        const { error: ee } = await supabaseAdmin.from('events').insert({
          venue_id: r.venue_id, title: r.title, category: r.category, poster_url: urlData.publicUrl,
          neighborhood: venue?.neighborhood ?? '', address: venue?.address ?? '', description: r.description,
          view_count: 0, like_count: 0, fill_frame: false, focal_x: 0.5, focal_y: 0.5, sold_out: r.sold_out,
          source_url: null, ai_confidence: r.confidence ? (confidenceMap[r.confidence] ?? null) : null, flag_note: null,
          starts_at: startDate.toISOString(),
          status: 'pending', created_by: user?.id ?? null,
        })
        if (ee) throw ee
        ok++
        setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: 'submitted' } : x))
      } catch (e) {
        setRows(prev => prev.map(x => x.id === r.id ? { ...x, error: String(e), checked: false } : x))
      }
    }
    setSubmittedCount(ok)
    setProgress({ done: selected.length, total: selected.length })
    setPhase('done')
  }

  const selectedCount = rows.filter(r => r.status === 'done' && r.checked && r.venue_id && r.title && r.date).length
  const unmatchedCount = rows.filter(r => r.status === 'done' && !r.venue_id).length

  // ── IDLE: multi-drop ──
  if (phase === 'idle') return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); buildGroups(Array.from(e.dataTransfer.files)) }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? 'var(--fg)' : 'var(--fg-25)'}`, borderRadius: 10, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', background: dragging ? 'rgba(240,236,227,0.04)' : 'transparent', transition: 'all 0.15s ease' }}
      >
        <span style={{ fontSize: 34 }}>🗂</span>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg)', margin: 0, textAlign: 'center' }}>Drop many poster images here</p>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', margin: 0, textAlign: 'center' }}>posters + optional info screenshots · JPG, PNG, WEBP, HEIC · up to {MAX_GROUPS} events</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => fileRef.current?.click()} style={ghostBtn}>Choose files</button>
        <button onClick={() => folderRef.current?.click()} style={ghostBtn}>Choose folder</button>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }} onChange={e => buildGroups(Array.from(e.target.files ?? []))} />
      {/* webkitdirectory folder picker (Chromium/Safari) — attrs set via ref effect */}
      <input ref={folderRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }} onChange={e => buildGroups(Array.from(e.target.files ?? []))} />
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', margin: '12px 0 0', lineHeight: 1.5 }}>
        Batch mode handles a poster + one optional info image per event. Has a tour schedule / multiple dates? Use single mode for that one.
      </p>
    </div>
  )

  // ── PAIRING strip ──
  if (phase === 'pairing') {
    const overCap = groups.length > MAX_GROUPS
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>
            Confirm pairing · {Math.min(groups.length, MAX_GROUPS)} event{groups.length !== 1 ? 's' : ''}
          </span>
          <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', cursor: 'pointer', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12 }}>✕ start over</button>
        </div>
        {overCap && (
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(217,119,6,0.95)', margin: '0 0 10px' }}>
            ⚠ Batch is capped at {MAX_GROUPS} — only the first {MAX_GROUPS} will be processed.
          </p>
        )}
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '0 0 12px' }}>
          Each card is one event: poster + optional info image. Nothing is uploaded or read until you confirm.
        </p>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {groups.map((g, idx) => (
            <div key={g.id} style={{ flexShrink: 0, width: 150, border: '1px solid var(--fg-15)', borderRadius: 8, padding: 8, background: 'rgba(240,236,227,0.02)' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <img src={g.posterPreview} alt="" style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 4, display: 'block', border: '1px solid var(--fg-15)' }} />
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'var(--fg-40)', margin: '3px 0 0', textAlign: 'center' }}>poster</p>
                </div>
                {g.info && g.infoPreview && (
                  <div style={{ flex: 1, position: 'relative' }}>
                    <img src={g.infoPreview} alt="" style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 4, display: 'block', border: '1px solid var(--fg-15)', opacity: 0.85 }} />
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'var(--fg-40)', margin: '3px 0 0', textAlign: 'center' }}>info</p>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {g.info ? (
                  <button onClick={() => splitGroup(idx)} title="Split — info becomes its own poster" style={chipBtn}>split</button>
                ) : (
                  <button onClick={() => mergeWithPrevious(idx)} disabled={idx === 0 || !!groups[idx - 1]?.info} title="Merge — this poster becomes the previous card's info image" style={{ ...chipBtn, opacity: (idx === 0 || !!groups[idx - 1]?.info) ? 0.35 : 1 }}>← merge</button>
                )}
                {!g.info && <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'var(--fg-30)', alignSelf: 'center' }}>no info</span>}
              </div>
            </div>
          ))}
        </div>
        <button onClick={processBatch} style={{ ...primaryBtn, width: '100%', marginTop: 14 }}>
          Confirm &amp; extract {Math.min(groups.length, MAX_GROUPS)} →
        </button>
      </div>
    )
  }

  // ── PROCESSING ──
  if (phase === 'processing') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--fg-18)', borderTopColor: 'var(--fg)', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>extracting {Math.min(progress.done + 1, progress.total)}/{progress.total}…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── DONE ──
  if (phase === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0', textAlign: 'center' }}>
      <span style={{ fontSize: 38 }}>✓</span>
      <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 20, color: 'var(--fg)', margin: 0 }}>{submittedCount} event{submittedCount !== 1 ? 's' : ''} submitted for review</p>
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', margin: 0 }}>They're pending in the Review queue.</p>
      <button onClick={reset} style={{ ...primaryBtn, marginTop: 6 }}>Batch another</button>
    </div>
  )

  // ── REVIEW / SUBMITTING checklist ──
  const submitting = phase === 'submitting'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>
          Review · {rows.filter(r => r.status === 'done' || r.status === 'submitted').length} extracted{rows.some(r => r.status === 'failed') ? ` · ${rows.filter(r => r.status === 'failed').length} failed` : ''}
        </span>
        <button onClick={reset} disabled={submitting} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', cursor: 'pointer', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12 }}>✕ discard batch</button>
      </div>

      {/* Bulk assign unmatched */}
      {unmatchedCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '10px 12px', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, background: 'rgba(217,119,6,0.06)' }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', whiteSpace: 'nowrap' }}>Assign all {unmatchedCount} unmatched to:</span>
          <select value={bulkVenue} onChange={e => setBulkVenue(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 160, padding: '6px 10px', fontSize: 13 }}>
            <option value="">— pick a venue —</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button
            disabled={!bulkVenue}
            onClick={() => setRows(prev => prev.map(r => (r.status === 'done' && !r.venue_id) ? { ...r, venue_id: bulkVenue, checked: !r.duplicateOf } : r))}
            style={{ ...primaryBtn, padding: '7px 12px', fontSize: 12, opacity: bulkVenue ? 1 : 0.4 }}
          >Apply</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => {
          if (r.status === 'failed') return (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
              <img src={r.posterPreview} alt="" style={{ width: 34, height: 46, objectFit: 'cover', borderRadius: 4, flexShrink: 0, opacity: 0.6 }} />
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.9)' }}>Extraction failed — {r.error}</span>
            </div>
          )
          if (r.status === 'extracting' || r.status === 'pending') return (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--fg-08)' }}>
              <img src={r.posterPreview} alt="" style={{ width: 34, height: 46, objectFit: 'cover', borderRadius: 4, flexShrink: 0, opacity: 0.5 }} />
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>{r.status === 'extracting' ? 'reading…' : 'queued'}</span>
            </div>
          )

          const submitted = r.status === 'submitted'
          const uncertain = (f: string) => r.uncertain.includes(f)
          const setRow = (patch: Partial<BatchRow>) => setRows(prev => prev.map(x => x.id === r.id ? { ...x, ...patch } : x))
          return (
            <div key={r.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${submitted ? 'rgba(74,222,128,0.3)' : r.duplicateOf ? 'rgba(217,119,6,0.3)' : 'var(--fg-12, var(--fg-15))'}`, background: submitted ? 'rgba(74,222,128,0.05)' : 'transparent', opacity: submitting && !r.checked ? 0.5 : 1 }}>
              {/* checkbox */}
              <input
                type="checkbox"
                checked={r.checked}
                disabled={submitting || submitted || !r.venue_id}
                onChange={e => setRow({ checked: e.target.checked })}
                style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: '#A855F7', cursor: r.venue_id ? 'pointer' : 'not-allowed' }}
              />
              {/* poster thumb */}
              <img src={r.posterPreview} alt="" style={{ width: 42, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--fg-15)' }} />
              {/* fields */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* title + confidence + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    value={r.title}
                    disabled={submitting || submitted}
                    onChange={e => setRow({ title: e.target.value })}
                    placeholder="Event title"
                    style={{ ...inputStyle, flex: 1, minWidth: 120, padding: '5px 8px', fontSize: 13, ...(uncertain('title') ? { borderColor: 'rgba(234,179,8,0.5)', background: 'rgba(234,179,8,0.04)' } : {}) }}
                  />
                  {uncertain('title') && <span title="AI uncertain" style={{ color: '#facc15', fontSize: 12 }}>⚠</span>}
                  {r.confidence && (
                    <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: CONFIDENCE_COLORS[r.confidence], background: `${CONFIDENCE_COLORS[r.confidence]}1a`, border: `1px solid ${CONFIDENCE_COLORS[r.confidence]}55`, padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
                      {CONFIDENCE_LABELS[r.confidence]}
                    </span>
                  )}
                  {r.duplicateOf && <span title={`Looks like "${r.duplicateOf.title}"`} style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(217,119,6,0.95)', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>DUPLICATE</span>}
                  {submitted && <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: '#4ade80', padding: '1px 5px' }}>✓ SUBMITTED</span>}
                </div>

                {/* date + time */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={r.date} disabled={submitting || submitted} onChange={e => setRow({ date: e.target.value })} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12, ...(uncertain('date') ? { borderColor: 'rgba(234,179,8,0.5)' } : {}) }} />
                  {uncertain('date') && <span title="AI uncertain" style={{ color: '#facc15', fontSize: 12 }}>⚠</span>}
                  <input type="time" value={r.time} disabled={submitting || submitted} onChange={e => setRow({ time: e.target.value })} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12 }} />
                  <select value={r.category} disabled={submitting || submitted} onChange={e => setRow({ category: e.target.value as Category })} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12, appearance: 'none' }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    onClick={() => setRow({ sold_out: !r.sold_out })}
                    disabled={submitting || submitted}
                    style={{ padding: '3px 8px', borderRadius: 4, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${r.sold_out ? 'rgba(240,70,60,0.5)' : 'var(--fg-18)'}`, background: r.sold_out ? 'rgba(240,70,60,0.15)' : 'transparent', color: r.sold_out ? '#f0463c' : 'var(--fg-40)' }}
                  >{r.sold_out ? 'sold out' : 'available'}</button>
                </div>

                {/* venue */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={r.venue_id}
                    disabled={submitting || submitted}
                    onChange={e => setRow({ venue_id: e.target.value, checked: e.target.value ? !r.duplicateOf : false })}
                    style={{ ...inputStyle, flex: 1, minWidth: 150, padding: '4px 8px', fontSize: 12, appearance: 'none', ...(r.venue_id ? {} : { borderColor: 'rgba(217,119,6,0.5)' }) }}
                  >
                    <option value="">⚠ needs venue{r.venue_name ? ` ("${r.venue_name}")` : ''} — pick…</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {!r.venue_id && r.suggested_venue_id && (
                    <button
                      onClick={() => setRow({ venue_id: r.suggested_venue_id!, checked: !r.duplicateOf })}
                      style={{ ...chipBtn, color: '#A855F7', borderColor: 'rgba(168,85,247,0.4)' }}
                    >→ {r.suggested_venue_name}?</button>
                  )}
                </div>

                {/* description — 1-line preview, tap to expand into editable textarea */}
                {r.descExpanded ? (
                  <textarea
                    value={r.description}
                    disabled={submitting || submitted}
                    onChange={e => setRow({ description: e.target.value })}
                    onBlur={() => setRow({ descExpanded: false })}
                    autoFocus
                    placeholder="Synopsis (Plaster voice)…"
                    style={{ ...inputStyle, minHeight: 64, resize: 'vertical', padding: '6px 8px', fontSize: 12, ...(uncertain('description') ? { borderColor: 'rgba(234,179,8,0.5)' } : {}) }}
                  />
                ) : (
                  <button
                    onClick={() => !submitting && !submitted && setRow({ descExpanded: true })}
                    title="Tap to edit description"
                    style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: submitted ? 'default' : 'text', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: r.description ? 'var(--fg-40)' : 'var(--fg-25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
                  >
                    {uncertain('description') && <span style={{ color: '#facc15' }}>⚠ </span>}
                    {r.description || 'No description — tap to add'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Submit bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
        <button
          onClick={submitSelected}
          disabled={submitting || selectedCount === 0}
          style={{ ...primaryBtn, flex: 1, opacity: (submitting || selectedCount === 0) ? 0.5 : 1 }}
        >
          {submitting ? `Submitting ${progress.done + 1}/${progress.total}…` : `Submit ${selectedCount} selected →`}
        </button>
      </div>
    </div>
  )
}

// ── shared button styles ──
const primaryBtn: React.CSSProperties = { padding: '11px 18px', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { flex: 1, padding: '9px 0', background: 'transparent', border: '1px solid var(--fg-18)', borderRadius: 6, color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer' }
const chipBtn: React.CSSProperties = { padding: '3px 8px', borderRadius: 4, border: '1px solid var(--fg-18)', background: 'transparent', color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }
