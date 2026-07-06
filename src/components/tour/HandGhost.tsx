import { useMemo } from 'react'

// Hand/paw gesture hints for the tour. Rob's line-art is black on transparent; rendered
// WHITE (invert) with a dark glow so it pops over the wall / any poster. Finger = tap /
// double-tap / drag; cat paw = the swipe step (a bit of a joke). pointer-events:none;
// reduced motion shows a static frame.
//
// For the finger, the FINGERTIP (not the image center) is placed at the middle of the
// box — the tour centers the box on the target, so the fingertip lands on the spot. Taps
// simply BLINK in and out (no growing/shrinking); drag slides the finger sideways.

const REDUCE = typeof window !== 'undefined'
  && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const FINGER = '/tour/finger-tap.png'
const PAW = '/tour/cat-paw.png'
const WHITE = 'invert(1) brightness(2) drop-shadow(0 0 9px rgba(0,0,0,0.6))'

// Fingertip position within the 500x500 finger art (fraction of width/height).
const FX = 0.33, FY = 0.17

const KEYFRAMES = `
@keyframes hg-blink1 {0%{opacity:0}10%{opacity:1}34%{opacity:1}44%{opacity:0}100%{opacity:0}}
@keyframes hg-blink2 {0%{opacity:0}7%{opacity:1}19%{opacity:1}27%{opacity:0}35%{opacity:0}42%{opacity:1}54%{opacity:1}62%{opacity:0}100%{opacity:0}}
@keyframes hg-swipe {0%{transform:translateX(70px);opacity:0}18%{opacity:1}80%{opacity:1}100%{transform:translateX(-100px);opacity:0}}
@keyframes hg-drag {0%{transform:translateX(-42px);opacity:0}20%{opacity:1}78%{opacity:1}100%{transform:translateX(56px);opacity:0}}
`

export function HandGhost({ variant, size = 190 }: { variant: 'tap' | 'doubletap' | 'swipe' | 'drag'; size?: number }) {
  const animation = useMemo(() => {
    if (REDUCE) return undefined
    if (variant === 'swipe') return 'hg-swipe 1.9s cubic-bezier(.45,.05,.35,.95) infinite'
    if (variant === 'drag') return 'hg-drag 1.9s cubic-bezier(.45,.05,.35,.95) infinite'
    if (variant === 'doubletap') return 'hg-blink2 2s ease-in-out infinite'
    return 'hg-blink1 1.9s ease-in-out infinite'
  }, [variant])

  if (variant === 'swipe') {
    return (
      <div style={{ width: size, height: size, pointerEvents: 'none' }} aria-hidden>
        <style>{KEYFRAMES}</style>
        <img src={PAW} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: WHITE, animation }} />
      </div>
    )
  }

  // Finger: shift so its fingertip sits at the box centre (which the tour puts on target).
  return (
    <div style={{ width: size, height: size, position: 'relative', pointerEvents: 'none' }} aria-hidden>
      <style>{KEYFRAMES}</style>
      <img
        src={FINGER}
        alt=""
        draggable={false}
        style={{
          position: 'absolute', width: '100%', height: '100%', objectFit: 'contain',
          left: `${(0.5 - FX) * 100}%`, top: `${(0.5 - FY) * 100}%`,
          filter: WHITE, animation,
        }}
      />
    </div>
  )
}
