import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// A lightweight, multi-step "how Plaster works" tour. Full-screen, theme-aware,
// swipeable (or use the buttons), with a small on-brand CSS scene per step.
// Launched from Settings; auto-runs once for new users via the plaster_tour_seen flag.

export const TOUR_SEEN_KEY = 'plaster_tour_seen'
export function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_SEEN_KEY) === '1' } catch { return false }
}
function markTourSeen() {
  try { localStorage.setItem(TOUR_SEEN_KEY, '1') } catch { /* ignore */ }
}

type Scene = 'welcome' | 'wall' | 'onecol' | 'like' | 'going' | 'lineup' | 'follow' | 'map' | 'msg' | 'hood' | 'you' | 'done'
interface Step { scene: Scene; title: string; body: string }

const STEPS: Step[] = [
  { scene: 'welcome', title: 'Welcome to Plaster', body: "Portland's event poster wall — discover shows, plan nights out, and feel the city's pulse. Here's the quick tour." },
  { scene: 'wall', title: 'The Wall', body: 'The heart of it all. Scroll the poster grid, and pinch to change how many columns you see.' },
  { scene: 'onecol', title: 'Open a poster', body: 'Double-tap any poster to open it in single view. Then swipe sideways to move through the poster, its details, and its community wall.' },
  { scene: 'like', title: 'Like what you love', body: 'Double-tap a poster to like it — a heart pops. Your likes help surface what’s hot on the Wall.' },
  { scene: 'going', title: '“I’ll be there”', body: 'Open a show’s details and tap “I’ll be there.” It drops the show into your Line Up so you never forget the date.' },
  { scene: 'lineup', title: 'Line Up', body: 'Your upcoming nights, stacked as diamonds — plus a feed of what your friends and the venues you follow are up to.' },
  { scene: 'follow', title: 'Follow venues & artists', body: 'Open a venue or artist’s page — from a map pin, the feed, or search — and tap Follow. Their new shows then surface for you.' },
  { scene: 'map', title: 'Map', body: 'See what’s on near you. Spin the day wheel and tap venue pins to explore the city, night by night.' },
  { scene: 'msg', title: 'Messages & Slap', body: 'Message friends and make group chats. Love a show? Slap your friends to it — it opens a group chat so you can plan going together.' },
  { scene: 'hood', title: 'Your neighborhood', body: 'Tap your neighborhood chip on the Wall for your community board — sell things, post local notices, or send a lost-pet alert.' },
  { scene: 'you', title: 'You', body: 'Your profile: the shows you’ve been to, who you follow, your neighborhood. Artists can add their music and claim their shows so their songs play on the poster.' },
  { scene: 'done', title: 'You’re all set', body: 'That’s the tour. Now go find your next night out.' },
]

// ── Small on-brand scenes (pure CSS/JSX, no assets, theme-aware) ─────────────
const DIAMOND: React.CSSProperties = { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }
const POSTER_GRADS = [
  'linear-gradient(135deg,#7c3aed,#db2777)', 'linear-gradient(135deg,#0ea5e9,#22d3ee)',
  'linear-gradient(135deg,#f59e0b,#ef4444)', 'linear-gradient(135deg,#10b981,#84cc16)',
  'linear-gradient(135deg,#6366f1,#a855f7)', 'linear-gradient(135deg,#ec4899,#f43f5e)',
]

function Diamond({ size, opacity = 1, grad }: { size: number; opacity?: number; grad?: string }) {
  return <div style={{ width: size, height: size, ...DIAMOND, opacity, background: grad ?? 'var(--fg)' }} />
}

