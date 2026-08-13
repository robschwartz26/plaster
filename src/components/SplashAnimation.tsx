import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Bundled pool — always present, always instant. Remote additions join them.
const SPLASH_IMAGES = [
  '/newsplash-1.png',
  '/newsplash-2.png',
  '/newsplash-3.png',
  '/newsplash-4.png',
  '/newsplash-5.png',
  '/newsplash-6.png',
]

// ── Remote splash pool ───────────────────────────────────────────────────────
// Drop new splash art into the public `posters` bucket under `splash/` (via
// the Supabase dashboard) and it joins the rotation on users' NEXT launch —
// no app build, no review, ever. The pool is cached in localStorage so the
// splash pick stays synchronous/instant; the refresh + image preload happen
// in the background after the app is already up.
const POOL_KEY = 'splash-pool-v1'

function currentPool(): string[] {
  try {
    const cached = JSON.parse(localStorage.getItem(POOL_KEY) ?? '[]')
    if (Array.isArray(cached) && cached.every(x => typeof x === 'string')) {
      return [...SPLASH_IMAGES, ...cached]
    }
  } catch { /* corrupted cache — fall through */ }
  return SPLASH_IMAGES
}

async function refreshPoolInBackground() {
  try {
    const { data } = await supabase.storage.from('posters').list('splash', { limit: 50 })
    const urls = (data ?? [])
      .filter(f => /\.(png|jpe?g|webp)$/i.test(f.name))
      .map(f => supabase.storage.from('posters').getPublicUrl(`splash/${f.name}`).data.publicUrl)
    localStorage.setItem(POOL_KEY, JSON.stringify(urls))
    // Warm the HTTP cache so a newly added splash is instant next launch
    for (const u of urls) { const img = new Image(); img.src = u }
  } catch { /* offline — bundled pool stands */ }
}

function randomSplash(): string {
  const pool = currentPool()
  return pool[Math.floor(Math.random() * pool.length)]
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

    // Sync the remote pool for next launch (never blocks this one)
    const t3 = setTimeout(refreshPoolInBackground, FADE_IN_MS + HOLD_MS + FADE_OUT_MS + 1500)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
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
