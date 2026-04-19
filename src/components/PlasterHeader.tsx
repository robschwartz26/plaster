import { useMotionValue, animate, motion } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

// Shared icon button style — exported so screens with custom right-side
// actions can match the header button appearance exactly.
export function headerIconBtn(active = false): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 4,
    border: `1px solid ${active ? 'var(--fg-55)' : 'var(--fg-18)'}`,
    background: active ? 'var(--fg-08)' : 'transparent',
    color: active ? 'var(--fg)' : 'var(--fg-65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  }
}

interface Props {
  /** Custom right-side content. Defaults to Search + Filter icons. */
  actions?: React.ReactNode
}

/**
 * Consistent top header used across every screen.
 *
 * Left: "plaster" wordmark. Swipe right → toggle day/night theme.
 * Right: Search + Filter icon buttons (or custom `actions`).
 *
 * Handles env(safe-area-inset-top) automatically.
 */
export function PlasterHeader({ actions }: Props) {
  const { toggle } = useTheme()
  const x = useMotionValue(0)

  return (
    <div
      className="shrink-0 flex items-center justify-between px-4"
      style={{
        height: 58,
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: 10,
        background: 'var(--bg)',
      }}
    >
      {/* Wordmark — swipe right to toggle theme */}
      <motion.span
        style={{
          x,
          fontSize: 26, fontWeight: 900,
          color: 'var(--fg)', letterSpacing: '-0.02em',
          lineHeight: 1, userSelect: 'none', touchAction: 'none',
          cursor: 'default', display: 'inline-block',
          fontFamily: '"Playfair Display", serif',
        }}
        drag="x"
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x >= 40) toggle()
          animate(x, 0, { type: 'spring', stiffness: 500, damping: 22 })
        }}
      >
        plaster
      </motion.span>

      {/* Right-side actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions ?? (
          <>
            <button style={headerIconBtn()}><Search size={16} /></button>
            <button style={headerIconBtn()}><SlidersHorizontal size={16} /></button>
          </>
        )}
      </div>
    </div>
  )
}
