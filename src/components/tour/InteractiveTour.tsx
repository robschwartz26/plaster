import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { setTourActive } from '@/lib/tourBus'

// Interactive, coach-mark tour overlaid on the real app. It spotlights a live element
// (by data-tour="…"), dims the rest, and advances only when the user performs the
// actual gesture/click (reported via tourBus) or navigates to the target screen.
// Launched from Settings, and auto-runs once for new users.

export const TOUR_SEEN_KEY = 'plaster_tour_seen'
export function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_SEEN_KEY) === '1' } catch { return false }
}

type Advance =
  | { on: 'cta' }                 // user taps the primary button
  | { on: 'action'; id: string }  // reportTourAction(id) fired from a real handler
  | { on: 'route'; to: string }   // user navigated to this route

interface Step {
  target?: string        // data-tour value to spotlight; omitted → centered card
  title: string
  body: string
  advance: Advance
  cta?: string           // label when advance.on === 'cta'
  gotoRoute?: string      // make sure we're on this screen when the step begins
  allowSkip?: boolean     // show a "Skip this step →" affordance
}

const STEPS: Step[] = [
  { title: 'Welcome to Plaster', body: "Let's take a quick, hands-on tour — you'll actually try each thing as we go.", advance: { on: 'cta' }, cta: 'Start', gotoRoute: '/' },
  { target: 'poster', title: 'Open a poster', body: 'Double-tap any poster to open it in single view.', advance: { on: 'action', id: 'open-poster' }, gotoRoute: '/', allowSkip: true },
  { target: 'onecol', title: 'Like what you love', body: 'Double-tap the poster to like it — a heart pops.', advance: { on: 'action', id: 'like' }, allowSkip: true },
  { target: 'onecol', title: 'See the details', body: 'Swipe sideways to move through the poster, its details, and its wall.', advance: { on: 'action', id: 'swipe' }, allowSkip: true },
  { target: 'rsvp', title: '“I’ll be there”', body: 'Tap this to add the show to your Line Up.', advance: { on: 'action', id: 'rsvp' }, allowSkip: true },
  { target: 'nav-/lineup', title: 'Your Line Up', body: 'Now tap Line Up to see your queue and your feed.', advance: { on: 'route', to: '/lineup' } },
  { title: 'Line Up', body: 'Your upcoming nights stack up here as diamonds, alongside your friends’ activity.', advance: { on: 'cta' }, cta: 'Next' },
  { target: 'nav-/map', title: 'The Map', body: 'Tap Map to find shows near you.', advance: { on: 'route', to: '/map' } },
  { title: 'Map', body: 'Spin the day wheel and tap venue pins to explore the city, night by night.', advance: { on: 'cta' }, cta: 'Next' },
  { target: 'nav-/msg', title: 'Messages', body: 'Tap MSG — message friends, and “slap” them to a show to plan going together.', advance: { on: 'route', to: '/msg' } },
  { title: 'Messages & Slap', body: 'Group chats live here. Slap a friend to a show and it opens a chat to plan the night.', advance: { on: 'cta' }, cta: 'Next' },
  { target: 'nav-/you', title: 'You', body: 'Tap You — your shows, follows, neighborhood, and settings.', advance: { on: 'route', to: '/you' } },
  { title: 'Follow venues & artists', body: 'Open any venue or artist’s page and tap Follow — their new shows will surface for you. Give it a try, or skip.', advance: { on: 'action', id: 'follow' }, allowSkip: true },
  { title: 'You’re all set', body: 'That’s the tour. Now go find your next night out.', advance: { on: 'cta' }, cta: 'Finish' },
]

interface Ctx { start: () => void }
const TourCtx = createContext<Ctx>({ start: () => {} })
export function useInteractiveTour() { return useContext(TourCtx) }

