import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader } from '@/components/PlasterHeader'

const INTERESTS = [
  'Music', 'Art', 'Comedy', 'Dance', 'Film',
  'Food & Drink', 'Sports', 'Community', 'Outdoors', 'Tech',
]

type Step = 'username' | 'avatar' | 'interests'

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>('username')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // ── Step 1: username ─────────────────────────────────────────
  async function submitUsername() {
    if (!user) return
    const clean = username.replace(/^@/, '').trim()
    if (!clean) { setUsernameError('Username is required'); return }
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(clean)) {
      setUsernameError('2–30 chars, letters/numbers/underscores only')
      return
    }
    setBusy(true)
    // upsert (not update) — if no profile row exists yet (DB trigger not yet run
    // for this user), update is a silent no-op. upsert ensures the row is created.
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: clean }, { onConflict: 'id' })
    setBusy(false)
    if (error) {
      setUsernameError(error.code === '23505' ? 'Username taken — try another' : error.message)
      return
    }
    setStep('avatar')
  }

  // ── Step 2: avatar ───────────────────────────────────────────
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function submitAvatar() {
    if (!user) return
    if (avatarFile) {
      setBusy(true)
      const ext = avatarFile.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })
      if (uploadErr) {
        console.error('[Onboarding] avatar upload failed:', uploadErr.message)
      } else {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        console.log('[Onboarding] avatar publicUrl:', publicUrl)
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', user.id)
        if (updateErr) console.error('[Onboarding] profile avatar_url update failed:', updateErr.message)
      }
      setBusy(false)
    }
    setStep('interests')
  }

  // ── Step 3: interests ────────────────────────────────────────
  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    )
  }

  async function submitInterests() {
    if (!user) return
    setBusy(true)
    await supabase.from('profiles').update({ interests }).eq('id', user.id)
    await refreshProfile()
    setBusy(false)
    navigate('/', { replace: true })
  }

  // ── Render ───────────────────────────────────────────────────
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

      {/* Step counter */}
      <p style={{ color: 'var(--fg-40)', fontSize: 13, margin: '0 0 36px', fontFamily: '"Space Grotesk", sans-serif', textAlign: 'center' }}>
        step {step === 'username' ? 1 : step === 'avatar' ? 2 : 3} of 3
      </p>

      {/* Centered content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px', marginTop: -60 }}>

      {step === 'username' && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={headingStyle}>Pick your username</h2>
          <input
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setUsernameError(null) }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={inputStyle}
          />
          {usernameError && <p style={errorStyle}>{usernameError}</p>}
          <button onClick={submitUsername} disabled={busy} style={btnStyle(busy)}>
            {busy ? '…' : 'Continue'}
          </button>
        </div>
      )}

      {step === 'avatar' && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <h2 style={headingStyle}>Add a photo</h2>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: avatarPreview ? 'transparent' : 'var(--fg-08)',
              border: '2px dashed var(--fg-25)',
              overflow: 'hidden',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatarPreview
              ? <img src={avatarPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 32 }}>+</span>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: 'none' }} />
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={submitAvatar} disabled={busy} style={btnStyle(busy)}>
              {busy ? 'Uploading…' : avatarPreview ? 'Save & continue' : 'Skip'}
            </button>
          </div>
        </div>
      )}

      {step === 'interests' && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={headingStyle}>What are you into?</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTERESTS.map((interest) => {
              const selected = interests.includes(interest)
              return (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 20,
                    border: `1.5px solid ${selected ? 'var(--fg)' : 'var(--fg-25)'}`,
                    background: selected ? 'var(--fg)' : 'transparent',
                    color: selected ? 'var(--bg)' : 'var(--fg-65)',
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {interest}
                </button>
              )
            })}
          </div>
          <button onClick={submitInterests} disabled={busy} style={{ ...btnStyle(busy), marginTop: 8 }}>
            {busy ? '…' : interests.length > 0 ? 'Finish' : 'Skip'}
          </button>
        </div>
      )}
      </div>
    </div>
  )
}

const headingStyle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--fg)',
  margin: '0 0 4px',
  textAlign: 'center' as const,
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
  boxSizing: 'border-box' as const,
}

const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: 13,
  margin: 0,
}

function btnStyle(busy: boolean): React.CSSProperties {
  return {
    width: '100%',
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
  }
}
