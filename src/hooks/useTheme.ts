import { useState, useEffect } from 'react'

export type Theme = 'night' | 'day'

// ── Shared module-level state so ALL useTheme() instances stay in sync ────────
const _listeners = new Set<(t: Theme) => void>()

let _current: Theme = 'night'
try {
  const stored = localStorage.getItem('plaster-theme') as Theme | null
  if (stored === 'day' || stored === 'night') _current = stored
} catch {}

function _apply(theme: Theme) {
  _current = theme
  document.documentElement.setAttribute('data-theme', theme)
  try { localStorage.setItem('plaster-theme', theme) } catch {}
  _listeners.forEach((cb) => cb(theme))
}

// Apply synchronously on module load (no flash)
_apply(_current)

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(_current)

  useEffect(() => {
    // Register so this instance receives updates from any other instance
    _listeners.add(setTheme)
    // Re-sync in case state already diverged before mount
    if (theme !== _current) setTheme(_current)
    return () => { _listeners.delete(setTheme) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => _apply(_current === 'night' ? 'day' : 'night')
  const set    = (t: Theme) => _apply(t)

  return { theme, setTheme: set, toggle }
}
