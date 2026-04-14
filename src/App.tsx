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
    if (!profile?.username) return <Navigate to="/onboarding" replace />
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function MapPlaceholder() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      color: 'var(--fg-30)',
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: 14,
    }}>
      Map — coming soon
    </div>
  )
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
        <Route path="/map"        element={<ProtectedRoute><MapPlaceholder /></ProtectedRoute>} />
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
