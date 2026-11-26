import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { setTourActive, setInterceptedAction } from '@/lib/tourBus'
import { useAuth } from '@/contexts/AuthContext'
import { HandGhost } from './HandGhost'
import { PinchFlip } from './PinchFlip'
import { CatSwipe } from './CatSwipe'
import { Heart } from '@/components/Heart'

// Interactive, coach-mark tour overlaid on the real app. It spotlights a live element,
// dims the rest (two-tier: hard for gesture steps, light for explainers), teaches
// gestures with looping diamond ghosts, and advances only when the user performs the
// real gesture/click (via tourBus) or navigates to the target screen. Resumable.

export const TOUR_SEEN_KEY = 'plaster_tour_seen'
export const TOUR_STEP_KEY = 'plaster_tour_step'
export function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_SEEN_KEY) === '1' } catch { return false }
}

// Guest mini-tour: auto-runs on a guest's first THREE app sessions (until they
// sign up). Counted per auto-run, once per browser session.
const GUEST_RUNS_KEY = 'plaster_guest_tour_runs'
const GUEST_SESSION_KEY = 'plaster_guest_tour_this_session'
function guestRuns(): number {
  try { return Number(localStorage.getItem(GUEST_RUNS_KEY) || '0') } catch { return 0 }
}
function incGuestRuns() {
  try { localStorage.setItem(GUEST_RUNS_KEY, String(guestRuns() + 1)) } catch { /* ignore */ }
}

function tourHaptic() {
  // Dependency-free (Web Vibration API); no-op on iOS web. True iOS haptics would need
  // @capacitor/haptics (deferred follow-up).
  try { navigator.vibrate?.(8) } catch { /* ignore */ }
}

type Ghost = 'swipe' | 'doubletap' | 'pinch' | 'tap' | 'drag'
type Advance = { on: 'cta' } | { on: 'action'; id: string }

