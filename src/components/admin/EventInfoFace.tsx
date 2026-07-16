import { SoldOutChip } from '@/components/SoldOutChip'
import type { WallEvent } from '@/types/event'

// EventInfoFace — a faithful, STATIC reproduction of the real 1-col info page
// (PosterCard.renderInfo). Used in admin surfaces to preview exactly what an
// event's info page will look like once it's live — without mounting the full
// interactive PosterCard swipe strip. Purely presentational: no RSVP/slap/report
// wiring, just the visual truth of the info face.

// Mirrors formatDateTime() in PosterCard.tsx so the date/time line reads identically.
function formatDateTime(iso: string, showTimes?: string[] | null): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const dayLabel = isToday ? 'Tonight' : isTomorrow ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (showTimes && showTimes.length >= 2) {
    const times = showTimes.map(fmtTime)
    const timesStr = times.length === 2 ? `${times[0]} & ${times[1]}` : `${times.slice(0, -1).join(', ')} & ${times[times.length - 1]}`
    return `${dayLabel} · ${timesStr}`
  }
  return `${dayLabel} · ${fmtTime(iso)}`
}

export function EventInfoFace({ event, description, address }: {
  event: WallEvent
  description: string | null
  address: string | null
}) {
  const color2 = event.color2 || '#A855F7'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: '1px solid var(--fg-15)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header block */}
      <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: '1px solid var(--fg-08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, background: color2 + '33', border: `1px solid ${color2}55`, fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: color2 }}>
            {event.category || 'Event'}
          </span>
          {event.sold_out && <SoldOutChip />}
        </div>
        <h2 style={{ margin: '8px 0 2px', fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.15 }}>
          {event.title}
        </h2>
        {event.venue_name && (
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: color2, fontWeight: 600 }}>
            {event.venue_name}
          </p>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--fg-40)', flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
            {formatDateTime(event.starts_at, event.show_times)}
          </span>
        </div>

        {address && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--fg-40)', flexShrink: 0, marginTop: 1 }}>
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.4 }}>{address}</span>
          </div>
        )}

        {description ? (
          <p style={{ margin: '0 0 16px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.6 }}>
            {description}
          </p>
        ) : (
          <p style={{ margin: '0 0 16px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#e0a050', fontStyle: 'italic', lineHeight: 1.5 }}>
            No description — the info page will show only the date line above. Add one before publishing.
          </p>
        )}

        <div style={{ height: 1, background: 'var(--fg-08)', margin: '0 0 14px' }} />

        {/* Non-interactive CTA — shows how the RSVP button will look on the live info page */}
        <div style={{ width: '100%', padding: '11px 0', borderRadius: 10, background: color2, color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, textAlign: 'center', opacity: 0.9 }}>
          I'll Be There
        </div>
        <p style={{ margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', textAlign: 'center', letterSpacing: '0.04em' }}>
          preview of the live info page
        </p>
      </div>
    </div>
  )
}
