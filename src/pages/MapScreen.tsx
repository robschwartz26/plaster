import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker, type MapRef } from 'react-map-gl/mapbox'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, type DbVenue } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const PORTLAND = { latitude: 45.5231, longitude: -122.6784 }
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'

// ── Radius slider (logarithmic: 0.5mi → 20mi) ────────────────
const MIN_MI = 0.5
const MAX_MI = 20
function sliderToMiles(v: number) { return MIN_MI * Math.pow(MAX_MI / MIN_MI, v) }
function milesToSlider(m: number) { return Math.log(m / MIN_MI) / Math.log(MAX_MI / MIN_MI) }

// ── Haversine distance ────────────────────────────────────────
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ── Time scrubber helpers (minutes from noon on selectedDate) ─
const SCRUB_MIN = 0    // noon
const SCRUB_MAX = 960  // 4am next day

function scrubberMinsToLabel(mins: number) {
  const totalMins = 12 * 60 + mins // offset from midnight
  const h24 = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'am' : 'pm'
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

function eventToScrubberMins(startsAt: string, selectedDate: string): number {
  // "minutes from noon on selectedDate"
  const eventMs = new Date(startsAt).getTime()
  const noonMs = new Date(selectedDate + 'T12:00:00').getTime()
  return (eventMs - noonMs) / 60000
}

// ── Date helpers ──────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function formatDateLabel(dateStr: string) {
  const today = todayStr()
  const tomorrow = addDays(today, 1)
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Types ─────────────────────────────────────────────────────
interface VenueEvent {
  id: string
  title: string
  starts_at: string
  poster_url: string | null
  category: string | null
  scrubMins: number // computed
}

interface VenuePin {
  venue: DbVenue
  events: VenueEvent[]
  distanceMi: number
}

const TICK_TIMES = [0, 180, 360, 540, 720, 840, 960] // noon, 3pm, 6pm, 9pm, midnight, 3am, 4am

export function MapScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)

  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [scrubMins, setScrubMins] = useState(360) // default 6pm
  const [radiusSlider, setRadiusSlider] = useState(milesToSlider(5)) // default 5mi
  const radiusMi = sliderToMiles(radiusSlider)

  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [pins, setPins] = useState<VenuePin[]>([])
  const [selectedVenue, setSelectedVenue] = useState<VenuePin | null>(null)
  const [loading, setLoading] = useState(false)

  const centerLat = userLoc?.lat ?? PORTLAND.latitude
  const centerLng = userLoc?.lng ?? PORTLAND.longitude

  // ── Geolocation ───────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setUserLoc((prev) => {
          if (prev && Math.abs(prev.lat - latitude) < 0.0001 && Math.abs(prev.lng - longitude) < 0.0001) return prev
          return { lat: latitude, lng: longitude }
        })
      },
      (err) => { console.warn('[Map] geolocation error:', err.message) },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(wid)
  }, [])

  // Save location to DB on significant move
  useEffect(() => {
    if (!userLoc || !user) return
    supabase.from('profiles').update({ location_lat: userLoc.lat, location_lng: userLoc.lng }).eq('id', user.id)
  }, [userLoc, user])

  // ── Load venues + events ──────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    // Events from noon selectedDate to 6am next day (catches late-night shows)
    const fromISO = selectedDate + 'T12:00:00'
    const toDate = addDays(selectedDate, 1)
    const toISO = toDate + 'T06:00:00'

    const [{ data: venuesData }, { data: eventsData }] = await Promise.all([
      supabase.from('venues').select('*').not('location_lat', 'is', null).not('location_lng', 'is', null),
      supabase.from('events').select('id, title, starts_at, poster_url, category, venue_id')
        .gte('starts_at', fromISO)
        .lte('starts_at', toISO)
        .not('venue_id', 'is', null)
        .order('starts_at', { ascending: true }),
    ])

    const venues = (venuesData ?? []) as DbVenue[]
    const events = (eventsData ?? []) as (VenueEvent & { venue_id: string })[]

    // Group events by venue
    const eventsByVenue: Record<string, VenueEvent[]> = {}
    for (const ev of events) {
      const scrub = eventToScrubberMins(ev.starts_at, selectedDate)
      if (!eventsByVenue[ev.venue_id]) eventsByVenue[ev.venue_id] = []
      eventsByVenue[ev.venue_id].push({ ...ev, scrubMins: scrub })
    }

    // Build pins for venues that have events today
    const newPins: VenuePin[] = []
    for (const venue of venues) {
      const venueEvents = eventsByVenue[venue.id]
      if (!venueEvents?.length) continue
      const dist = haversineMiles(centerLat, centerLng, venue.location_lat!, venue.location_lng!)
      newPins.push({ venue, events: venueEvents, distanceMi: dist })
    }

    setPins(newPins)
    setLoading(false)
  }, [selectedDate, centerLat, centerLng])

  useEffect(() => { loadData() }, [loadData])

  // ── Pan to user location ──────────────────────────────────
  function flyToUser() {
    if (!userLoc || !mapRef.current) return
    mapRef.current.flyTo({ center: [userLoc.lng, userLoc.lat], zoom: 13, duration: 1000 })
  }

  // ── Radius-filtered pins ──────────────────────────────────
  const visiblePins = pins.filter((p) => p.distanceMi <= radiusMi)

  // ── Is a venue "active" at current scrubber time? ─────────
  function isActive(pin: VenuePin) {
    return pin.events.some((ev) => Math.abs(ev.scrubMins - scrubMins) < 120)
  }

  // Pick the event closest to scrubber time for the pin thumbnail
  function nearestEvent(pin: VenuePin): VenueEvent | null {
    if (!pin.events.length) return null
    return pin.events.reduce((best, ev) =>
      Math.abs(ev.scrubMins - scrubMins) < Math.abs(best.scrubMins - scrubMins) ? ev : best
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0b0b' }}>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAP_STYLE}
          initialViewState={{ latitude: PORTLAND.latitude, longitude: PORTLAND.longitude, zoom: 12 }}
          style={{ width: '100%', height: '100%' }}
          onClick={() => setSelectedVenue(null)}
        >
          {/* User location dot */}
          {userLoc && (
            <Marker latitude={userLoc.lat} longitude={userLoc.lng} anchor="center">
              <motion.div
                style={{ position: 'relative', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {/* Pulse ring */}
                <motion.div
                  animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    width: 16, height: 16,
                    borderRadius: '50%',
                    background: '#60a5fa',
                  }}
                />
                {/* Dot */}
                <div style={{
                  width: 12, height: 12,
                  borderRadius: '50%',
                  background: '#3b82f6',
                  border: '2px solid white',
                  position: 'relative',
                  zIndex: 1,
                }} />
              </motion.div>
            </Marker>
          )}

          {/* Venue pins */}
          {visiblePins.map((pin) => {
            const active = isActive(pin)
            const ev = nearestEvent(pin)
            return (
              <Marker
                key={pin.venue.id}
                latitude={pin.venue.location_lat!}
                longitude={pin.venue.location_lng!}
                anchor="bottom"
                onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedVenue(pin) }}
              >
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: active ? 1 : 0.35 }}
                  transition={{ duration: 0.25 }}
                  style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                >
                  {active ? (
                    // Active pin — circular with poster or initial
                    <div style={{
                      width: 44, height: 44,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: '2px solid #f0ece3',
                      background: '#1a1a1a',
                      boxShadow: '0 0 0 3px rgba(240,236,227,0.15), 0 2px 8px rgba(0,0,0,0.6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      {ev?.poster_url ? (
                        <img
                          src={ev.poster_url}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif' }}>
                          {pin.venue.name[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                  ) : (
                    // Inactive pin — small dot
                    <div style={{
                      width: 8, height: 8,
                      borderRadius: '50%',
                      background: '#f0ece3',
                      opacity: 0.35,
                    }} />
                  )}
                  {/* Stem */}
                  {active && (
                    <div style={{
                      width: 2, height: 8,
                      background: '#f0ece3',
                      opacity: 0.7,
                      marginTop: 1,
                    }} />
                  )}
                </motion.div>
              </Marker>
            )
          })}
        </Map>

        {/* ── Date nav — top center ── */}
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 0,
          background: 'rgba(12,11,11,0.85)', backdropFilter: 'blur(8px)',
          borderRadius: 20, padding: '6px 4px',
          border: '1px solid rgba(240,236,227,0.12)',
          zIndex: 10,
        }}>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            style={{ background: 'none', border: 'none', color: 'var(--fg-40)', cursor: 'pointer', padding: '0 10px', fontSize: 18, lineHeight: 1 }}
          >‹</button>
          <span style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 13, fontWeight: 700,
            color: 'var(--fg)', minWidth: 90, textAlign: 'center',
          }}>
            {formatDateLabel(selectedDate)}
          </span>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            style={{ background: 'none', border: 'none', color: 'var(--fg-40)', cursor: 'pointer', padding: '0 10px', fontSize: 18, lineHeight: 1 }}
          >›</button>
        </div>

        {/* ── Radius slider — left side ── */}
        <div style={{
          position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          background: 'rgba(12,11,11,0.85)', backdropFilter: 'blur(8px)',
          borderRadius: 16, padding: '14px 10px',
          border: '1px solid rgba(240,236,227,0.12)',
          zIndex: 10,
        }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--fg-40)', textTransform: 'uppercase' }}>
            {radiusMi < 1 ? `${(radiusMi * 5280).toFixed(0)}ft` : `${radiusMi.toFixed(radiusMi < 10 ? 1 : 0)}mi`}
          </span>
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={radiusSlider}
            onChange={(e) => setRadiusSlider(Number(e.target.value))}
            style={{
              writingMode: 'vertical-lr' as const,
              direction: 'rtl' as const,
              height: 100,
              width: 4,
              cursor: 'pointer',
              accentColor: '#f0ece3',
            }}
          />
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--fg-30)', textTransform: 'uppercase' }}>
            R
          </span>
        </div>

        {/* ── Locate me button — right side ── */}
        <button
          onClick={flyToUser}
          style={{
            position: 'absolute', right: 14, bottom: 100,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(12,11,11,0.85)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(240,236,227,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 10,
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#f0ece3" strokeWidth={2} opacity={0.6}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="8" strokeDasharray="3 2" />
          </svg>
        </button>

        {/* ── Pin count badge ── */}
        {visiblePins.length > 0 && !selectedVenue && (
          <div style={{
            position: 'absolute', bottom: 92, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(12,11,11,0.85)', backdropFilter: 'blur(8px)',
            borderRadius: 20, padding: '5px 14px',
            border: '1px solid rgba(240,236,227,0.12)',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
            color: 'var(--fg-55)', zIndex: 10, whiteSpace: 'nowrap',
          }}>
            {visiblePins.length} venue{visiblePins.length !== 1 ? 's' : ''} · {visiblePins.filter(isActive).length} active
          </div>
        )}

        {/* ── Venue detail panel ── */}
        <AnimatePresence>
          {selectedVenue && (
            <motion.div
              key={selectedVenue.venue.id}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 300 }}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                maxHeight: '55%',
                background: 'rgba(18,17,17,0.97)', backdropFilter: 'blur(20px)',
                borderTop: '1px solid rgba(240,236,227,0.12)',
                borderRadius: '20px 20px 0 0',
                display: 'flex', flexDirection: 'column',
                zIndex: 20,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(240,236,227,0.2)' }} />
              </div>

              {/* Scrollable content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
                {/* Venue header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16, paddingTop: 8 }}>
                  {/* Venue avatar or initial */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: 'rgba(240,236,227,0.08)',
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selectedVenue.venue.avatar_url ? (
                      <img src={selectedVenue.venue.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 20, fontWeight: 700, color: 'rgba(240,236,227,0.55)', fontFamily: '"Space Grotesk", sans-serif' }}>
                        {selectedVenue.venue.name[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2 }}>
                      {selectedVenue.venue.name}
                    </p>
                    {(selectedVenue.venue.neighborhood || selectedVenue.venue.address) && (
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(240,236,227,0.45)', fontFamily: '"Space Grotesk", sans-serif' }}>
                        {selectedVenue.venue.neighborhood ?? selectedVenue.venue.address}
                      </p>
                    )}
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(240,236,227,0.30)', fontFamily: '"Space Grotesk", sans-serif' }}>
                      {selectedVenue.distanceMi < 0.1
                        ? 'nearby'
                        : selectedVenue.distanceMi < 1
                          ? `${(selectedVenue.distanceMi * 5280).toFixed(0)} ft away`
                          : `${selectedVenue.distanceMi.toFixed(1)} mi away`}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/venue/${selectedVenue.venue.id}`)}
                    style={{
                      padding: '7px 14px', borderRadius: 20,
                      border: 'none', background: '#f0ece3',
                      color: '#0c0b0b',
                      fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    View
                  </button>
                </div>

                {/* Events list */}
                <p style={{
                  margin: '0 0 10px', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'rgba(240,236,227,0.30)', fontFamily: '"Space Grotesk", sans-serif',
                }}>
                  {selectedVenue.events.length} event{selectedVenue.events.length !== 1 ? 's' : ''} · {formatDateLabel(selectedDate)}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {selectedVenue.events.map((ev) => {
                    const evDate = new Date(ev.starts_at)
                    const timeStr = evDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    const activeNow = Math.abs(ev.scrubMins - scrubMins) < 120
                    return (
                      <div
                        key={ev.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 0',
                          borderBottom: '1px solid rgba(240,236,227,0.06)',
                        }}
                      >
                        {/* Poster thumbnail */}
                        <div style={{
                          width: 36, height: 52, borderRadius: 4, flexShrink: 0,
                          overflow: 'hidden',
                          background: 'rgba(240,236,227,0.08)',
                        }}>
                          {ev.poster_url && <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            margin: 0, fontSize: 13, fontWeight: 600,
                            color: activeNow ? '#f0ece3' : 'rgba(240,236,227,0.55)',
                            fontFamily: '"Space Grotesk", sans-serif',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {ev.title}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(240,236,227,0.35)', fontFamily: '"Space Grotesk", sans-serif' }}>
                            {timeStr}
                            {ev.category && ` · ${ev.category}`}
                          </p>
                        </div>
                        {activeNow && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#f0ece3', flexShrink: 0,
                          }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading indicator */}
        {loading && (
          <div style={{
            position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(12,11,11,0.85)', backdropFilter: 'blur(8px)',
            borderRadius: 20, padding: '5px 14px',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
            color: 'var(--fg-30)', zIndex: 10,
          }}>
            Loading…
          </div>
        )}
      </div>

      {/* ── Time scrubber ── */}
      <div style={{
        background: 'var(--bg)',
        borderTop: '1px solid rgba(240,236,227,0.08)',
        padding: '10px 20px 6px',
      }}>
        {/* Current time label */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)' }}>
            12pm
          </span>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--fg-65)' }}>
            {scrubberMinsToLabel(scrubMins)}
          </span>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)' }}>
            4am
          </span>
        </div>

        {/* Slider track with tick marks */}
        <div style={{ position: 'relative' }}>
          <input
            type="range"
            min={SCRUB_MIN} max={SCRUB_MAX} step={15}
            value={scrubMins}
            onChange={(e) => setScrubMins(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f0ece3', cursor: 'pointer', display: 'block' }}
          />
          {/* Tick marks */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
            {TICK_TIMES.map((t) => (
              <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: 1, height: 4, background: 'rgba(240,236,227,0.18)' }} />
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 8, color: 'rgba(240,236,227,0.25)', whiteSpace: 'nowrap' }}>
                  {scrubberMinsToLabel(t)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
