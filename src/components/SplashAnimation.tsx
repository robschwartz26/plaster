import { useEffect, useRef, useState } from 'react'

/**
 * SplashAnimation
 *
 * Theme-aware splash with genuine CSS fade-in and fade-out.
 *
 * The fade-in works by:
 *   1. First paint: image rendered at opacity 0 with transition already set
 *   2. requestAnimationFrame: opacity set to 1 → browser animates the change
 *
 * Without the rAF, React sets opacity and transition in the same render so the
 * browser sees them as the initial state and doesn't animate.
 *
 * Background matches the user's current theme so the entrance reads correctly
 * in both day (cream) and night (near-black) modes.
 */

const FADE_IN_MS  = 600
const HOLD_MS     = 1500
const FADE_OUT_MS = 400

export function SplashAnimation() {
  const [opacity, setOpacity] = useState(0)
  const [done, setDone]       = useState(false)
  const isFadingOut           = useRef(false)

  const bg = document.documentElement.getAttribute('data-theme') === 'day'
    ? '#f0ece3'
    : '#0a0a0a'

  useEffect(() => {
    // Let the first paint land (opacity 0), then start the fade-in
    const raf = requestAnimationFrame(() => setOpacity(1))

    const t1 = setTimeout(() => {
      isFadingOut.current = true
      setOpacity(0)
    }, FADE_IN_MS + HOLD_MS)

    const t2 = setTimeout(
      () => setDone(true),
      FADE_IN_MS + HOLD_MS + FADE_OUT_MS,
    )

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  function handleTap() {
    if (isFadingOut.current) return
    isFadingOut.current = true
    setOpacity(0)
    setTimeout(() => setDone(true), FADE_OUT_MS)
  }

  if (done) return null

  return (
    <div
      onClick={handleTap}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: bg,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <img
        src="/new-splash.png"
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          opacity,
          transition: `opacity ${isFadingOut.current ? FADE_OUT_MS : FADE_IN_MS}ms ease`,
          willChange: 'opacity',
        }}
      />
    </div>
  )
}
