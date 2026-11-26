import { portlandToInstant } from '@/lib/portlandTime'

// Recurrence vocabulary + calendar math, as a PURE module.
//
// These lived in components/admin/adminShared.ts, which imports the Supabase
// client at module scope — importing it from a unit test spins up a real client.
// Moved here verbatim so planRecurrence() below can be tested; adminShared
// re-exports every name, so existing callers are untouched.

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'weekdays'
export type OrdinalKey = '1st' | '2nd' | '3rd' | '4th' | 'last'

export const FREQ_LABELS: Record<RecurrenceFrequency, string> = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', weekdays: 'Specific days' }
export const FREQ_COUNTS: Record<RecurrenceFrequency, number> = { weekly: 12, biweekly: 6, monthly: 3, weekdays: 0 }

export const ORDINAL_LABELS: OrdinalKey[] = ['1st', '2nd', '3rd', '4th', 'last']
// Mon–Sun labels; indices map to JS Date.getDay() via WEEKDAY_JS
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAY_JS     = [1, 2, 3, 4, 5, 6, 0] // Mon=1 … Sat=6, Sun=0

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

export function generateOccurrenceDates(start: Date, freq: RecurrenceFrequency, monthsAhead = 3): Date[] {
  const dates: Date[] = []
  const end = new Date(start); end.setMonth(end.getMonth() + monthsAhead)
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(new Date(cur))
    if (freq === 'weekly')    cur.setDate(cur.getDate() + 7)
    else if (freq === 'biweekly') cur.setDate(cur.getDate() + 14)
    else cur.setMonth(cur.getMonth() + 1)
  }
  return dates
}

// ── Planning a run from an event that already exists ─────────

export interface PlannedDate {
  /** Portland calendar date, YYYY-MM-DD. */
  date: string
  /** The instant for that date at the anchor event's Portland time of day. */
  starts_at: string
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The dates a recurrence would ADD to an event that already sits on one date.
 *
 * `startInput` is a datetime-local value — Portland wall clock, "YYYY-MM-DDTHH:mm".
 * The anchor's own date is never in the result: it is the row the admin is
 * editing, not a new one.
 *
 * Calendar arithmetic runs on floating local midnights (no zone), and only the
 * final YYYY-MM-DD is turned into an instant, through portlandToInstant. That is
 * what keeps a weekly 8pm show at 8pm Portland across the DST boundary instead
 * of drifting an hour — adding 7×24h to a UTC instant does drift.
 */
export function planRecurrence(
  startInput: string,
  freq: RecurrenceFrequency,
  ordinals: Set<OrdinalKey>,
  weekdays: Set<number>,
  monthsAhead = 3,
): PlannedDate[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(startInput ?? '')
  if (!m) return []
  const [, y, mo, d, hh, mi] = m
  const anchorYmd = `${y}-${mo}-${d}`
  const hhmm = hh && mi ? `${hh}:${mi}` : '20:00'
  const anchor = new Date(Number(y), Number(mo) - 1, Number(d))   // local midnight

  const raw = freq === 'weekdays'
    ? (ordinals.size && weekdays.size ? generateWeekdayOccurrences(anchor, ordinals, weekdays, monthsAhead) : [])
    : generateOccurrenceDates(anchor, freq, monthsAhead)

  const out: PlannedDate[] = []
  const seen = new Set<string>([anchorYmd])
  for (const occ of raw) {
    const key = ymdLocal(occ)
    if (seen.has(key)) continue
    const at = portlandToInstant(key, hhmm)
    if (!at) continue
    seen.add(key)
    out.push({ date: key, starts_at: at.toISOString() })
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
