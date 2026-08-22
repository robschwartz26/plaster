// Plaster is a Portland events app: day grouping and "Tonight"/"Tomorrow"
// labels must reflect PORTLAND local time, not the viewer's device timezone —
// otherwise an out-of-town viewer (a traveler planning a trip, an East Coast
// friend) sees a Friday-night Portland show filed under Saturday and mislabeled.
const PORTLAND_TZ = 'America/Los_Angeles'

// en-CA formats as YYYY-MM-DD; formatToParts avoids locale ambiguity.
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: PORTLAND_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: PORTLAND_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
})

/**
 * Convert a starts_at timestamp to a Portland-local YYYY-MM-DD string.
 * Example: '2026-05-02T04:00:00Z' → '2026-05-01' (PDT).
 */
export function eventLocalDate(startsAt: string): string {
  return dateFmt.format(new Date(startsAt))
}

/**
 * Portland-local YYYY-MM-DD for right now. Matches eventLocalDate() so "today"
 * lines up with how events are grouped, regardless of the device's timezone.
 */
export function todayLocalDate(): string {
  return dateFmt.format(new Date())
}

/**
 * Convert a starts_at timestamp to a Portland-local HH:MM string (24h).
 * Example: '2026-05-02T04:00:00Z' → '21:00' (PDT).
 */
export function eventLocalTime(startsAt: string): string {
  // en-GB 24h can emit '24:00' at midnight; normalize to '00:00'.
  return timeFmt.format(new Date(startsAt)).replace(/^24:/, '00:')
}
