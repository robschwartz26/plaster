import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { setTourActive } from '@/lib/tourBus'
import { GestureGhost } from './GestureGhost'

// Interactive, coach-mark tour overlaid on the real app. It spotlights a live element,
// dims the rest (two-tier: hard for gesture steps, light for explainers), teaches
// gestures with looping ghosts, and advances only when the user performs the real
// gesture/click (via tourBus) or navigates to the target screen. Resumable.

export const TOUR_SEEN_KEY = 'plaster_tour_seen'
const TOUR_STEP_KEY = 'plaster_tour_step'
export function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_SEEN_KEY) === '1' } catch { return false }
}

function tourHaptic() {
  // Dependency-free: works where the Web Vibration API exists (Android/web), no-op
  // elsewhere. True iOS haptics would need @capacitor/haptics (deferred follow-up).
  try { navigator.vibrate?.(8) } catch { /* ignore */ }
}

type Ghost = 'swipe' | 'doubletap' | 'pinch'
type Advance = { on: 'cta' } | { on: 'action'; id: string }

interface Step {
  type: 'center' | 'spotlight' | 'nav'
  title: string
  body: string
  cta?: string
  gotoRoute?: string        // center/spotlight: make sure we're on this screen
  // spotlight:
  target?: string           // data-tour value; omitted → screen-centered ghost/card
  ghost?: Ghost
  advance?: Advance         // default { on:'cta' }
  allowSkip?: boolean
  scrim?: 'light'           // force the light dim (e.g. pinch, so the grid shows)
  // nav:
  to?: string               // destination route (tab tap target)
  navLabel?: string         // label shown in the "tap X" card
  arriveBody?: string       // explainer once you've arrived
  // center finish:
  finish?: boolean
  personalized?: boolean
}

const STEPS: Step[] = [
  { type: 'center', title: 'Welcome to Plaster', body: "Let's take a quick, hands-on tour — you'll try each thing yourself as we go.", cta: 'Start', gotoRoute: '/' },
  { type: 'spotlight', ghost: 'pinch', scrim: 'light', title: 'Pinch the Wall', body: 'Pinch the poster grid to change how many columns you see. (On a laptop: ⌘/Ctrl-scroll.)', advance: { on: 'action', id: 'pinch' }, allowSkip: true, gotoRoute: '/' },
  { type: 'spotlight', target: 'poster', ghost: 'doubletap', title: 'Open a poster', body: 'Double-tap any poster to open it in single view.', advance: { on: 'action', id: 'open-poster' }, allowSkip: true },
  { type: 'spotlight', target: 'onecol', ghost: 'doubletap', title: 'Like what you love', body: 'Double-tap the poster to like it — a heart pops.', advance: { on: 'action', id: 'like' }, allowSkip: true },
  { type: 'spotlight', target: 'onecol', ghost: 'swipe', title: 'See the details', body: 'Swipe sideways to move through the poster, its details, and its wall.', advance: { on: 'action', id: 'swipe' }, allowSkip: true },
  { type: 'spotlight', target: 'rsvp', title: '“I’ll be there”', body: 'Tap this to add the show to your Line Up.', advance: { on: 'action', id: 'rsvp' }, allowSkip: true },
  { type: 'spotlight', target: 'slap', title: 'Slap your friends', body: 'Love this show? Slap your friends to it — it opens a group chat to plan the night.', advance: { on: 'cta' }, cta: 'Got it' },
  { type: 'nav', to: '/lineup', navLabel: 'Line Up', target: 'setlist', title: 'Your Line Up', body: 'Now tap Line Up.', arriveBody: 'Tap SET LIST any time to see every show you’ve said you’ll be there for, laid out on a calendar. This feed is what your friends, venues, and artists are up to.' },
  { type: 'nav', to: '/map', navLabel: 'Map', target: 'daywheel', title: 'The Map', body: 'Tap Map.', arriveBody: 'Spin the day wheel and tap venue pins to explore the city, night by night.' },
  { type: 'nav', to: '/msg', navLabel: 'MSG', title: 'Messages', body: 'Tap MSG.', arriveBody: 'Your chats live here — including the group chats your slaps open.' },
  { type: 'nav', to: '/you', navLabel: 'You', title: 'You', body: 'Tap You.', arriveBody: 'The venues and artists you follow show up here — their new shows surface in your Line Up. This is also your profile, neighborhood, and settings.' },
  { type: 'center', title: 'That’s Plaster{name}! ◆', body: 'Now go find your next night out! ☺', cta: 'Go find a show', finish: true, personalized: true },
]

interface Ctx { start: () => void }
const TourCtx = createContext<Ctx>({ start: () => {} })
export function useInteractiveTour() { return useContext(TourCtx) }

