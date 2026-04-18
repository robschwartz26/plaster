import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker } from 'react-map-gl/mapbox'
import { motion } from 'framer-motion'
import circle from '@turf/circle'
import difference from '@turf/difference'
import { featureCollection } from '@turf/helpers'
import { Search, SlidersHorizontal } from 'lucide-react'
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
// ── Knurl wheel constants & renderer ─────────────────────────────────────────
const WHEEL_H         = 12   // canvas surface height (CSS px)
const WHEEL_HOUSING_H = 18   // housing height inside control bar (CSS px)
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
    ? ['#1e1c18', 'rgba(195,188,175,0.75)', 'rgba(6,4,2,0.95)',     'rgba(110,104,92,0.65)', 'rgba(55,50,42,0.7)']
    : ['#b8b4ae', 'rgba(255,255,255,0.95)', 'rgba(80,75,68,0.85)',  'rgba(190,185,178,0.75)', 'rgba(160,155,148,0.8)']

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
  spec.addColorStop(0.5, dark ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.45)')
  spec.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = spec; ctx.fillRect(0, CH * 0.35, CW, CH * 0.30)

  const lShad = ctx.createLinearGradient(0, 0, CW * 0.14, 0)
  lShad.addColorStop(0, 'rgba(0,0,0,0.65)'); lShad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = lShad; ctx.fillRect(0, 0, CW * 0.14, CH)

  const rShad = ctx.createLinearGradient(CW * 0.86, 0, CW, 0)
  rShad.addColorStop(0, 'rgba(0,0,0,0)'); rShad.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = rShad; ctx.fillRect(CW * 0.86, 0, CW * 0.14, CH)

  // ── 5. Bevels ─────────────────────────────────────────────────────────────
  ctx.fillStyle = dark ? 'rgba(230,225,212,1)' : 'rgba(255,255,255,0.9)'
  ctx.fillRect(0, 0, CW, 0.75)
  ctx.fillStyle = dark ? 'rgba(120,116,106,0.8)' : 'rgba(140,136,128,0.5)'
  ctx.fillRect(0, CH - 0.75, CW, 0.75)

  // ── 6. Side fades (blend into housing) ───────────────────────────────────
  const [fr, fg, fb] = dark ? [3, 2, 2] : [196, 192, 186]  // #0e0c0a vs #c4c0ba
  const fadeW = 24
  const lf = ctx.createLinearGradient(0, 0, fadeW, 0)
  lf.addColorStop(0, `rgba(${fr},${fg},${fb},0.98)`); lf.addColorStop(1, `rgba(${fr},${fg},${fb},0)`)
  ctx.fillStyle = lf; ctx.fillRect(0, 0, fadeW, CH)
  const rf = ctx.createLinearGradient(CW - fadeW, 0, CW, 0)
  rf.addColorStop(0, `rgba(${fr},${fg},${fb},0)`); rf.addColorStop(1, `rgba(${fr},${fg},${fb},0.98)`)
  ctx.fillStyle = rf; ctx.fillRect(CW - fadeW, 0, fadeW, CH)

  // ── 7. Selector lines — 0.5px, 40px wide centre window ───────────────────
  const cx = CW / 2
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.22)'
  ctx.lineWidth = 0.5
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

  // canvasTop: centres the 20px surface in the 28px housing → 4px each side
  const canvasTop = (WHEEL_HOUSING_H - WHEEL_H) / 2

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: WHEEL_HOUSING_H,
        background: dark ? '#0e0c0a' : '#c4c0ba',
        borderRadius: 6,
        border: dark ? '0.5px solid rgba(255,255,255,0.06)' : '0.5px solid rgba(0,0,0,0.10)',
        position: 'relative',
        touchAction: 'none', userSelect: 'none',
        overflow: 'hidden', cursor: 'grab',
        boxShadow: dark
          ? 'inset 0 2px 8px rgba(0,0,0,0.90), inset 0 -2px 8px rgba(0,0,0,0.85)'
          : 'inset 0 2px 5px rgba(0,0,0,0.22), inset 0 -2px 5px rgba(0,0,0,0.14)',
      }}
      onPointerDown={onDown} onPointerMove={onMove}
      onPointerUp={onUp}     onPointerCancel={onUp}
    >
      {/* Indicator dot — centred in top gap */}
      <div style={{
        position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)',
        width: 4, height: 4, borderRadius: '50%',
        background: dark ? 'rgba(255,255,255,0.85)' : 'rgba(40,36,30,0.55)',
        boxShadow: dark ? '0 0 4px rgba(255,255,255,0.40)' : 'none',
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
    </div>
  )
}