interface Step {
  type: 'center' | 'spotlight' | 'nav'
  title: React.ReactNode
  body: React.ReactNode
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
  lockScroll?: boolean      // freeze the wall's vertical scroll so the user can't drift off the anchored poster
  noDim?: boolean           // spotlight step: highlight the target (ring + ghost) but DON'T dim the rest
  ghostSize?: number        // override the gesture-hint (hand/paw) size
  cardBottom?: boolean      // force the coach card to the bottom (don't cover top-of-page content)
  cardTop?: string          // custom top offset when the card is top-placed (sit it in a header gap)
  cardWidth?: number | string // override the card width (e.g. a narrow, tall card)
  cardOverride?: React.CSSProperties // fully override the card's position (e.g. pin top-right)
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
  { type: 'spotlight', target: 'wordmark', ghost: 'drag', ghostSize: 120, gotoRoute: '/', title: 'Day & night', body: <>Plaster has a day look and a night look. <strong>Pull</strong> the “plaster” logo to the right to switch.</>, advance: { on: 'action', id: 'theme-toggle' }, allowSkip: true },
  { type: 'spotlight', target: 'wordmark', ghost: 'drag', ghostSize: 120, gotoRoute: '/', title: 'Switch it back', body: <>Nice! <strong>Pull</strong> it again to flip back to where you started.</>, advance: { on: 'action', id: 'theme-toggle' }, allowSkip: true },
  { type: 'spotlight', target: 'poster', ghost: 'doubletap', ghostSize: 150, enterCmd: 'reset-grid', title: 'Open a poster', body: <><strong>Double-tap</strong> the highlighted poster to open it in single view.</>, advance: { on: 'action', id: 'open-poster' }, allowSkip: true },
  // The rail is category-aware (ArtistRail.tsx): Spotify + YouTube + Google for the
  // music categories, YouTube + Google for comedy/drag/film, Google alone for a
  // market or a Thanksgiving dinner. "Hear them first / tap Spotify or YouTube" read
  // as a bug whenever the tour landed on one of those — a lone Google button under a
  // promise of listening. The copy now names all three and says it varies.
  { type: 'spotlight', target: 'discovery', ghost: 'tap', ghostSize: 110, noDim: true, enterCmd: 'rail-pin', lockScroll: true, title: 'Check them out first', body: <>Every poster has a <strong>discovery bar</strong> — Spotify, YouTube or Google, whichever suits the show. Hear the act, watch a clip, or read up before you roll out.</>, advance: { on: 'cta' }, cta: 'Next', allowSkip: true },
  { type: 'spotlight', target: 'onecol', ghost: 'doubletap', ghostSize: 210, enterCmd: 'rail-unpin', lockScroll: true, title: <>Show your love <Heart /></>, body: <><strong>Double-tap</strong> in single-poster view to like the event and save it to your favorites.</>, advance: { on: 'action', id: 'like' }, allowSkip: true },
  { type: 'spotlight', target: 'onecol', ghost: 'swipe', lockScroll: true, title: 'See the details', body: <><strong>Swipe</strong> sideways to move through the poster, its details, and its wall.</>, advance: { on: 'action', id: 'swipe' }, allowSkip: true },
  { type: 'spotlight', target: 'rsvp', ghost: 'tap', ghostSize: 110, noDim: true, cardWidth: 240, cardOverride: { top: 'max(80px, env(safe-area-inset-top))', right: 12 }, intercept: 'rsvp', lockScroll: true, title: 'The info page', body: <>The event’s info page. <strong>Tap</strong> “I’ll be there” if you wanna go — it’ll add this show to your Set List.</>, advance: { on: 'action', id: 'rsvp' }, allowSkip: true },
  { type: 'spotlight', target: 'slap', ghost: 'tap', ghostSize: 140, lockScroll: true, title: 'Slap your friends', body: <>Excited about a show? <strong>Slap</strong> your friends and get them to come with — it opens a group chat so you can plan ahead.</>, advance: { on: 'action', id: 'slap' }, intercept: 'slap', reveal: '/tour/slap-friends.png', allowSkip: true },
  { type: 'nav', to: '/lineup', navLabel: 'Line Up', title: 'Your Line Up', body: <>Now <strong>tap</strong> Line Up.</>, arriveBody: 'This is where you see what your friends and your favorite bands and venues are up to.' },
  { type: 'spotlight', target: 'setlist', ghost: 'tap', ghostSize: 120, gotoRoute: '/lineup', title: 'Set List', body: <><strong>Tap</strong> SET LIST — it tracks every show you’re going to.</>, advance: { on: 'action', id: 'open-setlist' }, allowSkip: true },
  { type: 'spotlight', demo: true, gotoRoute: '/lineup', title: 'Your set list', body: 'Here’s your calendar — every show you’ve said you’ll be there for, laid out to make planning easy.', advance: { on: 'cta' }, cta: 'Next' },
  { type: 'nav', to: '/map', navLabel: 'Map', enterCmd: 'close-setlist', title: 'The Map', body: <><strong>Tap</strong> Map.</>, arriveBody: 'Shows near you, night by night.' },
  { type: 'nav', to: '/msg', navLabel: 'MSG', title: 'Messages', body: <><strong>Tap</strong> MSG.</>, arriveBody: 'All chats and group chats live here!' },
  { type: 'nav', to: '/you', navLabel: 'You', title: 'You', body: <><strong>Tap</strong> You.</>, arriveBody: 'Hey, lookin’ sharp! ;) This is your profile — upload your pics, keep track of your friends, bands, and venues, and gaze upon your poster collection (all the events you’ve attended)!' },
  { type: 'spotlight', interactive: true, ghost: 'pinch', enterCmd: 'reset-grid', gotoRoute: '/', title: 'Find your night out', body: <>That’s the tour! One last move — <strong>Pinch</strong> the wall to flow from one big poster up to a five-across grid, then go find your night out!</>, advance: { on: 'action', id: 'pinch' }, allowSkip: true },
]