export function InteractiveTourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [resumePrompt, setResumePrompt] = useState(false)
  const [resumeAt, setResumeAt] = useState(0)
  const [celebrating, setCelebrating] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()

  const start = useCallback(() => {
    let saved = 0
    try { saved = Number(localStorage.getItem(TOUR_STEP_KEY) || '0') } catch { /* ignore */ }
    if (saved > 0 && saved < STEPS.length) { setResumeAt(saved); setResumePrompt(true) }
    else { setI(0); setResumePrompt(false) }
    setActive(true)
  }, [])

  const stopComplete = useCallback(() => {
    setActive(false); setCelebrating(false); setI(0)
    try { localStorage.setItem(TOUR_SEEN_KEY, '1'); localStorage.removeItem(TOUR_STEP_KEY) } catch { /* ignore */ }
  }, [])
  const stopExit = useCallback(() => {
    setActive(false); setCelebrating(false)
    try { localStorage.setItem(TOUR_SEEN_KEY, '1') } catch { /* ignore */ } // keep step for resume
  }, [])

  const doAdvance = useCallback(() => {
    setI(v => { if (v + 1 >= STEPS.length) { stopComplete(); return 0 } return v + 1 })
  }, [stopComplete])

  const celebrateAndAdvance = useCallback(() => {
    tourHaptic()
    setCelebrating(true)
    setTimeout(() => { setCelebrating(false); doAdvance() }, 420)
  }, [doAdvance])

  useEffect(() => { setTourActive(active) }, [active])

  // Persist progress (so ✕ mid-run can be resumed).
  useEffect(() => {
    if (active && !resumePrompt) { try { localStorage.setItem(TOUR_STEP_KEY, String(i)) } catch { /* ignore */ } }
  }, [i, active, resumePrompt])

  // Auto-run once for a new user.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStarted.current && !hasSeenTour()) { autoStarted.current = true; start() }
  }, [start])

  const step = active && !resumePrompt ? STEPS[i] : null

  // Ensure the step's required screen.
  useEffect(() => {
    if (step?.gotoRoute && location.pathname !== step.gotoRoute) navigate(step.gotoRoute)
  }, [step, location.pathname, navigate])

  // Advance when a real handler reports the target action (with a celebration beat).
  useEffect(() => {
    if (!step || step.type !== 'spotlight' || step.advance?.on !== 'action') return
    const id = step.advance.id
    const h = (e: Event) => { if ((e as CustomEvent).detail === id) celebrateAndAdvance() }
    window.addEventListener('plaster-tour-action', h as EventListener)
    return () => window.removeEventListener('plaster-tour-action', h as EventListener)
  }, [step, celebrateAndAdvance])

  const onCta = useCallback(() => {
    const s = STEPS[i]
    if (s.finish) { navigate('/'); stopComplete(); return }
    doAdvance()
  }, [i, doAdvance, stopComplete, navigate])

  const navPhase: 'nav' | 'arrive' = step?.type === 'nav'
    ? (location.pathname === step.to || location.pathname.startsWith(step.to + '/') ? 'arrive' : 'nav')
    : 'nav'

  return (
    <TourCtx.Provider value={{ start }}>
      {children}
      {active && resumePrompt && (
        <ResumePrompt
          onResume={() => { setI(resumeAt); setResumePrompt(false) }}
          onRestart={() => { setI(0); setResumePrompt(false) }}
        />
      )}
      {step && (
        <TourLayer
          step={step}
          index={i}
          total={STEPS.length}
          navPhase={navPhase}
          celebrating={celebrating}
          username={profile?.username ?? null}
          onCta={onCta}
          onSkip={doAdvance}
          onClose={stopExit}
        />
      )}
    </TourCtx.Provider>
  )
}

