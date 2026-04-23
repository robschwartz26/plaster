import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader } from '@/components/PlasterHeader'
import { type CropRect, optimizeImage } from '@/lib/cropUtils'
import { CATEGORIES } from '@/lib/categories'
import { AdminBottomNav } from '@/components/admin/AdminBottomNav'
import { VenueForm } from '@/components/admin/VenueForm'
import { EventForm } from '@/components/admin/EventForm'
import { CropPreviewModal } from '@/components/admin/CropPreviewModal'
import {
  MAPBOX_TOKEN, IS_DEV, NEIGHBORHOODS,
  FREQ_LABELS, FREQ_COUNTS, ORDINAL_LABELS, WEEKDAY_LABELS,
  inputStyle, labelStyle, fieldStyle,
  generateWeekdayOccurrences, fmtShortDate, generateOccurrenceDates,
  venueSimilarity, findDuplicateVenueGroups,
  fileToBase64, fileToDataURL, extractEventFromImage,
  titleSimilarity, neighborhoodFromAddress,
  type Venue, type AdminNotification, type ExtractedEvent, type ExtractPayload,
  type ImportPhase, type Category, type RecurrenceFrequency, type OrdinalKey,
} from '@/components/admin/adminShared'


function ImportForm() {
  const [venues, setVenues] = useState<Venue[]>([])

  useEffect(() => {
    supabaseAdmin
      .from('venues')
      .select('id, name, neighborhood, address, location_lat, location_lng, website, instagram, hours')
      .order('name', { ascending: true })
      .then(({ data }) => { if (data) setVenues(data) })
  }, [])

  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [extracted, setExtracted] = useState<ExtractedEvent | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const [successTitle, setSuccessTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Extra info image — sent to Claude but NOT uploaded to storage
  const [infoFile, setInfoFile] = useState<File | null>(null)
  const [infoPreview, setInfoPreview] = useState('')
  const [infoDragging, setInfoDragging] = useState(false)
  const infoFileRef = useRef<HTMLInputElement>(null)

  const [userCrop, setUserCrop] = useState<CropRect | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [duplicateEvent, setDuplicateEvent] = useState<{ id: string; title: string; poster_url: string | null; starts_at: string } | null>(null)

  const [form, setForm] = useState({ title: '', venue_id: '', venue_name_manual: '', date: '', time: '', address: '', description: '', category: 'Live Music' as Category, neighborhood: '', website: '', instagram: '', hours: '' })
  const [fillFrame, setFillFrame] = useState(false)
  const [focalX, setFocalX] = useState(0.5)
  const [focalY, setFocalY] = useState(0.5)
  const [posterNatural, setPosterNatural] = useState<{ w: number; h: number } | null>(null)
  const focalDragRef = useRef<{ startX: number; startY: number; startFocalX: number; startFocalY: number } | null>(null)
  const [reExtracting, setReExtracting] = useState(false)
  const [reuseExistingPoster, setReuseExistingPoster] = useState(false)
  const [nearDuplicate, setNearDuplicate] = useState<Venue | null>(null)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly')
  const [weekdayOrdinals, setWeekdayOrdinals] = useState<Set<OrdinalKey>>(new Set())
  const [weekdayDays,     setWeekdayDays]     = useState<Set<number>>(new Set())
  const [successCount, setSuccessCount] = useState(1)

  const isUncertain = (field: string) => extracted?.uncertain_fields?.includes(field) ?? false

  const uncertainInput: React.CSSProperties = { ...inputStyle, borderColor: 'rgba(234,179,8,0.5)', background: 'rgba(234,179,8,0.04)' }

  const handleFiles = useCallback(async (files: File[]) => {
    const poster = files.find(f => f.type.startsWith('image/'))
    if (!poster) return
    setImageFiles([poster])
    setPhase('extracting')
    setErrorMsg('')
    try {
      const [dataURL, posterBase64] = await Promise.all([fileToDataURL(poster), fileToBase64(poster)])
      setImagePreviews([dataURL])
      // If an extra info image is queued, send both to Claude in one call
      const payload: ExtractPayload = infoFile
        ? { images: [
            { base64: posterBase64, mimeType: poster.type || 'image/jpeg' },
            { base64: await fileToBase64(infoFile), mimeType: infoFile.type || 'image/jpeg' },
          ]}
        : { base64: posterBase64, mimeType: poster.type || 'image/jpeg' }
      const result = await extractEventFromImage(payload)
      setExtracted(result)
      setReuseExistingPoster(!!result.existing_poster_url)
      const match = venues.find(v =>
        v.name.toLowerCase().includes(result.venue_name.toLowerCase()) ||
        result.venue_name.toLowerCase().includes(v.name.toLowerCase())
      )
      const detectedNeighborhood = neighborhoodFromAddress(match?.address || result.address)
      setForm({
        title: result.title,
        venue_id: match?.id ?? '',
        venue_name_manual: match ? '' : result.venue_name,
        date: result.date,
        time: result.time,
        address: match?.address || result.address,
        description: result.description,
        category: result.category,
        neighborhood: match?.neighborhood || detectedNeighborhood || '',
        website: match?.website || result.website || '',
        instagram: match?.instagram || result.instagram || '',
        hours: match?.hours || result.hours || '',
      })
      setPhase('review')
    } catch (e) {
      setErrorMsg(String(e)); setPhase('error')
    }
  }, [venues, infoFile])

  // Drop an info image during the review phase — re-extracts and merges only empty fields
  const handleInfoSet = useCallback(async (file: File) => {
    const url = await fileToDataURL(file)
    setInfoFile(file)
    setInfoPreview(url)
    if (!imageFiles[0]) return
    setReExtracting(true)
    try {
      const [posterBase64, infoBase64] = await Promise.all([
        fileToBase64(imageFiles[0]),
        fileToBase64(file),
      ])
      const payload: ExtractPayload = {
        images: [
          { base64: posterBase64, mimeType: imageFiles[0].type || 'image/jpeg' },
          { base64: infoBase64, mimeType: file.type || 'image/jpeg' },
        ],
      }
      const result = await extractEventFromImage(payload)
      setExtracted(result)
      setReuseExistingPoster(!!result.existing_poster_url)
      const match = venues.find(v =>
        v.name.toLowerCase().includes(result.venue_name.toLowerCase()) ||
        result.venue_name.toLowerCase().includes(v.name.toLowerCase())
      )
      setForm(f => {
        const resolvedVenueId = f.venue_id || match?.id || ''
        const resolvedMatch = resolvedVenueId ? (venues.find(v => v.id === resolvedVenueId) ?? match) : match
        return {
          title: result.title || f.title,
          venue_id: resolvedVenueId,
          venue_name_manual: resolvedMatch ? '' : (result.venue_name || f.venue_name_manual),
          date: result.date || f.date,
          time: result.time || f.time,
          address: resolvedMatch?.address || result.address || f.address,
          description: result.description || f.description,
          category: (result.category || f.category) as Category,
          neighborhood: resolvedMatch?.neighborhood || neighborhoodFromAddress(result.address) || f.neighborhood || '',
          website: resolvedMatch?.website || result.website || f.website || '',
          instagram: resolvedMatch?.instagram || result.instagram || f.instagram || '',
          hours: resolvedMatch?.hours || result.hours || f.hours || '',
        }
      })
    } catch {
      // silently ignore re-extraction errors — user keeps original fields
    } finally {
      setReExtracting(false)
    }
  }, [imageFiles, venues])

  const handleVenueChange = (venueId: string) => {
    const v = venues.find(v => v.id === venueId)
    setForm(f => ({
      ...f,
      venue_id: venueId,
      venue_name_manual: '',
      ...(v ? {
        address: v.address || f.address,
        neighborhood: v.neighborhood || f.neighborhood,
        website: v.website || f.website,
        instagram: v.instagram || f.instagram,
        hours: v.hours || f.hours,
      } : {}),
    }))
    // Backfill coords into DB if venue has none but extraction returned them
    if (v && !v.location_lat && extracted?.location_lat && extracted?.location_lng) {
      supabaseAdmin.from('venues').update({
        location_lat: extracted.location_lat,
        location_lng: extracted.location_lng,
        ...(extracted.address && !v.address ? { address: extracted.address } : {}),
      }).eq('id', venueId).then(() => {
        setVenues(prev => prev.map(venue =>
          venue.id === venueId
            ? { ...venue, location_lat: extracted!.location_lat ?? null, location_lng: extracted!.location_lng ?? null }
            : venue
        ))
      })
    }
  }

  // Load natural dimensions of poster for focal pan math
  useEffect(() => {
    const src = imagePreviews[0] || extracted?.existing_poster_url
    if (!src) { setPosterNatural(null); return }
    const img = new Image()
    img.onload = () => setPosterNatural({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [imagePreviews[0], extracted?.existing_poster_url])

  // Check for near-duplicate venues whenever selected venue or manual name changes
  useEffect(() => {
    if (!venues.length) { setNearDuplicate(null); return }
    const selectedVenue = form.venue_id ? venues.find(v => v.id === form.venue_id) : null
    const nameToCheck = selectedVenue?.name ?? form.venue_name_manual
    if (!nameToCheck) { setNearDuplicate(null); return }
    const near = venues.find(v => v.id !== form.venue_id && venueSimilarity(v.name, nameToCheck) > 0.7)
    setNearDuplicate(near ?? null)
  }, [form.venue_id, form.venue_name_manual, venues])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleFiles([file])
  }

  const doUpload = async (updateExistingId?: string) => {
    if ((!imageFiles[0] && !reuseExistingPoster) || !form.title || !form.date) return
    setPhase('uploading')
    try {
      let poster_url: string
      if (reuseExistingPoster && extracted?.existing_poster_url) {
        poster_url = extracted.existing_poster_url
      } else {
        if (!imageFiles[0]) throw new Error('No image to upload')
        const optimized = await optimizeImage(imageFiles[0], userCrop ?? extracted?.crop)
        const filename = `${Date.now()}-${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`
        const { error: storageError } = await supabaseAdmin.storage.from('posters').upload(filename, optimized, { contentType: 'image/jpeg', upsert: false })
        if (storageError) throw storageError
        const { data: urlData } = supabaseAdmin.storage.from('posters').getPublicUrl(filename)
        poster_url = urlData.publicUrl
      }

      if (updateExistingId) {
        const { error } = await supabaseAdmin.from('events').update({ poster_url }).eq('id', updateExistingId)
        if (error) throw error
      } else {
        let venue_id = form.venue_id
        if (!venue_id && form.venue_name_manual) {
          const { data: newVenue, error: venueError } = await supabaseAdmin.from('venues').insert({
            name: form.venue_name_manual,
            neighborhood: form.neighborhood || 'Portland',
            address: form.address || '',
            website: form.website || null,
            instagram: form.instagram.replace(/^@/, '') || null,
            hours: form.hours || null,
            location_lat: extracted?.location_lat ?? null,
            location_lng: extracted?.location_lng ?? null,
          }).select('id').single()
          if (venueError) throw venueError
          venue_id = newVenue.id
        } else if (venue_id && extracted?.location_lat && extracted?.location_lng) {
          // Backfill coords on existing venue if missing
          const existingVenue = venues.find(v => v.id === venue_id)
          if (existingVenue && !existingVenue.location_lat) {
            await supabaseAdmin.from('venues').update({
              location_lat: extracted.location_lat,
              location_lng: extracted.location_lng,
              ...(extracted.address && !existingVenue.address ? { address: extracted.address } : {}),
            }).eq('id', venue_id)
          }
        }
        if (!venue_id) throw new Error('A venue is required')
        const timeStr = form.time || '20:00'
        const startDate = new Date(`${form.date}T${timeStr}:00`)
        const nbhd = form.neighborhood || venues.find(v => v.id === venue_id)?.neighborhood || ''
        const baseRow = { venue_id, title: form.title, category: form.category, poster_url, neighborhood: nbhd, address: form.address, description: form.description, view_count: 0, like_count: 0, fill_frame: fillFrame, focal_x: focalX, focal_y: focalY }

        if (isRecurring) {
          const recurrenceGroupId = crypto.randomUUID()
          let dates: Date[]
          if (recurrenceFrequency === 'weekdays') {
            if (weekdayOrdinals.size === 0 || weekdayDays.size === 0) {
              setPhase('idle'); setErrorMsg('Pick at least one occurrence and one weekday.'); return
            }
            dates = generateWeekdayOccurrences(startDate, weekdayOrdinals, weekdayDays)
          } else {
            dates = generateOccurrenceDates(startDate, recurrenceFrequency)
          }
          if (dates.length === 0) {
            setPhase('idle'); setErrorMsg('No occurrences found in the 3-month window. Check the start date.'); return
          }
          const { error: eventError } = await supabaseAdmin.from('events').insert(
            dates.map(d => ({ ...baseRow, starts_at: d.toISOString(), recurrence_group_id: recurrenceGroupId, recurrence_frequency: recurrenceFrequency }))
          )
          if (eventError) throw eventError
          const lastDate = dates[dates.length - 1]
          const snoozeDate = new Date(lastDate); snoozeDate.setMonth(snoozeDate.getMonth() + 3)
          const venueName = venues.find(v => v.id === venue_id)?.name || 'the venue'
          const freqMsg = recurrenceFrequency === 'weekly' ? 'weekly' : recurrenceFrequency === 'biweekly' ? 'bi-weekly' : recurrenceFrequency === 'monthly' ? 'monthly' : 'on specific weekdays'
          await supabaseAdmin.from('admin_notifications').insert({
            type: 'recurrence_check',
            title: `Check recurring event: ${form.title}`,
            message: `${form.title} at ${venueName} was scheduled ${freqMsg} through ${lastDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Still running? Extend another 3 months or mark as ended.`,
            recurrence_group_id: recurrenceGroupId,
            snoozed_until: snoozeDate.toISOString(),
          })
          setSuccessCount(dates.length)
        } else {
          const { error: eventError } = await supabaseAdmin.from('events').insert({ ...baseRow, starts_at: startDate.toISOString() })
          if (eventError) throw eventError
          setSuccessCount(1)
        }
      }

      setSuccessTitle(form.title)
      setPhase('done')
    } catch (e) {
      setErrorMsg(String(e)); setPhase('error')
    }
  }

  const handleSubmit = async () => {
    if ((!imageFiles[0] && !reuseExistingPoster) || !form.title || !form.date) return

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
    setPhase('idle'); setImageFiles([]); setImagePreviews([]); setInfoFile(null); setInfoPreview(''); setExtracted(null); setErrorMsg(''); setSuccessTitle('')
    setForm({ title: '', venue_id: '', venue_name_manual: '', date: '', time: '', address: '', description: '', category: 'Live Music' as Category, neighborhood: '', website: '', instagram: '', hours: '' })
    setUserCrop(null); setShowPreviewModal(false); setDuplicateEvent(null); setFillFrame(false); setFocalX(0.5); setFocalY(0.5); setPosterNatural(null); setReuseExistingPoster(false); setNearDuplicate(null); setIsRecurring(false); setRecurrenceFrequency('weekly'); setWeekdayOrdinals(new Set()); setWeekdayDays(new Set()); setSuccessCount(1)
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
      if (blob) handleFiles([new File([blob], 'dev-poster.jpg', { type: 'image/jpeg' })])
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
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFiles([f]) }} />

      {/* Extra info image zone */}
      <div style={{ marginTop: 10 }}>
        {infoPreview ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--fg-18)', borderRadius: 8, background: 'rgba(240,236,227,0.02)' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src={infoPreview} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 5, display: 'block', border: '1px solid var(--fg-18)' }} />
              <button
                onClick={() => { setInfoFile(null); setInfoPreview('') }}
                style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >✕</button>
            </div>
            <div>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: 0 }}>Extra info image attached</p>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', margin: '3px 0 0' }}>Will be sent to Claude · not uploaded to storage</p>
            </div>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setInfoDragging(true) }}
            onDragLeave={() => setInfoDragging(false)}
            onDrop={e => {
              e.preventDefault(); setInfoDragging(false)
              const f = e.dataTransfer.files[0]
              if (f?.type.startsWith('image/')) { setInfoFile(f); fileToDataURL(f).then(url => setInfoPreview(url)) }
            }}
            onClick={() => infoFileRef.current?.click()}
            style={{ border: `1px dashed ${infoDragging ? 'var(--fg-40)' : 'var(--fg-18)'}`, borderRadius: 8, padding: '14px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', background: infoDragging ? 'rgba(240,236,227,0.03)' : 'transparent', transition: 'all 0.15s ease' }}
          >
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', margin: 0 }}>Extra info image <span style={{ color: 'var(--fg-25)' }}>(optional)</span></p>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-25)', margin: 0, textAlign: 'center' }}>Screenshot of event page, ticket site, or Instagram caption</p>
          </div>
        )}
        <input ref={infoFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
          const f = e.target.files?.[0]
          if (f) { setInfoFile(f); fileToDataURL(f).then(url => setInfoPreview(url)) }
        }} />
      </div>

      {IS_DEV && (
        <button onClick={loadDevPoster} style={{ marginTop: 12, padding: '6px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em' }}>
          DEV — Load Test Poster
        </button>
      )}
    </div>
  )

  if (phase === 'extracting') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
      {imagePreviews[0] && <img src={imagePreviews[0]} alt="" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />}
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
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', margin: 0 }}>
      {successCount > 1 ? `${successCount} events posted · ${recurrenceFrequency === 'weekdays' ? 'specific weekdays' : FREQ_LABELS[recurrenceFrequency].toLowerCase()} for 3 months` : 'Posted to the wall'}
    </p>
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
      <div style={{ display: 'grid', gridTemplateColumns: (imagePreviews[0] || reuseExistingPoster) ? '1fr 1.5fr' : '1fr', gap: 20, alignItems: 'start' }}>
        {(imagePreviews[0] || reuseExistingPoster) && (() => {
          const displayCrop = userCrop ?? extracted?.crop ?? { x: 0, y: 0, width: 1, height: 1 }
          const hasDisplayCrop = !(displayCrop.x === 0 && displayCrop.y === 0 && displayCrop.width === 1 && displayCrop.height === 1)
          return (
            <div>
              {/* Poster reuse banner */}
              {reuseExistingPoster && extracted?.existing_poster_url && (
                <div style={{ marginBottom: 8, padding: '7px 10px', borderRadius: 6, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Existing poster found — reusing it</span>
                  <button
                    onClick={() => setReuseExistingPoster(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    Use a different poster
                  </button>
                </div>
              )}
              <div style={{ borderRadius: 8, overflow: 'hidden', background: '#111', maxHeight: 420 }}>
                {reuseExistingPoster && extracted?.existing_poster_url ? (
                  <img src={extracted.existing_poster_url} alt="Existing poster" style={{ width: '100%', objectFit: 'contain', maxHeight: 420, display: 'block' }} />
                ) : hasDisplayCrop ? (
                  <div style={{ position: 'relative', width: '100%', paddingBottom: `${(displayCrop.height / displayCrop.width) * 100}%`, overflow: 'hidden' }}>
                    <img src={imagePreviews[0]} alt="Poster" style={{ position: 'absolute', width: `${100 / displayCrop.width}%`, height: `${100 / displayCrop.height}%`, left: `${-displayCrop.x / displayCrop.width * 100}%`, top: `${-displayCrop.y / displayCrop.height * 100}%`, objectFit: 'cover' }} />
                  </div>
                ) : (
                  <img src={imagePreviews[0]} alt="Poster" style={{ width: '100%', objectFit: 'contain', maxHeight: 420, display: 'block' }} />
                )}
              </div>
              {!reuseExistingPoster && (
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', marginTop: 6, textAlign: 'center' }}>
                  {userCrop ? '✂ Cropped (adjusted) · max 1200px · JPEG' : hasDisplayCrop ? '✂ Cropped by AI · max 1200px · JPEG' : 'Will be resized to max 1200px · JPEG'}
                </p>
              )}
              {/* Info image zone — stays visible the entire review phase */}
              <div style={{ marginTop: 10 }}>
                {reExtracting ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid var(--fg-18)', borderRadius: 8, background: 'rgba(240,236,227,0.02)' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--fg-18)', borderTopColor: 'var(--fg)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>Re-reading with extra image…</span>
                  </div>
                ) : infoPreview ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--fg-18)', borderRadius: 8, background: 'rgba(240,236,227,0.02)' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={infoPreview} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 5, display: 'block', border: '1px solid var(--fg-18)' }} />
                      <button
                        onClick={() => { setInfoFile(null); setInfoPreview('') }}
                        style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                      >✕</button>
                    </div>
                    <div>
                      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: 0 }}>Extra info image used</p>
                      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', margin: '3px 0 0' }}>Drop another to re-read</p>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={e => { e.preventDefault(); setInfoDragging(true) }}
                    onDragLeave={() => setInfoDragging(false)}
                    onDrop={e => {
                      e.preventDefault(); setInfoDragging(false)
                      const f = e.dataTransfer.files[0]
                      if (f?.type.startsWith('image/')) handleInfoSet(f)
                    }}
                    onClick={() => infoFileRef.current?.click()}
                    style={{ border: `1px dashed ${infoDragging ? 'var(--fg-40)' : 'var(--fg-18)'}`, borderRadius: 8, padding: '14px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', background: infoDragging ? 'rgba(240,236,227,0.03)' : 'transparent', transition: 'all 0.15s ease' }}
                  >
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', margin: 0 }}>Extra info image <span style={{ color: 'var(--fg-25)' }}>(optional)</span></p>
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-25)', margin: 0, textAlign: 'center' }}>Screenshot of event page, ticket site, or Instagram caption</p>
                  </div>
                )}
                <input ref={infoFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleInfoSet(f)
                }} />
              </div>
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
            <select style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }} value={form.venue_id} onChange={e => handleVenueChange(e.target.value)}>
              <option value="">— New venue —</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {form.venue_id && !nearDuplicate && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#4ade80', margin: '4px 0 0 0' }}>existing venue · address &amp; details auto-filled</p>
            )}
            {!form.venue_id && (
              <input style={{ ...inputStyle, marginTop: 8 }} value={form.venue_name_manual} onChange={e => setForm(f => ({ ...f, venue_name_manual: e.target.value }))} placeholder="New venue name (will be created)" />
            )}
            {nearDuplicate && (
              <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 6, background: 'rgba(234,179,8,0.06)' }}>
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(234,179,8,0.9)', margin: '0 0 8px 0' }}>
                  Similar venue found: <strong>{nearDuplicate.name}</strong>
                  {nearDuplicate.address && <span style={{ fontWeight: 400, color: 'rgba(234,179,8,0.6)' }}> · {nearDuplicate.address}</span>}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { handleVenueChange(nearDuplicate.id); setNearDuplicate(null) }} style={{ padding: '4px 10px', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 4, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Use existing
                  </button>
                  <button type="button" onClick={() => setNearDuplicate(null)} style={{ padding: '4px 10px', background: 'transparent', color: 'var(--fg-40)', border: '1px solid var(--fg-18)', borderRadius: 4, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer' }}>
                    Create new
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Venue map preview — shown when we have geocoded coords */}
          {MAPBOX_TOKEN && extracted?.location_lat && extracted?.location_lng && (
            <div>
              <img
                src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+A855F7(${extracted.location_lng},${extracted.location_lat})/${extracted.location_lng},${extracted.location_lat},14/200x100@2x?access_token=${MAPBOX_TOKEN}`}
                alt="venue location"
                style={{ width: '100%', borderRadius: 6, display: 'block' }}
              />
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#4ade80', margin: '4px 0 0' }}>
                ✓ geocoded
                {extracted.address_source === 'db' ? ' · from database' : extracted.address_source === 'mapbox' ? ' · via Mapbox' : extracted.address_source === 'ai' ? ' · AI estimate ⚠' : ''}
              </p>
            </div>
          )}

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

          {/* Recurring event */}
          <div style={fieldStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => setIsRecurring(v => !v)}
                style={{ width: 40, height: 22, borderRadius: 11, border: 'none', background: isRecurring ? '#A855F7' : 'var(--fg-18)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s ease' }}
              >
                <span style={{ position: 'absolute', top: 3, left: isRecurring ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease' }} />
              </button>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>Recurring event</span>
            </div>
            {isRecurring && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Frequency mode chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['weekly', 'biweekly', 'monthly', 'weekdays'] as RecurrenceFrequency[]).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRecurrenceFrequency(f)}
                      style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${recurrenceFrequency === f ? 'var(--fg)' : 'var(--fg-18)'}`, background: recurrenceFrequency === f ? 'var(--fg)' : 'transparent', color: recurrenceFrequency === f ? 'var(--bg)' : 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s ease' }}
                    >
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
                </div>

                {/* Weekday-mode sub-pickers */}
                {recurrenceFrequency === 'weekdays' && (() => {
                  const previewDates = (weekdayOrdinals.size > 0 && weekdayDays.size > 0)
                    ? (() => { const sd = form.date ? new Date(`${form.date}T${form.time || '20:00'}:00`) : new Date(); return generateWeekdayOccurrences(sd, weekdayOrdinals, weekdayDays) })()
                    : []
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Ordinal row */}
                      <div>
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-40)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Which occurrence?</p>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {ORDINAL_LABELS.map(ord => {
                            const active = weekdayOrdinals.has(ord)
                            return (
                              <button key={ord} type="button"
                                onClick={() => setWeekdayOrdinals(prev => { const n = new Set(prev); active ? n.delete(ord) : n.add(ord); return n })}
                                style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? '#A855F7' : 'var(--fg-18)'}`, background: active ? 'rgba(168,85,247,0.15)' : 'transparent', color: active ? '#A855F7' : 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}
                              >{ord}</button>
                            )
                          })}
                        </div>
                      </div>
                      {/* Weekday row */}
                      <div>
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-40)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Which day?</p>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {WEEKDAY_LABELS.map((label, idx) => {
                            const active = weekdayDays.has(idx)
                            return (
                              <button key={label} type="button"
                                onClick={() => setWeekdayDays(prev => { const n = new Set(prev); active ? n.delete(idx) : n.add(idx); return n })}
                                style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? '#A855F7' : 'var(--fg-18)'}`, background: active ? 'rgba(168,85,247,0.15)' : 'transparent', color: active ? '#A855F7' : 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}
                              >{label}</button>
                            )
                          })}
                        </div>
                      </div>
                      {/* Preview */}
                      {previewDates.length > 0 && (
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: 0 }}>
                          This will post {previewDates.length} event{previewDates.length !== 1 ? 's' : ''} over the next 3 months:{' '}
                          {previewDates.slice(0, 3).map(fmtShortDate).join(', ')}
                          {previewDates.length > 3 ? `, and ${previewDates.length - 3} more` : ''}
                        </p>
                      )}
                      {(weekdayOrdinals.size === 0 || weekdayDays.size === 0) && (
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', margin: 0 }}>
                          Pick at least one occurrence and one weekday to see a preview.
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* Preview for simple modes */}
                {recurrenceFrequency !== 'weekdays' && (
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: 0 }}>
                    This will post {FREQ_COUNTS[recurrenceFrequency]} events over the next 3 months ({FREQ_LABELS[recurrenceFrequency]})
                  </p>
                )}
              </div>
            )}
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

          {/* Fill frame */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Fill frame</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setFillFrame(v => !v)}
                style={{ padding: '6px 14px', background: fillFrame ? 'rgba(168,85,247,0.18)' : 'transparent', border: `1px solid ${fillFrame ? 'rgba(168,85,247,0.55)' : 'var(--fg-18)'}`, borderRadius: 4, color: fillFrame ? '#c084fc' : 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                {fillFrame ? 'ON' : 'OFF'}
              </button>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)' }}>
                {fillFrame ? 'fills grid card (edges cropped)' : 'fits grid card (backdrop visible)'}
              </span>
            </div>
            {fillFrame && posterNatural && (() => {
              const posterSrc = reuseExistingPoster ? extracted?.existing_poster_url : imagePreviews[0]
              if (!posterSrc) return null
              const cw = 160, ch = 240
              const scale = Math.max(cw / (posterNatural.w || 1), ch / (posterNatural.h || 1))
              const dw = posterNatural.w * scale, dh = posterNatural.h * scale
              const ox = dw - cw, oy = dh - ch
              const imgLeft = ox > 0 ? -focalX * ox : (cw - dw) / 2
              const imgTop = oy > 0 ? -focalY * oy : (ch - dh) / 2
              return (
                <div style={{ marginTop: 10 }}>
                  <div
                    onPointerDown={e => {
                      e.currentTarget.setPointerCapture(e.pointerId)
                      focalDragRef.current = { startX: e.clientX, startY: e.clientY, startFocalX: focalX, startFocalY: focalY }
                    }}
                    onPointerMove={e => {
                      const d = focalDragRef.current
                      if (!d) return
                      const startLeft = ox > 0 ? -d.startFocalX * ox : (cw - dw) / 2
                      const startTop = oy > 0 ? -d.startFocalY * oy : (ch - dh) / 2
                      const nLeft = ox > 0 ? Math.min(0, Math.max(-ox, startLeft + (e.clientX - d.startX))) : startLeft
                      const nTop = oy > 0 ? Math.min(0, Math.max(-oy, startTop + (e.clientY - d.startY))) : startTop
                      setFocalX(ox > 0 ? -nLeft / ox : 0.5)
                      setFocalY(oy > 0 ? -nTop / oy : 0.5)
                    }}
                    onPointerUp={() => { focalDragRef.current = null }}
                    style={{ width: 160, height: 240, overflow: 'hidden', borderRadius: 8, cursor: 'grab', position: 'relative', userSelect: 'none', touchAction: 'none', border: '1px solid var(--fg-18)', background: '#111' }}
                  >
                    <img
                      src={posterSrc}
                      draggable={false}
                      style={{ position: 'absolute', width: dw, height: dh, left: imgLeft, top: imgTop, pointerEvents: 'none', userSelect: 'none', display: 'block' }}
                    />
                  </div>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', display: 'block', marginTop: 5 }}>Drag to reposition</span>
                </div>
              )
            })()}
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {!reuseExistingPoster && (
              <button
                type="button"
                onClick={handlePreview}
                disabled={!imageFiles[0]}
                style={{ padding: '12px 14px', background: 'transparent', border: '1px solid var(--fg-25)', borderRadius: 6, color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
              >
                Preview
              </button>
            )}
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

      {showPreviewModal && imageFiles[0] && (
        <CropPreviewModal
          imageSrc={imagePreviews[0]}
          imageFile={imageFiles[0]}
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

// ── Admin notifications ──────────────────────────────────────

function AdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [actioning, setActioning] = useState<string | null>(null)

  const fetchNotifications = async () => {
    const now = new Date().toISOString()
    const { data } = await supabaseAdmin
      .from('admin_notifications')
      .select('*')
      .eq('dismissed', false)
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
      .order('created_at', { ascending: false })
    if (data) setNotifications(data as AdminNotification[])
  }

  useEffect(() => { fetchNotifications() }, [])

  if (!notifications.length) return null

  const handleExtend = async (n: AdminNotification) => {
    if (!n.recurrence_group_id) return
    setActioning(n.id)
    try {
      const { data: events } = await supabaseAdmin
        .from('events')
        .select('starts_at, recurrence_frequency, venue_id, title, category, poster_url, description, fill_frame, focal_x, focal_y, neighborhood, address')
        .eq('recurrence_group_id', n.recurrence_group_id)
        .order('starts_at', { ascending: false })
        .limit(1)
      if (!events?.length) return
      const last = events[0]
      const freq = (last.recurrence_frequency ?? 'weekly') as RecurrenceFrequency
      const nextStart = new Date(last.starts_at)
      if (freq === 'weekly')        nextStart.setDate(nextStart.getDate() + 7)
      else if (freq === 'biweekly') nextStart.setDate(nextStart.getDate() + 14)
      else                          nextStart.setMonth(nextStart.getMonth() + 1)
      const newDates = generateOccurrenceDates(nextStart, freq)
      await supabaseAdmin.from('events').insert(newDates.map(d => ({
        venue_id: last.venue_id, title: last.title, category: last.category,
        poster_url: last.poster_url, starts_at: d.toISOString(),
        neighborhood: last.neighborhood, address: last.address,
        description: last.description, view_count: 0, like_count: 0,
        fill_frame: last.fill_frame, focal_x: last.focal_x, focal_y: last.focal_y,
        recurrence_group_id: n.recurrence_group_id, recurrence_frequency: freq,
      })))
      const newSnooze = new Date(newDates[newDates.length - 1])
      newSnooze.setMonth(newSnooze.getMonth() + 3)
      await supabaseAdmin.from('admin_notifications').update({ snoozed_until: newSnooze.toISOString() }).eq('id', n.id)
      await fetchNotifications()
    } finally { setActioning(null) }
  }

  const handleMarkEnded = async (id: string) => {
    await supabaseAdmin.from('admin_notifications').update({ dismissed: true }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const handleSnooze = async (id: string) => {
    const until = new Date(); until.setDate(until.getDate() + 14)
    await supabaseAdmin.from('admin_notifications').update({ snoozed_until: until.toISOString() }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <section style={{ marginBottom: 8 }}>
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: '0 0 14px 0' }}>Notifications</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notifications.map(n => (
          <div key={n.id} style={{ padding: '14px 16px', border: '1px solid rgba(234,179,8,0.35)', borderRadius: 8, background: 'rgba(234,179,8,0.05)' }}>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 6px 0' }}>{n.title}</p>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: '0 0 12px 0', lineHeight: 1.5 }}>{n.message}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleExtend(n)}
                disabled={actioning === n.id}
                style={{ padding: '6px 12px', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: actioning === n.id ? 'default' : 'pointer', opacity: actioning === n.id ? 0.6 : 1 }}
              >
                {actioning === n.id ? 'Extending…' : 'Extend 3 months'}
              </button>
              <button
                onClick={() => handleMarkEnded(n.id)}
                style={{ padding: '6px 12px', background: 'transparent', color: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, cursor: 'pointer' }}
              >
                Mark as ended
              </button>
              <button
                onClick={() => handleSnooze(n.id)}
                style={{ padding: '6px 12px', background: 'transparent', color: 'var(--fg-40)', border: '1px solid var(--fg-18)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, cursor: 'pointer' }}
              >
                Dismiss for now
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Duplicate venue merger ───────────────────────────────────

function DuplicateVenueMerger({ groups, onMergeComplete }: { groups: Venue[][]; onMergeComplete: () => void }) {
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null)
  const [primaryIds, setPrimaryIds] = useState<Record<number, string>>({})
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})
  const [merging, setMerging] = useState<number | null>(null)
  const [mergeSuccess, setMergeSuccess] = useState<Record<number, string>>({})

  const activeCount = groups.filter((_, i) => !mergeSuccess[i]).length
  if (!groups.length || !activeCount) return null

  const loadCounts = async (venueIds: string[]) => {
    const { data } = await supabaseAdmin.from('events').select('venue_id').in('venue_id', venueIds)
    const counts: Record<string, number> = {}
    venueIds.forEach(id => { counts[id] = 0 })
    for (const row of data ?? []) if (row.venue_id) counts[row.venue_id] = (counts[row.venue_id] ?? 0) + 1
    setEventCounts(prev => ({ ...prev, ...counts }))
  }

  const handleExpand = async (i: number) => {
    if (expandedGroup === i) { setExpandedGroup(null); return }
    setExpandedGroup(i)
    await loadCounts(groups[i].map(v => v.id))
  }

  const handleMerge = async (groupIdx: number) => {
    const primaryId = primaryIds[groupIdx]
    if (!primaryId) return
    const group = groups[groupIdx]
    const primary = group.find(v => v.id === primaryId)!
    const duplicateIds = group.filter(v => v.id !== primaryId).map(v => v.id)
    setMerging(groupIdx)
    try {
      const { count } = await supabaseAdmin.from('events').select('*', { count: 'exact', head: true }).in('venue_id', duplicateIds)
      const evtCount = count ?? 0
      if (duplicateIds.length > 0) {
        const { error: upErr } = await supabaseAdmin.from('events').update({ venue_id: primaryId }).in('venue_id', duplicateIds)
        if (upErr) throw upErr
      }
      const { error: delErr } = await supabaseAdmin.from('venues').delete().in('id', duplicateIds)
      if (delErr) throw delErr
      setMergeSuccess(prev => ({
        ...prev,
        [groupIdx]: `${evtCount} event${evtCount !== 1 ? 's' : ''} repointed to ${primary.name}. ${duplicateIds.length} duplicate venue${duplicateIds.length !== 1 ? 's' : ''} deleted.`,
      }))
      onMergeComplete()
    } catch (e) {
      console.error('Merge failed:', e)
    } finally { setMerging(null) }
  }

  return (
    <section style={{ marginBottom: 8 }}>
      <div style={{ padding: '14px 16px', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, background: 'rgba(239,68,68,0.05)', marginBottom: 10 }}>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px 0' }}>Duplicate venues detected</p>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: 0 }}>
          {activeCount} venue group{activeCount !== 1 ? 's' : ''} may be duplicates. Review and merge to keep your data clean.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((group, groupIdx) => {
          if (mergeSuccess[groupIdx]) return (
            <div key={groupIdx} style={{ padding: '10px 14px', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 7, background: 'rgba(74,222,128,0.05)' }}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#4ade80', margin: 0 }}>✓ {mergeSuccess[groupIdx]}</p>
            </div>
          )
          const isExpanded = expandedGroup === groupIdx
          const primaryId = primaryIds[groupIdx]
          return (
            <div key={groupIdx} style={{ border: '1px solid var(--fg-18)', borderRadius: 7, overflow: 'hidden' }}>
              <button onClick={() => handleExpand(groupIdx)} style={{ width: '100%', padding: '10px 14px', background: 'rgba(240,236,227,0.02)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-65)', textAlign: 'left' }}>
                  {group.map(v => v.name).join(' · ')}
                </span>
                <span style={{ color: 'var(--fg-40)', fontSize: 10, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
              </button>
              {isExpanded && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--fg-08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.map(v => (
                    <div key={v.id} style={{ padding: '10px 12px', borderRadius: 6, border: `1px solid ${primaryId === v.id ? 'rgba(168,85,247,0.55)' : 'var(--fg-18)'}`, background: primaryId === v.id ? 'rgba(168,85,247,0.08)' : 'rgba(240,236,227,0.02)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 2px 0' }}>{v.name}</p>
                        {v.address    && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '0 0 1px 0' }}>{v.address}</p>}
                        {v.neighborhood && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: 0 }}>{v.neighborhood}</p>}
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', margin: '4px 0 0 0' }}>
                          {eventCounts[v.id] !== undefined ? `${eventCounts[v.id]} event${eventCounts[v.id] !== 1 ? 's' : ''}` : '…'}
                        </p>
                      </div>
                      <button
                        onClick={() => setPrimaryIds(prev => ({ ...prev, [groupIdx]: v.id }))}
                        style={{ padding: '5px 10px', background: primaryId === v.id ? '#A855F7' : 'transparent', color: primaryId === v.id ? '#fff' : 'var(--fg-55)', border: `1px solid ${primaryId === v.id ? '#A855F7' : 'var(--fg-18)'}`, borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {primaryId === v.id ? '✓ Keeping' : 'Keep this one'}
                      </button>
                    </div>
                  ))}
                  {primaryId && (
                    <button
                      onClick={() => handleMerge(groupIdx)}
                      disabled={merging === groupIdx}
                      style={{ padding: '9px 0', background: merging === groupIdx ? 'var(--fg-18)' : 'rgba(239,68,68,0.85)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, cursor: merging === groupIdx ? 'default' : 'pointer' }}
                    >
                      {merging === groupIdx ? 'Merging…' : `Merge & Delete ${group.length - 1} duplicate${group.length - 1 !== 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Main admin dashboard ─────────────────────────────────────

function AdminDashboard() {
  const [venues, setVenues] = useState<Venue[]>([])

  const fetchVenues = async () => {
    const { data } = await supabaseAdmin.from('venues').select('id, name, neighborhood, address, location_lat, location_lng, website, instagram, hours').order('name', { ascending: true })
    if (data) setVenues(data)
  }

  useEffect(() => { fetchVenues() }, [])

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PlasterHeader />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 24px 32px', width: '100%' }}>

          <DuplicateVenueMerger groups={findDuplicateVenueGroups(venues)} onMergeComplete={fetchVenues} />
          <AdminNotifications />

          <Section title="Add a Venue">
            <VenueForm onVenueAdded={fetchVenues} />
          </Section>

          <Section title="Add an Event">
            <EventForm venues={venues} />
          </Section>

          <Section title="Import Poster">
            <ImportForm />
          </Section>

        </div>
      </div>
      <AdminBottomNav />
    </div>
  )
}

// ── Entry point ──────────────────────────────────────────────

export function Admin() {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily: '"Space Grotesk", sans-serif',
        color: 'var(--fg)',
        background: 'var(--bg)',
      }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
          plaster
        </div>
        <p style={{ margin: '8px 0', fontSize: 15, maxWidth: 320 }}>
          This page is for admins only.
        </p>
      </div>
    )
  }
  return <AdminDashboard />
}
