import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker } from 'react-map-gl/mapbox'
import { motion, AnimatePresence } from 'framer-motion'
import circle from '@turf/circle'
import difference from '@turf/difference'
import { featureCollection } from '@turf/helpers'
import { List, Search, SlidersHorizontal, X } from 'lucide-react'
import { supabase, type DbVenue } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { useTheme } from '@/hooks/useTheme'
import { DateIndicator } from '@/components/DateIndicator'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const PORTLAND = { latitude: 45.5051, longitude: -122.6750 }

const CHIPS = ['All', '♥', 'Music', 'Drag', 'Dance', 'Art', 'Film', 'Literary', 'Trivia', 'Other'] as const
const DAY_COUNT = 7

// ── Logarithmic radius scale ──────────────────────────────────────────────────
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

// ── Haversine distance ────────────────────────────────────────────────────────
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Fog mask ──────────────────────────────────────────────────────────────────
const WORLD_POLYGON = {
  type: 'Feature' as const, properties: {},
  geometry: { type: 'Polygon' as const, coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
}
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as [] }

// ── Day helpers ───────────────────────────────────────────────────────────────
function todayStr(): string { return new Date().toISOString().slice(0, 10) }
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function formatDayFull(idx: number, today: string): string {
  if (idx === 0) return 'Tonight'
  if (idx === 1) return 'Tomorrow'
  const date = addDays(today, idx)
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Knurl wheel constants & renderer ─────────────────────────────────────────
const WHEEL_H      = 20   // drum canvas height in CSS px  (housing is 28px)
const WHEEL_ITEM_W = 72   // px per day slot
const WHEEL_COMP   = 0.70 // scroll→pattern compression
const WHEEL_PITCH  = 8    // fine diamond knurl pitch in CSS px

function drawKnurl(canvas: HTMLCanvasElement, scrollPx: number, dark: boolean): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const CW = canvas.width / dpr
  const CH = canvas.height / dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Palette
  const [edge0, edge1, mid0, mid1, lineCol, hlCol, lipEdge] = dark
    ? ['#0a0908','#181614','#2a2825','#322e2a', 'rgba(8,6,4,1)',        'rgba(210,202,188,1)',    'rgba(160,152,140,0.70)']
    : ['#5e5a56','#747068','#8a8680','#908c88', 'rgba(60,56,50,0.7)',   'rgba(255,255,255,0.95)', 'rgba(220,215,210,0.70)']
  // fadeRgb matches the housing: night → #0a0908, day → #b8b4ae slot recess
  const fadeRgb = dark ? '10,9,8' : '184,180,174'

  // 1 ── Cylinder body
  const body = ctx.createLinearGradient(0, 0, 0, CH)
  body.addColorStop(0,    edge0)
  body.addColorStop(0.15, edge1)
  body.addColorStop(0.40, mid0)
  body.addColorStop(0.50, mid1)
  body.addColorStop(0.60, mid0)
  body.addColorStop(0.85, edge1)
  body.addColorStop(1,    edge0)
  ctx.fillStyle = body; ctx.fillRect(0, 0, CW, CH)

  // 2 ── Specular band
  const spec = ctx.createLinearGradient(0, 0, 0, CH)
  const sw = dark ? 0.09 : 0.26
  spec.addColorStop(0,    'rgba(255,255,255,0)')
  spec.addColorStop(0.44, 'rgba(255,255,255,0)')
  spec.addColorStop(0.50, `rgba(255,255,255,${sw})`)
  spec.addColorStop(0.56, 'rgba(255,255,255,0)')
  spec.addColorStop(1,    'rgba(255,255,255,0)')
  ctx.fillStyle = spec; ctx.fillRect(0, 0, CW, CH)

  // 3 ── Knurl lines (fine diamond)
  const P = WHEEL_PITCH
  const s = ((scrollPx % P) + P * 1000) % P
  ctx.strokeStyle = lineCol; ctx.lineWidth = 0.5
  for (let a = s - P * (Math.ceil(CH / P) + 2); a < CW + CH; a += P) {
    ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a + CH, CH); ctx.stroke()
  }
  for (let b = s - P * 2; b < CW + CH + P; b += P) {
    ctx.beginPath(); ctx.moveTo(b, 0); ctx.lineTo(b - CH, CH); ctx.stroke()
  }

  // 4 ── Pyramid highlights
  const halfP = P / 2
  const maxDiff = Math.ceil(CH / halfP) + 1
  const sumMin  = Math.floor((-2 - s) / halfP) - 2
  const sumMax  = Math.ceil((CW + 2 - s) / halfP) + 2
  ctx.fillStyle = hlCol
  for (let diff = 0; diff <= maxDiff; diff++) {
    const iy = diff * halfP; if (iy > CH + 1) break
    for (let sum = sumMin; sum <= sumMax; sum++) {
      if ((sum + diff) % 2 !== 0) continue
      const ix = s + sum * halfP
      if (ix < -1 || ix > CW + 1) continue
      ctx.beginPath(); ctx.arc(ix - 0.5, iy - 0.5, 1.1, 0, Math.PI * 2); ctx.fill()
    }
  }

  // 5 ── Thin bevel lips (3px)
  const topLip = ctx.createLinearGradient(0, 0, 0, 3)
  topLip.addColorStop(0, lipEdge); topLip.addColorStop(1, 'rgba(128,120,112,0)')
  ctx.fillStyle = topLip; ctx.fillRect(0, 0, CW, 3)
  const botLip = ctx.createLinearGradient(0, CH - 3, 0, CH)
  botLip.addColorStop(0, 'rgba(128,120,112,0)'); botLip.addColorStop(1, lipEdge)
  ctx.fillStyle = botLip; ctx.fillRect(0, CH - 3, CW, 3)
  // Bright edge lines
  ctx.fillStyle = dark ? 'rgba(180,172,160,0.60)' : 'rgba(255,255,255,0.90)'
  ctx.fillRect(0, 0, CW, 0.5); ctx.fillRect(0, CH - 0.5, CW, 0.5)

  // 6 ── Side fades
  const fadeW = 36
  const lf = ctx.createLinearGradient(0, 0, fadeW, 0)
  lf.addColorStop(0, `rgba(${fadeRgb},0.95)`); lf.addColorStop(1, `rgba(${fadeRgb},0)`)
  ctx.fillStyle = lf; ctx.fillRect(0, 0, fadeW, CH)
  const rf = ctx.createLinearGradient(CW - fadeW, 0, CW, 0)
  rf.addColorStop(0, `rgba(${fadeRgb},0)`); rf.addColorStop(1, `rgba(${fadeRgb},0.95)`)
  ctx.fillStyle = rf; ctx.fillRect(CW - fadeW, 0, fadeW, CH)

  // 7 ── Centre selector lines (0.5px, very fine)
  const cx = CW / 2, hw = WHEEL_ITEM_W / 2
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(cx - hw, 3); ctx.lineTo(cx - hw, CH - 3); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + hw, 3); ctx.lineTo(cx + hw, CH - 3); ctx.stroke()

  // 8 ── White indicator dot (2.5px, top-centre) — white in both modes
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.beginPath(); ctx.arc(cx, 2.5, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.40)'
  ctx.beginPath(); ctx.arc(cx - 0.6, 1.7, 1.0, 0, Math.PI * 2); ctx.fill()
}

interface KnurlWheelProps {
  dayIdx: number
  setDayIdx: (i: number) => void
  dark: boolean
}

function KnurlWheelPicker({ dayIdx, setDayIdx, dark }: KnurlWheelProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasReady  = useRef(false)
  const darkRef      = useRef(dark)
  darkRef.current = dark

  const offsetRef  = useRef(-dayIdx * WHEEL_ITEM_W)
  const [offset, setOffset] = useState(-dayIdx * WHEEL_ITEM_W)
  const velRef     = useRef(0)
  const lastXRef   = useRef(0)
  const lastTRef   = useRef(0)
  const dragging   = useRef(false)
  const rafRef     = useRef<number | null>(null)

  // Cleanup on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // Init canvas dimensions + watch resize
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    function resize() {
      const dpr = window.devicePixelRatio || 1
      const w = container!.offsetWidth
      if (!w) return
      canvas!.width  = w * dpr
      canvas!.height = WHEEL_H * dpr
      canvasReady.current = true
      drawKnurl(canvas!, offsetRef.current * WHEEL_COMP, darkRef.current)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Redraw whenever offset changes
  useEffect(() => {
    if (!canvasReady.current || !canvasRef.current) return
    drawKnurl(canvasRef.current, offset * WHEEL_COMP, darkRef.current)
  }, [offset])

  // Redraw whenever theme changes
  useEffect(() => {
    if (!canvasReady.current || !canvasRef.current) return
    drawKnurl(canvasRef.current, offsetRef.current * WHEEL_COMP, dark)
  }, [dark])

  const activeIdx = Math.round(Math.max(0, Math.min(DAY_COUNT - 1, -offset / WHEEL_ITEM_W)))

  // ── Snap animation
  function snap() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const idx    = Math.max(0, Math.min(DAY_COUNT - 1, Math.round(-offsetRef.current / WHEEL_ITEM_W)))
    const target = -idx * WHEEL_ITEM_W
    function tick() {
      const diff = target - offsetRef.current
      if (Math.abs(diff) < 0.25) {
        offsetRef.current = target; setOffset(target); setDayIdx(idx); return
      }
      offsetRef.current += diff * 0.18
      setOffset(offsetRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // ── Momentum
  function startMomentum() {
    function tick() {
      velRef.current *= 0.88
      if (Math.abs(velRef.current) < 0.5) { snap(); return }
      const next = offsetRef.current + velRef.current
      offsetRef.current = next; setOffset(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function onDown(e: React.PointerEvent) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true; velRef.current = 0
    lastXRef.current = e.clientX; lastTRef.current = e.timeStamp
  }

  function onMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const dx = e.clientX - lastXRef.current
    const dt = Math.max(1, e.timeStamp - lastTRef.current)
    velRef.current = (dx / dt) * 16
    const next = offsetRef.current + dx
    offsetRef.current = next; setOffset(next)
    lastXRef.current = e.clientX; lastTRef.current = e.timeStamp
  }

  function onUp() {
    if (!dragging.current) return
    dragging.current = false; startMomentum()
  }

  return (
    <div
      ref={containerRef}
      style={{
        flexShrink: 0,
        height: 28,
        background: dark ? '#0a0908' : '#b8b4ae',
        borderTop: `1px solid ${dark ? 'rgba(0,0,0,0.75)' : 'rgba(80,76,70,0.45)'}`,
        position: 'relative',
        touchAction: 'none', userSelect: 'none',
        overflow: 'hidden', cursor: 'grab',
        boxShadow: dark
          ? 'inset 0 2px 8px rgba(0,0,0,0.85), inset 0 -2px 8px rgba(0,0,0,0.85)'
          : 'inset 0 2px 5px rgba(40,36,30,0.40), inset 0 -2px 5px rgba(40,36,30,0.28)',
      }}
      onPointerDown={onDown} onPointerMove={onMove}
      onPointerUp={onUp}     onPointerCancel={onUp}
    >
      {/* Canvas: knurl texture */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 4, left: 0,
          width: '100%', height: WHEEL_H, display: 'block', pointerEvents: 'none',
        }}
      />

      {/* Pip indicators */}
      <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4, pointerEvents: 'none' }}>
        {Array.from({ length: DAY_COUNT }, (_, i) => (
          <div key={i} style={{
            width:  i === activeIdx ? 4 : 2.5,
            height: i === activeIdx ? 4 : 2.5,
            borderRadius: '50%',
            background: i === activeIdx
              ? (dark ? 'rgba(255,255,255,0.88)' : 'rgba(50,46,42,0.80)')
              : (dark ? 'rgba(255,255,255,0.18)' : 'rgba(50,46,42,0.22)'),
            transition: 'all 150ms ease',
          }} />
        ))}
      </div>
    </div>
  )
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
  const { theme } = useTheme()
  const navigate = useNavigate()
  const mapRef = useRef<any>(null)
  const mapLoadedRef = useRef(false)

  const mapStyle = theme === 'day'
    ? 'mapbox://styles/mapbox/light-v11'
    : 'mapbox://styles/mapbox/dark-v11'

  const today = todayStr()
  const [dayIdx, setDayIdx] = useState(0)
  const selectedDate = addDays(today, dayIdx)

  const [activeFilter, setActiveFilter] = useState('All')
  const [listOpen, setListOpen] = useState(false)

  // Radius
  const RADIUS_PRESETS = [1, 2, 5, 10, 25, 100]
  const [sliderPos, setSliderPos] = useState(() => milesToSlider(5))
  const radiusMi = sliderToMiles(sliderPos)
  function cycleRadius() {
    const next = RADIUS_PRESETS.find((p) => p > radiusMi + 0.1) ?? RADIUS_PRESETS[0]
    setSliderPos(milesToSlider(next))
  }

  // Locations
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const centerLat = userLoc?.lat ?? PORTLAND.latitude
  const centerLng = userLoc?.lng ?? PORTLAND.longitude

  // Map view
  const [viewState, setViewState] = useState({ longitude: PORTLAND.longitude, latitude: PORTLAND.latitude, zoom: 12 })

  // Data
  const [venues, setVenues] = useState<DbVenue[]>([])
  const [eventsByVenue, setEventsByVenue] = useState<Record<string, VenueEvent[]>>({})
  const [likedEventIds, setLikedEventIds] = useState<Set<string>>(new Set())
  const [selectedVenue, setSelectedVenue] = useState<DbVenue | null>(null)

  // Fog/circle
  const circleDataRef = useRef<object>(EMPTY_FC)
  const fogDataRef = useRef<object>(EMPTY_FC)

  const circleGeoJSON = radiusMi < 99.5
    ? circle([centerLng, centerLat], radiusMi, { steps: 64, units: 'miles' })
    : null
  const fogGeoJSON = circleGeoJSON
    ? (() => { try { const d = difference(featureCollection([WORLD_POLYGON as any, circleGeoJSON])); return d ? { type: 'FeatureCollection' as const, features: [d] } : null } catch { return null } })()
    : null
  circleDataRef.current = circleGeoJSON ?? EMPTY_FC
  fogDataRef.current = fogGeoJSON ?? EMPTY_FC

  // ── Mapbox layers ─────────────────────────────────────────────────────────
  const setupLayers = useCallback((map: any) => {
    if (!map.getSource('radius-mask-source')) map.addSource('radius-mask-source', { type: 'geojson', data: EMPTY_FC })
    if (!map.getLayer('radius-mask-layer')) map.addLayer({ id: 'radius-mask-layer', type: 'fill', source: 'radius-mask-source', paint: { 'fill-color': '#000000', 'fill-opacity': 0.35 } })
    if (!map.getSource('radius-circle-source')) map.addSource('radius-circle-source', { type: 'geojson', data: EMPTY_FC })
    if (!map.getLayer('radius-circle-layer')) map.addLayer({ id: 'radius-circle-layer', type: 'line', source: 'radius-circle-source', paint: { 'line-color': '#f0ece3', 'line-opacity': 0.2, 'line-width': 1.5 } })
    const cs = map.getSource('radius-circle-source'); if (cs) cs.setData(circleDataRef.current)
    const fs = map.getSource('radius-mask-source'); if (fs) fs.setData(fogDataRef.current)
  }, [])

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    if (!map) return
    mapLoadedRef.current = true
    setupLayers(map)
    map.on('style.load', () => setupLayers(map))
  }, [setupLayers])

  // ── Dynamic map style switch (theme toggle) ───────────────────────────────
  useEffect(() => {
    if (!mapLoadedRef.current || !mapRef.current) return
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    if (map?.getStyle?.()) map.setStyle(mapStyle)
  }, [mapStyle])

  useEffect(() => {
    if (!mapLoadedRef.current || !mapRef.current) return
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    const cs = map.getSource('radius-circle-source'); if (cs) cs.setData(circleGeoJSON ?? EMPTY_FC)
    const fs = map.getSource('radius-mask-source'); if (fs) fs.setData(fogGeoJSON ?? EMPTY_FC)
  }, [circleGeoJSON, fogGeoJSON])

  // ── Geolocation ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation || !user) return
    let lastSaved = { lat: 0, lng: 0 }
    const onSuccess = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng } = pos.coords
      setUserLoc({ lat, lng })
      setViewState((v) => ({ ...v, latitude: lat, longitude: lng }))
      if (Math.abs(lat - lastSaved.lat) > 0.0001 || Math.abs(lng - lastSaved.lng) > 0.0001) {
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

  // ── Load liked events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('event_likes').select('event_id').eq('user_id', user.id)
      .then(({ data }) => setLikedEventIds(new Set((data ?? []).map((r: { event_id: string }) => r.event_id))))
  }, [user])

  // ── Load events for selected day ──────────────────────────────────────────
  useEffect(() => {
    const fromISO = selectedDate + 'T00:00:00'
    const toISO = addDays(selectedDate, 1) + 'T08:00:00'
    supabase.from('events')
      .select('id, title, starts_at, poster_url, category, venue_id')
      .gte('starts_at', fromISO).lte('starts_at', toISO)
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

  // ── Derived: visible + filtered pins ─────────────────────────────────────
  const maxDist = radiusMi >= 99.5 ? Infinity : radiusMi
  const visibleVenues = venues.filter((v) =>
    haversineMiles(centerLat, centerLng, v.location_lat!, v.location_lng!) <= maxDist
  )

  function venueMatchesFilter(venueId: string): boolean {
    if (activeFilter === 'All') return true
    const evs = eventsByVenue[venueId] ?? []
    if (activeFilter === '♥') return evs.some((ev) => likedEventIds.has(ev.id))
    return evs.some((ev) => ev.category === activeFilter)
  }

  const venuesWithEvents = new Set(Object.keys(eventsByVenue))

  // ── Derived: sorted list events ───────────────────────────────────────────
  const visibleVenueIds = new Set(visibleVenues.map((v) => v.id))
  const listEvents: VenueEvent[] = Object.values(eventsByVenue)
    .flat()
    .filter((ev) => {
      if (!visibleVenueIds.has(ev.venue_id)) return false
      if (activeFilter === '♥') return likedEventIds.has(ev.id)
      if (activeFilter !== 'All') return ev.category === activeFilter
      return true
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  // ── Handlers ─────────────────────────────────────────────────────────────
  function flyToUser() {
    if (!userLoc || !mapRef.current) return
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    map.flyTo({ center: [userLoc.lng, userLoc.lat], zoom: 14, duration: 1000 })
  }

  function distLabel(venue: DbVenue): string {
    const mi = haversineMiles(centerLat, centerLng, venue.location_lat!, venue.location_lng!)
    if (mi < 0.1) return 'nearby'
    if (mi < 1) return `${(mi * 5280).toFixed(0)} ft`
    return `${mi.toFixed(1)} mi`
  }

  const selectedVenueEvents = selectedVenue
    ? (eventsByVenue[selectedVenue.id] ?? []).filter((ev) => {
        if (activeFilter === 'All') return true
        if (activeFilter === '♥') return likedEventIds.has(ev.id)
        return ev.category === activeFilter
      })
    : []


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <PlasterHeader
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setListOpen((o) => !o)} style={headerIconBtn(listOpen)}><List size={16} /></button>
            <button style={headerIconBtn()}><Search size={16} /></button>
            <button style={headerIconBtn()}><SlidersHorizontal size={16} /></button>
          </div>
        }
      />

      {/* ── Filter chips ── */}
      <div
        className="shrink-0 flex items-center gap-2 overflow-x-auto px-4"
        style={{ height: 'var(--filterbar-height)', background: 'var(--bg)', WebkitOverflowScrolling: 'touch' }}
      >
        {CHIPS.map((chip) => {
          const isActive = chip === activeFilter
          return (
            <button
              key={chip}
              onClick={() => setActiveFilter(chip)}
              className="shrink-0 font-body font-medium whitespace-nowrap"
              style={{
                fontSize: chip === '♥' ? 12 : 9,
                letterSpacing: chip === '♥' ? 0 : '0.02em',
                padding: '3px 8px', borderRadius: 4,
                border: `1px solid ${isActive ? 'var(--fg-55)' : 'var(--fg-15)'}`,
                background: isActive ? 'var(--fg-08)' : 'transparent',
                color: isActive ? 'var(--fg)' : 'var(--fg-40)',
                lineHeight: 1.6,
              }}
            >
              {chip === '♥' ? '♥\uFE0E' : chip}
            </button>
          )
        })}
        <div className="shrink-0 w-2" />
      </div>

      {/* ── Date indicator blocks ── */}
      <DateIndicator activeDay={selectedDate} today={today} />

      {/* ── Map area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(e) => setViewState(e.viewState)}
          onLoad={handleMapLoad}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
          mapboxAccessToken={MAPBOX_TOKEN}
          attributionControl={false}
          onClick={() => { setSelectedVenue(null) }}
        >
          {/* User GPS dot */}
          {userLoc && (
            <Marker longitude={userLoc.lng} latitude={userLoc.lat} anchor="center">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div
                  animate={{ scale: [1, 2.5], opacity: [0.45, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 32, height: 32, borderRadius: '50%', background: 'rgba(96,165,250,0.2)' }}
                />
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#60a5fa', border: '2px solid white', boxShadow: '0 0 12px rgba(96,165,250,0.9)', position: 'relative', zIndex: 1 }} />
              </div>
            </Marker>
          )}

          {/* Venue pins */}
          {visibleVenues.map((venue, i) => {
            const hasEvents = venuesWithEvents.has(venue.id)
            const matchesFilter = venueMatchesFilter(venue.id)
            // Hide venues that have events but none match the active filter
            if (hasEvents && !matchesFilter) return null
            const events = eventsByVenue[venue.id] ?? []
            const firstPoster = events.find((e) => e.poster_url)?.poster_url ?? null
            const isActive = hasEvents && matchesFilter
            return (
              <Marker key={venue.id} longitude={venue.location_lng!} latitude={venue.location_lat!} anchor="bottom">
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: isActive ? 1 : 0.28 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4), type: 'spring', stiffness: 300 }}
                  onClick={(e) => { e.stopPropagation(); if (isActive) setSelectedVenue(venue) }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: isActive ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                >
                  {isActive ? (
                    <>
                      <motion.div
                        animate={{ boxShadow: ['0 0 0 0px rgba(240,236,227,0)', '0 0 0 5px rgba(240,236,227,0.14)', '0 0 0 0px rgba(240,236,227,0)'] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          width: 40, height: 40, borderRadius: '50%',
                          overflow: 'hidden', border: '2px solid rgba(240,236,227,0.9)',
                          background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {firstPoster
                          ? <img src={firstPoster} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 14, fontWeight: 700, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif' }}>{venue.name[0].toUpperCase()}</span>
                        }
                      </motion.div>
                      <div style={{ width: 2, height: 6, background: 'rgba(240,236,227,0.65)', borderRadius: 1 }} />
                    </>
                  ) : (
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f0ece3' }} />
                  )}
                </motion.button>
              </Marker>
            )
          })}
        </Map>

        {/* ── Radius pill — top right ── */}
        <button
          onClick={cycleRadius}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            height: 30, padding: '0 11px',
            borderRadius: 15,
            background: theme === 'night' ? 'rgba(12,11,11,0.88)' : 'rgba(232,228,223,0.92)',
            backdropFilter: 'blur(14px)',
            border: `1px solid ${theme === 'night' ? 'rgba(240,236,227,0.14)' : 'rgba(26,24,20,0.13)'}`,
            display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}
        >
          <svg width={9} height={9} viewBox="0 0 24 24" fill="none"
            stroke={theme === 'night' ? 'rgba(240,236,227,0.55)' : 'rgba(26,24,20,0.45)'}
            strokeWidth={2.5}>
            <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
          <span style={{
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700,
            color: theme === 'night' ? 'rgba(240,236,227,0.80)' : 'rgba(26,24,20,0.72)',
            whiteSpace: 'nowrap',
          }}>
            {formatRadiusLabel(radiusMi)}
          </span>
        </button>

        {/* ── Locate button — left ── */}
        <button
          onClick={flyToUser}
          style={{
            position: 'absolute', left: 12, bottom: 16, zIndex: 10,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(12,11,11,0.9)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(240,236,227,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(240,236,227,0.55)" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>

        {/* ── Venue detail sheet ── */}
        <AnimatePresence>
          {selectedVenue && !listOpen && (
            <motion.div
              key={selectedVenue.id}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 300 }}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '54%',
                background: 'rgba(15,14,14,0.98)',
                borderTop: '1px solid rgba(240,236,227,0.1)',
                borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column', zIndex: 30,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(240,236,227,0.18)' }} />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: 'rgba(240,236,227,0.07)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedVenue.avatar_url
                      ? <img src={selectedVenue.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(240,236,227,0.45)', fontFamily: '"Space Grotesk", sans-serif' }}>{selectedVenue.name[0].toUpperCase()}</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif' }}>{selectedVenue.name}</p>
                    {(selectedVenue.neighborhood || selectedVenue.address) && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(240,236,227,0.4)', fontFamily: '"Space Grotesk", sans-serif' }}>
                        {selectedVenue.neighborhood ?? selectedVenue.address} · {distLabel(selectedVenue)}
                      </p>
                    )}
                  </div>
                  <button onClick={() => navigate(`/venue/${selectedVenue.id}`)} style={{ padding: '7px 14px', borderRadius: 20, border: 'none', background: '#f0ece3', color: '#0c0b0b', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>View</button>
                </div>
                {selectedVenueEvents.length === 0
                  ? <p style={{ fontSize: 13, color: 'rgba(240,236,227,0.3)', fontFamily: '"Space Grotesk", sans-serif', margin: 0 }}>No events match</p>
                  : selectedVenueEvents.map((ev) => {
                      const timeStr = new Date(ev.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      return (
                        <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(240,236,227,0.05)' }}>
                          <div style={{ width: 32, height: 46, borderRadius: 4, flexShrink: 0, background: 'rgba(240,236,227,0.07)', overflow: 'hidden' }}>
                            {ev.poster_url && <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(240,236,227,0.35)', fontFamily: '"Space Grotesk", sans-serif' }}>{timeStr}{ev.category ? ` · ${ev.category}` : ''}</p>
                          </div>
                        </div>
                      )
                    })
                }
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── List mode sheet ── */}
        <AnimatePresence>
          {listOpen && (
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 300 }}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
                background: 'rgba(12,11,11,0.99)',
                display: 'flex', flexDirection: 'column', zIndex: 40,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sheet header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(240,236,227,0.08)', flexShrink: 0 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif' }}>
                    {formatDayFull(dayIdx, today)}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(240,236,227,0.35)', fontFamily: '"Space Grotesk", sans-serif' }}>
                    {listEvents.length} event{listEvents.length !== 1 ? 's' : ''}
                    {formatRadiusLabel(radiusMi) !== 'Any' ? ` within ${formatRadiusLabel(radiusMi)}` : ''}
                  </p>
                </div>
                <button onClick={() => setListOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(240,236,227,0.15)', background: 'rgba(240,236,227,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240,236,227,0.6)' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Event list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {listEvents.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 14, color: 'rgba(240,236,227,0.3)', fontFamily: '"Space Grotesk", sans-serif' }}>No events found</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(240,236,227,0.2)', fontFamily: '"Space Grotesk", sans-serif' }}>Try expanding the radius or changing the day</p>
                  </div>
                ) : (
                  listEvents.map((ev) => {
                    const venue = venues.find((v) => v.id === ev.venue_id)
                    const timeStr = new Date(ev.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    return (
                      <button
                        key={ev.id}
                        onClick={() => { setListOpen(false); navigate('/') }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                          padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: '1px solid rgba(240,236,227,0.05)', textAlign: 'left',
                        }}
                      >
                        {/* Poster */}
                        <div style={{ width: 40, height: 58, borderRadius: 5, flexShrink: 0, background: 'rgba(240,236,227,0.07)', overflow: 'hidden' }}>
                          {ev.poster_url && <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f0ece3', fontFamily: '"Space Grotesk", sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(240,236,227,0.45)', fontFamily: '"Space Grotesk", sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue?.name ?? ''}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(240,236,227,0.3)', fontFamily: '"Space Grotesk", sans-serif' }}>{timeStr}</p>
                        </div>
                        {/* Category badge */}
                        {ev.category && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                            textTransform: 'uppercase', color: 'rgba(240,236,227,0.45)',
                            border: '1px solid rgba(240,236,227,0.15)',
                            borderRadius: 4, padding: '2px 6px', flexShrink: 0,
                            fontFamily: '"Space Grotesk", sans-serif',
                          }}>
                            {ev.category}
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Day wheel picker ── */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        background: 'var(--bg)', paddingBottom: 6,
      }}>
        <div style={{
          width: 'clamp(160px, 33vw, 240px)',
          ...(theme === 'day' ? {
            background: '#d8d4ce',
            borderRadius: 5,
            padding: '5px 8px',
          } : {}),
        }}>
          <KnurlWheelPicker dayIdx={dayIdx} setDayIdx={setDayIdx} dark={theme === 'night'} />
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
