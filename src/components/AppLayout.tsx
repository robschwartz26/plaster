import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SuspendedBanner } from './SuspendedBanner'
import { InteractiveTourProvider } from './tour/InteractiveTour'

export function AppLayout() {
  // The interactive tour lives here (inside the router, above every tab screen) so it
  // can spotlight the bottom nav and walk you screen-to-screen. It auto-runs once for
  // a new user and is replayable from Settings → "Take a tour".
  return (
    <InteractiveTourProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SuspendedBanner />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </InteractiveTourProvider>
  )
}
