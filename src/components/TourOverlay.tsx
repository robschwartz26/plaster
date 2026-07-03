import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// A lightweight, multi-step "how Plaster works" tour. Full-screen, theme-aware,
// swipeable (or use the buttons). Launched from Settings; can also auto-run once for
// new users via the plaster_tour_seen flag (see markTourSeen / hasSeenTour).

export const TOUR_SEEN_KEY = 'plaster_tour_seen'
export function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_SEEN_KEY) === '1' } catch { return false }
}
function markTourSeen() {
  try { localStorage.setItem(TOUR_SEEN_KEY, '1') } catch { /* ignore */ }
}

interface Step { glyph: string; title: string; body: string }

const STEPS: Step[] = [
  {
    glyph: '👋',
    title: 'Welcome to Plaster',
    body: "Portland's event poster wall — discover shows, plan nights out, and feel the city's pulse. Here's the quick tour.",
  },
  {
    glyph: '🖼️',
    title: 'The Wall',
    body: 'The heart of it all. Scroll the poster grid and pinch to change columns. Double-tap any poster to open it full-screen, then swipe through its details and wall.',
  },
  {
    glyph: '🗺️',
    title: 'Map',
    body: 'See what’s on near you. Spin the day wheel and tap venue pins to explore the city, night by night.',
  },
  {
    glyph: '📅',
    title: 'Line Up',
    body: 'Your feed and your queue. Tap “I’ll be there” on a show and watch your upcoming nights stack up as diamonds.',
  },
  {
    glyph: '💬',
    title: 'Messages & Slap',
    body: 'Message friends and make group chats. Love a show? Slap your friends to it — it opens a group chat so you can plan going together.',
  },
  {
    glyph: '🏘️',
    title: 'Your neighborhood',
    body: 'Tap your neighborhood chip on the Wall for your community board — sell things, post local notices, or send a lost-pet alert.',
  },
  {
    glyph: '🎤',
    title: 'You',
    body: 'Your profile: the shows you’ve been to, who you follow, your neighborhood. Artists can add their music and claim their shows so their songs play right on the poster.',
  },
  {
    glyph: '🎉',
    title: 'You’re all set',
    body: 'That’s the tour. Now go find your next night out.',
  },
]

export function TourOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const touchX = useRef<number | null>(null)

  if (!open) return null

  const step = STEPS[i]
  const last = i === STEPS.length - 1

  function finish() {
    markTourSeen()
    setI(0)
    onClose()
  }
  const next = () => (last ? finish() : setI(v => Math.min(v + 1, STEPS.length - 1)))
  const prev = () => setI(v => Math.max(v - 1, 0))

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (dx < -45) next()
        else if (dx > 45) prev()
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        padding: 'max(20px, env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
    >
      {/* Top bar: step count + skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
          {i + 1} / {STEPS.length}
        </span>
        <button onClick={finish} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer' }}>
          {last ? '' : 'Skip'}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18 }}>
        <div style={{ fontSize: 56, lineHeight: 1 }} aria-hidden>{step.glyph}</div>
        <h2 style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontSize: 30, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.1, maxWidth: 340 }}>
          {step.title}
        </h2>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, color: 'var(--fg-65)', lineHeight: 1.6, maxWidth: 340 }}>
          {step.body}
        </p>
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 20, flexShrink: 0 }}>
        {STEPS.map((_, idx) => (
          <span
            key={idx}
            onClick={() => setI(idx)}
            style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 4, background: idx === i ? 'var(--fg)' : 'var(--fg-25)', cursor: 'pointer', transition: 'width 0.2s ease, background 0.2s ease' }}
          />
        ))}
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        {i > 0 && (
          <button onClick={prev} style={{ flex: '0 0 auto', padding: '14px 20px', borderRadius: 12, border: '1.5px solid var(--fg-18)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Back
          </button>
        )}
        <button onClick={next} style={{ flex: 1, padding: '14px 0', borderRadius: 12, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          {last ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
