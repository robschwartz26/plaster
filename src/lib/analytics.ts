import { supabase } from '@/lib/supabase'

// ── Analytics data layer ──────────────────────────────────────────────────────
// Reads metrics_daily, one row per Portland day (migrations 115–117). Everything
// here is a straight read; the numbers are computed nightly by pg_cron so the
// panel never aggregates over the live tables.
//
// The important rule in this file: null is a value. A null means "not measured"
// — Apple had no report, or the metric predates its capture — and must never be
// coerced to 0. A zero draws a line to the floor and invents a crash that never
// happened.

export interface MetricsDay {
  day: string
  // wall
  events_published_total: number
  events_upcoming: number
  events_added: number
  events_with_poster: number
  // coverage
  venues_total: number
  venues_with_upcoming: number
  neighborhoods_covered: number
  venues_missing_coords: number
  // pipeline
  events_pending: number
  orphans_open: number
  // people
  profiles_total: number
  signups: number
  rsvps: number
  likes: number
  posts: number
  follows: number
  views: number
  viewers: number
  viewers_7d: number
  // devices (null before capture began)
  devices_total: number | null
  devices_ios: number | null
  devices_android: number | null
  active_devices_7d: number | null
  // store (null when Apple has no report for that day)
  downloads_ios: number | null
  redownloads_ios: number | null
  updates_ios: number | null
  downloads_android: number | null
}

export type MetricKey = keyof Omit<MetricsDay, 'day'>

const COLUMNS = [
  'day',
  'events_published_total', 'events_upcoming', 'events_added', 'events_with_poster',
  'venues_total', 'venues_with_upcoming', 'neighborhoods_covered', 'venues_missing_coords',
  'events_pending', 'orphans_open',
  'profiles_total', 'signups', 'rsvps', 'likes', 'posts', 'follows',
  'views', 'viewers', 'viewers_7d',
  'devices_total', 'devices_ios', 'devices_android', 'active_devices_7d',
  'downloads_ios', 'redownloads_ios', 'updates_ios', 'downloads_android',
].join(', ')

export async function fetchMetrics(days: number): Promise<MetricsDay[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data, error } = await supabase
    .from('metrics_daily')
    .select(COLUMNS)
    .gte('day', since.toISOString().slice(0, 10))
    .order('day', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as MetricsDay[]
}

// ── Derived numbers ───────────────────────────────────────────────────────────

export const series = (rows: MetricsDay[], key: MetricKey): (number | null)[] =>
  rows.map(r => {
    const v = r[key]
    return typeof v === 'number' ? v : null
  })

/** Most recent non-null value, or null if the whole window is unmeasured. */
export function latest(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return values[i]
  return null
}

/** Sum of the measured values, ignoring gaps. Null if nothing was measured. */
export function total(values: (number | null)[]): number | null {
  let sum = 0, seen = 0
  for (const v of values) if (v !== null) { sum += v; seen++ }
  return seen ? sum : null
}

/**
 * Percent change of the last `window` days against the `window` before them.
 * Returns null when either half has no measured data, or when the earlier half
 * is zero — "up from nothing" is not a percentage and printing ∞% or +100% is
 * worse than printing nothing.
 */
export function trend(values: (number | null)[], window: number): number | null {
  if (values.length < window * 2) return null
  const recent = total(values.slice(-window))
  const prior = total(values.slice(-window * 2, -window))
  if (recent === null || prior === null || prior === 0) return null
  return ((recent - prior) / prior) * 100
}

export const fmtNum = (n: number | null): string =>
  n === null ? '—' : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString()

export const fmtPct = (p: number | null): string =>
  p === null ? '' : `${p > 0 ? '+' : ''}${p.toFixed(0)}%`

export const fmtDay = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
