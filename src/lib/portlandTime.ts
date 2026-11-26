// ── Portland is the app's timezone, not the device's ────────────────────────
// Plaster is a Portland wall. When an admin types "Dec 5, 8:00 PM" they mean
// 8pm in Portland, whether they are in Portland, in Lisbon, or behind a VPN
// that moves the machine's clock.
//
// `new Date("2026-12-05T20:00:00")` does NOT mean that. With no offset the
// runtime applies the DEVICE's timezone, so the same keystrokes produce a
// different instant depending on where the laptop is. From Tokyo that entry
// lands at 3am Portland the day before — the same class of silent, uniform
// shift as the UTC-hour bug that published 64 events a day early.
//
// These helpers pin every conversion to America/Los_Angeles explicitly and
// handle DST by asking the zone for its offset on that date, rather than
// assuming -8 or -7.

const TZ = 'America/Los_Angeles'

/**
 * Minutes Portland is behind UTC at a given instant: 480 in PST, 420 in PDT.
 * Read from the zone itself, so DST rule changes need no code change.
 */
function offsetMinutesAt(instant: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(instant).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-08:00'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!m) return 480
  const mins = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? mins : -mins
}

/**
 * A Portland wall-clock date + time → the real instant.
 *
 * `date` is YYYY-MM-DD, `time` is HH:MM (24h). A null or malformed time is an
 * error here on purpose: callers that have no time must decide what to do about
 * it (set time_tbd) rather than receive a silent 8pm.
 */
export function portlandToInstant(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  // Read the wall clock as if it were UTC, then shift by the zone's offset.
  const asUtc = new Date(`${date}T${time}:00Z`)
  if (Number.isNaN(asUtc.getTime())) return null
  const first = new Date(asUtc.getTime() + offsetMinutesAt(asUtc) * 60_000)
  // One correction pass: near a DST boundary the offset at the guessed instant
  // can differ from the offset at the true one.
  const second = new Date(asUtc.getTime() + offsetMinutesAt(first) * 60_000)
  return second
}

/** The Portland calendar date of an instant, YYYY-MM-DD. */
export function portlandDate(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
}

/** The Portland wall-clock time of an instant, HH:MM (24h). */
export function portlandTime(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

/**
 * Value for an <input type="datetime-local">, in Portland terms.
 * Without this the browser shows the device's local clock, so an admin abroad
 * sees — and then saves back — the wrong time.
 */
export function toPortlandInputValue(instant: Date | string): string {
  return `${portlandDate(instant)}T${portlandTime(instant)}`
}

/** The inverse: what a datetime-local field gives back is Portland wall clock. */
export function fromPortlandInputValue(value: string): Date | null {
  const [date, time] = (value || '').split('T')
  return date && time ? portlandToInstant(date, time.slice(0, 5)) : null
}

/**
 * Add whole days to an instant, keeping the Portland wall clock.
 * Date.setDate() keeps the DEVICE's wall clock, which drifts an hour across a
 * DST boundary and drifts by the whole offset when the device is not in
 * Portland.
 */
export function addPortlandDays(instant: Date | string, days: number): Date | null {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  const [y, m, day] = portlandDate(d).split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, day + days))
  const iso = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
  return portlandToInstant(iso, portlandTime(d))
}
