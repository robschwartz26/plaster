import 'mapbox-gl/dist/mapbox-gl.css'
import { Heart } from '@/components/Heart'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker } from 'react-map-gl/mapbox'
import { motion } from 'framer-motion'
import circle from '@turf/circle'
import difference from '@turf/difference'
import { featureCollection } from '@turf/helpers'
import { Search, SlidersHorizontal } from 'lucide-react'
import { supabase, type DbVenue } from '@/lib/supabase'
import { CATEGORIES, getGradient } from '@/lib/categories'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { PreferencesPanel } from '@/components/PreferencesPanel'
import { useTheme } from '@/hooks/useTheme'
import { DateIndicator } from '@/components/DateIndicator'
import { DebugOverlay } from '@/components/DebugOverlay'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const PORTLAND = { latitude: 45.5051, longitude: -122.6750 }

const CHIPS = ['All', '♥', ...CATEGORIES] as const
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
function todayStr(): string {
  // LOCAL date (not toISOString/UTC, which is a day ahead in the evening in the US).
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
// A venue's event row in the bottom sheet. `ringed` marks the row the map has
// flown to: the sheet walks across several venues as you scroll, and without it
// there is nothing tying the pin on the map to the poster you are reading.
function rowStyle(first: boolean, ringed: boolean): React.CSSProperties {
  // The hairline colour is theme-aware: a literal off-white vanished against the
  // day-mode sheet, which is that same colour. --fg vars invert with the theme.
  const hair = 'var(--fg-08)'
  return {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '8px 16px', background: 'none', textAlign: 'left', cursor: 'pointer',
    // Every row carries a 1px box on all four sides — transparent wherever no
    // rule is wanted — so its metrics never change with state. The ring itself
    // is painted INSIDE as an inset shadow, which costs no layout at all: a
    // thicker border would grow the row, and because the ringed row changes as
    // the sheet scrolls, the list would jitter under the reader's thumb.
    border: '1px solid transparent',
    borderTopColor: !ringed && first ? hair : 'transparent',
    borderBottomColor: !ringed ? hair : 'transparent',
    borderRadius: ringed ? 8 : 0,
    boxShadow: ringed ? 'inset 0 0 0 2px var(--fg-80)' : 'none',
    transition: 'box-shadow 0.18s ease, border-color 0.18s ease, border-radius 0.18s ease',
  }
}

// ── Where you left the map ───────────────────────────────────────────────────
//
// Tapping a poster out of a venue's sheet jumps to the Wall, which unmounts this
// screen and takes Mapbox with it. Coming back dropped you at the default
// Portland-wide view — the wrong place for someone who was working four blocks
// of inner Southeast. The camera and the three filters are remembered here, in
// module scope: this JS context only, nothing written to disk, gone when the app
// is killed.
//
// It expires on purpose. Two things would be confusing otherwise — opening the
// app tomorrow still parked on Saturday, and opening it next week parked on a
// Saturday that has already happened. So the snapshot is ignored after
// RECALL_MS, and the day is kept as a DATE rather than a wheel index, which
// makes a stale one recognisable: it simply isn't in the next seven days any
// more, and the wheel goes back to tonight.
const RECALL_MS = 30 * 60 * 1000

interface MapRecall {
  at: number
  view: { longitude: number; latitude: number; zoom: number }
  date: string          // the day the wheel was on, absolute
  filter: string
  sliderPos: number
  venueId: string | null       // the venue whose sheet was open
  rowVenueId: string | null    // the row that was at the sheet's top edge
}
let mapRecall: MapRecall | null = null

/** Stamp and store the snapshot. A plain function so the write to module state
 *  and the clock read stay out of the component's render analysis. */
function rememberMap(r: Omit<MapRecall, 'at'>) {
  mapRecall = { ...r, at: Date.now() }
}

/** The wheel slot for a date, or 0 (tonight) if it has fallen out of the window. */
function dayIndexFor(date: string, today: string): number {
  for (let i = 0; i <= 6; i++) if (addDays(today, i) === date) return i
  return 0
}

// ── Knurl wheel constants & renderer ─────────────────────────────────────────
const WHEEL_H         = 12   // canvas surface height (CSS px)
const WHEEL_HOUSING_H = 18   // housing height inside control bar (CSS px)
const WHEEL_ITEM_W   = 40   // px per day slot
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
  onDragStart?: () => void
  onDragEnd?: () => void
  onLiveIdx?: (idx: number) => void
}