// Guest mini-tour: the three core wall gestures, each a forced task (only the
// real gesture advances; the dim blockers keep everything else untouchable),
// then a signup pitch spotlighting the SIGN UP tab. ✕ exits any time; no Skip.
const GUEST_STEPS: Step[] = [
  { type: 'center', title: 'Welcome to Plaster', body: "Portland's living poster wall. A few quick moves and you'll have it down.", cta: 'Show me', gotoRoute: '/' },
  // DOUBLE-TAP FIRST. It is the move people don't guess — "tap a poster" is the
  // reflex everywhere else — and it is the one that opens the whole app up, so
  // it goes before the zoom steps and before any other instruction.
  { type: 'spotlight', target: 'poster', ghost: 'doubletap', ghostSize: 150, enterCmd: 'reset-grid', gotoRoute: '/', title: 'Double-tap to open', body: <><strong>Double-tap</strong> the highlighted poster to open the show.</>, advance: { on: 'action', id: 'open-poster' } },
  { type: 'spotlight', target: 'onecol', ghost: 'swipe', lockScroll: true, title: 'Swipe for info', body: <><strong>Swipe</strong> sideways to see the show's details — time, venue, tickets, and its wall.</>, advance: { on: 'action', id: 'swipe' } },
  // Beat on the info page: the swipe fires the instant you land on it, so hold
  // here and actually talk about it. demo blocks interaction so they can't swipe
  // off before reading; CTA moves on.
  { type: 'spotlight', demo: true, lockScroll: true, title: 'Info page!', body: "Voila! Everything you need to know about the event in one place! :)", advance: { on: 'cta' }, cta: 'Got it' },
  // Zoom steps advance on DESTINATION signals (pinch-1col / pinch-grid) — plain
  // 'pinch' fires on any mid-gesture column change and would blow through the
  // step before the zoom finishes. reset-grid puts the wall back to the full
  // grid first, since we're arriving from the info page.
  { type: 'spotlight', interactive: true, ghost: 'pinch', enterCmd: 'reset-grid', gotoRoute: '/', title: 'Zoom in', body: <><strong>Two fingers</strong> — zoom in until one poster fills the wall.</>, advance: { on: 'action', id: 'pinch-1col' } },
  // CTA buffer between the zooms: releasing a finished zoom-in makes the fingers
  // drift back together, which reads as zoom-out and fires pinch-grid instantly —
  // skipping the zoom-out step. While this card is up nothing listens for pinch
  // signals, so the release can be as messy as it likes.
  { type: 'spotlight', demo: true, title: 'Well would ya look at that!', body: "One poster, full bleed. The art gets the whole stage on Plaster.", advance: { on: 'cta' }, cta: "Let's zoom out" },
  { type: 'spotlight', interactive: true, ghost: 'pinch', title: 'Zoom back out', body: <>Now <strong>pinch</strong> back out to the full wall.</>, advance: { on: 'action', id: 'pinch-grid' } },
  { type: 'spotlight', target: 'nav-/auth', ghost: 'tap', ghostSize: 110, enterCmd: 'reset-grid', cardOverride: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }, title: 'Unlock the rest', body: <><strong>Sign up</strong> to unlock the advanced features — and the full tutorial!</>, cta: 'Done' },
]

const devBtn: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6,
  border: '1px dashed var(--fg-30)', background: 'var(--bg)', color: 'var(--fg-40)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, cursor: 'pointer',
}

interface Ctx { start: () => void }
const TourCtx = createContext<Ctx>({ start: () => {} })
export function useInteractiveTour() { return useContext(TourCtx) }

