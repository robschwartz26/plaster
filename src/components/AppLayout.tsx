import { Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from './BottomNav'
import { SuspendedBanner } from './SuspendedBanner'
import { InteractiveTourProvider } from './tour/InteractiveTour'
import { GuestGateProvider } from './GuestGate'

export function AppLayout() {
  // Hold first paint until the session check resolves. Otherwise a cold start
  // with a stored session flashes the guest UI (3-tab nav) for a beat before
  // flipping to the signed-in one. The splash animation covers this gap.
  const { loading } = useAuth()
  if (loading) return null

  // The interactive tour lives here (inside the router, above every tab screen) so it
  // can spotlight the bottom nav and walk you screen-to-screen. It auto-runs once for
  // a new user and is replayable from Settings → "Take a tour".
  // GuestGate lives here too: any screen in the shell can gate an account-based
  // action behind the sign-up sheet (guest mode, Apple 5.1.1(v)).
  return (
    <GuestGateProvider>
      <InteractiveTourProvider>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <SuspendedBanner />
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Outlet />
          </div>
          <BottomNav />
        </div>
      </InteractiveTourProvider>
    </GuestGateProvider>
  )
}
