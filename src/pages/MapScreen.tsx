import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker } from 'react-map-gl/mapbox'
import { motion, AnimatePresence } from 'framer-motion'
import circle from '@turf/circle'
import difference from '@turf/difference'
import { featureCollection } from '@turf/helpers'
import { supabase, type DbVenue } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'
const PORTLAND = { latitude: 45.5051, longitude: -122.6750 }

// ── Logarithmic radius scale (mirrors Swapper exactly) ───────────────────────
function sliderToMiles(position: number): number {
  const minMiles = 1, maxMiles = 100, midMiles = 3.5
  if (position <= 0.5) return minMiles + (midMiles - minMiles) * (position / 0.5)
  const t = (position - 0.5) / 0.5
  return midMiles + (maxMiles - midMiles) * (t * t)
}

function milesToSlider(miles: number): number {
  const minMiles = 1, maxMiles = 100, midMiles = 3.5
  if (miles <= midMiles) return ((miles - minMiles) / (midMiles - minMiles)) * 0.5
  const t = Math.sqrt((miles - midMiles) / (maxMiles - midMiles))
  return 0.5 + t * 0.5
}

function formatRadiusLabel(miles: number): string {
  if (miles >= 99.5) return 'Any'
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

// ── Haversine distance (miles) ────────────────────────────────────────────────
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── World bbox for fog mask ───────────────────────────────────────────────────
const WORLD_POLYGON = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
  },
}
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as [] }

