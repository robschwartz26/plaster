import { useRef, useState } from 'react'

interface Props {
  onDismiss: () => void
  children: React.ReactNode
}

const REVEAL_WIDTH = 72  // px of delete button shown when fully swiped
const TRIGGER = 48       // px swipe needed to commit

export function SwipeableConversationRow({ onDismiss, children }: Props) {
  const [offset, setOffset] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const startXRef = useRef<number | null>(null)
  const startOffsetRef = useRef(0)

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return
    startXRef.current = e.touches[0].clientX
    startOffsetRef.current = offset
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startXRef.current === null || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - startXRef.current
    const base = startOffsetRef.current
    const raw = base + dx
    // Only allow swiping left (negative), clamp at -REVEAL_WIDTH
    const clamped = Math.max(-REVEAL_WIDTH, Math.min(0, raw))
    setOffset(clamped)
  }

  function onTouchEnd() {
    startXRef.current = null
    if (offset <= -TRIGGER) {
      setOffset(-REVEAL_WIDTH)
      setRevealed(true)
    } else {
      setOffset(0)
      setRevealed(false)
    }
  }

  function close() {
    setOffset(0)
    setRevealed(false)
  }

  return (
    <div
      style={{ position: 'relative', overflow: 'hidden' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Delete action behind */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: REVEAL_WIDTH,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#ef4444',
      }}>
        <button
          onClick={() => { close(); onDismiss() }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#fff', fontFamily: '"Barlow Condensed", sans-serif',
            fontWeight: 700, fontSize: 13, letterSpacing: '0.06em',
            width: '100%', height: '100%',
          }}
        >
          DISMISS
        </button>
      </div>

      {/* Row content, translates left */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: startXRef.current === null ? 'transform 0.22s cubic-bezier(0.4,0,0.2,1)' : 'none',
          background: 'var(--bg)',
          position: 'relative', zIndex: 1,
        }}
        onClick={() => { if (revealed) { close(); return } }}
      >
        {children}
      </div>
    </div>
  )
}
