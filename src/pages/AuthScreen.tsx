import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

type Tab = 'signin' | 'signup'

export function AuthScreen() {
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (tab === 'signin') {
        const { error } = await signIn(email, password)
        if (error) { setError(error.message); return }
        navigate('/', { replace: true })
      } else {
        const { error } = await signUp(email, password)
        if (error) { setError(error.message); return }
        navigate('/onboarding', { replace: true })
      }
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 28px',
      }}
    >
      {/* Wordmark */}
      <span
        style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 38,
          fontWeight: 900,
          color: 'var(--fg)',
          letterSpacing: '-0.02em',
          marginBottom: 48,
          lineHeight: 1,
        }}
      >
        plaster
      </span>

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
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
          style={inputStyle}
        />

        {error && (
          <p style={{ color: '#f87171', fontSize: 13, margin: 0, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
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
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          {busy ? '…' : tab === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
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
