import '@/lib/env' // Validates required env vars at boot. Throws fast if missing.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { StatusBar } from '@capacitor/status-bar'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

if (Capacitor.isNativePlatform()) {
  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => { /* silent */ })
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => { /* silent */ })
  // Capgo OTA: REQUIRED — tells the updater this bundle booted successfully.
  // Without it, every OTA update auto-rolls-back on the next launch.
  CapacitorUpdater.notifyAppReady().catch(() => { /* web / plugin absent */ })
}

// Block native browser pinch-zoom everywhere except the poster grid,
// which manages its own non-passive pinch listener with preventDefault.
// The grid's listener fires first (it's on a child element), so this
// document-level handler only catches touches on the nav, header, etc.
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length >= 2) e.preventDefault()
  },
  { passive: false },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Hide native splash as soon as the React tree is mounted
import('@capacitor/splash-screen').then(({ SplashScreen }) => {
  SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {/* no-op when web */})
})
