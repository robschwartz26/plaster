import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SuspendedBanner } from './SuspendedBanner'
import { TourOverlay, hasSeenTour } from './TourOverlay'

export function AppLayout() {
  // First-run: auto-show the tour once for a new user (persisted in localStorage).
  // Replayable any time from Settings → "Take a tour".
  const [tourOpen, setTourOpen] = useState(() => !hasSeenTour())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SuspendedBanner />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <BottomNav />
      <TourOverlay open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  )
}