function KnurlWheelPicker({ dayIdx, setDayIdx, dark, onDragStart, onDragEnd, onLiveIdx }: KnurlWheelProps) {
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
    onDragStart?.()
  }

  function onMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const dx = e.clientX - lastXRef.current
    const dt = Math.max(1, e.timeStamp - lastTRef.current)
    velRef.current = (dx / dt) * 16
    const next = offsetRef.current + dx
    offsetRef.current = next; setOffset(next)
    lastXRef.current = e.clientX; lastTRef.current = e.timeStamp
    const liveIdx = Math.max(0, Math.min(DAY_COUNT - 1, Math.round(-next / WHEEL_ITEM_W)))
    onLiveIdx?.(liveIdx)
  }

  function onUp() {
    if (!dragging.current) return
    dragging.current = false
    onDragEnd?.()
    startMomentum()
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

// ── Scrubbing ruler ───────────────────────────────────────────────────────────
const RULER_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

interface ScrubbingRulerProps {
  centerDayIdx: number
  isVisible: boolean
  today: string
  dark: boolean
}

function ScrubbingRuler({ centerDayIdx, isVisible, today, dark }: ScrubbingRulerProps) {
  const offsets = [-2, -1, 0, 1, 2]
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: '50%',
      transform: 'translateX(-50%)',
      width: 5 * WHEEL_ITEM_W,
      paddingBottom: 5,
      opacity: isVisible ? 1 : 0,
      transition: 'opacity 150ms ease',
      pointerEvents: 'none',
      display: 'flex',
    }}>
      {offsets.map(off => {
        const idx = centerDayIdx + off
        const inRange = idx >= 0 && idx < DAY_COUNT
        let label = ''
        if (inRange) {
          const d = new Date(addDays(today, idx) + 'T12:00:00')
          label = `${RULER_DAYS[d.getDay()]} ${d.getDate()}`
        }
        const isCenter = off === 0
        return (
          <div key={off} style={{
            width: WHEEL_ITEM_W, textAlign: 'center',
            fontFamily: '"Barlow Condensed", sans-serif',
            fontWeight: isCenter ? 900 : 700,
            fontSize: isCenter ? 13 : 10,
            letterSpacing: '0.06em', lineHeight: 1,
            color: isCenter
              ? (dark ? 'rgba(240,236,227,1)' : 'rgba(12,11,11,1)')
              : (dark ? 'rgba(240,236,227,0.4)' : 'rgba(12,11,11,0.35)'),
          }}>
            {label}
          </div>
        )
      })}
    </div>
  )
}

