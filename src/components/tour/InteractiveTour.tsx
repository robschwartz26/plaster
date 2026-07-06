import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { setTourActive, setInterceptedAction } from '@/lib/tourBus'
import { GestureGhost } from './GestureGhost'
import { PinchFlip } from './PinchFlip'

// Interactive, coach-mark tour overlaid on the real app. It spotlights a live element,
// dims the rest (two-tier: hard for gesture steps, light for explainers), teaches
// gestures with looping diamond ghosts, and advances only when the user performs the
// real gesture/click (via tourBus) or navigates to the target screen. Resumable.

export const TOUR_SEEN_KEY = 'plaster_tour_seen'
const TOUR_STEP_KEY = 'plaster_tour_step'
export function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_SEEN_KEY) === '1' } catch { return false }
}

function tourHaptic() {
  // Dependency-free (Web Vibration API); no-op on iOS web. True iOS haptics would need
  // @capacitor/haptics (deferred follow-up).
  try { navigator.vibrate?.(8) } catch { /* ignore */ }
}

type Ghost = 'swipe' | 'doubletap' | 'pinch' | 'tap'
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
  interactive?: boolean     // pinch: visual dim only, nothing blocks touches
  demo?: boolean            // show-only demo: block interaction, ghost at top, advance via CTA
  intercept?: string        // action id the target control reports instead of its default
  enterCmd?: string         // command dispatched to the app when this step begins (e.g. reset the wall to grid)
  reveal?: string           // action step: on the action, reveal this image + a Next CTA (don't advance yet)
  // nav:
  to?: string
  navLabel?: string
  arriveBody?: string
  // center finish:
  finish?: boolean
}

const STEPS: Step[] = [
  { type: 'center', title: 'Welcome to Plaster', body: "Let's take a quick, hands-on tour — you'll try each thing yourself as we go.", cta: 'Start', gotoRoute: '/' },
  { type: 'spotlight', demo: true, ghost: 'pinch', enterCmd: 'reset-grid', title: 'Pinch to zoom', body: 'Pinch the poster wall to change how many columns you see — from one big poster up to a five-across grid. Give it a try after the tour!', advance: { on: 'cta' }, cta: 'Next', gotoRoute: '/' },
  { type: 'spotlight', target: 'poster', ghost: 'doubletap', enterCmd: 'reset-grid', title: 'Open a poster', body: 'Double-tap the highlighted poster to open it in single view.', advance: { on: 'action', id: 'open-poster' }, allowSkip: true },
  { type: 'spotlight', target: 'onecol', ghost: 'doubletap', title: 'Show your love!', body: 'Double-tap in single-poster view to like the event and save it to your favorites.', advance: { on: 'action', id: 'like' }, allowSkip: true },
  { type: 'spotlight', target: 'onecol', ghost: 'swipe', title: 'See the details', body: 'Swipe sideways to move through the poster, its details, and its wall.', advance: { on: 'action', id: 'swipe' }, allowSkip: true },
  { type: 'spotlight', target: 'rsvp', title: '“I’ll be there”', body: 'Tap this to add the show to your Line Up.', advance: { on: 'action', id: 'rsvp' }, allowSkip: true },
  { type: 'spotlight', target: 'slap', ghost: 'tap', title: 'Slap your friends', body: 'Excited about a show? Slap your friends and get them to come with — it opens a group chat so you can plan ahead.', advance: { on: 'action', id: 'slap' }, intercept: 'slap', reveal: '/tour/slap-friends.png', allowSkip: true },
  { type: 'nav', to: '/lineup', navLabel: 'Line Up', title: 'Your Line Up', body: 'Now tap Line Up.', arriveBody: 'This is where you see what your friends and your favorite bands and venues are up to.' },
  { type: 'spotlight', target: 'setlist', ghost: 'tap', gotoRoute: '/lineup', title: 'Set List', body: 'SET LIST keeps track of the shows you’re going to — with a nifty calendar to make it even easier.', advance: { on: 'cta' }, cta: 'Next' },
  { type: 'nav', to: '/map', navLabel: 'Map', title: 'The Map', body: 'Tap Map.', arriveBody: 'Shows near you, night by night.' },
  { type: 'nav', to: '/msg', navLabel: 'MSG', title: 'Messages', body: 'Tap MSG.', arriveBody: 'All chats and group chats live here!' },
  { type: 'nav', to: '/you', navLabel: 'You', title: 'You', body: 'Tap You.', arriveBody: 'Hey, lookin’ sharp! ;) This is your profile — upload your pics, keep track of your friends, bands, and venues, and gaze upon your poster collection (all the events you’ve attended)!' },
  { type: 'center', title: 'You’re all set', body: 'That’s the tour. Now go find your next night out! ☺', cta: 'Go find a show', finish: true },
]