// ── Day helpers ───────────────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDayLabel(dateStr: string, todayDate: string): string {
  const tomorrowDate = addDays(todayDate, 1)
  const weekday = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
  const monthDay = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (dateStr === todayDate) return `Tonight · ${weekday} ${monthDay}`
  if (dateStr === tomorrowDate) return `Tomorrow · ${weekday} ${monthDay}`
  return `${weekday} ${monthDay}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface VenueEvent {
  id: string
  title: string
  starts_at: string
  poster_url: string | null
  category: string | null
  venue_id: string
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MapScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const mapRef = useRef<any>(null)
  const mapLoadedRef = useRef(false)

  // Day selection (index 0 = today, up to 6)
  const today = todayStr()
  const [dayIdx, setDayIdx] = useState(0)
  const selectedDate = addDays(today, dayIdx)

  // Radius
  const [sliderPos, setSliderPos] = useState(() => milesToSlider(5))
  const radiusMi = sliderToMiles(sliderPos)

  // Locations
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusCenter, setRadiusCenter] = useState<{ lat: number; lng: number } | null>(null)

  // Map view state
  const [viewState, setViewState] = useState({
    longitude: PORTLAND.longitude,
    latitude: PORTLAND.latitude,
    zoom: 12,
  })

  // Data
  const [venues, setVenues] = useState<DbVenue[]>([])
  const [eventsByVenue, setEventsByVenue] = useState<Record<string, VenueEvent[]>>({})
  const [selectedVenue, setSelectedVenue] = useState<DbVenue | null>(null)

  // Fog/circle GeoJSON refs (for re-applying after style reload)
  const circleDataRef = useRef<object>(EMPTY_FC)
  const fogDataRef = useRef<object>(EMPTY_FC)

  const centerLat = radiusCenter?.lat ?? userLoc?.lat ?? PORTLAND.latitude
  const centerLng = radiusCenter?.lng ?? userLoc?.lng ?? PORTLAND.longitude

  const circleGeoJSON2 = radiusMi < 99.5
    ? circle([centerLng, centerLat], radiusMi, { steps: 64, units: 'miles' })
    : null

  const fogGeoJSON = circleGeoJSON2
    ? (() => {
        try {
          const diff = difference(featureCollection([WORLD_POLYGON as any, circleGeoJSON2]))
          return diff ? { type: 'FeatureCollection' as const, features: [diff] } : null
        } catch { return null }
      })()
    : null

  circleDataRef.current = circleGeoJSON2 ?? EMPTY_FC
  fogDataRef.current = fogGeoJSON ?? EMPTY_FC

  // ── Imperative Mapbox layer setup (same pattern as Swapper) ──────────────
  const setupLayers = useCallback((map: any) => {
    if (!map.getSource('radius-mask-source')) {
      map.addSource('radius-mask-source', { type: 'geojson', data: EMPTY_FC })
    }
    if (!map.getLayer('radius-mask-layer')) {
      map.addLayer({
        id: 'radius-mask-layer',
        type: 'fill',
        source: 'radius-mask-source',
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.35 },
      })
    }
    if (!map.getSource('radius-circle-source')) {
      map.addSource('radius-circle-source', { type: 'geojson', data: EMPTY_FC })
    }
    if (!map.getLayer('radius-circle-layer')) {
      map.addLayer({
        id: 'radius-circle-layer',
        type: 'line',
        source: 'radius-circle-source',
        paint: { 'line-color': '#f0ece3', 'line-opacity': 0.25, 'line-width': 1.5 },
      })
    }
    const circleSrc = map.getSource('radius-circle-source')
    if (circleSrc) circleSrc.setData(circleDataRef.current)
    const fogSrc = map.getSource('radius-mask-source')
    if (fogSrc) fogSrc.setData(fogDataRef.current)
  }, [])

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    if (!map) return
    mapLoadedRef.current = true
    setupLayers(map)
    map.on('style.load', () => setupLayers(map))
  }, [setupLayers])

  // ── Update Mapbox sources when circle/fog data changes ────────────────────
  useEffect(() => {
    if (!mapLoadedRef.current || !mapRef.current) return
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    const circleSrc = map.getSource('radius-circle-source')
    if (circleSrc) circleSrc.setData(circleGeoJSON2 ?? EMPTY_FC)
    const fogSrc = map.getSource('radius-mask-source')
    if (fogSrc) fogSrc.setData(fogGeoJSON ?? EMPTY_FC)
  }, [circleGeoJSON2, fogGeoJSON])

  // ── Geolocation ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation || !user) return
    let lastSaved = { lat: 0, lng: 0 }
    const onSuccess = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng } = pos.coords
      setUserLoc({ lat, lng })
      setViewState((v) => ({ ...v, latitude: lat, longitude: lng }))
      const moved = Math.abs(lat - lastSaved.lat) > 0.0001 || Math.abs(lng - lastSaved.lng) > 0.0001
      if (moved) {
        lastSaved = { lat, lng }
        supabase.from('profiles').update({ location_lat: lat, location_lng: lng }).eq('id', user.id)
      }
    }
    const onError = (err: GeolocationPositionError) => console.warn('[Map] geolocation:', err.message)
    navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, maximumAge: 0 })
    const wid = navigator.geolocation.watchPosition(onSuccess, onError, { enableHighAccuracy: true, maximumAge: 30000 })
    return () => navigator.geolocation.clearWatch(wid)
  }, [user])

  // ── Load venues (once) ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('venues').select('*').not('location_lat', 'is', null).not('location_lng', 'is', null)
      .then(({ data }) => setVenues((data ?? []) as DbVenue[]))
  }, [])

  // ── Load events for selected day ──────────────────────────────────────────
  useEffect(() => {
    const fromISO = selectedDate + 'T00:00:00'
    const toISO = addDays(selectedDate, 1) + 'T08:00:00'
    supabase.from('events')
      .select('id, title, starts_at, poster_url, category, venue_id')
      .gte('starts_at', fromISO)
      .lte('starts_at', toISO)
      .not('venue_id', 'is', null)
      .order('starts_at', { ascending: true })
      .then(({ data }) => {
        const byVenue: Record<string, VenueEvent[]> = {}
        for (const ev of (data ?? []) as VenueEvent[]) {
          if (!byVenue[ev.venue_id]) byVenue[ev.venue_id] = []
          byVenue[ev.venue_id].push(ev)
        }
        setEventsByVenue(byVenue)
        setSelectedVenue(null)
      })
  }, [selectedDate])

  // ── Pins within radius ────────────────────────────────────────────────────
  const visibleVenues = venues.filter((v) => {
    const dist = haversineMiles(centerLat, centerLng, v.location_lat!, v.location_lng!)
    return dist <= (radiusMi >= 99.5 ? Infinity : radiusMi)
  })

  const venuesWithEvents = new Set(Object.keys(eventsByVenue))
  const activeCount = visibleVenues.filter((v) => venuesWithEvents.has(v.id)).length

  // ── Pan to user ───────────────────────────────────────────────────────────
  function flyToUser() {
    if (!userLoc || !mapRef.current) return
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    map.flyTo({ center: [userLoc.lng, userLoc.lat], zoom: 14, duration: 1000 })
  }

  // ── Day scrubber swipe gesture ────────────────────────────────────────────
  const scrubTouchStartX = useRef<number | null>(null)
  function onScrubTouchStart(e: React.TouchEvent) {
    scrubTouchStartX.current = e.touches[0].clientX
  }
  function onScrubTouchEnd(e: React.TouchEvent) {
    if (scrubTouchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - scrubTouchStartX.current
    scrubTouchStartX.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0) setDayIdx((i) => Math.min(i + 1, 6))
    else setDayIdx((i) => Math.max(i - 1, 0))
  }

  // Distance label for venue panel
  function distLabel(venue: DbVenue): string {
    const mi = haversineMiles(centerLat, centerLng, venue.location_lat!, venue.location_lng!)
    if (mi < 0.1) return 'nearby'
    if (mi < 1) return `${(mi * 5280).toFixed(0)} ft`
    return `${mi.toFixed(1)} mi`
  }

  const selectedVenueEvents = selectedVenue ? (eventsByVenue[selectedVenue.id] ?? []) : []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0c0b0b' }}>

      {/* Map area — fills all space above day scrubber and nav */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(e) => setViewState(e.viewState)}
          onLoad={handleMapLoad}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLE}
          mapboxAccessToken={MAPBOX_TOKEN}
          attributionControl={false}
          onClick={() => setSelectedVenue(null)}
        >
          {/* User GPS dot */}
          {userLoc && (
            <Marker longitude={userLoc.lng} latitude={userLoc.lat} anchor="center">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div
                  animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 32, height: 32, borderRadius: '50%', background: 'rgba(96,165,250,0.2)' }}
                />
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#60a5fa', border: '2px solid white',
                  boxShadow: '0 0 12px rgba(96,165,250,0.9), 0 0 24px rgba(96,165,250,0.4)',
                  position: 'relative', zIndex: 1,
                }} />
              </div>
            </Marker>
          )}

          {/* Venue pins */}
          {visibleVenues.map((venue, i) => {
            const hasEvents = venuesWithEvents.has(venue.id)
            const events = eventsByVenue[venue.id] ?? []
            const firstPoster = events.find((e) => e.poster_url)?.poster_url ?? null
            return (
              <Marker
                key={venue.id}
                longitude={venue.location_lng!}
                latitude={venue.location_lat!}
                anchor="bottom"
              >
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: hasEvents ? 1 : 0.28 }}
                  transition={{ delay: i * 0.02, type: 'spring', stiffness: 300 }}
                  onClick={(e) => { e.stopPropagation(); setSelectedVenue(venue) }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                >
                  {hasEvents ? (
                    // Active pin with poster or initial
                    <>
                      <motion.div
                        animate={{ boxShadow: [
                          '0 0 0 0 rgba(240,236,227,0.0)',
                          '0 0 0 6px rgba(240,236,227,0.15)',
                          '0 0 0 0 rgba(240,236,227,0.0)',
                        ]}}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          width: 40, height: 40, borderRadius: '50%',
                          overflow: 'hidden',
                          border: '2px solid rgba(240,236,227,0.9)',
                          background: '#1a1a1a',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        {firstPoster
                          ? <img src={firstPoster} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 14, fontWeight: 700, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif' }}>
                              {venue.name[0].toUpperCase()}
                            </span>
                        }
                      </motion.div>
                      {/* Stem */}
                      <div style={{ width: 2, height: 6, background: 'rgba(240,236,227,0.7)', borderRadius: 1 }} />
                    </>
                  ) : (
                    // Inactive dot
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f0ece3' }} />
                  )}
                </motion.button>
              </Marker>
            )
          })}
        </Map>

        {/* ── Radius slider — right side, same pattern as Swapper ───────────── */}
        <div
          style={{
            position: 'absolute', right: 12, bottom: 80, zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            background: 'rgba(12,11,11,0.9)', backdropFilter: 'blur(12px)',
            borderRadius: 16, padding: '12px 10px',
            border: '1px solid rgba(240,236,227,0.12)',
          }}
        >
          {/* Reset to GPS */}
          <button
            onClick={() => { setRadiusCenter(null); flyToUser() }}
            title="Reset to my location"
            style={{
              width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(240,236,227,0.15)',
              background: 'rgba(240,236,227,0.06)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(240,236,227,0.5)',
            }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>

          {/* Radius label */}
          <span style={{
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700,
            color: '#f0ece3', whiteSpace: 'nowrap',
          }}>
            {formatRadiusLabel(radiusMi)}
          </span>

          {/* Vertical slider */}
          <input
            type="range"
            min={0} max={1} step={0.001}
            value={sliderPos}
            onChange={(e) => {
              const pos = Number(e.target.value)
              setSliderPos(pos)
            }}
            style={{
              writingMode: 'vertical-lr' as const,
              direction: 'rtl' as const,
              height: 100, width: 16,
              cursor: 'pointer',
              accentColor: '#f0ece3',
            }}
          />
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'rgba(240,236,227,0.3)' }}>
            1
          </span>
        </div>

        {/* ── Locate me button — left side ── */}
        <button
          onClick={flyToUser}
          style={{
            position: 'absolute', left: 12, bottom: 80, zIndex: 10,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(12,11,11,0.9)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(240,236,227,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(240,236,227,0.55)" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>

        {/* ── Pin count badge ── */}
        {!selectedVenue && visibleVenues.length > 0 && (
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(12,11,11,0.85)', backdropFilter: 'blur(8px)',
            borderRadius: 20, padding: '5px 14px',
            border: '1px solid rgba(240,236,227,0.1)',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
            color: 'rgba(240,236,227,0.5)', zIndex: 10, whiteSpace: 'nowrap',
          }}>
            {activeCount} venue{activeCount !== 1 ? 's' : ''} tonight
          </div>
        )}

        {/* ── Venue detail bottom sheet ── */}
        <AnimatePresence>
          {selectedVenue && (
            <motion.div
              key={selectedVenue.id}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 300 }}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                maxHeight: '54%',
                background: 'rgba(15,14,14,0.98)',
                borderTop: '1px solid rgba(240,236,227,0.1)',
                borderRadius: '18px 18px 0 0',
                display: 'flex', flexDirection: 'column',
                zIndex: 30,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(240,236,227,0.18)' }} />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 18px' }}>
                {/* Venue header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(240,236,227,0.07)',
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selectedVenue.avatar_url
                      ? <img src={selectedVenue.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(240,236,227,0.45)', fontFamily: '"Space Grotesk", sans-serif' }}>
                          {selectedVenue.name[0].toUpperCase()}
                        </span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif' }}>
                      {selectedVenue.name}
                    </p>
                    {(selectedVenue.neighborhood || selectedVenue.address) && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(240,236,227,0.4)', fontFamily: '"Space Grotesk", sans-serif' }}>
                        {selectedVenue.neighborhood ?? selectedVenue.address}
                        {' · '}{distLabel(selectedVenue)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/venue/${selectedVenue.id}`)}
                    style={{
                      padding: '7px 14px', borderRadius: 20, border: 'none',
                      background: '#f0ece3', color: '#0c0b0b',
                      fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    View
                  </button>
                </div>

                {/* Events list */}
                {selectedVenueEvents.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'rgba(240,236,227,0.3)', fontFamily: '"Space Grotesk", sans-serif', margin: 0 }}>
                    No events {dayIdx === 0 ? 'tonight' : 'this day'}
                  </p>
                ) : (
                  <>
                    <p style={{
                      margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'rgba(240,236,227,0.28)',
                      fontFamily: '"Space Grotesk", sans-serif',
                    }}>
                      {selectedVenueEvents.length} event{selectedVenueEvents.length !== 1 ? 's' : ''}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {selectedVenueEvents.map((ev) => {
                        const timeStr = new Date(ev.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        return (
                          <div key={ev.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 0', borderBottom: '1px solid rgba(240,236,227,0.05)',
                          }}>
                            <div style={{
                              width: 32, height: 46, borderRadius: 4, flexShrink: 0,
                              background: 'rgba(240,236,227,0.07)', overflow: 'hidden',
                            }}>
                              {ev.poster_url && <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{
                                margin: 0, fontSize: 13, fontWeight: 600, color: '#f0ece3',
                                fontFamily: '"Space Grotesk", sans-serif',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {ev.title}
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(240,236,227,0.35)', fontFamily: '"Space Grotesk", sans-serif' }}>
                                {timeStr}{ev.category ? ` · ${ev.category}` : ''}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Day scrubber ── */}
      <div
        onTouchStart={onScrubTouchStart}
        onTouchEnd={onScrubTouchEnd}
        style={{
          background: 'rgba(12,11,11,0.97)',
          borderTop: '1px solid rgba(240,236,227,0.08)',
          padding: '10px 16px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setDayIdx((i) => Math.max(i - 1, 0))}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            color: dayIdx === 0 ? 'rgba(240,236,227,0.15)' : 'rgba(240,236,227,0.5)',
            fontSize: 22, lineHeight: 1, fontFamily: '"Space Grotesk", sans-serif',
          }}
          disabled={dayIdx === 0}
        >
          ‹
        </button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <AnimatePresence mode="wait">
            <motion.span
              key={selectedDate}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 14, fontWeight: 700,
                color: '#f0ece3',
                display: 'inline-block',
              }}
            >
              {formatDayLabel(selectedDate, today)}
            </motion.span>
          </AnimatePresence>
          {/* Dot indicators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 5 }}>
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                onClick={() => setDayIdx(i)}
                style={{
                  width: i === dayIdx ? 14 : 5,
                  height: 5, borderRadius: 3,
                  background: i === dayIdx ? '#f0ece3' : 'rgba(240,236,227,0.2)',
                  cursor: 'pointer',
                  transition: 'all 250ms ease',
                }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => setDayIdx((i) => Math.min(i + 1, 6))}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            color: dayIdx === 6 ? 'rgba(240,236,227,0.15)' : 'rgba(240,236,227,0.5)',
            fontSize: 22, lineHeight: 1, fontFamily: '"Space Grotesk", sans-serif',
          }}
          disabled={dayIdx === 6}
        >
          ›
        </button>
      </div>

      <BottomNav />
    </div>
  )
}
