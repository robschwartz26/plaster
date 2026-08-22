import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { type Session, type User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  avatar_full_url: string | null
  avatar_diamond_url: string | null
  bio: string | null
  is_public: boolean
  is_admin?: boolean
  is_ingester?: boolean
  interests: string[]
  created_at: string
  account_type: string | null
  pending_account_type: string | null
  home_neighborhood?: string | null
  home_sextant?: string | null
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  canIngest: boolean
  loading: boolean
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  verifySignupOtp: (email: string, token: string) => Promise<{ error: Error | null }>
  sendPasswordReset: (email: string) => Promise<{ error: Error | null }>
  verifyPasswordResetOtp: (email: string, token: string) => Promise<{ error: Error | null }>
  updatePassword: (password: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // The profile currently loaded (or in-flight). Lets us skip the clear+refetch
  // on TOKEN_REFRESHED / foreground-resume events where the user is unchanged —
  // those fire ~hourly and previously nulled `profile` app-wide, wiping the
  // LINE UP feed to "Loading…", clearing in-progress edits, and flickering admin UI.
  const loadedProfileIdRef = useRef<string | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      // Distinguish "no row yet" (PGRST116) from a real fetch failure. A real
      // failure must NOT null an already-loaded profile (that would blank
      // profile-gated UI on a flaky network); one retry, then leave prior state.
      if (error.code === 'PGRST116') { setProfile(null); loadedProfileIdRef.current = userId }
      else {
        const { data: retry } = await supabase.from('profiles').select('*').eq('id', userId).single()
        if (retry) { setProfile(retry); loadedProfileIdRef.current = userId }
      }
      return
    }
    setProfile(data ?? null)
    loadedProfileIdRef.current = userId
  }, [])

  const refreshProfile = useCallback(async () => {
    const id = loadedProfileIdRef.current
    if (id) await fetchProfile(id)
  }, [fetchProfile])

  useEffect(() => {
    // Load initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      const newId = session?.user?.id ?? null
      if (newId) {
        // Only churn when the actual user changed. TOKEN_REFRESHED / resume
        // events keep the same id → update the session object but leave user,
        // profile, and every downstream subscription/feed untouched.
        if (newId !== loadedProfileIdRef.current) {
          setUser(session!.user)
          setProfile(null)
          fetchProfile(newId)
        }
      } else {
        setUser(null)
        setProfile(null)
        loadedProfileIdRef.current = null
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error as Error | null }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function verifySignupOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' })
    return { error: error as Error | null }
  }

  // Password recovery, OTP-code style (no deep link needed — mirrors signup).
  // Emails a recovery code; requires the Supabase "Reset Password" template to
  // include {{ .Token }} so the user receives a 6-digit code, not just a link.
  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return { error: error as Error | null }
  }

  // Verifies the recovery code and establishes a (recovery) session so the new
  // password can be set with updatePassword below.
  async function verifyPasswordResetOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    return { error: error as Error | null }
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    return { error: error as Error | null }
  }

  const isAdmin = profile?.is_admin === true
  const canIngest = (profile?.is_admin || profile?.is_ingester) === true

  // Memoize so the context value identity only changes when real state does —
  // otherwise every AuthProvider render pushes a new object to every consumer.
  // The auth action functions are stable module-level closures over `supabase`.
  const value = useMemo<AuthContextValue>(() => ({
    user, session, profile, isAdmin, canIngest, loading,
    signUp, signIn, signOut, refreshProfile,
    verifySignupOtp, sendPasswordReset, verifyPasswordResetOtp, updatePassword,
  }), [user, session, profile, isAdmin, canIngest, loading, refreshProfile])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
