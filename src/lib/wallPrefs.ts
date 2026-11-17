import { useEffect, useState } from 'react'

// Wall personalization — device-level preferences (localStorage, no account
// round-trip): hide whole categories from the wall, bump chip legibility,
// and cap how far the grid zooms out. Saved from Settings → Personalize the
// wall; the Wall listens for the change event so an open wall updates live.

export interface WallPrefs {
  hiddenCats: string[]
  chipSize: 'standard' | 'large'
  maxCols: 3 | 4 | 5
}

export const DEFAULT_WALL_PREFS: WallPrefs = {
  hiddenCats: [],
  chipSize: 'standard',
  maxCols: 5,
}

const KEY = 'wall-prefs-v1'
export const WALL_PREFS_EVENT = 'plaster-wall-prefs'
const EVENT = WALL_PREFS_EVENT

export function loadWallPrefs(): WallPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_WALL_PREFS
    const p = JSON.parse(raw)
    return {
      hiddenCats: Array.isArray(p.hiddenCats) ? p.hiddenCats.filter((c: unknown) => typeof c === 'string') : [],
      chipSize: p.chipSize === 'large' ? 'large' : 'standard',
      maxCols: [3, 4, 5].includes(p.maxCols) ? p.maxCols : 5,
    }
  } catch {
    return DEFAULT_WALL_PREFS
  }
}

export function saveWallPrefs(prefs: WallPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useWallPrefs(): WallPrefs {
  const [prefs, setPrefs] = useState<WallPrefs>(loadWallPrefs)
  useEffect(() => {
    const onChange = () => setPrefs(loadWallPrefs())
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])
  return prefs
}
