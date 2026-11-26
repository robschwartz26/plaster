import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { optimizeImage, resizeForExtraction, blobToBase64 } from '@/lib/cropUtils'
import { CATEGORY_GRADIENTS } from '@/lib/categories'
import { EventInfoFace } from '@/components/admin/EventInfoFace'
import { pendingToWallEvent, type PendingEvent } from '@/components/admin/reviewShared'
import {
  extractEventFromImage, friendlyExtractionError, fileFromDrop, geocodeAddress,
  FREQ_LABELS, FREQ_COUNTS, ORDINAL_LABELS, WEEKDAY_LABELS, planRecurrence, fmtShortDate,
  type RecurrenceFrequency, type OrdinalKey,
} from '@/components/admin/adminShared'
import { NeighborhoodSelect, rememberNeighborhood } from '@/components/admin/NeighborhoodSelect'
import { ensureVenueAccount } from '@/lib/venueAccounts'
import { toPortlandInputValue, fromPortlandInputValue, portlandDate } from '@/lib/portlandTime'

// The editable face of a Review-stage event: text fields + a poster re-upload drop
// zone, with a live preview of the resulting info page. Save writes straight to the
// events row (admin RLS permits). Used inside each expanded Review row.

const CATEGORY_OPTIONS = Object.keys(CATEGORY_GRADIENTS)

// Sentinel value for the venue <select> — never a real venue id (those are uuids).
const NEW_VENUE = '__new_venue__'