interface Ctx { start: () => void }
const TourCtx = createContext<Ctx>({ start: () => {} })
export function useInteractiveTour() { return useContext(TourCtx) }

export function InteractiveTourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [resumePrompt, setResumePrompt] = useState(false)
  const [resumeAt, setResumeAt] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const start = useCallback(() => {
    let saved = 0
    try { saved = Number(localStorage.getItem(TOUR_STEP_KEY) || '0') } catch { /* ignore */ }
    if (saved > 0 && saved < STEPS.length) { setResumeAt(saved); setResumePrompt(true) }
    else { setI(0); setResumePrompt(false) }
    setActive(true)
  }, [])

  const stopComplete = useCallback(() => {
    setActive(false); setI(0)
    try { localStorage.setItem(TOUR_SEEN_KEY, '1'); localStorage.removeItem(TOUR_STEP_KEY) } catch { /* ignore */ }
  }, [])
  const stopExit = useCallback(() => {
    setActive(false)
    try { localStorage.setItem(TOUR_SEEN_KEY, '1') } catch { /* ignore */ } // keep step for resume
  }, [])

  const doAdvance = useCallback(() => {
    // Belt-and-suspenders: close any sheet a step may have opened before moving on.
    try { window.dispatchEvent(new CustomEvent('plaster-tour-cleanup')) } catch { /* ignore */ }
    setI(v => { if (v + 1 >= STEPS.length) { stopComplete(); return 0 } return v + 1 })
  }, [stopComplete])

  const actionAdvance = useCallback(() => { tourHaptic(); doAdvance() }, [doAdvance])

  useEffect(() => { setTourActive(active) }, [active])

  // Persist progress so ✕ mid-run can be resumed.
  useEffect(() => {
    if (active && !resumePrompt) { try { localStorage.setItem(TOUR_STEP_KEY, String(i)) } catch { /* ignore */ } }
  }, [i, active, resumePrompt])

  // Auto-run once for a new user.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStarted.current && !hasSeenTour()) { autoStarted.current = true; start() }
  }, [start])

  const step = active && !resumePrompt ? STEPS[i] : null

  // Let intercepting controls (Slap button) know when to report instead of act.
  useEffect(() => { setInterceptedAction(step?.intercept ?? null); setRevealed(false) }, [step])

  // Drive the app into the right state when a step begins (e.g. reset the wall to the
  // multi-column grid) so the tour's step state can't drift from the app's view.
  useEffect(() => {
    if (step?.enterCmd) {
      try { window.dispatchEvent(new CustomEvent('plaster-tour-cmd', { detail: { cmd: step.enterCmd } })) } catch { /* ignore */ }
    }
  }, [step])

  // Ensure the step's required screen.
  useEffect(() => {
    if (step?.gotoRoute && location.pathname !== step.gotoRoute) navigate(step.gotoRoute)
  }, [step, location.pathname, navigate])

  // Advance when a real handler reports the target action.
  useEffect(() => {
    if (!step || step.type !== 'spotlight' || step.advance?.on !== 'action') return
    const id = step.advance.id
    const h = (e: Event) => {
      if ((e as CustomEvent).detail !== id) return
      // Reveal-then-Next steps (Slap): show the image instead of advancing outright.
      if (step.reveal) { tourHaptic(); setRevealed(true) }
      else actionAdvance()
    }
    window.addEventListener('plaster-tour-action', h as EventListener)
    return () => window.removeEventListener('plaster-tour-action', h as EventListener)
  }, [step, actionAdvance])

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
          revealed={revealed}
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