function TourVisual({ scene }: { scene: Scene }) {
  const box: React.CSSProperties = { height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center' }

  switch (scene) {
    case 'welcome':
      return (
        <div style={{ ...box, gap: 12 }}>
          <Diamond size={26} opacity={0.4} grad={POSTER_GRADS[1]} />
          <Diamond size={56} grad={POSTER_GRADS[0]} />
          <Diamond size={26} opacity={0.4} grad={POSTER_GRADS[2]} />
        </div>
      )
    case 'wall':
      return (
        <div style={{ ...box }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 5 }}>
            {POSTER_GRADS.map((g, i) => (
              <div key={i} style={{ width: 34, height: 50, borderRadius: 4, background: g }} />
            ))}
          </div>
        </div>
      )
    case 'onecol':
      return (
        <div style={{ ...box, gap: 14 }}>
          <span style={{ fontSize: 26, color: 'var(--fg-30)', lineHeight: 1 }}>‹</span>
          <div style={{ width: 62, height: 92, borderRadius: 6, background: POSTER_GRADS[0], display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
            <span style={{ fontSize: 16, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>···</span>
          </div>
          <span style={{ fontSize: 26, color: 'var(--fg-30)', lineHeight: 1 }}>›</span>
        </div>
      )
    case 'like':
      return (
        <div style={{ ...box }}>
          <div style={{ position: 'relative', width: 62, height: 92, borderRadius: 6, background: POSTER_GRADS[5], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ position: 'absolute', width: 46, height: 46, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)' }} />
            <span style={{ fontSize: 26, color: '#fff', lineHeight: 1 }}>{'♥'}</span>
          </div>
        </div>
      )
    case 'going':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '10px 22px', borderRadius: 10, background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700 }}>
            I’ll be there
          </div>
          <span style={{ fontSize: 18, color: 'var(--fg-30)', lineHeight: 1 }}>↓</span>
          <Diamond size={22} grad={POSTER_GRADS[3]} />
        </div>
      )
    case 'lineup':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 8 }}>
          {[1, 0.75, 0.5, 0.3].map((o, i) => (
            <Diamond key={i} size={26} opacity={o} grad={POSTER_GRADS[i % POSTER_GRADS.length]} />
          ))}
        </div>
      )
    case 'follow':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 12 }}>
          <Diamond size={54} grad={POSTER_GRADS[1]} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 20, background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700 }}>
            + Follow
          </div>
        </div>
      )
    case 'map':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative', width: 150, height: 74, borderRadius: 10, background: 'var(--fg-08)', border: '1px solid var(--fg-15)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: '38%', top: '30%', width: 12, height: 12, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: '#ef4444', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }} />
            <div style={{ position: 'absolute', left: '68%', top: '58%', width: 9, height: 9, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: 'var(--fg-40)' }} />
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} style={{ width: 2, height: i === 5 ? 16 : 10, borderRadius: 2, background: i === 5 ? 'var(--fg)' : 'var(--fg-25)' }} />
            ))}
          </div>
        </div>
      )
    case 'msg':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 8, alignItems: 'stretch', width: 170, margin: '0 auto' }}>
          <div style={{ alignSelf: 'flex-start', maxWidth: '75%', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', background: 'var(--fg-15)' }} />
          <div style={{ alignSelf: 'flex-end', maxWidth: '75%', padding: '8px 30px', borderRadius: '14px 14px 4px 14px', background: 'var(--fg)' }} />
          <div style={{ alignSelf: 'flex-start', maxWidth: '55%', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', background: 'var(--fg-15)' }} />
        </div>
      )
    case 'hood':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--fg-25)' }}>
            <div style={{ width: 8, height: 8, ...DIAMOND, background: 'var(--fg-55)' }} />
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--fg-65)' }}>Kenton</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 70, height: 46, borderRadius: 8, background: 'var(--fg-08)', border: '1px solid var(--fg-15)' }} />
            <div style={{ width: 70, height: 46, borderRadius: 8, background: 'var(--fg-08)', border: '1px solid var(--fg-15)' }} />
          </div>
        </div>
      )
    case 'you':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 12 }}>
          <Diamond size={60} grad={POSTER_GRADS[4]} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--fg-15)', background: 'var(--fg-08)' }}>
            <span style={{ width: 0, height: 0, borderLeft: '9px solid var(--fg-65)', borderTop: '6px solid transparent', borderBottom: '6px solid transparent' }} />
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--fg-65)' }}>Listen</span>
          </div>
        </div>
      )
    case 'done':
      return (
        <div style={{ ...box }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', border: '2px solid var(--fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 22, height: 12, borderLeft: '3px solid var(--fg)', borderBottom: '3px solid var(--fg)', transform: 'rotate(-45deg) translate(1px, -3px)' }} />
          </div>
        </div>
      )
  }
}

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
        <button onClick={finish} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer', visibility: last ? 'hidden' : 'visible' }}>
          Skip
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14 }}>
        <TourVisual scene={step.scene} />
        <h2 style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontSize: 30, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.1, maxWidth: 340 }}>
          {step.title}
        </h2>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, color: 'var(--fg-65)', lineHeight: 1.6, maxWidth: 340 }}>
          {step.body}
        </p>
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20, flexShrink: 0, flexWrap: 'wrap' }}>
        {STEPS.map((_, idx) => (
          <span
            key={idx}
            onClick={() => setI(idx)}
            style={{ width: idx === i ? 20 : 7, height: 7, borderRadius: 4, background: idx === i ? 'var(--fg)' : 'var(--fg-25)', cursor: 'pointer', transition: 'width 0.2s ease, background 0.2s ease' }}
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
