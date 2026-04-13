import { motion, AnimatePresence } from 'framer-motion'

export interface EventInfo {
  id: string
  title: string
  venue: string
  startsAt: string // ISO datetime
  likeCount: number
  viewCount: number
}

interface Props {
  activeDay: string | null // "YYYY-MM-DD"
  today: string
  eventInfo?: EventInfo | null // when set, show event details instead of date
}

function formatDateBlocks(dateStr: string, today: string) {
  const date = new Date(dateStr + 'T12:00:00')
  const todayDate = new Date(today + 'T12:00:00')
  const diffDays = Math.round((date.getTime() - todayDate.getTime()) / 86400000)

  let label: string
  if (diffDays === 0) label = 'Tonight'
  else if (diffDays === 1) label = 'Tomorrow'
  else label = date.toLocaleDateString('en-US', { weekday: 'long' })

  const shortDay = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const dateLabel = date
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase()

  return { label, shortDay, dateLabel, isFuture: diffDays > 0 }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

const BLOCK_BASE: React.CSSProperties = {
  fontFamily: '"Barlow Condensed", sans-serif',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '3px 10px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 160,
  display: 'inline-block',
}

export function DateIndicator({ activeDay, today, eventInfo }: Props) {
  // Determine which content key to use — drives the cross-fade
  const contentKey = eventInfo ? `ev:${eventInfo.id}` : activeDay ?? 'none'

  return (
    <div
      className="flex items-center gap-2 px-4"
      style={{ height: 'var(--dateindicator-height)', marginBottom: 8, background: 'var(--bg)' }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={contentKey}
          className="flex items-center gap-1.5"
          style={eventInfo ? { width: '100%' } : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {eventInfo ? (
            // ── Event info mode (1-col) ──────────────────────────────
            <>
              {/* Left — title · venue · time pills */}
              <div className="flex items-center gap-1.5 overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...BLOCK_BASE, background: 'var(--fg)', color: 'var(--bg)' }}>
                  {eventInfo.title}
                </span>
                <span style={{ ...BLOCK_BASE, border: '1px solid var(--fg-25)', color: 'var(--fg-80)' }}>
                  {eventInfo.venue}
                </span>
                <span style={{ ...BLOCK_BASE, color: 'var(--fg-30)' }}>
                  {formatTime(eventInfo.startsAt)}
                </span>
              </div>

              {/* Right — ♥ count  👁 count */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexShrink: 0,
                  fontFamily: '"Barlow Condensed", sans-serif',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.06em',
                }}
              >
                <span style={{ color: 'var(--fg-55)' }}>♥ {eventInfo.likeCount}</span>
                <span style={{ color: 'var(--fg-30)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M1 8C1 8 3.5 3 8 3s7 5 7 5-2.5 5-7 5S1 8 1 8z" />
                    <circle cx="8" cy="8" r="2" />
                  </svg>
                  {eventInfo.viewCount}
                </span>
              </div>
            </>
          ) : activeDay ? (
            // ── Date mode (2-5 col) ──────────────────────────────────
            (() => {
              const d = formatDateBlocks(activeDay, today)
              return (
                <>
                  {/* Block 1 — solid white — day label */}
                  <span
                    style={{
                      ...BLOCK_BASE,
                      background: d.isFuture ? 'rgba(240,236,227,0.25)' : '#f0ece3',
                      color: d.isFuture ? 'rgba(12,11,11,0.5)' : '#0c0b0b',
                    }}
                  >
                    {d.label}
                  </span>

                  {/* Block 2 — ghost border — short day */}
                  <span
                    style={{
                      ...BLOCK_BASE,
                      border: `1px solid rgba(240,236,227,${d.isFuture ? 0.15 : 0.25})`,
                      color: d.isFuture ? 'rgba(240,236,227,0.3)' : 'rgba(240,236,227,0.8)',
                    }}
                  >
                    {d.shortDay}
                  </span>

                  {/* Block 3 — ghost — date */}
                  <span
                    style={{
                      ...BLOCK_BASE,
                      color: d.isFuture ? 'rgba(240,236,227,0.18)' : 'rgba(240,236,227,0.3)',
                    }}
                  >
                    {d.dateLabel}
                  </span>
                </>
              )
            })()
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
