import { useEffect, useState } from 'react'

// Two-frame hand-pinch flip for the tour's pinch step. Rob's art is black line-art on a
// transparent background; we render it WHITE (invert) with a dark glow so it stays legible
// over the bright wall / any poster. It sits centered over the grid — never on the light
// coach card (where white-on-cream would vanish). Both frames are mounted and cross-faded
// so the first swap never flickers.

const OPEN = '/tour/pinch-open.png'
const CLOSED = '/tour/pinch-closed.png'
const REDUCE = typeof window !== 'undefined'
  && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function PinchFlip({ size = 96 }: { size?: number }) {
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    if (REDUCE) return
    const id = setInterval(() => setClosed(c => !c), 650)
    return () => clearInterval(id)
  }, [])

  const showClosed = closed && !REDUCE
  const frame: React.CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
    pointerEvents: 'none', userSelect: 'none',
    // black art → white, plus a soft dark glow for contrast on bright posters
    filter: 'invert(1) brightness(2) drop-shadow(0 0 8px rgba(0,0,0,0.55))',
    transition: 'opacity 0.1s linear',
  }

  return (
    <div role="img" aria-label="Pinch to zoom the wall" style={{ position: 'relative', width: size, height: size, pointerEvents: 'none' }}>
      <img src={OPEN} alt="" draggable={false} style={{ ...frame, opacity: showClosed ? 0 : 1 }} />
      <img src={CLOSED} alt="" draggable={false} style={{ ...frame, opacity: showClosed ? 1 : 0 }} />
    </div>
  )
}
