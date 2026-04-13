import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Wall } from './components/Wall'
import { Admin } from './pages/Admin'
import { AuthScreen } from './pages/AuthScreen'
import { OnboardingScreen } from './pages/OnboardingScreen'
import { YouScreen } from './pages/YouScreen'

function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--fg-30)',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 14,
        }}
      >
        {label} — coming soon
      </div>
    </div>
  )
}

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
    // If they haven't set a username yet, send to onboarding
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

      {/* Post-signup onboarding (requires auth) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute><OnboardingScreen /></ProtectedRoute>
        }
      />

      {/* Protected app routes */}
      <Route path="/" element={<ProtectedRoute><Wall /></ProtectedRoute>} />
      <Route path="/map" element={<ProtectedRoute><Placeholder label="Map" /></ProtectedRoute>} />
      <Route path="/venues" element={<ProtectedRoute><Placeholder label="Venues" /></ProtectedRoute>} />
      <Route path="/you" element={<ProtectedRoute><YouScreen /></ProtectedRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
