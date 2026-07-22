import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SafeArea, SystemBarsStyle } from '@capacitor-community/safe-area'

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
  // Match the native status-bar icons to the theme so they stay legible over the
  // transparent bar: light icons on the dark night bg, dark icons on the light
  // day bg. Android goes through the safe-area plugin (which owns the system
  // bars there); iOS uses @capacitor/status-bar.
  if (Capacitor.getPlatform() === 'android') {
    // SystemBarsStyle.Dark = dark bar treatment (light icons) → night;
    // .Light = light bar treatment (dark icons) → day.
    SafeArea.setSystemBarsStyle({
      style: theme === 'night' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => { /* silent */ })
  } else if (Capacitor.isNativePlatform()) {
    // iOS: Capacitor Style.Dark = light content for dark bg; Style.Light = dark
    // content for light bg.
    StatusBar.setStyle({ style: theme === 'night' ? Style.Dark : Style.Light }).catch(() => { /* silent */ })
  }
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
