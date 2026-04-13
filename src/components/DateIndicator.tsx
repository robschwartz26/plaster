import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  activeDay: string | null // "YYYY-MM-DD"
  today: string
}

function formatBlocks(dateStr: string, today: string) {
  const date = new Date(dateStr + 'T12:00:00')
  const todayDate = new Date(today + 'T12:00:00')
  const diffDays = Math.round((date.getTime() - todayDate.getTime()) / 86400000)

  let label: string
  if (diffDays === 0) label = 'Tonight'
  else if (diffDays === 1) label = 'Tomorrow'
  else {
    label = date.toLocaleDateString('en-US', { weekday: 'long' })
  }

  const shortDay = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const dateLabel = date
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase()

  return { label, shortDay, dateLabel, isFuture: diffDays > 0 }
}

export function DateIndicator({ activeDay, today }: Props) {
  const info = activeDay ? formatBlocks(activeDay, today) : null

  return (
    <div
      className="flex items-center gap-2 px-4 bg-[#0c0b0b]"
      style={{ height: 'var(--dateindicator-height)' }}
    >
      <AnimatePresence mode="wait">
        {info && (
          <motion.div
            key={activeDay}
            className="flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* Block 1 — solid white label */}
            <span
              className="font-condensed font-bold uppercase"
              style={{
                fontSize: 9,
                letterSpacing: '0.06em',
                background: info.isFuture ? 'rgba(240,236,227,0.25)' : '#f0ece3',
                color: info.isFuture ? 'rgba(12,11,11,0.5)' : '#0c0b0b',
                padding: '1px 5px',
              }}
            >
              {info.label}
            </span>

            {/* Block 2 — ghost border */}
            <span
              className="font-condensed font-bold uppercase"
              style={{
                fontSize: 9,
                letterSpacing: '0.06em',
                border: `1px solid rgba(240,236,227,${info.isFuture ? 0.15 : 0.25})`,
                color: info.isFuture ? 'rgba(240,236,227,0.3)' : 'rgba(240,236,227,0.8)',
                padding: '1px 5px',
              }}
            >
              {info.shortDay}
            </span>

            {/* Block 3 — pure ghost */}
            <span
              className="font-condensed font-bold uppercase"
              style={{
                fontSize: 9,
                letterSpacing: '0.06em',
                color: info.isFuture ? 'rgba(240,236,227,0.18)' : 'rgba(240,236,227,0.3)',
                padding: '1px 5px',
              }}
            >
              {info.dateLabel}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
