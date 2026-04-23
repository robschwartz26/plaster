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
 * Convert a starts_at timestamp to a local-timezone HH:MM string (24h).
 * Example: '2026-05-02T04:00:00Z' in Portland (PDT) → '21:00'
 */
export function eventLocalTime(startsAt: string): string {
  const d = new Date(startsAt)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}
