import { useMemo } from 'react'

// Hand/paw gesture hints for the tour. Finger = tap / double-tap / drag; cat paw =
// swipe. The finger is black line-art on transparent, rendered WHITE (invert) with a
// dark glow so it pops over the wall / any poster. The paw is filled art — white
// inside a heavy black outline — so it ships as drawn, shadow only (see PAW_FILTER).
// pointer-events:none; reduced motion → static frame.
//
// The FINGERTIP sits at the middle of the box (the tour centers the box on the target).
// Taps BLINK in and out (no grow/shrink) with a splash ripple; drag blinks on the target
// with a row of ››› arrows flowing right to show the pull.

const REDUCE = typeof window !== 'undefined'
  && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const FINGER = '/tour/finger-tap.png'
const PAW = '/tour/cat-paw.png'
const WHITE = 'invert(1) brightness(2) drop-shadow(0 0 9px rgba(0,0,0,0.6))'
// The paw is NOT inverted. The finger is thin black line-art on transparent, so it
// has to be flipped white to read at all; the paw art is a solid white fill inside a
// heavy black outline, which carries its own contrast over a bright poster or the
// dark wall alike. Inverting it would make a black paw that disappears on the wall —
// and the old thin-line paw, flipped to a white outline with nothing inside, is
// exactly what was getting lost against busy artwork. Shadow only, to lift it off.
const PAW_FILTER = 'drop-shadow(0 2px 7px rgba(0,0,0,0.55)) drop-shadow(0 0 3px rgba(0,0,0,0.45))'
const INK = 'rgba(255,255,255,0.96)'
const GLOW = 'drop-shadow(0 0 6px rgba(0,0,0,0.6))'

// Fingertip position within the 500x500 finger art (fraction of width/height).
const FX = 0.33, FY = 0.17

const KEYFRAMES = `
@keyframes hg-blink1 {0%{opacity:0}10%{opacity:1}34%{opacity:1}44%{opacity:0}100%{opacity:0}}
@keyframes hg-blink2 {0%{opacity:0}7%{opacity:1}19%{opacity:1}27%{opacity:0}35%{opacity:0}42%{opacity:1}54%{opacity:1}62%{opacity:0}100%{opacity:0}}
@keyframes hg-ripple1 {0%{transform:translate(-50%,-50%) scale(.25);opacity:0}14%{opacity:.6}34%{transform:translate(-50%,-50%) scale(1.7);opacity:0}100%{opacity:0}}
@keyframes hg-ripple2 {0%{transform:translate(-50%,-50%) scale(.25);opacity:0}9%{opacity:.6}24%{transform:translate(-50%,-50%) scale(1.6);opacity:0}31%{transform:translate(-50%,-50%) scale(.25);opacity:0}44%{opacity:.6}59%{transform:translate(-50%,-50%) scale(1.6);opacity:0}100%{opacity:0}}
@keyframes hg-swipe {0%{transform:translateX(70px);opacity:0}18%{opacity:1}80%{opacity:1}100%{transform:translateX(-100px);opacity:0}}
@keyframes hg-drag {0%{transform:translateX(-10px);opacity:0}14%{transform:translateX(-10px);opacity:1}72%{transform:translateX(42px);opacity:1}100%{transform:translateX(42px);opacity:0}}
@keyframes hg-arrow {0%,100%{opacity:.12}50%{opacity:1}}
`

export function HandGhost({ variant, size = 190 }: { variant: 'tap' | 'doubletap' | 'swipe' | 'drag'; size?: number }) {
  const fingerAnim = useMemo(() => {
    if (REDUCE) return undefined
    if (variant === 'drag') return 'hg-drag 1.9s ease-in-out infinite'
    if (variant === 'doubletap') return 'hg-blink2 2s ease-in-out infinite'
    return 'hg-blink1 1.9s ease-in-out infinite' // tap
  }, [variant])

  if (variant === 'swipe') {
    const anim = REDUCE ? undefined : 'hg-swipe 1.9s cubic-bezier(.45,.05,.35,.95) infinite'
    return (
      <div style={{ width: size, height: size, pointerEvents: 'none' }} aria-hidden>
        <style>{KEYFRAMES}</style>
        <img src={PAW} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: PAW_FILTER, animation: anim }} />
      </div>
    )
  }

  const isTap = variant === 'tap' || variant === 'doubletap'

  return (
    <div style={{ width: size, height: size, position: 'relative', pointerEvents: 'none' }} aria-hidden>
      <style>{KEYFRAMES}</style>

      {/* splash ripple at the fingertip (box centre) */}
      {isTap && !REDUCE && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: size * 0.46, height: size * 0.46, borderRadius: '50%', border: `3px solid ${INK}`, filter: GLOW, animation: `${variant === 'doubletap' ? 'hg-ripple2 2s' : 'hg-ripple1 1.9s'} ease-out infinite` }} />
      )}

      {/* ››› arrows flowing right, for the logo pull */}
      {variant === 'drag' && (
        <div style={{ position: 'absolute', left: '88%', top: '50%', transform: 'translateY(-50%)', display: 'flex', whiteSpace: 'nowrap' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ fontSize: size * 0.42, lineHeight: 1, color: INK, filter: GLOW, animation: REDUCE ? undefined : `hg-arrow 1s ease-in-out ${i * 0.13}s infinite` }}>›</span>
          ))}
        </div>
      )}

      {/* finger: fingertip at box centre */}
      <img
        src={FINGER}
        alt=""
        draggable={false}
        style={{
          position: 'absolute', width: '100%', height: '100%', objectFit: 'contain',
          left: `${(0.5 - FX) * 100}%`, top: `${(0.5 - FY) * 100}%`,
          filter: WHITE, animation: fingerAnim,
        }}
      />
    </div>
  )
}