export function InteractiveTourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()

  const start = useCallback(() => { setI(0); setActive(true) }, [])
  const stop = useCallback(() => {
    setActive(false)
    try { localStorage.setItem(TOUR_SEEN_KEY, '1') } catch { /* ignore */ }
  }, [])
  const advance = useCallback(() => {
    setI(v => { if (v + 1 >= STEPS.length) { stop(); return 0 } return v + 1 })
  }, [stop])

  useEffect(() => { setTourActive(active) }, [active])

  // Auto-run once for a new user.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStarted.current && !hasSeenTour()) { autoStarted.current = true; start() }
  }, [start])

  const step = active ? STEPS[i] : null

  // Make sure we're on the step's required screen.
  useEffect(() => {
    if (step?.gotoRoute && location.pathname !== step.gotoRoute) navigate(step.gotoRoute)
  }, [step, location.pathname, navigate])

  // Advance when the user reaches the target route.
  useEffect(() => {
    if (!step || step.advance.on !== 'route') return
    const to = step.advance.to
    if (location.pathname === to || location.pathname.startsWith(to + '/')) advance()
  }, [step, location.pathname, advance])

  // Advance when a real handler reports the target action.
  useEffect(() => {
    if (!step || step.advance.on !== 'action') return
    const id = step.advance.id
    const h = (e: Event) => { if ((e as CustomEvent).detail === id) advance() }
    window.addEventListener('plaster-tour-action', h as EventListener)
    return () => window.removeEventListener('plaster-tour-action', h as EventListener)
  }, [step, advance])

  return (
    <TourCtx.Provider value={{ start }}>
      {children}
      {active && step && (
        <TourLayer
          step={step}
          index={i}
          total={STEPS.length}
          onCta={advance}
          onSkip={advance}
          onClose={stop}
        />
      )}
    </TourCtx.Provider>
  )
}

function TourLayer({ step, index, total, onCta, onSkip, onClose }: {
  step: Step; index: number; total: number; onCta: () => void; onSkip: () => void; onClose: () => void
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Follow the target every frame — it may mount late, scroll, or move.
  useEffect(() => {
    if (!step.target) { setRect(null); return }
    let raf = 0
    const tick = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
      const r = el?.getBoundingClientRect() ?? null
      setRect(r && r.width > 0 && r.height > 0 ? r : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [step.target])

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const hasHole = !!step.target && !!rect
  const centered = !step.target
  const PAD = 6

  // Place the card in the half opposite the target so it never covers it.
  let cardPos: React.CSSProperties
  if (centered) {
    cardPos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (rect) {
    const targetCenterY = rect.top + rect.height / 2
    cardPos = targetCenterY > vh / 2
      ? { top: 'max(64px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)' }
      : { bottom: 'calc(96px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }
  } else {
    // target set but not on screen yet — float near the bottom, no dim/blockers
    cardPos = { bottom: 'calc(96px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }
  }

  const dim = 'rgba(0,0,0,0.72)'
  const blocker: React.CSSProperties = { position: 'fixed', background: dim, pointerEvents: 'auto' }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'none' }}>
      <style>{'@keyframes plaster-tour-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}100%{box-shadow:0 0 0 14px rgba(255,255,255,0)}}'}</style>

      {centered && <div style={{ position: 'fixed', inset: 0, background: dim, pointerEvents: 'auto' }} />}

      {hasHole && rect && (() => {
        const x = rect.left - PAD, y = rect.top - PAD, w = rect.width + PAD * 2, h = rect.height + PAD * 2
        return (
          <>
            {/* 4 blockers: dim + capture taps everywhere except the hole */}
            <div style={{ ...blocker, left: 0, top: 0, right: 0, height: Math.max(0, y) }} />
            <div style={{ ...blocker, left: 0, top: y + h, right: 0, bottom: 0 }} />
            <div style={{ ...blocker, left: 0, top: y, width: Math.max(0, x), height: h }} />
            <div style={{ ...blocker, left: x + w, top: y, right: 0, height: h }} />
            {/* pulse ring around the hole */}
            <div style={{ position: 'fixed', left: x, top: y, width: w, height: h, borderRadius: 10, border: '2px solid rgba(255,255,255,0.9)', pointerEvents: 'none', animation: 'plaster-tour-pulse 1.4s ease-out infinite' }} />
          </>
        )
      })()}

      {/* Coach-mark card */}
      <div style={{ position: 'fixed', ...cardPos, width: 'min(360px, calc(100vw - 40px))', pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--fg-15)', borderRadius: 16, padding: 18, boxShadow: '0 8px 30px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
            {index + 1} / {total}
          </span>
          <button onClick={onClose} aria-label="End tour" style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <h3 style={{ margin: '0 0 6px', fontFamily: '"Playfair Display", serif', fontSize: 21, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.15 }}>{step.title}</h3>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.55 }}>{step.body}</p>

        {step.advance.on === 'cta' ? (
          <button onClick={onCta} style={{ marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {step.cta ?? 'Next'}
          </button>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>
              {step.advance.on === 'route' ? 'Tap the highlighted tab' : 'Try it above'}
            </span>
            {(step.allowSkip || step.advance.on === 'route') && (
              <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Skip →
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