// Same shape the Review queue uses to spot a duplicate: venue + Portland date +
// normalized title. Used to skip run dates the venue already has.
function normForDupe(t: string): string {
  return (t || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

// The field shows and accepts PORTLAND wall clock, not the device's. Reading
// it with getHours() showed an admin abroad the wrong time, then saved that
// wrong time back on the next edit.
const isoToLocalInput = toPortlandInputValue

interface VenueLite { id: string; name: string; neighborhood: string | null; address: string | null }

export function ReviewRowEditor({ row, venues, onSaved, seriesIds = [], onVenueCreated }: {
  row: PendingEvent
  venues: VenueLite[]
  onSaved: () => void
  seriesIds?: string[]
  onVenueCreated?: (v: VenueLite) => void
}) {
  // A collapsed series shows one card for many dates. Shared fields (title,
  // venue, category, blurb, poster, sold-out) save to every date in the series;
  // starts_at stays per-row, or every date would collapse onto one.
  const siblingIds = seriesIds.filter(id => id !== row.id)
  const [title, setTitle] = useState(row.title)
  const [venueId, setVenueId] = useState(row.venue_id ?? '')
  const [category, setCategory] = useState(row.category ?? 'Other')
  const [startsAt, setStartsAt] = useState(isoToLocalInput(row.starts_at))
  const [description, setDescription] = useState(row.description ?? '')
  // Opt-in: render this event's blurb with real line breaks. Off by default so
  // nothing that already reads fine suddenly re-flows (migration 113).
  const [descBreaks, setDescBreaks] = useState(row.description_breaks ?? false)
  const [soldOut, setSoldOut] = useState(!!row.sold_out)
  const [posterUrl, setPosterUrl] = useState(row.poster_url)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const [infoBusy, setInfoBusy] = useState(false)
  const [extractBusy, setExtractBusy] = useState(false)
  const [infoDrag, setInfoDrag] = useState(false)
  const [infoErr, setInfoErr] = useState('')
  // Show-schedule drop: repeatable. Each screenshot is read for dates and the
  // event is cloned per NEW date (server dedupes), so overlapping screenshots
  // are safe and a long run can be fed in across several drops.
  const [schedBusy, setSchedBusy] = useState(false)
  const [schedDrag, setSchedDrag] = useState(false)
  const [schedErr, setSchedErr] = useState('')
  const [schedAdded, setSchedAdded] = useState(0)
  const [schedSkipped, setSchedSkipped] = useState(0)
  const [schedDrops, setSchedDrops] = useState(0)
  // Recurring run, the same interface the Single ingester carries: weekly /
  // bi-weekly / monthly, or a weekday pattern like "1st & 3rd Thursday". The
  // event in hand is the anchor — Save expands the run from its date forward.
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurFreq, setRecurFreq] = useState<RecurrenceFrequency>('weekly')
  const [recurOrdinals, setRecurOrdinals] = useState<Set<OrdinalKey>>(new Set())
  const [recurDays, setRecurDays] = useState<Set<number>>(new Set())
  const [recurAdded, setRecurAdded] = useState(0)
  const [recurSkipped, setRecurSkipped] = useState(0)
  // "New venue" straight from the selector: the ingester guesses a venue it already
  // knows, so a show at a room Plaster has never seen lands under the wrong name.
  // Create the venue here, select it, and it appears in every other Review row's
  // dropdown immediately (the list lives in the parent).
  const [newVenueOpen, setNewVenueOpen] = useState(false)
  const [nvName, setNvName] = useState('')
  const [nvHood, setNvHood] = useState('')
  const [nvAddress, setNvAddress] = useState('')
  const [nvWebsite, setNvWebsite] = useState('')
  const [nvInstagram, setNvInstagram] = useState('')
  const [nvBusy, setNvBusy] = useState(false)
  const [nvErr, setNvErr] = useState('')
  const [nvMade, setNvMade] = useState('')

  // Accepts local files AND images dragged straight off a webpage (like the
  // Single ingester) — web drags carry a URL, not a File, and were silently
  // ignored before. fileFromDrop resolves both.
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    setExtractBusy(true) // covers the URL fetch for web drags
    try {
      const f = await fileFromDrop(e)
      if (!f) { setErr('That drop had no image — try dragging the image itself, or save it and drop the file.'); return }
      await takeFile(f)
    } catch {
      setErr("Couldn't fetch that image from the page — save it locally and drop the file.")
    } finally { setExtractBusy(false) }
  }

  // Dropping a poster stages it for upload AND runs the same AI extraction as
  // the Single ingester, filling title/date/time/category (and description if
  // empty) from the poster. Everything stays editable; nothing hits the DB
  // until Save. Extraction failure never blocks the upload itself.
  async function takeFile(f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return
    setPosterFile(f)
    setPosterPreview(URL.createObjectURL(f))
    setSaved(false)
    setExtractBusy(true); setErr('')
    try {
      const blob = await resizeForExtraction(f)
      const base64 = await blobToBase64(blob)
      const ex = await extractEventFromImage({ base64, mimeType: 'image/jpeg' })
      if (ex.title?.trim()) setTitle(ex.title.trim())
      if (ex.category) setCategory(ex.category)
      if (/^\d{4}-\d{2}-\d{2}$/.test(ex.date ?? '')) {
        const time = /^\d{2}:\d{2}/.test(ex.time ?? '') ? ex.time.slice(0, 5) : startsAt.slice(11, 16) || '20:00'
        setStartsAt(`${ex.date}T${time}`)
      }
      // Poster blurb only fills an EMPTY description — never stomps a scraped
      // or hand-edited one (the screenshot drop zone below is for rewriting).
      if (!description.trim() && ex.description?.trim()) setDescription(ex.description.trim())
      if (ex.sold_out) setSoldOut(true)
    } catch (e) {
      setErr(`Poster staged, but AI read failed: ${friendlyExtractionError(e)}`)
    } finally { setExtractBusy(false) }
  }

  // Drop a screenshot of the event info → Claude Vision writes a Plaster-voice blurb
  // AND corrects title / date / time when they're clearly visible in the image
  // (grounded only — the server returns null for anything it can't actually read).
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
      const { blurb, title: exTitle, date: exDate, time: exTime } =
        json as { blurb?: string | null; title?: string | null; date?: string | null; time?: string | null }
      if (!blurb && !exTitle && !exDate && !exTime) {
        throw new Error("Couldn't read event details from that image — try a clearer screenshot.")
      }
      if (blurb) setDescription(blurb.trim())
      if (exTitle) setTitle(exTitle)
      if (exDate) {
        // New date + (extracted time, else keep the field's current time-of-day)
        setStartsAt(`${exDate}T${exTime ?? startsAt.slice(11, 16) ?? '20:00'}`)
      } else if (exTime) {
        setStartsAt(`${startsAt.slice(0, 10)}T${exTime}`)
      }
      setSaved(false)
    } catch (e) {
      setInfoErr(e instanceof Error ? e.message : String(e))
    } finally { setInfoBusy(false) }
  }

  // Drop a screenshot of a run/tour date list → Claude Vision reads EVERY date
  // (expanding ranges, weekday patterns and calendar grids) and clones this event
  // once per date, deduped against the venue's existing rows. Hits the same
  // clipper_schedule endpoint the Clipper uses; an admin JWT is accepted there.
  async function addDatesFromSchedule(f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return
    setSchedBusy(true); setSchedErr('')
    try {
      const blob = await resizeForExtraction(f)
      const base64 = await blobToBase64(blob)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in')
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ clipper_schedule: { event_id: row.id, image_base64: base64, mimeType: 'image/jpeg' } }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.status === 'error') {
        throw new Error(json.reason || json.error || `failed: ${res.status}`)
      }
      const added = Number(json.added ?? 0)
      const skipped = Number(json.skipped ?? 0)
      if (!added && !skipped) throw new Error("Couldn't read any dates from that image.")
      setSchedAdded(n => n + added)
      setSchedSkipped(n => n + skipped)
      setSchedDrops(n => n + 1)
      if (added) onSaved() // refresh the queue so the new dates appear
    } catch (e) {
      setSchedErr(e instanceof Error ? e.message : String(e))
    } finally { setSchedBusy(false) }
  }

  // Creates the venue, selects it on this card, and hands it to the parent so the
  // other Review rows can pick it from their dropdowns. Does NOT write the event —
  // "Save changes" below still commits the assignment (and the whole series).
  async function createVenue() {
    const name = nvName.trim()
    if (!name) { setNvErr('Name required'); return }
    const clash = venues.find(v => v.name.trim().toLowerCase() === name.toLowerCase())
    if (clash) {
      setVenueId(clash.id)
      setNewVenueOpen(false)
      setNvErr('')
      setNvMade(`${clash.name} already existed — selected it`)
      return
    }
    setNvBusy(true); setNvErr('')
    try {
      const addr = nvAddress.trim()
      const coords = addr ? await geocodeAddress(addr, nvHood) : null
      const { data, error } = await supabase.from('venues').insert({
        name,
        neighborhood: nvHood || null,
        address: addr || null,
        website: nvWebsite.trim() || null,
        instagram: nvInstagram.replace(/^@/, '').trim() || null,
        location_lat: coords?.lat ?? null,
        location_lng: coords?.lng ?? null,
      }).select('id, name, neighborhood, address').single()
      if (error) throw error
      const v = data as VenueLite
      // A venue is only reachable once it has an account (see ensureVenueAccount).
      await ensureVenueAccount(v.id)
      rememberNeighborhood(v.neighborhood)   // joins the picker for the next venue
      onVenueCreated?.(v)
      setVenueId(v.id)
      setNewVenueOpen(false)
      setNvMade(`${v.name} created — pick it for the other dates, then Save`)
      setNvName(''); setNvHood(''); setNvAddress(''); setNvWebsite(''); setNvInstagram('')
    } catch (e) {
      setNvErr(e instanceof Error ? e.message : String(e))
    } finally { setNvBusy(false) }
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
        description_breaks: descBreaks,
        sold_out: soldOut,
        starts_at: (fromPortlandInputValue(startsAt) ?? new Date(startsAt)).toISOString(),
        // Saving the editor means a human looked at the date-time field, so the
        // clock is no longer a placeholder even if they left it untouched.
        time_tbd: false,
        poster_url: newPosterUrl,
        // keep address/neighborhood in step with the chosen venue; clearing the
        // venue clears them too (no stale address from the previous venue)
        neighborhood: venue?.neighborhood ?? null,
        address: venue?.address ?? null,
      }).eq('id', row.id)
      if (updErr) throw updErr
      if (siblingIds.length) {
        const { error: sibErr } = await supabase.from('events').update({
          title: title.trim(),
          venue_id: venueId || null,
          category,
          description: description.trim() || null,
          description_breaks: descBreaks,
          sold_out: soldOut,
          poster_url: newPosterUrl,
          neighborhood: venue?.neighborhood ?? null,
          address: venue?.address ?? null,
        }).in('id', siblingIds)
        if (sibErr) throw sibErr
      }
      // Recurring run: clone this event onto every generated date. The clones
      // carry the fields just saved, and land in Review exactly like the
      // schedule drop zone's do — a run never reaches the wall unreviewed.
      if (isRecurring) {
        const planned = planRecurrence(startsAt, recurFreq, recurOrdinals, recurDays)
        if (!planned.length) {
          throw new Error(recurFreq === 'weekdays'
            ? 'Pick at least one occurrence and one weekday.'
            : 'No dates in the next 3 months — check the start date.')
        }
        // Dates this venue already carries under this title are skipped, so
        // saving twice, or saving after a schedule drop, never doubles the wall.
        const taken = new Set<string>()
        if (venueId) {
          const { data: existing } = await supabase.from('events')
            .select('title, starts_at')
            .eq('venue_id', venueId)
            .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          for (const ex of (existing ?? []) as { title: string; starts_at: string }[]) {
            if (normForDupe(ex.title) === normForDupe(title)) taken.add(portlandDate(ex.starts_at))
          }
        }
        const fresh = planned.filter(p => !taken.has(p.date))
        if (fresh.length) {
          const groupId = crypto.randomUUID()
          const { error: recurErr } = await supabase.from('events').insert(fresh.map(p => ({
            venue_id: venueId || null,
            title: title.trim(),
            category,
            poster_url: newPosterUrl,
            starts_at: p.starts_at,
            description: description.trim() || null,
            description_breaks: descBreaks,
            neighborhood: venue?.neighborhood ?? null,
            address: venue?.address ?? null,
            view_count: 0,
            like_count: 0,
            status: 'pending',
            passed_review: false,
            // A sold-out night says nothing about next week's.
            sold_out: false,
            time_tbd: false,
            source_url: row.source_url,
            ai_confidence: row.ai_confidence,
            recurrence_group_id: groupId,
            recurrence_frequency: recurFreq,
          })))
          if (recurErr) throw recurErr
          // Stamp the anchor (and its already-collapsed dates) into the same
          // group, so the series reads as one run everywhere it's keyed on it.
          await supabase.from('events')
            .update({ recurrence_group_id: groupId, recurrence_frequency: recurFreq })
            .in('id', [row.id, ...siblingIds])
        }
        setRecurAdded(fresh.length)
        setRecurSkipped(planned.length - fresh.length)
        setIsRecurring(false)
      }
      setPosterUrl(newPosterUrl); setPosterFile(null)
      setSaved(true)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  // Live preview of what Save would add. Cheap (pure date math, no network).
  const plannedRun = isRecurring ? planRecurrence(startsAt, recurFreq, recurOrdinals, recurDays) : []

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
          onDrop={handleDrop}
          onClick={() => document.getElementById(`review-poster-${row.id}`)?.click()}
          style={{ position: 'relative', paddingBottom: '150%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--fg-08)', border: dragging ? '2px dashed #A855F7' : '1px solid var(--fg-15)' }}
        >
          {(posterPreview ?? posterUrl)
            ? <img src={posterPreview ?? posterUrl!} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-30)', fontSize: 11 }}>no poster</div>}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 6px', background: extractBusy ? 'rgba(168,85,247,0.8)' : 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9, textAlign: 'center', letterSpacing: '0.04em' }}>
            {extractBusy ? 'AI reading poster…' : dragging ? 'drop to replace' : 'drop / click to replace'}
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
            <select
              value={venueId}
              onChange={e => {
                if (e.target.value === NEW_VENUE) {
                  setNvName(''); setNvErr(''); setNvMade('')
                  setNewVenueOpen(true)
                  return                      // keep the current selection until it's made
                }
                setVenueId(e.target.value)
              }}
              style={inp}
            >
              <option value="">— none —</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value={NEW_VENUE}>＋ New venue…</option>
            </select>
            {nvMade && !newVenueOpen && (
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#4ade80' }}>{nvMade}</span>
            )}
          </div>
          <div style={{ width: 130 }}>
            <label style={lbl}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {newVenueOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.35)', background: 'rgba(168,85,247,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ ...lbl, marginBottom: 0 }}>New venue</span>
              <button
                onClick={() => { setNewVenueOpen(false); setNvErr('') }}
                disabled={nvBusy}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--fg-40)' }}
              >Cancel</button>
            </div>
            <input autoFocus value={nvName} onChange={e => setNvName(e.target.value)} placeholder="Venue name *" style={inp}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createVenue() } }} />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <NeighborhoodSelect value={nvHood} onChange={setNvHood} style={inp} />
              </div>
              <input value={nvAddress} onChange={e => setNvAddress(e.target.value)} placeholder="Address (geocoded)" style={{ ...inp, flex: 2, minWidth: 160 }} />
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <input value={nvWebsite} onChange={e => setNvWebsite(e.target.value)} placeholder="Website (optional)" style={{ ...inp, flex: 2, minWidth: 160 }} />
              <input value={nvInstagram} onChange={e => setNvInstagram(e.target.value)} placeholder="@instagram (optional)" style={{ ...inp, flex: 1, minWidth: 130 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <button onClick={createVenue} disabled={nvBusy || !nvName.trim()} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#A855F7', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: nvBusy ? 'wait' : 'pointer', opacity: nvBusy || !nvName.trim() ? 0.5 : 1 }}>
                {nvBusy ? 'Creating…' : 'Create & select'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--fg-40)' }}>then hit Save changes below</span>
              {nvErr && <span style={{ fontSize: 11, color: '#e05555' }}>{nvErr}</span>}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={lbl}>Date &amp; time</label>
            <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={inp} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-65)', paddingBottom: 8 }}>
            <input type="checkbox" checked={soldOut} onChange={e => setSoldOut(e.target.checked)} /> Sold out
          </label>
        </div>

        {/* Recurring run — the Single ingester's interface, anchored on this date */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <button
              type="button"
              onClick={() => setIsRecurring(v => !v)}
              aria-pressed={isRecurring}
              style={{ width: 36, height: 20, borderRadius: 10, border: 'none', background: isRecurring ? '#A855F7' : 'var(--fg-18)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s ease' }}
            >
              <span style={{ position: 'absolute', top: 3, left: isRecurring ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease' }} />
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--fg-65)' }}>Recurring event</span>
          </div>

          {isRecurring && (
            <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 9, padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.35)', background: 'rgba(168,85,247,0.06)' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['weekly', 'biweekly', 'monthly', 'weekdays'] as RecurrenceFrequency[]).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRecurFreq(f)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${recurFreq === f ? 'var(--fg)' : 'var(--fg-18)'}`, background: recurFreq === f ? 'var(--fg)' : 'transparent', color: recurFreq === f ? 'var(--bg)' : 'var(--fg-55)', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease' }}
                  >
                    {FREQ_LABELS[f]}
                  </button>
                ))}
              </div>

              {recurFreq === 'weekdays' && (
                <>
                  <div>
                    <p style={{ ...lbl, margin: '0 0 5px' }}>Which occurrence?</p>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {ORDINAL_LABELS.map(ord => {
                        const active = recurOrdinals.has(ord)
                        return (
                          <button key={ord} type="button"
                            onClick={() => setRecurOrdinals(prev => { const n = new Set(prev); if (active) n.delete(ord); else n.add(ord); return n })}
                            style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? '#A855F7' : 'var(--fg-18)'}`, background: active ? 'rgba(168,85,247,0.15)' : 'transparent', color: active ? '#A855F7' : 'var(--fg-55)', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}
                          >{ord}</button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p style={{ ...lbl, margin: '0 0 5px' }}>Which day?</p>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {WEEKDAY_LABELS.map((label, idx) => {
                        const active = recurDays.has(idx)
                        return (
                          <button key={label} type="button"
                            onClick={() => setRecurDays(prev => { const n = new Set(prev); if (active) n.delete(idx); else n.add(idx); return n })}
                            style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? '#A855F7' : 'var(--fg-18)'}`, background: active ? 'rgba(168,85,247,0.15)' : 'transparent', color: active ? '#A855F7' : 'var(--fg-55)', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}
                          >{label}</button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {plannedRun.length > 0 ? (
                <p style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--fg-40)', margin: 0 }}>
                  Save adds {plannedRun.length} more date{plannedRun.length === 1 ? '' : 's'} over the next 3 months
                  {recurFreq !== 'weekdays' && ` (${FREQ_LABELS[recurFreq].toLowerCase()})`}:{' '}
                  {plannedRun.slice(0, 3).map(d => fmtShortDate(new Date(d.starts_at))).join(', ')}
                  {plannedRun.length > 3 ? `, and ${plannedRun.length - 3} more` : ''}. They land here in Review, same poster and blurb, each one still editable.
                </p>
              ) : (
                <p style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--fg-30)', margin: 0 }}>
                  {recurFreq === 'weekdays'
                    ? 'Pick at least one occurrence and one weekday to see the dates.'
                    : `No dates in the next 3 months — check the date above. (${FREQ_LABELS[recurFreq]} normally adds about ${FREQ_COUNTS[recurFreq]}.)`}
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <label style={lbl}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          {/* Line breaks are opt-in per event: without this the info page
              collapses newlines, which is how every existing blurb reads. */}
          <button
            type="button"
            onClick={() => setDescBreaks(v => !v)}
            aria-pressed={descBreaks}
            style={{
              marginTop: 6, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              fontFamily: '"Space Grotesk", sans-serif', fontSize: 11.5, lineHeight: 1.3,
              border: descBreaks ? '1px solid #A855F7' : '1px solid var(--fg-18)',
              background: descBreaks ? 'rgba(168,85,247,0.12)' : 'transparent',
              color: descBreaks ? '#A855F7' : 'var(--fg-55)',
            }}
          >
            {descBreaks ? '\u00b6 Line breaks on' : '\u00b6 Allow line breaks'}
          </button>
          {descBreaks && (
            <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: 'var(--fg-40)' }}>
              Blank lines and single returns you type above will show on the info page. Preview below.
            </div>
          )}
          {/* Drop a screenshot → AI writes the blurb */}
          <div
            onDragOver={e => { e.preventDefault(); setInfoDrag(true) }}
            onDragLeave={() => setInfoDrag(false)}
            onDrop={e => { e.preventDefault(); setInfoDrag(false); describeFromScreenshot(e.dataTransfer.files?.[0]) }}
            onClick={() => document.getElementById(`info-shot-${row.id}`)?.click()}
            style={{ marginTop: 6, padding: '9px 11px', borderRadius: 7, cursor: infoBusy ? 'wait' : 'pointer', textAlign: 'center', fontSize: 11.5, lineHeight: 1.4, color: infoBusy ? 'var(--fg-40)' : 'var(--fg-55)', border: infoDrag ? '1.5px dashed #A855F7' : '1.5px dashed var(--fg-18)', background: infoDrag ? 'rgba(168,85,247,0.06)' : 'transparent' }}
          >
            {infoBusy ? 'Reading screenshot…' : <>📄 Drop a <strong>screenshot of the event info</strong> → AI fills blurb + title/date/time</>}
          </div>
          <input id={`info-shot-${row.id}`} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => describeFromScreenshot(e.target.files?.[0] ?? undefined)} />
          {infoErr && <span style={{ fontSize: 11, color: '#e05555' }}>{infoErr}</span>}

          {/* Drop a run/tour date list → clone this event per date. Repeatable. */}
          <div
            onDragOver={e => { e.preventDefault(); setSchedDrag(true) }}
            onDragLeave={() => setSchedDrag(false)}
            onDrop={e => { e.preventDefault(); setSchedDrag(false); addDatesFromSchedule(e.dataTransfer.files?.[0]) }}
            onClick={() => document.getElementById(`sched-shot-${row.id}`)?.click()}
            style={{ marginTop: 6, padding: '9px 11px', borderRadius: 7, cursor: schedBusy ? 'wait' : 'pointer', textAlign: 'center', fontSize: 11.5, lineHeight: 1.4, color: schedBusy ? 'var(--fg-40)' : 'var(--fg-55)', border: schedDrag ? '1.5px dashed #A855F7' : '1.5px dashed var(--fg-18)', background: schedDrag ? 'rgba(168,85,247,0.06)' : 'transparent' }}
          >
            {schedBusy
              ? 'Reading schedule…'
              : <>🗓 Drop a <strong>show schedule</strong> → adds every date as its own listing{schedDrops > 0 && ' · drop another to add more'}</>}
          </div>
          <input id={`sched-shot-${row.id}`} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { addDatesFromSchedule(e.target.files?.[0] ?? undefined); e.target.value = '' }} />
          {schedDrops > 0 && (
            <span style={{ fontSize: 11, color: '#4ade80' }}>
              +{schedAdded} date{schedAdded === 1 ? '' : 's'} added{schedSkipped ? ` · ${schedSkipped} already there` : ''} across {schedDrops} drop{schedDrops === 1 ? '' : 's'}
            </span>
          )}
          {schedErr && <span style={{ fontSize: 11, color: '#e05555' }}>{schedErr}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#A855F7', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…'
              : isRecurring && plannedRun.length ? `Save + add ${plannedRun.length} date${plannedRun.length === 1 ? '' : 's'}`
              : siblingIds.length ? `Save to all ${siblingIds.length + 1} dates`
              : 'Save changes'}
          </button>
          {siblingIds.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--fg-40)' }}>date &amp; time applies to this one only</span>
          )}
          {saved && (
            <span style={{ fontSize: 12, color: '#4ade80' }}>
              Saved ✓{recurAdded > 0 && ` · +${recurAdded} date${recurAdded === 1 ? '' : 's'}`}
              {recurAdded > 0 && recurSkipped > 0 && ` · ${recurSkipped} already there`}
            </span>
          )}
          {err && <span style={{ fontSize: 12, color: '#e05555' }}>{err}</span>}
        </div>
      </div>

      {/* Right: live info-page preview */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-30)', marginBottom: 6 }}>Info-page preview</div>
        <EventInfoFace event={previewEvent} description={description.trim() || null} address={selectedVenue?.address ?? row.address} descriptionBreaks={descBreaks} />
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--fg-18)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }
