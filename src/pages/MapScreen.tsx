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
const WHEEL_H        = 28   // canvas surface height (CSS px)
const WHEEL_HOUSING_H = 56  // total housing height (CSS px)
const WHEEL_ITEM_W   = 72   // px per day slot
const WHEEL_COMP     = 0.70 // scroll→pattern compression
const WHEEL_P        = 5    // diamond pitch (CSS px)

function drawKnurl(canvas: HTMLCanvasElement, scrollPx: number, dark: boolean): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const CW = canvas.width / dpr
  const CH = canvas.height / dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const P = WHEEL_P
  const half = P / 2

  // ── Palette ──────────────────────────────────────────────────────────────
  const [base, ulFace, lrFace, urFace, llFace] = dark
    ? ['#1e1c18', 'rgba(195,188,175,0.75)', 'rgba(6,4,2,0.95)',    'rgba(110,104,92,0.65)', 'rgba(55,50,42,0.7)']
    : ['#6a6560', 'rgba(255,255,255,0.9)',   'rgba(20,16,12,0.85)', 'rgba(180,175,165,0.65)', 'rgba(70,64,56,0.72)']

  // ── 1. Base fill ─────────────────────────────────────────────────────────
  ctx.fillStyle = base
  ctx.fillRect(0, 0, CW, CH)

  // ── 2. Diamond faces ──────────────────────────────────────────────────────
  // Grid: row r at y = r*(P/2). Even rows x = sP + c*P, odd rows x = sP + P/2 + c*P.
  // Groove x-intercepts at y=0: sP - P/2 + n*P — verified to pass through all diamond vertices.
  const sP = ((scrollPx % P) + P) % P
  const rowMax = Math.ceil(CH / half) + 4
  const colMax = Math.ceil(CW / P) + 4

  for (let r = -2; r < rowMax; r++) {
    const cy = r * half
    const xBase = (((r % 2) + 2) % 2 === 0) ? sP : sP + half
    for (let c = -2; c < colMax; c++) {
      const cx = xBase + c * P
      const tx = cx,       ty = cy - half   // top
      const rx = cx + half, ry = cy          // right
      const bx = cx,       by = cy + half   // bottom
      const lx = cx - half, ly = cy          // left

      // UL face — bright (catches upper-left light)
      ctx.fillStyle = ulFace
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(cx, cy); ctx.lineTo(lx, ly)
      ctx.closePath(); ctx.fill()
      // UR face
      ctx.fillStyle = urFace
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(rx, ry); ctx.lineTo(cx, cy)
      ctx.closePath(); ctx.fill()
      // LL face
      ctx.fillStyle = llFace
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(lx, ly)
      ctx.closePath(); ctx.fill()
      // LR face — near black shadow
      ctx.fillStyle = lrFace
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(rx, ry); ctx.lineTo(cx, cy)
      ctx.closePath(); ctx.fill()
    }
  }

  // ── 3. Hairline grooves ───────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'
  ctx.lineWidth = 0.5
  const gMin = -Math.ceil((CW + CH) / P) - 2
  const gMax =  Math.ceil((CW + CH) / P) + 2
  for (let n = gMin; n < gMax; n++) {
    const x0 = sP - half + n * P
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 - CH, CH); ctx.stroke() // slope -1
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + CH, CH); ctx.stroke() // slope +1
  }

  // ── 4. Cylindrical shading ────────────────────────────────────────────────
  const topShad = ctx.createLinearGradient(0, 0, 0, CH * 0.42)
  topShad.addColorStop(0, 'rgba(0,0,0,0.88)'); topShad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topShad; ctx.fillRect(0, 0, CW, CH * 0.42)

  const botShad = ctx.createLinearGradient(0, CH * 0.58, 0, CH)
  botShad.addColorStop(0, 'rgba(0,0,0,0)'); botShad.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.fillStyle = botShad; ctx.fillRect(0, CH * 0.58, CW, CH * 0.42)

  const spec = ctx.createLinearGradient(0, CH * 0.35, 0, CH * 0.65)
  spec.addColorStop(0, 'rgba(255,255,255,0)')
  spec.addColorStop(0.5, 'rgba(255,255,255,0.26)')
  spec.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = spec; ctx.fillRect(0, CH * 0.35, CW, CH * 0.30)

  const lShad = ctx.createLinearGradient(0, 0, CW * 0.14, 0)
  lShad.addColorStop(0, 'rgba(0,0,0,0.65)'); lShad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = lShad; ctx.fillRect(0, 0, CW * 0.14, CH)

  const rShad = ctx.createLinearGradient(CW * 0.86, 0, CW, 0)
  rShad.addColorStop(0, 'rgba(0,0,0,0)'); rShad.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = rShad; ctx.fillRect(CW * 0.86, 0, CW * 0.14, CH)

  // ── 5. Bevels ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(230,225,212,1)';    ctx.fillRect(0, 0, CW, 0.75)
  ctx.fillStyle = 'rgba(120,116,106,0.8)';  ctx.fillRect(0, CH - 0.75, CW, 0.75)

  // ── 6. Side fades (blend into dark housing) ───────────────────────────────
  const fadeW = 24
  const lf = ctx.createLinearGradient(0, 0, fadeW, 0)
  lf.addColorStop(0, 'rgba(3,2,2,0.98)'); lf.addColorStop(1, 'rgba(3,2,2,0)')
  ctx.fillStyle = lf; ctx.fillRect(0, 0, fadeW, CH)
  const rf = ctx.createLinearGradient(CW - fadeW, 0, CW, 0)
  rf.addColorStop(0, 'rgba(3,2,2,0)'); rf.addColorStop(1, 'rgba(3,2,2,0.98)')
  ctx.fillStyle = rf; ctx.fillRect(CW - fadeW, 0, fadeW, CH)

  // ── 7. Selector lines — 0.5px, 40px wide centre window ───────────────────
  const cx = CW / 2
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(cx - 20, 1); ctx.lineTo(cx - 20, CH - 1); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 20, 1); ctx.lineTo(cx + 20, CH - 1); ctx.stroke()
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

  const canvasTop = (WHEEL_HOUSING_H - WHEEL_H) / 2  // = 14px

  return (
    <div
      ref={containerRef}
      style={{
        flexShrink: 0,
        height: WHEEL_HOUSING_H,
        background: '#0a0908',
        borderRadius: 12,
        border: '0.5px solid rgba(255,255,255,0.05)',
        position: 'relative',
        touchAction: 'none', userSelect: 'none',
        overflow: 'hidden', cursor: 'grab',
        boxShadow: 'inset 0 4px 14px rgba(0,0,0,0.92), inset 0 -4px 14px rgba(0,0,0,0.88)',
      }}
      onPointerDown={onDown} onPointerMove={onMove}
      onPointerUp={onUp}     onPointerCancel={onUp}
    >
      {/* White indicator dot — top centre of slot */}
      <div style={{
        position: 'absolute',
        top: Math.round(canvasTop / 2) - 2,
        left: '50%', transform: 'translateX(-50%)',
        width: 5, height: 5, borderRadius: '50%',
        background: 'rgba(255,255,255,0.90)',
        boxShadow: '0 0 5px rgba(255,255,255,0.45)',
        pointerEvents: 'none',
      }} />

      {/* Canvas: knurl texture */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: canvasTop, left: 0,
          width: '100%', height: WHEEL_H, display: 'block', pointerEvents: 'none',
        }}
      />

      {/* Pip row — 7 dots below wheel */}
      <div style={{
        position: 'absolute', bottom: 6, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none',
      }}>
        {Array.from({ length: DAY_COUNT }, (_, i) => (
          <div key={i} style={{
            width:  i === activeIdx ? 5 : 3,
            height: i === activeIdx ? 5 : 3,
            borderRadius: '50%',
            background: i === activeIdx ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.10)',
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
        background: theme === 'night' ? '#0a0908' : '#f0ece3',
        padding: '8px 0',
      }}>
        <div style={{ width: 'clamp(160px, 33vw, 240px)' }}>
          <KnurlWheelPicker dayIdx={dayIdx} setDayIdx={setDayIdx} dark={theme === 'night'} />
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
