// Tiny event bus so real gesture/click handlers can advance the interactive tour
// without importing React context. Handlers call reportTourAction(id); the tour only
// listens while active, and reportTourAction no-ops otherwise (zero overhead normally).
let active = false

export function setTourActive(v: boolean) { active = v }

export function reportTourAction(id: string) {
  if (!active) return
  try { window.dispatchEvent(new CustomEvent('plaster-tour-action', { detail: id })) } catch { /* ignore */ }
}
