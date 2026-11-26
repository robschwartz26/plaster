// ── Does the date agree with the description? ────────────────────────────────
// Event blurbs state their own schedule in plain English — "every Monday",
// "Fridays and Sundays", "2nd and 4th Tuesdays". That is a free second opinion
// on the date, and it catches the failure mode a human reviewer is worst at:
// a date that looks perfectly reasonable but is one day off.
//
// This exists because a timezone bug in the Clipper published 64 events a day
// early (Karaoke From Hell as Sundays, Stripparaoke as Thursdays and
// Saturdays) and nobody spotted it for days. Both descriptions said otherwise
// the whole time.
//
// Tuned to under-report. A reviewer who sees three false warnings stops
// reading them, so anything ambiguous passes silently:
//   • EVERY weekday named anywhere in the text counts as allowed. "Saturday or
//     Sunday, February 27–28" is a real two-night run, not a conflict — the
//     first version of this check flagged five of those and only two real bugs.
//   • Silence means "no claim found", never "verified".

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Every weekday named in the text, as 0=Sunday indices. Matches "Friday", "Fridays". */
export function claimedWeekdays(description: string | null | undefined): number[] {
  const text = (description ?? '').toLowerCase()
  if (!text) return []
  const out: number[] = []
  for (let i = 0; i < DAYS.length; i++) {
    if (new RegExp(`\\b${DAYS[i]}s?\\b`).test(text)) out.push(i)
  }
  return out
}

/** Portland weekday of an instant, 0=Sunday — never the server's local zone. */
export function portlandWeekday(startsAt: string): number | null {
  const d = new Date(startsAt)
  if (Number.isNaN(d.getTime())) return null
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'long',
  }).format(d).toLowerCase()
  const i = DAYS.indexOf(name)
  return i === -1 ? null : i
}

export interface WeekdayConflict {
  actual: string      // 'Sun'
  claimed: string[]   // ['Mon']
}

/**
 * Non-null only when the description names weekdays and this event falls on
 * none of them. No description, no weekday named, or an unparseable date all
 * return null — this is a hint, not a gate.
 */
export function weekdayConflict(
  description: string | null | undefined,
  startsAt: string | null | undefined,
): WeekdayConflict | null {
  if (!startsAt) return null
  const claimed = claimedWeekdays(description)
  if (claimed.length === 0) return null
  const actual = portlandWeekday(startsAt)
  if (actual === null) return null
  if (claimed.includes(actual)) return null
  return { actual: LABEL[actual], claimed: claimed.map(i => LABEL[i]) }
}
