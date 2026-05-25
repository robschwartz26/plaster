import { useEffect, useRef, useState } from 'react'

const SPLASH_IMAGES = [
  '/newsplash-1.png',
  '/newsplash-2.png',
  '/newsplash-3.png',
  '/newsplash-4.png',
  '/newsplash-5.png',
  '/newsplash-6.png',
]

function randomSplash(): string {
  return SPLASH_IMAGES[Math.floor(Math.random() * SPLASH_IMAGES.length)]
}

const FADE_IN_MS  = 600
const HOLD_MS     = 1500
const FADE_OUT_MS = 400

export function SplashAnimation() {
  const [opacity, setOpacity] = useState(0)
  const [done, setDone]       = useState(false)
  const isFadingOut           = useRef(false)
  // Pick once on mount so it doesn't re-roll mid-animation
  const splashSrc             = useRef(randomSplash())

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
        src={splashSrc.current}
        alt=""
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/newsplash-1.png' }}
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
