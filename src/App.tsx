import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Wall } from './components/Wall'
import { ErrorBoundary } from './components/ErrorBoundary'

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
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/auth"       element={<AuthRoute><ErrorBoundary><AuthScreen /></ErrorBoundary></AuthRoute>} />
        <Route path="/admin"      element={<ErrorBoundary><Admin /></ErrorBoundary>} />
        <Route path="/onboarding" element={<ProtectedRoute><ErrorBoundary><Onboarding /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/"           element={<ProtectedRoute><ErrorBoundary><Wall /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/tonight"    element={<ProtectedRoute><ErrorBoundary><Tonight /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/lineup"     element={<ProtectedRoute><ErrorBoundary><LineUp /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/map"        element={<ProtectedRoute><ErrorBoundary><MapScreen /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/venues"     element={<ProtectedRoute><ErrorBoundary><VenuesScreen /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/msg"        element={<ProtectedRoute><ErrorBoundary><MsgScreen /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/venue/:id"  element={<ProtectedRoute><ErrorBoundary><VenueProfile /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/you"        element={<ProtectedRoute><ErrorBoundary><YouScreen /></ErrorBoundary></ProtectedRoute>} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