export function InteractiveTourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [mode, setMode] = useState<'full' | 'guest'>('full')
  const [i, setI] = useState(0)
  const [resumePrompt, setResumePrompt] = useState(false)
  const [resumeAt, setResumeAt] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const steps = mode === 'guest' ? GUEST_STEPS : STEPS

  const start = useCallback(() => {
    let saved = 0
    try { saved = Number(localStorage.getItem(TOUR_STEP_KEY) || '0') } catch { /* ignore */ }
    setMode('full')
    if (saved > 0 && saved < STEPS.length) { setResumeAt(saved); setResumePrompt(true) }
    else { setI(0); setResumePrompt(false) }
    setActive(true)
  }, [])

  // DEV review: run the full tour from the top, no resume prompt in the way.
  const startFullFromTop = useCallback(() => {
    try { localStorage.removeItem(TOUR_STEP_KEY) } catch { /* ignore */ }
    setMode('full')
    setResumePrompt(false)
    setI(0)
    setActive(true)
  }, [])

  // Guest mini-tour: short, never resumable, and never touches the full tour's
  // seen/step flags (the full tour must still auto-run after signup).
  const startGuest = useCallback(() => {
    setMode('guest')
    setI(0)
    setResumePrompt(false)
    setActive(true)
  }, [])

  const stopComplete = useCallback(() => {
    setActive(false); setI(0)
    if (mode === 'full') {
      try { localStorage.setItem(TOUR_SEEN_KEY, '1'); localStorage.removeItem(TOUR_STEP_KEY) } catch { /* ignore */ }
    }
  }, [mode])
  const stopExit = useCallback(() => {
    setActive(false)
    if (mode === 'full') {
      try { localStorage.setItem(TOUR_SEEN_KEY, '1') } catch { /* ignore */ } // keep step for resume
    }
  }, [mode])

  // Guard: a burst of duplicate signals (e.g. a pinch firing many frames at max
  // zoom) must never advance more than one step. Latched on advance, released
  // once the step index actually changes (effect below).
  const advancingRef = useRef(false)
  const doAdvance = useCallback(() => {
    if (advancingRef.current) return
    advancingRef.current = true
    // Belt-and-suspenders: close any sheet a step may have opened before moving on.
    try { window.dispatchEvent(new CustomEvent('plaster-tour-cleanup')) } catch { /* ignore */ }
    const len = mode === 'guest' ? GUEST_STEPS.length : STEPS.length
    setI(v => { if (v + 1 >= len) { stopComplete(); return 0 } return v + 1 })
  }, [stopComplete, mode])
  // Release the latch once the step actually changed, so the next step can advance.
  useEffect(() => { advancingRef.current = false }, [i, active])

  const actionAdvance = useCallback(() => { tourHaptic(); doAdvance() }, [doAdvance])

  useEffect(() => { setTourActive(active) }, [active])

  // Persist progress so ✕ mid-run can be resumed. Full tour only.
  useEffect(() => {
    if (active && !resumePrompt && mode === 'full') { try { localStorage.setItem(TOUR_STEP_KEY, String(i)) } catch { /* ignore */ } }
  }, [i, active, resumePrompt, mode])

  // Auto-run once for a new user. Signed-in only: guests browsing the public
  // wall (guest mode, Apple 5.1.1(v)) shouldn't get a tour that teaches
  // RSVP/slap gestures they can't perform yet — it fires right after signup
  // instead (onboarding clears the seen-flags).
  const { user, loading } = useAuth()
  const autoStarted = useRef(false)
  useEffect(() => {
    if (user && !autoStarted.current && !hasSeenTour()) { autoStarted.current = true; start() }
  }, [start, user])

  // Guest mini-tour auto-run: first three sessions without an account. One run
  // per browser session (guards against AppLayout remounts burning extra runs).
  useEffect(() => {
    if (loading || user || active) return
    if (guestRuns() >= 3) return
    try { if (sessionStorage.getItem(GUEST_SESSION_KEY) === '1') return } catch { /* ignore */ }
    const t = setTimeout(() => {
      try { sessionStorage.setItem(GUEST_SESSION_KEY, '1') } catch { /* ignore */ }
      incGuestRuns()
      startGuest()
    }, 1500)
    return () => clearTimeout(t)
  }, [loading, user, active, startGuest])

  // Signed up mid-guest-tour (e.g. via a gate sheet) → the pitch no longer applies.
  useEffect(() => {
    if (active && mode === 'guest' && user) setActive(false)
  }, [active, mode, user])

  const step = active && !resumePrompt ? steps[i] : null

  // Let intercepting controls (Slap button) know when to report instead of act.
  useEffect(() => { setInterceptedAction(step?.intercept ?? null); setRevealed(false) }, [step])

  // Drive the app into the right state when a step begins (e.g. reset the wall to the
  // multi-column grid) so the tour's step state can't drift from the app's view.
  useEffect(() => {
    if (step?.enterCmd) {
      try { window.dispatchEvent(new CustomEvent('plaster-tour-cmd', { detail: { cmd: step.enterCmd } })) } catch { /* ignore */ }
    }
  }, [step])

  // Lock/unlock the wall's vertical scroll per step, so anchored single-poster
  // steps can't be scrolled off their target. Always emit one or the other so
  // leaving a locked step (or the tour ending) reliably restores scrolling.
  useEffect(() => {
    const cmd = step?.lockScroll ? 'lock-scroll' : 'unlock-scroll'
    try { window.dispatchEvent(new CustomEvent('plaster-tour-cmd', { detail: { cmd } })) } catch { /* ignore */ }
  }, [step])

  // Belt-and-suspenders: if the tour unmounts mid-step, restore scrolling.
  useEffect(() => () => {
    try { window.dispatchEvent(new CustomEvent('plaster-tour-cmd', { detail: { cmd: 'unlock-scroll' } })) } catch { /* ignore */ }
  }, [])

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
    const s = steps[i]
    if (s.finish) { navigate('/'); stopComplete(); return }
    doAdvance()
  }, [i, steps, doAdvance, stopComplete, navigate])

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
          // Remount per step — and per nav phase, which swaps the target out from
          // under the same step — so the layer's placement state starts clean
          // instead of being reset by hand.
          key={`${i}:${navPhase}`}
          step={step}
          index={i}
          total={steps.length}
          navPhase={navPhase}
          revealed={revealed}
          onCta={onCta}
          onSkip={doAdvance}
          onClose={stopExit}
        />
      )}
      {/* DEV replay buttons (dev builds only). Guest tour for signed-out review —
          it also clears the three-run cap so it can be watched again. Full tour for
          signed-in review, always from step 1 so the resume prompt can't swallow it.
          They never both show: the guest tour closes itself the moment a user exists. */}
      {import.meta.env.DEV && !active && (
        <div style={{
          position: 'fixed', left: 10,
          bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 10px)',
          zIndex: 2999, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
        }}>
          {user && (
            <button onClick={startFullFromTop} style={devBtn}>DEV: full tour</button>
          )}
          {!user && (
            <button
              onClick={() => {
                try { localStorage.removeItem(GUEST_RUNS_KEY); sessionStorage.removeItem(GUEST_SESSION_KEY) } catch { /* ignore */ }
                startGuest()
              }}
              style={devBtn}
            >
              DEV: guest tour
            </button>
          )}
        </div>
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
  // Which half of the screen the card sits in, decided ONCE from the first real
  // measurement of the target. A step that summons its own target — the discovery
  // rail, which arrives a few frames after rail-pin — has nothing to measure at
  // first, so the old code fell through to the bottom default and then snapped to
  // the top the instant the rail mounted. That flinch is what this removes. The
  // latch also stops a card hopping later if its target shifts mid-step.
  const [side, setSide] = useState<'top' | 'bottom' | null>(null)
  const sideDone = useRef(false)
  // A target that never mounts must not hide the card for good — there would be no
  // ✕ and no Skip left to get out with.
  const [lateShow, setLateShow] = useState(false)

  const target = step.type === 'nav'
    ? (navPhase === 'nav' ? `nav-${step.to}` : undefined)   // spotlight the tab, then explain (no dest spotlight)
    : step.target
  const ghost = step.type === 'spotlight' ? step.ghost : undefined

  // Whether this step's card is placed against its target at all. Step-level and
  // constant for the life of the layer, so the measuring loop can close over it.
  const sidesApply = !!target && step.type !== 'center' && !step.interactive
    && !step.cardOverride && !step.cardBottom

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
        const real = r.width > 0 && r.height > 0
        setRect(real ? r : null)
        // First real measurement wins, and only once it is actually on screen —
        // a rect still scrolling into view would pick the wrong half.
        if (real && sidesApply && !sideDone.current
            && r.bottom > 24 && r.top < window.innerHeight - 24) {
          sideDone.current = true
          setSide(r.top + r.height / 2 > window.innerHeight / 2 ? 'top' : 'bottom')
        }
      } else {
        setRect(null)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, sidesApply])

  // Empty deps: the layer remounts for every step, so this is once per step.
  useEffect(() => {
    const t = setTimeout(() => setLateShow(true), 600)
    return () => clearTimeout(t)
  }, [])

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
    isReveal ? 0.62 :
    centered ? 0.62 :
    interactive ? 0.35 :
    step.type === 'nav' ? (navPhase === 'arrive' ? 0.32 : 0.55) :
    step.cta ? 0.5 :
    0.65
  const dim = `rgba(0,0,0,${dimAmt})`

  // Card placement: opposite half from the target; bottom for interactive/no-hole gesture.
  let cardPos: React.CSSProperties
  if (step.cardOverride) {
    cardPos = step.cardOverride
  } else if (centered) {
    cardPos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (side === 'top' && !isReveal) {
    // isReveal overrides: the revealed image hangs above the card, so it needs the
    // bottom of the screen whatever the target said.
    cardPos = { top: step.cardTop ?? 'max(64px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)' }
  } else {
    // interactive (pinch) or explainer with no on-screen target → bottom, clear of the app
    cardPos = { bottom: 'calc(104px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }
  }

  // The swipe cat sits in the corner and bats left across the poster, so it anchors to
  // the target's bottom-right instead of its centre (where it would cover the art it is
  // asking you to swipe). Every other ghost stays centred on what it points at.
  const cornerGhost = ghost === 'swipe'
  const ghostPos: React.CSSProperties = cornerGhost && rect && inView
    ? { position: 'fixed', right: Math.max(8, vw - rect.right + 6), bottom: Math.max(8, vh - rect.bottom + 6) }
    : cornerGhost
    ? { position: 'fixed', right: 14, bottom: 'calc(var(--nav-height, 64px) + env(safe-area-inset-bottom) + 14px)' }
    : hasHole && rect
    ? { position: 'fixed', left: rect.left + rect.width / 2, top: rect.top + rect.height / 2, transform: 'translate(-50%,-50%)' }
    : demo
    ? { position: 'fixed', left: '50%', top: '44%', transform: 'translate(-50%,-50%)' }
    : { position: 'fixed', left: '50%', top: '42%', transform: 'translate(-50%,-50%)' }

  // DIMMING and BLOCKING are separate decisions. A step may want the screen fully
  // visible (noDim, nav-arrive) and still want every control but its own inert —
  // otherwise the tour talks about a screen while the user taps away underneath it
  // and the step's state drifts from the app's.
  const blocker = (visible: boolean): React.CSSProperties => ({
    position: 'fixed', background: visible ? dim : 'transparent',
    pointerEvents: 'auto', touchAction: 'none',
  })
  const isNavCta = step.type === 'nav' && navPhase === 'arrive'
  const showCta = centered || step.advance?.on === 'cta' || isNavCta || !!step.cta
  const showSkip = !showCta && (step.allowSkip || step.type === 'nav')
  const body = isNavCta ? (step.arriveBody ?? step.body) : step.body

  // Scrim: full + clickable for centered; 4 blockers around the hole for a spotlight.
  // Dim the whole screen ONLY for the welcome/finish cards. Explainer steps that talk
  // ABOUT a screen leave it fully visible; spotlight steps dim only around their target
  // (a specific button/icon). Interactive steps show the screen normally too.
  const fullScrim = centered || isReveal
  const fullScrimBlocks = centered || isReveal  // only these capture taps

  const placed = !sidesApply || side !== null || lateShow

  // A card with nothing to point at — the arrival half of a nav step, and the demo
  // explainers — covers the screen with an invisible shield, so the card's own button
  // is the only live control. NOT used when a step HAS a target that is merely
  // off-screen: the layer scrolls to it, and shielding there would strand the user on
  // a step they can no longer reach. Interactive (pinch) steps are never shielded.
  const shield = !centered && !isReveal && !interactive && (demo || !target)

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'none' }}>
      <style>{'@keyframes plaster-tour-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}100%{box-shadow:0 0 0 14px rgba(255,255,255,0)}}'}</style>

      {fullScrim && (
        <div style={{ position: 'fixed', inset: 0, background: dim, pointerEvents: fullScrimBlocks ? 'auto' : 'none' }} />
      )}

      {/* The shield: screen visible, nothing underneath reachable. */}
      {shield && (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', pointerEvents: 'auto', touchAction: 'none' }} />
      )}


      {hasHole && rect && (() => {
        const x = rect.left - PAD, y = rect.top - PAD, w = rect.width + PAD * 2, h = rect.height + PAD * 2
        return (
          <>
            {/* Always four blockers, so only the spotlit control is live. noDim just
                makes them invisible: it means "don't darken the screen", not "let
                them wander off". */}
            {(() => {
              const b = blocker(!step.noDim)
              return (
                <>
                  <div style={{ ...b, left: 0, top: 0, right: 0, height: Math.max(0, y) }} />
                  <div style={{ ...b, left: 0, top: y + h, right: 0, bottom: 0 }} />
                  <div style={{ ...b, left: 0, top: y, width: Math.max(0, x), height: h }} />
                  <div style={{ ...b, left: x + w, top: y, right: 0, height: h }} />
                </>
              )
            })()}
            {ghost !== 'drag' && (
              <div style={{ position: 'fixed', left: x, top: y, width: w, height: h, borderRadius: 10, border: '2px solid rgba(255,255,255,0.9)', pointerEvents: 'none', animation: 'plaster-tour-pulse 1.4s ease-out infinite' }} />
            )}
          </>
        )
      })()}

      {ghost && !isReveal && (
        <div style={{ ...ghostPos, pointerEvents: 'none' }}>
          {ghost === 'pinch'
            ? <PinchFlip size={340} />
            : ghost === 'swipe'
            ? <CatSwipe size={step.ghostSize ?? 230} />
            : <HandGhost variant={ghost} size={step.ghostSize ?? (ghost === 'tap' ? 120 : 190)} />}
        </div>
      )}

      {/* Coach-mark card */}
      {/* Held back until it knows where it belongs, then faded in. Steps with a fixed
          position or nothing to measure against are placed from the first frame. */}
      <div style={{ position: 'fixed', ...cardPos, width: step.cardWidth ?? 'min(360px, calc(100vw - 40px))', pointerEvents: placed ? 'auto' : 'none', background: 'var(--bg)', border: '1px solid var(--fg-15)', borderRadius: 16, boxShadow: '6px 8px 0 var(--tour-board)', opacity: placed ? 1 : 0, transition: 'opacity 140ms ease' }}>
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
              {body && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.55 }}>{body}</p>}

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
