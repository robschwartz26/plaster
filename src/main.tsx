import '@/lib/env' // Validates required env vars at boot. Throws fast if missing.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