// ── Category colors ───────────────────────────────────────────────────────────
const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  Music:    ['#4c1d95', '#7c3aed'],
  Drag:     ['#831843', '#ec4899'],
  Dance:    ['#7c2d12', '#f97316'],
  Comedy:   ['#1e3a5f', '#38bdf8'],
  Literary: ['#3730a3', '#818cf8'],
  Art:      ['#365314', '#a3e635'],
  Film:     ['#0c4a6e', '#38bdf8'],
  Trivia:   ['#7c2d12', '#fb923c'],
  Other:    ['#2e1065', '#a855f7'],
}
function catPinColor(cat: string | null | undefined): string {
  return (CATEGORY_GRADIENTS[cat ?? ''] ?? CATEGORY_GRADIENTS.Other)[1]
}
function catGradient(cat: string | null | undefined): string {
  const [c1, c2] = CATEGORY_GRADIENTS[cat ?? ''] ?? CATEGORY_GRADIENTS.Other
  return `conic-gradient(from 0deg at 50% 50%, ${c1}, ${c2}, ${c1})`
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
  const venuesWithEvents = new Set(Object.keys(eventsByVenue))
  const maxDist = radiusMi >= 99.5 ? Infinity : radiusMi
  const visibleVenues = venues.filter((v) =>
    haversineMiles(centerLat, centerLng, v.location_lat!, v.location_lng!) <= maxDist &&
    venuesWithEvents.has(v.id)
  )

  function venueMatchesFilter(venueId: string): boolean {
    if (activeFilter === 'All') return true
    const evs = eventsByVenue[venueId] ?? []
    if (activeFilter === '♥') return evs.some((ev) => likedEventIds.has(ev.id))
    return evs.some((ev) => ev.category === activeFilter)
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  function flyToUser() {
    if (!userLoc || !mapRef.current) return
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    map.flyTo({ center: [userLoc.lng, userLoc.lat], zoom: 14, duration: 1000 })
  }

  function flyToVenue(venue: DbVenue) {
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    if (map) map.flyTo({ center: [venue.location_lng!, venue.location_lat!], zoom: 14, duration: 800 })
    setSelectedVenue(venue)
  }

  const selectedVenueEvents = selectedVenue ? (eventsByVenue[selectedVenue.id] ?? []) : []

  const adjacentVenues = selectedVenue
    ? visibleVenues
        .filter(v => v.id !== selectedVenue.id && venueMatchesFilter(v.id))
        .sort((a, b) =>
          haversineMiles(selectedVenue.location_lat!, selectedVenue.location_lng!, a.location_lat!, a.location_lng!) -
          haversineMiles(selectedVenue.location_lat!, selectedVenue.location_lng!, b.location_lat!, b.location_lng!)
        )
    : []


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <PlasterHeader
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

          {/* Venue pins — circle + venue name label */}
          {visibleVenues.map((venue, i) => {
            const matchesFilter = venueMatchesFilter(venue.id)
            if (!matchesFilter) return null
            const events = eventsByVenue[venue.id] ?? []
            const isSelected = selectedVenue?.id === venue.id
            const pinColor = catPinColor(events[0]?.category)
            const pinSize = isSelected ? 36 : 28
            return (
              <Marker key={venue.id} longitude={venue.location_lng!} latitude={venue.location_lat!} anchor="center">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4), type: 'spring', stiffness: 300 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedVenue(isSelected ? null : venue) }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <svg
                      width={pinSize} height={pinSize} viewBox="0 0 28 28" fill="none"
                      style={{ display: 'block', filter: `drop-shadow(0 2px 6px ${pinColor}99)`, transition: 'all 0.15s ease' }}
                    >
                      <circle cx="14" cy="14" r="12.5" stroke={isSelected ? '#ffffff' : `${pinColor}66`} strokeWidth={isSelected ? 2 : 1.5} />
                      <circle cx="14" cy="14" r={isSelected ? 9 : 8} fill={pinColor} opacity={0.92} />
                    </svg>
                  </button>
                  <span style={{
                    fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 600,
                    color: '#f0ece3',
                    background: 'rgba(0,0,0,0.65)',
                    backdropFilter: 'blur(4px)',
                    padding: '1px 4px', borderRadius: 3,
                    whiteSpace: 'nowrap', maxWidth: 88,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                  }}>
                    {venue.name}
                  </span>
                </motion.div>
              </Marker>
            )
          })}
        </Map>

        {/* ── Bottom slide-up venue panel ── */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: '60%', height: '55vh', zIndex: 30,
            background: 'var(--bg)',
            borderRadius: '12px 0 0 0',
            display: 'flex', flexDirection: 'column',
            transform: selectedVenue ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
            boxShadow: '-4px -4px 24px rgba(0,0,0,0.35)',
          }}
        >
          {/* Decorative indicator bar */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 2, flexShrink: 0 }}>
            <div style={{ width: 36, height: 3, borderRadius: 1.5, background: 'var(--fg-18)' }} />
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {selectedVenue && (
              <>
                {/* ── Featured venue ── */}
                <div style={{ padding: '8px 16px 10px' }}>
                  <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 22, lineHeight: 1.2, color: 'var(--fg)' }}>
                    {selectedVenue.name}
                  </p>
                  {selectedVenue.neighborhood && (
                    <p style={{ margin: '4px 0 0', fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
                      {selectedVenue.neighborhood}
                    </p>
                  )}
                </div>

                {selectedVenueEvents.length === 0 ? (
                  <p style={{ margin: 0, padding: '8px 16px 14px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>
                    Nothing on {dayIdx === 0 ? 'tonight' : 'this day'}
                  </p>
                ) : (
                  selectedVenueEvents.map((ev, i) => {
                    const timeStr = new Date(ev.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    const bg = catGradient(ev.category)
                    return (
                      <button key={ev.id} onClick={() => navigate('/')}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 16px', background: 'none', border: 'none', borderTop: i === 0 ? '1px solid var(--fg-08)' : 'none', borderBottom: '1px solid var(--fg-08)', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ width: 40, height: 60, borderRadius: 4, flexShrink: 0, background: bg, overflow: 'hidden', position: 'relative' }}>
                          {ev.poster_url && <img src={ev.poster_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                          <p style={{ margin: '3px 0 0', fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: 'var(--fg-40)' }}>{timeStr}</p>
                        </div>
                      </button>
                    )
                  })
                )}

                {/* ── Adjacent venues ── */}
                {adjacentVenues.map(venue => {
                  const vEvents = eventsByVenue[venue.id] ?? []
                  return (
                    <div key={venue.id}>
                      <div style={{ height: 1, background: 'var(--fg-15)', margin: '6px 0' }} />
                      <button
                        onClick={() => flyToVenue(venue)}
                        style={{ display: 'block', width: '100%', padding: '4px 16px 4px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--fg-55)' }}>{venue.name}</span>
                        {venue.neighborhood && <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)', marginLeft: 6 }}>{venue.neighborhood}</span>}
                      </button>
                      {vEvents.map((ev, i) => {
                        const timeStr = new Date(ev.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        const bg = catGradient(ev.category)
                        return (
                          <button key={ev.id} onClick={() => { flyToVenue(venue); navigate('/') }}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 16px', background: 'none', border: 'none', borderTop: i === 0 ? '1px solid var(--fg-08)' : 'none', borderBottom: '1px solid var(--fg-08)', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <div style={{ width: 40, height: 60, borderRadius: 4, flexShrink: 0, background: bg, overflow: 'hidden', position: 'relative' }}>
                              {ev.poster_url && <img src={ev.poster_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                              <p style={{ margin: '3px 0 0', fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: 'var(--fg-40)' }}>{timeStr}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

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

      </div>

      {/* ── Control bar ── */}
      <div style={{
        width: '100%', height: 52, flexShrink: 0,
        background: theme === 'night' ? '#0a0908' : 'var(--bg)',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 5,
      }}>
        {/* Wheel — 33% of bar width */}
        <div style={{ width: '33%' }}>
          <KnurlWheelPicker dayIdx={dayIdx} setDayIdx={setDayIdx} dark={theme === 'night'} />
        </div>

        {/* Pip row */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {Array.from({ length: DAY_COUNT }, (_, i) => (
            <div key={i} style={{
              width:  i === dayIdx ? 5 : 3,
              height: i === dayIdx ? 5 : 3,
              borderRadius: '50%',
              background: i === dayIdx
                ? (theme === 'night' ? 'rgba(255,255,255,0.85)' : '#1a1814')
                : (theme === 'night' ? 'rgba(255,255,255,0.10)' : 'rgba(26,24,20,0.20)'),
              transition: 'all 150ms ease',
            }} />
          ))}
        </div>

        {/* PLR product stamp */}
        <span style={{
          position: 'absolute', bottom: 5, right: 10,
          fontFamily: '"Barlow Condensed", sans-serif',
          fontWeight: 700, fontSize: 8,
          letterSpacing: '0.12em',
          color: theme === 'night' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)',
          userSelect: 'none', pointerEvents: 'none',
        }}>
          PLR
        </span>
      </div>

      <BottomNav />
    </div>
  )
}
