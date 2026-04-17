import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Wall } from './components/Wall'

// Heavy pages are code-split — loaded only when their route is visited.
// Admin includes Mapbox; splitting it out significantly reduces initial bundle.
const Admin        = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })))
const AuthScreen   = lazy(() => import('./pages/AuthScreen').then(m => ({ default: m.AuthScreen })))
const Onboarding   = lazy(() => import('./pages/OnboardingScreen').then(m => ({ default: m.OnboardingScreen })))
const YouScreen    = lazy(() => import('./pages/YouScreen').then(m => ({ default: m.YouScreen })))
const VenuesScreen = lazy(() => import('./pages/VenuesScreen').then(m => ({ default: m.VenuesScreen })))
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
        <Route path="/auth"       element={<AuthRoute><AuthScreen /></AuthRoute>} />
        <Route path="/admin"      element={<Admin />} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/"           element={<ProtectedRoute><Wall /></ProtectedRoute>} />
        <Route path="/tonight"    element={<ProtectedRoute><Tonight /></ProtectedRoute>} />
        <Route path="/lineup"     element={<ProtectedRoute><LineUp /></ProtectedRoute>} />
        <Route path="/map"        element={<ProtectedRoute><MapScreen /></ProtectedRoute>} />
        <Route path="/venues"     element={<ProtectedRoute><VenuesScreen /></ProtectedRoute>} />
        <Route path="/venue/:id"  element={<ProtectedRoute><VenueProfile /></ProtectedRoute>} />
        <Route path="/you"        element={<ProtectedRoute><YouScreen /></ProtectedRoute>} />
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
