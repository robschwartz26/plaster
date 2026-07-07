/**
 * Convert a starts_at timestamp to a local-timezone YYYY-MM-DD string.
 * Example: '2026-05-02T04:00:00Z' in Portland (PDT) → '2026-05-01'
 */
export function eventLocalDate(startsAt: string): string {
  const d = new Date(startsAt)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Local-timezone YYYY-MM-DD for right now. Use this for "today" so it matches
 * eventLocalDate() — NOT new Date().toISOString() (that's UTC and is a day ahead in
 * the evening in the US, which mislabels "Tonight").
 */
export function todayLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Convert a starts_at timestamp to a local-timezone HH:MM string (24h).
 * Example: '2026-05-02T04:00:00Z' in Portland (PDT) → '21:00'
 */
export function eventLocalTime(startsAt: string): string {
  const d = new Date(startsAt)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}
