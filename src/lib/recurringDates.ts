import { portlandToInstant } from '@/lib/portlandTime'

// Recurring / multi-date expansion for the poster importer.
//
// This is the highest-stakes pure logic in the app: it turns the admin's primary
// date + extra dates + times into the exact list of event rows that hit the wall.
// A wrong output = wrong shows on the wall, silently. Extracted VERBATIM from
// ImportForm's submit path so it can be unit-tested (see recurringDates.test.ts).

export interface ExtraDate {
  date: string // YYYY-MM-DD
  time: string // HH:mm, may be empty
}

export interface ExpandedOccurrence {
  /** Calendar date key, YYYY-MM-DD. */
  date: string
  /** ISO timestamp of the earliest show that day — the row's starts_at. */
  starts_at: string
  /** All ISO show times that day when there's more than one, else null. */
  show_times: string[] | null
}

/**
 * Placeholder clock for a date that carries no time of its own.
 *
 * It is a placeholder, NOT a default: callers that use it must also set
 * events.time_tbd, or the wall prints 8pm as though the venue announced it.
 * That silent fallback put a museum tour, an outdoor market and a theatre
 * performance on the wall at hours they do not run.
 */
export const DEFAULT_SHOW_TIME = '20:00'

/**
 * Group a primary date + extra dates (each with an optional time) into the final
 * per-calendar-date occurrence list used to build event rows for a multi-date
 * upload. Behavior, verbatim from the original submit path:
 *
 *  - The same calendar date appearing more than once collapses to ONE occurrence:
 *    `starts_at` is the earliest show time, `show_times` lists every time that day
 *    (only when there's more than one; otherwise null).
 *  - A date with no time of its own falls back to the primary time, then to
 *    DEFAULT_SHOW_TIME.
 *  - Output is sorted chronologically by date; times within a date are sorted ascending.
 *
 * Timezone: every entry means Portland wall clock, pinned explicitly via
 * portlandToInstant(). This used to rely on the RUNNER's timezone being
 * Portland, which held only while the admin was in Portland — from Tokyo the
 * same "20:00" resolved to 3am Portland, and from London to noon.
 */
export function expandOccurrences(
  primaryDate: string,
  primaryTime: string,
  extraDates: ExtraDate[],
): ExpandedOccurrence[] {
  // Group all occurrences by calendar date — same date = multiple show times
  const dateMap = new Map<string, string[]>()
  const addToMap = (date: string, time: string) => {
    const at = portlandToInstant(date, time)
    if (!at) return
    const iso = at.toISOString()
    if (!dateMap.has(date)) dateMap.set(date, [])
    dateMap.get(date)!.push(iso)
  }
  addToMap(primaryDate, primaryTime || DEFAULT_SHOW_TIME)
  for (const ed of extraDates) addToMap(ed.date, ed.time || primaryTime || DEFAULT_SHOW_TIME)
  for (const [d, times] of dateMap) dateMap.set(d, times.sort())
  const uniqueDates = [...dateMap.keys()].sort()
  return uniqueDates.map(date => {
    const times = dateMap.get(date)!
    return {
      date,
      starts_at: times[0],
      show_times: times.length > 1 ? times : null,
    }
  })
}