function ResumePrompt({ onResume, onRestart }: { onResume: () => void; onRestart: () => void }) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
      <div style={{ width: 'min(340px, calc(100vw - 40px))', background: 'var(--bg)', border: '1px solid var(--fg-15)', borderRadius: 16, padding: 20, textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 6px', fontFamily: '"Playfair Display", serif', fontSize: 20, fontWeight: 900, color: 'var(--fg)' }}>Pick up where you left off?</h3>
        <p style={{ margin: '0 0 16px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>You didn’t finish the tour last time.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onRestart} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1.5px solid var(--fg-18)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Start over</button>
          <button onClick={onResume} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Resume</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function TourLayer({ step, index, total, navPhase, celebrating, username, onCta, onSkip, onClose }: {
  step: Step; index: number; total: number; navPhase: 'nav' | 'arrive'; celebrating: boolean
  username: string | null; onCta: () => void; onSkip: () => void; onClose: () => void
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const scrolledFor = useRef<string | null>(null)

  // What are we spotlighting this frame?
  const target = step.type === 'nav'
    ? (navPhase === 'nav' ? `nav-${step.to}` : step.target)   // tab first, then destination
    : step.target
  const ghost = step.type === 'spotlight' ? step.ghost : undefined

  // Follow the target every frame (handles late mounts, scroll, layout shifts).
  useEffect(() => {
    scrolledFor.current = null
    if (!target) { setRect(null); return }
    let raf = 0
    const tick = () => {
      const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        // Auto-scroll into view once if it's off-screen.
        if (scrolledFor.current !== target && (r.bottom < 8 || r.top > window.innerHeight - 8)) {
          scrolledFor.current = target
          try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* ignore */ }
        }
        setRect(r.width > 0 && r.height > 0 ? r : null)
      } else {
        setRect(null)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const hasHole = !!target && !!rect
  const centered = step.type === 'center'
  const PAD = 6

  // Two-tier scrim.
  const dimAmt =
    step.type === 'center' ? 0.62 :
    step.type === 'nav' ? (navPhase === 'arrive' ? 0.32 : 0.55) :
    step.scrim === 'light' ? 0.35 :
    step.advance?.on === 'action' ? 0.65 : 0.5
  const dim = `rgba(0,0,0,${dimAmt})`

  // Card placement: opposite half from the target so it never covers it.
  let cardPos: React.CSSProperties
  if (centered || (!hasHole && !rect)) {
    cardPos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (rect) {
    const cy = rect.top + rect.height / 2
    cardPos = cy > vh / 2
      ? { top: 'max(64px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)' }
      : { bottom: 'calc(104px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }
  } else {
    cardPos = { bottom: 'calc(104px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }
  }

  // Where the ghost sits: over the hole if we have one, else screen-centre.
  const ghostPos: React.CSSProperties = hasHole && rect
    ? { position: 'fixed', left: rect.left + rect.width / 2, top: rect.top + rect.height / 2, transform: 'translate(-50%,-50%)' }
    : { position: 'fixed', left: '50%', top: '42%', transform: 'translate(-50%,-50%)' }

  const blocker: React.CSSProperties = { position: 'fixed', background: dim, pointerEvents: 'auto' }
  const isNavCta = step.type === 'nav' && navPhase === 'arrive'
  const showCta = centered || step.advance?.on === 'cta' || isNavCta
  const showSkip = !showCta && (step.allowSkip || step.type === 'nav')
  const body = step.type === 'nav' && navPhase === 'arrive' ? (step.arriveBody ?? step.body) : step.body
  const title = step.personalized
    ? step.title.replace('{name}', username ? `, @${username}` : '')
    : step.title

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'none' }}>
      <style>{'@keyframes plaster-tour-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}100%{box-shadow:0 0 0 14px rgba(255,255,255,0)}}'}</style>

      {(centered || (!hasHole && !!target && !rect)) && (
        <div style={{ position: 'fixed', inset: 0, background: dim, pointerEvents: 'auto' }} />
      )}
      {!centered && !target && (
        <div style={{ position: 'fixed', inset: 0, background: dim, pointerEvents: 'auto' }} />
      )}

      {hasHole && rect && (() => {
        const x = rect.left - PAD, y = rect.top - PAD, w = rect.width + PAD * 2, h = rect.height + PAD * 2
        return (
          <>
            <div style={{ ...blocker, left: 0, top: 0, right: 0, height: Math.max(0, y) }} />
            <div style={{ ...blocker, left: 0, top: y + h, right: 0, bottom: 0 }} />
            <div style={{ ...blocker, left: 0, top: y, width: Math.max(0, x), height: h }} />
            <div style={{ ...blocker, left: x + w, top: y, right: 0, height: h }} />
            <div style={{ position: 'fixed', left: x, top: y, width: w, height: h, borderRadius: 10, border: '2px solid rgba(255,255,255,0.9)', pointerEvents: 'none', animation: 'plaster-tour-pulse 1.4s ease-out infinite' }} />
          </>
        )
      })()}

      {ghost && !celebrating && (
        <div style={{ ...ghostPos, pointerEvents: 'none' }}><GestureGhost variant={ghost} /></div>
      )}

      {/* Coach-mark card */}
      <div style={{ position: 'fixed', ...cardPos, width: 'min(360px, calc(100vw - 40px))', pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--fg-15)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.35)' }}>
        {/* progress bar */}
        <div style={{ height: 4, background: 'var(--fg-15)' }}>
          <div style={{ height: '100%', width: `${((index + 1) / total) * 100}%`, background: 'var(--fg)', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ padding: 18 }}>
          {celebrating ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, fontWeight: 900, color: 'var(--fg)' }}>Nice ✓</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
                <button onClick={onClose} aria-label="End tour" style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <h3 style={{ margin: '0 0 6px', fontFamily: '"Playfair Display", serif', fontSize: 21, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.15 }}>{title}</h3>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.55 }}>{body}</p>

              {showCta ? (
                <>
                  <button onClick={onCta} style={{ marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                    {step.cta ?? 'Next'}
                  </button>
                  {step.finish && (
                    <p style={{ margin: '10px 0 0', textAlign: 'center', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>Replay any time from Settings.</p>
                  )}
                </>
              ) : (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>
                    {step.type === 'nav' ? 'Tap the highlighted tab' : 'Try it above'}
                  </span>
                  {showSkip && (
                    <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Skip →</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
