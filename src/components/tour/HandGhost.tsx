import { useMemo } from 'react'

// Hand/paw gesture hints for the tour. Rob's line-art is black on transparent; we render
// it WHITE (invert) with a dark glow so it pops over the wall / any poster, like the pinch
// hands. Finger = tap / double-tap; cat paw = the swipe step (a bit of a joke). Big by
// design. pointer-events:none; reduced-motion shows a static frame.

const REDUCE = typeof window !== 'undefined'
  && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const FINGER = '/tour/finger-tap.png'
const PAW = '/tour/cat-paw.png'
const WHITE = 'invert(1) brightness(2) drop-shadow(0 0 9px rgba(0,0,0,0.6))'

const KEYFRAMES = `
@keyframes hg-tap1 {0%,26%{transform:translateY(0)}36%{transform:translateY(16px)}48%,100%{transform:translateY(0)}}
@keyframes hg-tap2 {0%,14%{transform:translateY(0)}22%{transform:translateY(16px)}31%{transform:translateY(0)}39%{transform:translateY(16px)}48%,100%{transform:translateY(0)}}
@keyframes hg-swipe {0%{transform:translateX(70px);opacity:0}18%{opacity:1}80%{opacity:1}100%{transform:translateX(-100px);opacity:0}}
`

export function HandGhost({ variant, size = 240 }: { variant: 'tap' | 'doubletap' | 'swipe'; size?: number }) {
  const src = variant === 'swipe' ? PAW : FINGER
  const animation = useMemo(() => {
    if (REDUCE) return undefined
    if (variant === 'swipe') return 'hg-swipe 1.9s cubic-bezier(.45,.05,.35,.95) infinite'
    if (variant === 'doubletap') return 'hg-tap2 1.9s ease-in-out infinite'
    return 'hg-tap1 1.7s ease-in-out infinite'
  }, [variant])

  return (
    <div style={{ width: size, height: size, pointerEvents: 'none' }} aria-hidden>
      <style>{KEYFRAMES}</style>
      <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: WHITE, animation }} />
    </div>
  )
}