function catPinColor(cat: string | null | undefined): string {
  return getGradient(cat)[1]
}
function catGradient(cat: string | null | undefined): string {
  const [c1, c2] = getGradient(cat)
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
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Debug overlay ─────────────────────────────────────────────────────────
  const [debugLogs, setDebugLogs] = useState<string[]>([])
  const [debugOpen, setDebugOpen] = useState(true)
  function debugLog(...args: unknown[]) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
    console.log(...args)
    if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) setDebugLogs(prev => [...prev.slice(-9), msg])
  }

  const mapStyle = theme === 'day'
    ? 'mapbox://styles/mapbox/light-v11'
    : 'mapbox://styles/mapbox/dark-v11'

  const today = todayStr()
  // Read once, at mount. A snapshot older than RECALL_MS is treated as absent:
  // that is someone coming back to the app, not coming back to the map.
  const [recall] = useState(() => (mapRecall && Date.now() - mapRecall.at < RECALL_MS ? mapRecall : null))

  const [dayIdx, setDayIdx] = useState(() => (recall ? dayIndexFor(recall.date, todayStr()) : 0))
  const selectedDate = addDays(today, dayIdx)
  const [isDragging, setIsDragging] = useState(false)
  const [liveDayIdx, setLiveDayIdx] = useState(0)

  const [activeFilter, setActiveFilter] = useState(recall?.filter ?? 'All')

  // Radius
  const RADIUS_PRESETS = [1, 2, 5, 10, 25, 100]
  const [sliderPos, setSliderPos] = useState(() => recall?.sliderPos ?? milesToSlider(100)) // default "Any" — few venues for now, show them all
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
  const [viewState, setViewState] = useState(recall?.view ?? { longitude: PORTLAND.longitude, latitude: PORTLAND.latitude, zoom: 9.5 })


  // Data
  const [venues, setVenues] = useState<DbVenue[]>([])
  const [eventsByVenue, setEventsByVenue] = useState<Record<string, VenueEvent[]>>({})
  const [likedEventIds, setLikedEventIds] = useState<Set<string>>(new Set())
  const [selectedVenue, setSelectedVenue] = useState<DbVenue | null>(null)
  // The venue the sheet is CURRENTLY showing at its top edge, which is not the
  // same thing as the one you tapped. The sheet lists the tapped venue and then
  // its neighbours, so scrolling walks you across the city while the map sits
  // where you started — the heading says Shanghai Tunnel Bar and the pin still
  // says Cinema 21, which reads as "all of these are at Cinema 21". The map
  // follows the top row instead, and that row is ringed so it's clear which
  // poster the pin belongs to. Mirrored in a ref so the scroll handler can
  // compare without re-subscribing on every change.
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null)
  const activeVenueIdRef = useRef<string | null>(null)

  // Cyclical sheet. The last venue in the list could never reach the top edge —
  // there was nothing below it to scroll — so the map could never be sent to
  // it, which is the one thing this sheet is for. The list is rendered three
  // times and the scroll is kept in the middle copy, teleporting back by one
  // copy-height whenever it drifts out. Every row can reach the top, and a
  // flick keeps going instead of hitting a wall.
  //
  // Only when one copy is taller than the sheet. Below that the whole list is
  // already on screen, and three copies would just show the same venues twice.
  const firstCopyRef = useRef<HTMLDivElement>(null)
  const copyHRef = useRef(0)
  const [looping, setLooping] = useState(false)
  const loopCopies = looping ? 3 : 1

  // Kept current while the map is open rather than written on the way out, so
  // there is no unmount ordering to get wrong. `at` therefore counts from the
  // last moment they were actually looking at it, which is what should expire.
  useEffect(() => {
    if (pendingRowRef.current) return   // a restore is in flight; don't clobber it
    rememberMap({
      view: viewState, date: selectedDate, filter: activeFilter, sliderPos,
      venueId: selectedVenue?.id ?? null,
      rowVenueId: activeVenueId ?? selectedVenue?.id ?? null,
    })
  }, [viewState, selectedDate, activeFilter, sliderPos, selectedVenue?.id, activeVenueId])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)

  // Fog/circle
  const circleDataRef = useRef<object>(EMPTY_FC)
  const fogDataRef = useRef<object>(EMPTY_FC)

  // Memoized on the inputs that actually change the shapes — without this the
  // 64-step circle + world-polygon difference recomputed and both GeoJSON
  // sources re-serialized on EVERY render, including every onMove pan frame at
  // sub-100mi radius (visible jank on older iPhones).
  const circleGeoJSON = useMemo(
    () => radiusMi < 99.5 ? circle([centerLng, centerLat], radiusMi, { steps: 64, units: 'miles' }) : null,
    [centerLng, centerLat, radiusMi],
  )
  const fogGeoJSON = useMemo(
    () => circleGeoJSON
      ? (() => { try { const d = difference(featureCollection([WORLD_POLYGON as any, circleGeoJSON])); return d ? { type: 'FeatureCollection' as const, features: [d] } : null } catch { return null } })()
      : null,
    [circleGeoJSON],
  )
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
    debugLog('[handleMapLoad] map loaded')
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    if (!map) return
    mapLoadedRef.current = true
    setupLayers(map)
    map.on('style.load', () => setupLayers(map))
  }, [setupLayers])

  // ── Dynamic map style switch (theme toggle) ───────────────────────────────
  useEffect(() => {
    debugLog('[mapStyle effect] running, style=', mapStyle)
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
    // Centre on the user's first fix only when arriving fresh. With a restored
    // camera there is already a view the user chose, and the fix lands a beat
    // after mount — long enough to look like the restore worked and then yank
    // the map to wherever the phone is. That is what put the sheet on Cinema 21
    // while the map sat in Hillsboro.
    let hasCenteredOnce = !!recall
    const onSuccess = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng } = pos.coords
      debugLog('[geolocation] update', lat, lng)
      setUserLoc({ lat, lng })
      if (!hasCenteredOnce) {
        hasCenteredOnce = true
        setViewState((v) => ({ ...v, latitude: lat, longitude: lng }))
      }
      if (Math.abs(lat - lastSaved.lat) > 0.0001 || Math.abs(lng - lastSaved.lng) > 0.0001) {
        lastSaved = { lat, lng }
        // userLoc is kept in memory only. Previously tried to persist to profiles.location_lat/lng
        // but those columns don't exist on the profiles table. Leaving in-memory until a real
        // 'events near me' feature is designed with proper privacy considerations.
      }
    }
    const onError = (err: GeolocationPositionError) => console.warn('[Map] geolocation:', err.message)
    navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, maximumAge: 0 })
    const wid = navigator.geolocation.watchPosition(onSuccess, onError, { enableHighAccuracy: true, maximumAge: 30000 })
    return () => navigator.geolocation.clearWatch(wid)
  }, [user?.id, recall])

  // Restoring the camera alone drops you on a map with no sense of what you were
  // reading. The sheet is the reference point — "we're back here, at this event" —
  // so it comes back with it, scrolled to the same row and still ringed.
  //
  // Only when the day survived. If the recalled date has passed, the wheel has
  // already fallen back to tonight and the list underneath is a different list;
  // reopening a sheet onto it would restore a venue the user never chose for
  // this day.
  const dayKept = !!recall && addDays(today, dayIndexFor(recall.date, today)) === recall.date
  // Armed AT MOUNT, not when the venues land. The snapshot-keeping effect below
  // fires on the first render — before the fetch resolves and before there is a
  // selectedVenue to report — and would otherwise overwrite the very venue it
  // is about to restore with null. While this holds a value, nothing is saved.
  const pendingRowRef = useRef<string | null>(
    recall && dayKept ? (recall.rowVenueId ?? recall.venueId) : null,
  )
  const lastEventsDateRef = useRef<string | null>(null)
  // Safety valve: while a restore is pending nothing is saved, so a request
  // that can never land (the venue lost its events, the row never rendered)
  // would freeze the snapshot. Give up after a few seconds.
  useEffect(() => {
    const t = setTimeout(() => { pendingRowRef.current = null }, 4000)
    return () => clearTimeout(t)
  }, [])

  // ── Load venues (once) ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('venues').select('*').not('location_lat', 'is', null).not('location_lng', 'is', null)
      .then(({ data }) => {
        const rows = (data ?? []) as DbVenue[]
        setVenues(rows)
        const v = recall?.venueId && dayKept ? rows.find(x => x.id === recall.venueId) : undefined
        if (!v) { pendingRowRef.current = null; return }   // nothing to restore — start saving
        setSelectedVenue(v)
      })
  }, [recall, dayKept])

  // ── Load liked events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('event_likes').select('event_id').eq('user_id', user.id)
      .then(({ data }) => setLikedEventIds(new Set((data ?? []).map((r: { event_id: string }) => r.event_id))))
  }, [user?.id])

  // ── Load events for selected day ──────────────────────────────────────────
  useEffect(() => {
    // Window is LOCAL midnight → next-day 8am local (late shows straddle
    // midnight). Sent as UTC instants — a bare 'T00:00:00' string compares in
    // the DB's timezone (UTC), which shifted the whole day 7h early and put
    // yesterday's evening shows at the top of "tonight".
    const fromISO = new Date(selectedDate + 'T00:00:00').toISOString()
    const toISO = new Date(addDays(selectedDate, 1) + 'T08:00:00').toISOString()
    supabase.from('events')
      .select('id, title, starts_at, poster_url, category, venue_id')
      .eq('status', 'published')
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
        // Changing the day closes the sheet, since it is showing a list that no
        // longer exists. Keyed on the date ACTUALLY changing rather than on a
        // "first load" flag: this fetch also runs on mount, landing after the
        // venues one, where it was closing a sheet that had just been restored —
        // and StrictMode runs the whole effect twice, which a one-shot flag
        // cannot survive.
        const prevDate = lastEventsDateRef.current
        lastEventsDateRef.current = selectedDate
        if (prevDate !== null && prevDate !== selectedDate) setSelectedVenue(null)
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
    debugLog('[flyToVenue] called for', venue.name)
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    if (!map) return

    // Panel is 55% wide, 40vh tall, anchored bottom-right.
    // Calculate panel's top-left corner in pixels.
    const panelWidth  = window.innerWidth  * 0.55
    const panelHeight = window.innerHeight * 0.40
    const panelCornerX = window.innerWidth  - panelWidth
    const panelCornerY = window.innerHeight - panelHeight

    // DIAGONAL_RATIO: how far along the diagonal line from the panel corner
    // toward the screen's top-left the pin should land.
    // 0 = at panel corner (bad, obscured). 1 = at screen top-left (too extreme).
    // 0.65 feels right — pin lands well clear of the panel, upper-left area.
    const DIAGONAL_RATIO = 0.65

    const targetX = panelCornerX * (1 - DIAGONAL_RATIO)
    const targetY = panelCornerY * (1 - DIAGONAL_RATIO)

    const venuePixel = map.project([venue.location_lng!, venue.location_lat!])
    const dx = venuePixel.x - targetX
    const dy = venuePixel.y - targetY
    const currentCenter = map.project(map.getCenter())
    const newCenter = map.unproject([currentCenter.x + dx, currentCenter.y + dy])

    debugLog('[flyToVenue] easeTo to', newCenter)
    map.easeTo({ center: newCenter, zoom: map.getZoom(), duration: 600 })
  }

  // Whichever event row is sitting at the top of the sheet owns the map. Called
  // from the sheet's scroll, rAF-throttled — a scroll fires far faster than a
  // camera move is worth recomputing, and getBoundingClientRect forces layout.
  const scrollTickRef = useRef(false)
  function onSheetScroll() {
    if (scrollTickRef.current) return
    scrollTickRef.current = true
    requestAnimationFrame(() => {
      scrollTickRef.current = false
      const sc = scrollRef.current
      if (!sc) return

      // Keep the scroll inside the middle copy. Done before anything is read,
      // so the row under the top edge is the same one either side of the jump
      // and the map never twitches at the seam. Thresholds are half a copy from
      // each boundary, which keeps the teleport far from the ends where iOS
      // momentum is most likely to notice it.
      const copyH = copyHRef.current
      if (looping && copyH > 0) {
        if (sc.scrollTop < copyH * 0.5) sc.scrollTop += copyH
        else if (sc.scrollTop > copyH * 1.5) sc.scrollTop -= copyH
      }

      const top = sc.getBoundingClientRect().top
      const rows = sc.querySelectorAll<HTMLElement>('[data-venue-row]')
      for (const row of rows) {
        // First row still showing any of itself below the sheet's top edge.
        if (row.getBoundingClientRect().bottom > top + 12) {
          const id = row.dataset.venueRow
          if (!id || id === activeVenueIdRef.current) return
          activeVenueIdRef.current = id
          setActiveVenueId(id)
          const v = venues.find(x => x.id === id)
          // Only move for a venue we can actually point at.
          if (v?.location_lat != null && v?.location_lng != null) flyToVenue(v)
          return
        }
      }
    })
  }

  function selectVenue(venue: DbVenue) {
    debugLog('[selectVenue]', venue.name)
    setSelectedVenue(venue)
    flyToVenue(venue)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  // Measure one copy against the sheet and arm the loop. The observer carries
  // every later change — a filter that empties the list, a day with fewer
  // shows — so the deps only need to cover the sheet appearing at all.
  useEffect(() => {
    const measure = () => {
      const el = firstCopyRef.current
      const sc = scrollRef.current
      if (!el || !sc) { copyHRef.current = 0; setLooping(false); return }
      const h = el.offsetHeight
      copyHRef.current = h
      setLooping(h > sc.clientHeight + 40)
    }
    const el = firstCopyRef.current
    if (!el) { measure(); return }
    const ro = new ResizeObserver(measure)
    ro.observe(el)          // fires once on observe, which is the first measure
    return () => ro.disconnect()
  }, [selectedVenue?.id])

  // Put the restored sheet back on the row it was showing. Waits a frame so the
  // list is in the DOM, and re-runs when the loop arms, because arming it shifts
  // every offset by a copy. Measured from rects rather than offsetTop, which is
  // relative to whichever ancestor happens to be positioned.
  useEffect(() => {
    const want = pendingRowRef.current
    if (!want || !selectedVenue?.id) return
    const raf = requestAnimationFrame(() => {
      const sc = scrollRef.current
      if (!sc) return
      const scTop = sc.getBoundingClientRect().top
      const rows = [...sc.querySelectorAll<HTMLElement>('[data-venue-row]')]
      // When looping, take the copy in the middle so there is room either way.
      const matches = rows.filter(r => r.dataset.venueRow === want)
      // Nothing yet: the events load lands after the venues one, so the first
      // pass can find an empty sheet. Leave the request standing — this effect
      // re-runs when the events arrive and again when the loop arms.
      if (!matches.length) return
      const row = looping && matches.length === 3 ? matches[1] : matches[0]
      // Leave the venue's heading peeking above the row, which is where it sits
      // when you scroll to it by hand — the ring still picks this row, and the
      // sheet reads as "this event, at this venue" rather than a bare row.
      const HEADER_PEEK = 30
      sc.scrollTop += row.getBoundingClientRect().top - scTop - HEADER_PEEK
      // Pre-set the ref so the scroll this causes sees no change and doesn't
      // re-fly a camera that was already restored to this exact spot.
      activeVenueIdRef.current = want
      setActiveVenueId(want)
      pendingRowRef.current = null
    })
    return () => cancelAnimationFrame(raf)
  }, [selectedVenue?.id, looping, eventsByVenue])

  // Entering the loop: drop into the middle copy so there is a copy's worth of
  // room to scroll in either direction before the first teleport.
  useEffect(() => {
    if (pendingRowRef.current) return   // the restore picks its own copy
    if (!looping || !scrollRef.current || !copyHRef.current) return
    scrollRef.current.scrollTop += copyHRef.current
  }, [looping])

  // Scroll panel to top whenever selected venue changes — unless a restore is
  // pending, which is about to scroll it somewhere specific.
  useEffect(() => {
    if (pendingRowRef.current) return
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    activeVenueIdRef.current = selectedVenue?.id ?? null
    setActiveVenueId(selectedVenue?.id ?? null)
  }, [selectedVenue?.id])

  const selectedVenueEvents = selectedVenue ? (eventsByVenue[selectedVenue.id] ?? []) : []

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return [] as Array<{ event: VenueEvent; venue: DbVenue }>
    const results: Array<{ event: VenueEvent; venue: DbVenue }> = []
    for (const venue of venues) {
      const venueEvents = eventsByVenue[venue.id] ?? []
      for (const ev of venueEvents) {
        const matches =
          (ev.title?.toLowerCase().includes(q) ?? false) ||
          (venue.name?.toLowerCase().includes(q) ?? false) ||
          (ev.category?.toLowerCase().includes(q) ?? false)
        if (matches) {
          results.push({ event: ev, venue })
        }
      }
    }
    return results
  }, [searchQuery, venues, eventsByVenue])

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
            <button
              style={{
                ...headerIconBtn(),
                background: searchOpen ? 'var(--fg-08)' : 'transparent',
              }}
              onClick={() => setSearchOpen(v => !v)}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
            >
              <Search size={16} />
            </button>
            <button
              style={{
                ...headerIconBtn(),
                background: prefsOpen ? 'var(--fg-08)' : 'transparent',
              }}
              onClick={() => setPrefsOpen(v => !v)}
              aria-label="Preferences"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        }
      />

      {searchOpen && (
        <div style={{
          flexShrink: 0,
          padding: '8px 16px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--fg-08)',
          background: 'var(--bg)',
        }}>
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search events on this day…"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--fg-15)',
              background: 'var(--fg-08)',
              color: 'var(--fg)',
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--fg-55)',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 13,
                padding: '4px 8px',
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

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
              {chip === '♥' ? <Heart /> : chip}
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
            // The enlarged pin follows the sheet's top row, not the tap that
            // opened it — otherwise scrolling flies the map to a venue whose pin
            // stays small while the one you left behind is still the big one.
            const isSelected = (activeVenueId ?? selectedVenue?.id) === venue.id
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
                    onClick={(e) => { e.stopPropagation(); if (isSelected) setSelectedVenue(null); else selectVenue(venue) }}
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
                    color:       theme === 'night' ? '#f0ece3' : '#0c0b0b',
                    background:  theme === 'night' ? 'rgba(0,0,0,0.65)' : 'rgba(240,236,227,0.85)',
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
            width: '55%', height: '40vh', zIndex: 30,
            background: 'var(--bg)',
            borderRadius: '12px 0 0 0',
            display: 'flex', flexDirection: 'column',
            transform: (selectedVenue || (searchOpen && searchQuery.trim() !== '')) ? 'translateY(0)' : 'translateY(100%)',
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
          <div ref={scrollRef} onScroll={onSheetScroll} style={{ flex: 1, overflowY: 'auto' }}>
            {searchOpen && searchQuery.trim() !== '' ? (
              <>
                <div style={{ padding: '8px 16px 10px' }}>
                  <p style={{ margin: 0, fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>
                    {searchResults.length === 0 ? 'No matches' : `${searchResults.length} ${searchResults.length === 1 ? 'match' : 'matches'}`} {dayIdx === 0 ? 'tonight' : 'this day'}
                  </p>
                </div>

                {searchResults.length === 0 ? (
                  <p style={{ margin: 0, padding: '8px 16px 14px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>
                    Try a different search or change the day.
                  </p>
                ) : (
                  searchResults.map(({ event: ev, venue }, i) => {
                    const timeStr = new Date(ev.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    const bg = catGradient(ev.category)
                    return (
                      <button
                        key={ev.id}
                        onClick={() => navigate('/', { state: { openEventId: ev.id } })}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 16px', background: 'none', border: 'none', borderTop: i === 0 ? '1px solid var(--fg-08)' : 'none', borderBottom: '1px solid var(--fg-08)', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ width: 40, height: 60, borderRadius: 4, flexShrink: 0, background: bg, overflow: 'hidden', position: 'relative' }}>
                          {ev.poster_url && <img src={ev.poster_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                          <p style={{ margin: '3px 0 0', fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', color: 'var(--fg-40)' }}>{venue.name} · {timeStr}</p>
                        </div>
                      </button>
                    )
                  })
                )}
              </>
            ) : selectedVenue ? (
              <>
                {/* Rendered once, or three times when looping: see loopCopies. */}
                {Array.from({ length: loopCopies }, (_, copy) => (
                  <div key={copy} ref={copy === 0 ? firstCopyRef : undefined}>
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
                          <button key={ev.id} onClick={() => navigate('/', { state: { openEventId: ev.id } })}
                            data-venue-row={selectedVenue.id}
                            style={rowStyle(i === 0, activeVenueId === selectedVenue.id)}
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
                            onClick={() => selectVenue(venue)}
                            style={{ display: 'block', width: '100%', padding: '4px 16px 4px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                          >
                            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--fg-55)' }}>{venue.name}</span>
                            {venue.neighborhood && <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)', marginLeft: 6 }}>{venue.neighborhood}</span>}
                          </button>
                          {vEvents.map((ev, i) => {
                            const timeStr = new Date(ev.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                            const bg = catGradient(ev.category)
                            return (
                              <button key={ev.id} onClick={() => navigate('/', { state: { openEventId: ev.id } })}
                                data-venue-row={venue.id}
                                style={rowStyle(i === 0, activeVenueId === venue.id)}
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
                  </div>
                ))}
              </>
            ) : null}
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

        {/* ── Debug overlay ── */}
        <DebugOverlay logs={debugLogs} open={debugOpen} onToggle={() => setDebugOpen(v => !v)} />

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
        <div data-tour="daywheel" style={{ width: '33%', position: 'relative' }}>
          <ScrubbingRuler centerDayIdx={liveDayIdx} isVisible={isDragging} today={today} dark={theme === 'night'} />
          <KnurlWheelPicker
            dayIdx={dayIdx}
            setDayIdx={setDayIdx}
            dark={theme === 'night'}
            onDragStart={() => { setIsDragging(true); setLiveDayIdx(dayIdx) }}
            onDragEnd={() => setIsDragging(false)}
            onLiveIdx={setLiveDayIdx}
          />
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

      <PreferencesPanel open={prefsOpen} onClose={() => setPrefsOpen(false)} context="map" />
    </div>
  )
}
