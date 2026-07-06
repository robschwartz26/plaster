// Tiny event bus so real gesture/click handlers can advance the interactive tour
// without importing React context. Handlers call reportTourAction(id); the tour only
// listens while active, and reportTourAction no-ops otherwise (zero overhead normally).
let active = false
let interceptedAction: string | null = null

export function setTourActive(v: boolean) { active = v; if (!v) interceptedAction = null }

export function reportTourAction(id: string) {
  if (!active) return
  try { window.dispatchEvent(new CustomEvent('plaster-tour-action', { detail: id })) } catch { /* ignore */ }
}

// Intercept: while the tour is on a step that wants to intercept a control (e.g. the
// Slap button during the slap step), the control reports the action INSTEAD of running
// its normal behavior (so tapping Slap advances the tour without opening the sheet).
export function setInterceptedAction(id: string | null) { interceptedAction = id }
export function isIntercepted(id: string) { return active && interceptedAction === id }
