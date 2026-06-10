// TEAR LAB — dev-only diagnostic for the 1-col panel tear. Active only when the URL
// has ?tearlab. Each toggle isolates one suspected cause; flip one at a time, reload,
// and run the repro to convict. Inert in production (tearOn() is always false without
// ?tearlab). Remove this file + TearLab.tsx + the PosterCard hooks once convicted.

export const TEARLAB = typeof window !== 'undefined' && window.location.search.includes('tearlab')

export const TEAR_TOGGLES = ['A', 'B', 'C', 'D', 'E'] as const
export type TearToggle = typeof TEAR_TOGGLES[number]

export const TEAR_LABELS: Record<TearToggle, string> = {
  A: 'A · static content (no fetch)',
  B: 'B · info: no inner scroller',
  C: 'C · poke scroller on arrival',
  D: 'D · no root fade trio',
  E: 'E · scroller own layer (translateZ)',
}

export function tearOn(t: TearToggle): boolean {
  if (!TEARLAB) return false
  try { return sessionStorage.getItem('tearlab.' + t) === '1' } catch { return false }
}

export function setTear(t: TearToggle, on: boolean) {
  try { sessionStorage.setItem('tearlab.' + t, on ? '1' : '0') } catch { /* noop */ }
}

// ~80-word filler used by toggle A so renderInfo paints fixed content (no fetch).
export const TEAR_LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure ' +
  'dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ' +
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt ' +
  'mollit anim id est laborum, sed ut perspiciatis unde omnis iste natus error.'
