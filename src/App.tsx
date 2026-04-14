import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Wall } from './components/Wall'
import { Admin } from './pages/Admin'
import { AuthScreen } from './pages/AuthScreen'
import { OnboardingScreen } from './pages/OnboardingScreen'
import { YouScreen } from './pages/YouScreen'
import { VenuesScreen } from './pages/VenuesScreen'
import { VenueProfile } from './pages/VenueProfile'
import { TonightScreen } from './pages/TonightScreen'

// Redirects unauthenticated users to /auth
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null // avoid flash

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }
  return <>{children}</>
}

// Redirect logged-in users away from /auth
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth()

  if (loading) return null

  if (user) {
    if (!profile?.username) return <Navigate to="/onboarding" replace />
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<AuthRoute><AuthScreen /></AuthRoute>} />
      <Route path="/admin" element={<Admin />} />

      {/* Post-signup onboarding */}
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingScreen /></ProtectedRoute>} />

      {/* Protected app routes */}
      <Route path="/"        element={<ProtectedRoute><Wall /></ProtectedRoute>} />
      <Route path="/tonight" element={<ProtectedRoute><TonightScreen /></ProtectedRoute>} />
      <Route path="/map"     element={<ProtectedRoute><MapPlaceholder /></ProtectedRoute>} />
      <Route path="/venues"  element={<ProtectedRoute><VenuesScreen /></ProtectedRoute>} />
      <Route path="/venue/:id" element={<ProtectedRoute><VenueProfile /></ProtectedRoute>} />
      <Route path="/you"     element={<ProtectedRoute><YouScreen /></ProtectedRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
