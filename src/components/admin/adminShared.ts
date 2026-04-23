import { supabase as supabaseAdmin } from '@/lib/supabase'
import { type CropRect } from '@/lib/cropUtils'
import { type CategoryName } from '@/lib/categories'

// ── Constants ────────────────────────────────────────────────

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
export const IS_DEV = window.location.hostname === 'localhost'

export const NEIGHBORHOODS = [
  'Northeast', 'Southeast', 'North', 'Northwest', 'Southwest',
  'Downtown', 'Pearl', 'Alberta', 'Mississippi', 'Hawthorne',
  'Division', 'Burnside',
]

// ── Shared input styles ──────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(240,236,227,0.05)',
  border: '1px solid var(--fg-18)',
  borderRadius: 6,
  padding: '10px 12px',
  color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-55)',
  marginBottom: 6,
}

export const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
}

// ── Types ────────────────────────────────────────────────────

export interface Venue {
  id: string
  name: string
  neighborhood: string | null
  address: string | null
  location_lat: number | null
  location_lng: number | null
  website: string | null
  instagram: string | null
  hours: string | null
}

export interface AdminNotification {
  id: string
  type: string
  title: string
  message: string
  recurrence_group_id: string | null
  snoozed_until: string | null
  dismissed: boolean
  created_at: string
}

export type ImportPhase = 'idle' | 'extracting' | 'review' | 'duplicate' | 'uploading' | 'done' | 'error'
export type Category = CategoryName

export interface ExtractedEvent {
  title: string
  venue_name: string
  date: string
  time: string
  address: string
  description: string
  category: Category
  confidence: 'high' | 'medium' | 'low'
  uncertain_fields: string[]
  crop?: CropRect
  location_lat?: number
  location_lng?: number
  address_source?: 'db' | 'mapbox' | 'ai' | 'none'
  website?: string
  instagram?: string
  hours?: string
  existing_poster_url?: string
}

export type ExtractPayload =
  | { base64: string; mimeType: string }
  | { images: { base64: string; mimeType: string }[] }

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'weekdays'
export type OrdinalKey = '1st' | '2nd' | '3rd' | '4th' | 'last'

export const FREQ_LABELS: Record<RecurrenceFrequency, string> = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', weekdays: 'Specific days' }
export const FREQ_COUNTS: Record<RecurrenceFrequency, number> = { weekly: 12, biweekly: 6, monthly: 3, weekdays: 0 }

export const ORDINAL_LABELS: OrdinalKey[] = ['1st', '2nd', '3rd', '4th', 'last']
// Mon–Sun labels; indices map to JS Date.getDay() via WEEKDAY_JS
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAY_JS     = [1, 2, 3, 4, 5, 6, 0] // Mon=1 … Sat=6, Sun=0

// ── Geocoding ────────────────────────────────────────────────

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN) {
    console.warn('VITE_MAPBOX_TOKEN not set — skipping geocoding')
    return null
  }
  const query = encodeURIComponent(address + ', Portland, Oregon')
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1&proximity=-122.6784,45.5051`
  const res = await fetch(url)
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  const [lng, lat] = feature.geometry.coordinates
  return { lat, lng }
}

// ── Recurrence helpers ───────────────────────────────────────

export function getNthWeekdayOfMonth(year: number, month: number, jsWeekday: number, n: number): Date | null {
  if (n === -1) {
    const lastDay = new Date(year, month + 1, 0)
    const diff = (lastDay.getDay() - jsWeekday + 7) % 7
    return new Date(year, month, lastDay.getDate() - diff)
  }
  const firstDayOfMonth = new Date(year, month, 1)
  const diff = (jsWeekday - firstDayOfMonth.getDay() + 7) % 7
  const nthDay = 1 + diff + (n - 1) * 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  if (nthDay > daysInMonth) return null
  return new Date(year, month, nthDay)
}

export function generateWeekdayOccurrences(start: Date, ordinals: Set<OrdinalKey>, weekdays: Set<number>, monthsAhead = 3): Date[] {
  const dates: Date[] = []
  const end = new Date(start); end.setMonth(end.getMonth() + monthsAhead)
  for (let m = 0; m <= monthsAhead; m++) {
    const ref  = new Date(start.getFullYear(), start.getMonth() + m, 1)
    const year = ref.getFullYear()
    const mon  = ref.getMonth()
    for (const wdIdx of weekdays) {
      const jsWd = WEEKDAY_JS[wdIdx]
      for (const ord of ordinals) {
        const n = ord === 'last' ? -1 : parseInt(ord[0])
        const d = getNthWeekdayOfMonth(year, mon, jsWd, n)
        if (d && d >= start && d <= end) dates.push(d)
      }
    }
  }
  return dates.sort((a, b) => a.getTime() - b.getTime())
}

export function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function generateOccurrenceDates(start: Date, freq: RecurrenceFrequency): Date[] {
  const dates: Date[] = []
  const end = new Date(start); end.setMonth(end.getMonth() + 3)
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(new Date(cur))
    if (freq === 'weekly')    cur.setDate(cur.getDate() + 7)
    else if (freq === 'biweekly') cur.setDate(cur.getDate() + 14)
    else cur.setMonth(cur.getMonth() + 1)
  }
  return dates
}

// ── Venue duplicate detection ────────────────────────────────

export function venueSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9\s]/g, '').trim()
  const na = norm(a), nb = norm(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const words = (s: string) => new Set(s.split(/\s+/).filter(w => w.length > 1))
  const wa = words(na), wb = words(nb)
  if (wa.size === 0 || wb.size === 0) return 0
  let overlap = 0
  for (const w of wa) { if (wb.has(w)) overlap++ }
  return overlap / Math.max(wa.size, wb.size)
}

export function findDuplicateVenueGroups(venues: Venue[]): Venue[][] {
  const groups: Venue[][] = []
  const used = new Set<string>()
  for (let i = 0; i < venues.length; i++) {
    if (used.has(venues[i].id)) continue
    const group = [venues[i]]
    for (let j = i + 1; j < venues.length; j++) {
      if (used.has(venues[j].id)) continue
      if (venueSimilarity(venues[i].name, venues[j].name) > 0.7) {
        group.push(venues[j]); used.add(venues[j].id)
      }
    }
    if (group.length > 1) { used.add(venues[i].id); groups.push(group) }
  }
  return groups
}

// ── File utilities ───────────────────────────────────────────

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── AI extraction ────────────────────────────────────────────

export async function extractEventFromImage(payload: ExtractPayload): Promise<ExtractedEvent> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
  const { data: { session } } = await supabaseAdmin.auth.getSession()
  if (!session?.access_token) {
    throw new Error('You must be signed in to extract poster info. Please sign out and sign back in.')
  }
  const token = session.access_token

  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-poster`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) throw new Error(`Extraction failed: ${response.status}`)
  return await response.json() as ExtractedEvent
}

// ── Text utilities ───────────────────────────────────────────

export function titleSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 2))
  const wa = words(a), wb = words(b)
  if (wa.size === 0 || wb.size === 0) return 0
  return [...wa].filter(w => wb.has(w)).length / Math.max(wa.size, wb.size)
}

export function neighborhoodFromAddress(address: string): string {
  const a = address.toUpperCase()
  if (/\bNE\b/.test(a)) return 'Northeast'
  if (/\bSE\b/.test(a)) return 'Southeast'
  if (/\bNW\b/.test(a)) return 'Northwest'
  if (/\bSW\b/.test(a)) return 'Southwest'
  if (/\bN\b/.test(a) && !/\bNE\b|\bNW\b/.test(a)) return 'North'
  return ''
}