function TourLayer({ step, index, total, navPhase, revealed, onCta, onSkip, onClose }: {
  step: Step; index: number; total: number; navPhase: 'nav' | 'arrive'; revealed: boolean
  onCta: () => void; onSkip: () => void; onClose: () => void
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const scrolledFor = useRef<string | null>(null)

  const target = step.type === 'nav'
    ? (navPhase === 'nav' ? `nav-${step.to}` : undefined)   // spotlight the tab, then explain (no dest spotlight)
    : step.target
  const ghost = step.type === 'spotlight' ? step.ghost : undefined

  useEffect(() => {
    scrolledFor.current = null
    if (!target) { setRect(null); return }
    let raf = 0
    const tick = () => {
      const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
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
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400
  const centered = step.type === 'center'
  const interactive = !!step.interactive
  const isReveal = revealed && !!step.reveal
  const demo = !!step.demo
  // Only cut a hole when the target is actually on-screen — otherwise the blockers
  // would cover the viewport and trap scrolling (and misalign the tour).
  const inView = !!rect && rect.bottom > 24 && rect.top < vh - 24 && rect.right > 8 && rect.left < vw - 8
  const hasHole = !!target && !!rect && inView && !interactive && !isReveal
  const PAD = 6

  const dimAmt =
    centered ? 0.62 :
    interactive ? 0.35 :
    step.type === 'nav' ? (navPhase === 'arrive' ? 0.32 : 0.55) :
    step.cta ? 0.5 :
    0.65
  const dim = `rgba(0,0,0,${dimAmt})`

  // Card placement: opposite half from the target; bottom for interactive/no-hole gesture.
  let cardPos: React.CSSProperties
  if (centered) {
    cardPos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (hasHole && rect) {
    const cy = rect.top + rect.height / 2
    cardPos = cy > vh / 2
      ? { top: 'max(64px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)' }
      : { bottom: 'calc(104px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }
  } else {
    // interactive (pinch) or explainer with no on-screen target → bottom, clear of the app
    cardPos = { bottom: 'calc(104px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }
  }

  const ghostPos: React.CSSProperties = hasHole && rect
    ? { position: 'fixed', left: rect.left + rect.width / 2, top: rect.top + rect.height / 2, transform: 'translate(-50%,-50%)' }
    : demo
    ? { position: 'fixed', left: '50%', top: '24%', transform: 'translate(-50%,-50%)' }
    : { position: 'fixed', left: '50%', top: '42%', transform: 'translate(-50%,-50%)' }

  const blocker: React.CSSProperties = { position: 'fixed', background: dim, pointerEvents: 'auto' }
  const isNavCta = step.type === 'nav' && navPhase === 'arrive'
  const showCta = centered || step.advance?.on === 'cta' || isNavCta || !!step.cta
  const showSkip = !showCta && (step.allowSkip || step.type === 'nav')
  const body = isNavCta ? (step.arriveBody ?? step.body) : step.body

  // Scrim: full + clickable for centered; full + NON-blocking for interactive/nav-arrive
  // explainers; 4 blockers around the hole otherwise.
  // Dim the whole screen ONLY for the welcome/finish cards. Explainer steps that talk
  // ABOUT a screen leave it fully visible; spotlight steps dim only around their target
  // (a specific button/icon). Interactive steps show the screen normally too.
  const fullScrim = centered
  const fullScrimBlocks = centered  // only centered captures taps

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'none' }}>
      <style>{'@keyframes plaster-tour-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}100%{box-shadow:0 0 0 14px rgba(255,255,255,0)}}'}</style>

      {fullScrim && (
        <div style={{ position: 'fixed', inset: 0, background: dim, pointerEvents: fullScrimBlocks ? 'auto' : 'none' }} />
      )}

      {/* Demo step: transparent full-screen blocker so the wall shows but can't be pinched. */}
      {demo && (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', pointerEvents: 'auto' }} />
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

      {ghost && !isReveal && (
        <div style={{ ...ghostPos, pointerEvents: 'none' }}>
          {ghost === 'pinch' ? <PinchFlip size={280} /> : <GestureGhost variant={ghost} />}
        </div>
      )}

      {/* Coach-mark card */}
      <div style={{ position: 'fixed', ...cardPos, width: 'min(360px, calc(100vw - 40px))', pointerEvents: 'auto', background: 'var(--bg)', border: '1px solid var(--fg-15)', borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.35)' }}>
        {isReveal && step.reveal && (
          <img src={step.reveal} alt="" draggable={false} style={{ position: 'absolute', left: '50%', bottom: '100%', transform: 'translate(-50%, 12%)', width: 300, height: 300, objectFit: 'contain', pointerEvents: 'none', zIndex: 1 }} />
        )}
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--fg-40)' }}>{index + 1} / {total}</span>
            <button onClick={onClose} aria-label="End tour" style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
          {isReveal ? (
            <>
              <h3 style={{ margin: '0 0 6px', fontFamily: '"Playfair Display", serif', fontSize: 21, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.15 }}>That got their attention!</h3>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.55 }}>A slap pings your friends and opens a group chat to plan the night.</p>
              <button onClick={onCta} style={{ marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Next</button>
            </>
          ) : (
            <>
              <h3 style={{ margin: '0 0 6px', fontFamily: '"Playfair Display", serif', fontSize: 21, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.15 }}>{step.title}</h3>
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
