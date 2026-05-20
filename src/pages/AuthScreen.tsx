import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader } from '@/components/PlasterHeader'

type Tab = 'signin' | 'signup'

const RESEND_COOLDOWN = 60

export function AuthScreen() {
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { signIn, signUp } = useAuth()

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [])

  function startCooldown() {
    setResendCooldown(RESEND_COOLDOWN)
    cooldownRef.current = setInterval(() => {
      setResendCooldown((n) => {
        if (n <= 1) { clearInterval(cooldownRef.current!); return 0 }
        return n - 1
      })
    }, 1000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (tab === 'signin') {
        const { error } = await signIn(email, password)
        if (error) { setError(error.message); return }
      } else {
        if (!agreedToTerms) {
          setError('Please agree to the Terms of Use and Privacy Policy to continue.')
          return
        }
        const { error } = await signUp(email, password)
        if (error) { setError(error.message); return }
        setEmailSent(true)
        startCooldown()
      }
      // Don't navigate here — AuthRoute reads the actual profile and decides:
      //   username set   → Wall (/)
      //   username empty → Onboarding (/onboarding)
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || busy) return
    setError(null)
    setBusy(true)
    try {
      const { error } = await signUp(email, password)
      if (error) { setError(error.message); return }
      startCooldown()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PlasterHeader actions={<span />} />

      {/* Centered content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px' }}>

      {emailSent ? (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>✉️</div>
          <h2 style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--fg)' }}>
            Check your email
          </h2>
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.6 }}>
            We sent a confirmation link to<br />
            <strong style={{ color: 'var(--fg)' }}>{email}</strong>.<br />
            Tap it to confirm and enter Plaster.
          </p>
          {error && (
            <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>
          )}
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0 || busy}
            style={{
              marginTop: 8,
              padding: '13px 0',
              width: '100%',
              borderRadius: 14,
              border: '1.5px solid var(--fg-25)',
              background: 'transparent',
              color: resendCooldown > 0 ? 'var(--fg-40)' : 'var(--fg)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 14,
              fontWeight: 600,
              cursor: resendCooldown > 0 || busy ? 'not-allowed' : 'pointer',
              transition: 'color 150ms ease',
            }}
          >
            {busy ? '…' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Didn't get it? Resend"}
          </button>
          <button
            onClick={() => { setEmailSent(false); setError(null) }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fg-40)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>

      {/* Tab toggle */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: 340,
          background: 'var(--fg-08)',
          borderRadius: 12,
          padding: 3,
          marginBottom: 24,
        }}
      >
        {(['signin', 'signup'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null) }}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 10,
              border: 'none',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
              background: tab === t ? 'var(--fg)' : 'transparent',
              color: tab === t ? 'var(--bg)' : 'var(--fg-55)',
            }}
          >
            {t === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        ))}
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={inputStyle}
        />
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
            style={{ ...inputStyle, paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(s => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              padding: 6,
              cursor: 'pointer',
              color: 'var(--fg-55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {tab === 'signup' && (
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '6px 4px 0',
              cursor: 'pointer',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 12,
              color: 'var(--fg-65)',
              lineHeight: 1.4,
            }}
          >
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              style={{
                marginTop: 2,
                width: 16,
                height: 16,
                cursor: 'pointer',
                accentColor: '#A855F7',
                flexShrink: 0,
              }}
            />
            <span>
              I agree to the{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#A855F7', textDecoration: 'underline' }}
              >Terms of Use</a>
              {' '}and{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#A855F7', textDecoration: 'underline' }}
              >Privacy Policy</a>.
              I will not post objectionable content.
            </span>
          </label>
        )}

        {error && (
          <p style={{ color: '#f87171', fontSize: 13, margin: 0, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || (tab === 'signup' && !agreedToTerms)}
          style={{
            marginTop: 4,
            padding: '14px 0',
            borderRadius: 14,
            border: 'none',
            background: 'var(--fg)',
            color: 'var(--bg)',
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 15,
            fontWeight: 700,
            cursor: (busy || (tab === 'signup' && !agreedToTerms)) ? 'not-allowed' : 'pointer',
            opacity: (busy || (tab === 'signup' && !agreedToTerms)) ? 0.5 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          {busy ? '…' : tab === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
        </>
      )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: 12,
  border: '1.5px solid var(--fg-18)',
  background: 'var(--fg-08)',
  color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
}
