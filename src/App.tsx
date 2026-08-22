import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Wall } from './components/Wall'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLayout } from './components/AppLayout'
import { SplashAnimation } from './components/SplashAnimation'
import { usePushNotifications } from './hooks/usePushNotifications'

// Heavy pages are code-split — loaded only when their route is visited.
// Admin includes Mapbox; splitting it out significantly reduces initial bundle.
const Admin        = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })))
const AuthScreen   = lazy(() => import('./pages/AuthScreen').then(m => ({ default: m.AuthScreen })))
const Onboarding   = lazy(() => import('./pages/OnboardingScreen').then(m => ({ default: m.OnboardingScreen })))
const YouScreen    = lazy(() => import('./pages/YouScreen').then(m => ({ default: m.YouScreen })))
const VenuesScreen = lazy(() => import('./pages/VenuesScreen').then(m => ({ default: m.VenuesScreen })))
const MsgScreen    = lazy(() => import('./pages/MsgScreen').then(m => ({ default: m.MsgScreen })))
const VenueProfile = lazy(() => import('./pages/VenueProfile').then(m => ({ default: m.VenueProfile })))
const Tonight      = lazy(() => import('./pages/TonightScreen').then(m => ({ default: m.TonightScreen })))
const LineUp       = lazy(() => import('./pages/LineUpScreen'))
const MapScreen    = lazy(() => import('./pages/MapScreen').then(m => ({ default: m.MapScreen })))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })))
const TermsOfUse    = lazy(() => import('./pages/TermsOfUse').then(m => ({ default: m.TermsOfUse })))
const Staff         = lazy(() => import('./pages/StaffScreen').then(m => ({ default: m.StaffScreen })))

// Redirects unauthenticated users to /auth
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />
  return <>{children}</>
}

// Redirects logged-in users away from /auth
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth()
  if (loading) return null
  if (user) {
    // profile=null means the fetch is still in flight — don't decide yet.
    // Returning null here prevents the "existing user lands on onboarding"
    // race: user becomes non-null before the profile fetch resolves.
    if (profile === null) return null
    if (!profile.username) return <Navigate to="/onboarding" replace />
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}


function AppRoutes() {
  usePushNotifications()
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Routes outside the app shell */}
        <Route path="/auth"       element={<AuthRoute><AuthScreen /></AuthRoute>} />
        <Route path="/admin"      element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/staff"      element={<ProtectedRoute><Staff /></ProtectedRoute>} />
        <Route path="/privacy"    element={<PrivacyPolicy />} />
        <Route path="/terms"      element={<TermsOfUse />} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

        {/* App shell with persistent BottomNav.
            Guest mode (Apple 5.1.1(v)): the shell itself is open — guests browse
            the Wall/Map/venues with no session. Only the account-based screens
            keep a ProtectedRoute (deep links there bounce to /auth); in-app,
            guests never see those tabs and gated actions open the GuestGate. */}
        <Route element={<AppLayout />}>
          <Route path="/"          element={<ErrorBoundary><Wall /></ErrorBoundary>} />
          <Route path="/lineup"    element={<ProtectedRoute><ErrorBoundary><LineUp /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/map"       element={<ErrorBoundary><MapScreen /></ErrorBoundary>} />
          <Route path="/msg"       element={<ProtectedRoute><ErrorBoundary><MsgScreen /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/you"              element={<ProtectedRoute><ErrorBoundary><YouScreen /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/profile/:username" element={<ProtectedRoute><ErrorBoundary><YouScreen /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/venues"    element={<ErrorBoundary><VenuesScreen /></ErrorBoundary>} />
          <Route path="/venue/:id" element={<ErrorBoundary><VenueProfile /></ErrorBoundary>} />
          <Route path="/tonight"   element={<ErrorBoundary><Tonight /></ErrorBoundary>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SplashAnimation />
        {/* Top-level boundary catches anything above the per-route boundaries —
            including lazy-chunk load failures after a redeploy (stale client
            requests a hashed chunk that no longer exists) and errors in
            AuthScreen/Admin/Onboarding, which have no boundary of their own.
            Without this, those throw to the root and white-screen the app. */}
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
