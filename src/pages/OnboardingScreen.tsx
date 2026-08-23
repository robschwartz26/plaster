import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { isObjectionable } from '@/lib/contentFilter'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader } from '@/components/PlasterHeader'
import { Diamond } from '@/components/Diamond'
import { hashPhone, hashEmail } from '@/lib/contactHash'
import { pickFromCamera, pickFromLibrary, type PickImageOutcome } from '@/lib/pickImage'
import { CameraDeniedSheet } from '@/components/CameraDeniedSheet'
import { AvatarUploader, type AvatarUploaderRef } from '@/components/AvatarUploader'
import { FindFriends } from '@/components/FindFriends'
import { NearbyVenues } from '@/components/NearbyVenues'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { TOUR_SEEN_KEY, TOUR_STEP_KEY } from '@/components/tour/InteractiveTour'
import { SEXTANT_LABELS, type Sextant } from '@/lib/neighborhoods'

const INTERESTS = [
  'Music', 'Art', 'Comedy', 'Dance', 'Film',
  'Food & Drink', 'Sports', 'Community', 'Outdoors', 'Tech',
]

type Step = 'username' | 'account_type' | 'neighborhood' | 'avatar' | 'interests' | 'phone' | 'find_friends' | 'nearby_venues' | 'welcome'

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>('username')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [accountChoice, setAccountChoice] = useState<'person' | 'artist' | 'venue' | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const uploaderRef = useRef<AvatarUploaderRef>(null)
  const [neighborhood, setNeighborhood] = useState<string | null>(null)
  const [sextant, setSextant] = useState<Sextant | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [deniedWhich, setDeniedWhich] = useState<'camera' | 'photos' | null>(null)
  const [busy, setBusy] = useState(false)
  const { user, profile, refreshProfile, canIngest } = useAuth()
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
    // Objectionable-content gate (Apple 1.2) — no slurs/hate in handles.
    if (isObjectionable(clean)) {
      setUsernameError('Please choose a different username')
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
    await refreshProfile()
    // Staff accounts skip the consumer onboarding steps and go directly to the staff dashboard
    if (canIngest) { navigate('/staff'); return }
    setStep('account_type')
  }

  // ── Step 2: account type ──────────────────────────────────────
  async function submitAccountType() {
    if (!user || !accountChoice) return
    setBusy(true)

    // For VA choices, set pending_account_type. account_type stays 'person' until admin approves.
    if (accountChoice === 'artist' || accountChoice === 'venue') {
      const { error } = await supabase
        .from('profiles')
        .update({ pending_account_type: accountChoice })
        .eq('id', user.id)
      if (error) {
        console.error('[Onboarding] pending_account_type update failed:', error.message)
        // Non-fatal: continue to next step. User can re-request via support if it doesn't take.
      }
    }
    // For 'person', no DB write needed — account_type already defaults to 'person'

    setBusy(false)
    setStep('neighborhood')
  }

  // ── Step 3: neighborhood ─────────────────────────────────────
  async function submitNeighborhood() {
    if (!user || !neighborhood || !sextant) return
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({ home_neighborhood: neighborhood, home_sextant: sextant })
      .eq('id', user.id)
    setBusy(false)
    if (error) { console.error('[Onboarding] neighborhood update failed:', error.message); return }
    await refreshProfile()
    setStep('avatar')
  }

  // ── Step 3: avatar ───────────────────────────────────────────
  function handlePickOutcome(outcome: PickImageOutcome) {
    if (outcome.status === 'success') {
      uploaderRef.current?.openWith(outcome.file)
    } else if (outcome.status === 'denied') {
      setDeniedWhich(outcome.which)
    } else if (outcome.status === 'error') {
      console.error('[Onboarding] pick image error:', outcome.message)
    }
    // 'cancelled' → do nothing
  }

  async function takePhoto() {
    handlePickOutcome(await pickFromCamera())
  }

  async function chooseFromLibrary() {
    handlePickOutcome(await pickFromLibrary())
  }

  function submitAvatar() {
    // AvatarUploader handles upload + profile write in onDone; just advance
    setStep('interests')
  }

  // ── Step 4: interests ────────────────────────────────────────
  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    )
  }

  async function submitInterests() {
    if (!user) return
    setBusy(true)
    await supabase.from('profiles').update({ interests }).eq('id', user.id)
    setBusy(false)
    setStep('phone')
  }

  // ── Step 5: phone ────────────────────────────────────────────
  async function submitPhone() {
    if (!user) return
    const ph = await hashPhone(phone)
    if (ph === null) { setPhoneError('Enter a valid phone number'); return }
    const eh = user.email ? await hashEmail(user.email) : null
    setBusy(true)
    try {
      await supabase.from('profiles').update({
        phone_hash: ph,
        ...(eh ? { email_hash: eh } : {}),
      }).eq('id', user.id)
      await refreshProfile()
      setStep('find_friends')
    } catch (err) {
      console.error('[Onboarding] submitPhone failed:', err)
    } finally {
      setBusy(false)
    }
  }

  async function skipPhone() {
    if (!user) return
    const eh = user.email ? await hashEmail(user.email) : null
    if (eh) {
      await supabase.from('profiles').update({ email_hash: eh }).eq('id', user.id)
    }
    await refreshProfile()
    setStep('find_friends')
  }

  // ── Render ───────────────────────────────────────────────────

  // find_friends + welcome are full-screen — render outside the normal shell
  if (step === 'find_friends') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 10 }}>
        <FindFriends onDone={() => { refreshProfile(); setStep('nearby_venues') }} />
      </div>
    )
  }

  if (step === 'nearby_venues') {
    return <NearbyVenues onDone={() => setStep('welcome')} />
  }

  if (step === 'welcome') {
    return (
      <WelcomeScreen
        avatarUrl={avatarPreview ?? profile?.avatar_diamond_url ?? null}
        onEnter={() => {
          // A fresh signup just finished — force the interactive tour to auto-run
          // for this new user. The tour's auto-start is gated by a DEVICE-level
          // "seen" flag, which a previous account on this device may have set;
          // clearing it (plus any stale resume step) guarantees every new signup
          // gets the walkthrough, even on a shared/returning device. Existing users
          // skip onboarding entirely, so they're unaffected (and can still replay
          // from Settings → "Take a tour").
          try { localStorage.removeItem(TOUR_SEEN_KEY); localStorage.removeItem(TOUR_STEP_KEY) } catch { /* ignore */ }
          navigate('/', { replace: true })
        }}
      />
    )
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

      {/* Step counter */}
      <p style={{ color: 'var(--fg-40)', fontSize: 13, margin: '0 0 36px', fontFamily: '"Space Grotesk", sans-serif', textAlign: 'center' }}>
        step {step === 'username' ? 1 : step === 'account_type' ? 2 : step === 'neighborhood' ? 3 : step === 'avatar' ? 4 : step === 'interests' ? 5 : 6} of 7
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

      {step === 'account_type' && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={headingStyle}>What kind of account is this?</h2>

          <button
            onClick={() => setAccountChoice('person')}
            style={accountCardStyle(accountChoice === 'person')}
          >
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>Personal</div>
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', marginTop: 4 }}>For fans and friends</div>
          </button>

          <button
            onClick={() => setAccountChoice('artist')}
            style={accountCardStyle(accountChoice === 'artist')}
          >
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>Artist</div>
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', marginTop: 4 }}>For bands, solo artists, performers</div>
          </button>

          <button
            onClick={() => setAccountChoice('venue')}
            style={accountCardStyle(accountChoice === 'venue')}
          >
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>Venue</div>
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', marginTop: 4 }}>For bars, clubs, event spaces</div>
          </button>

          <button
            onClick={submitAccountType}
            disabled={busy || !accountChoice}
            style={{ ...btnStyle(busy), marginTop: 8, opacity: (busy || !accountChoice) ? 0.5 : 1 }}
          >
            {busy ? '…' : 'Continue'}
          </button>
        </div>
      )}

      {step === 'neighborhood' && (
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={headingStyle}>Which neighborhood is yours?</h2>
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', textAlign: 'center', margin: '-4px 0 4px', lineHeight: 1.5 }}>
            {sextant
              ? <>Your chip shows <strong style={{ color: 'var(--fg)' }}>{neighborhood}</strong> · your community wall covers all of {SEXTANT_LABELS[sextant]} Portland. Change it anytime.</>
              : "You'll see your community wall and local alerts for here — change it anytime."}
          </p>
          <NeighborhoodPicker value={neighborhood} onChange={(name, sx) => { setNeighborhood(name); setSextant(sx) }} />
          <button onClick={submitNeighborhood} disabled={busy || !neighborhood} style={{ ...btnStyle(busy), opacity: (busy || !neighborhood) ? 0.5 : 1 }}>
            {busy ? '…' : 'Continue'}
          </button>
        </div>
      )}

      {step === 'avatar' && !cropOpen && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <h2 style={headingStyle}>Add a photo</h2>
          <div>
            {avatarPreview
              ? <Diamond diamondUrl={avatarPreview} size={100} />
              : (
                <div style={{ position: 'relative', width: 100, height: 100 }}>
                  <svg width={100} height={100} viewBox="0 0 100 100" fill="none" style={{ display: 'block' }}>
                    <polygon points="50,5 95,50 50,95 5,50" fill="var(--fg-08)" stroke="var(--fg-25)" strokeWidth="1.5" strokeDasharray="5 4" />
                  </svg>
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--fg-40)', pointerEvents: 'none' }}>+</span>
                </div>
              )
            }
          </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={takePhoto}
                disabled={busy}
                style={outlineBtnStyle(busy)}
              >
                Take Photo
              </button>
              <button
                onClick={chooseFromLibrary}
                disabled={busy}
                style={outlineBtnStyle(busy)}
              >
                Choose from Library
              </button>
            </div>
            <button onClick={submitAvatar} style={btnStyle(false)}>
              {avatarPreview ? 'Continue' : 'Skip'}
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
            {busy ? '…' : interests.length > 0 ? 'Continue' : 'Skip'}
          </button>
        </div>
      )}

      {step === 'phone' && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={headingStyle}>Let your friends find you</h2>
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg)', textAlign: 'center', margin: '0 0 4px', fontWeight: 500 }}>
            Add your number so friends who have it can find you on Plaster.
          </p>
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-55)', textAlign: 'center', margin: '0 0 8px' }}>
            <strong style={{ color: 'var(--fg)', fontWeight: 700 }}>We don't sell phone, email, contacts, or personal info — ever. Period.</strong>{' '}
            Not to advertisers, marketers, or spammers. No exceptions, no fine print. We use it for one thing only: helping you find your friends on Plaster. Don't want to? Skip it — you can always add it later.
          </p>
          <input
            type="tel"
            inputMode="tel"
            placeholder="Your phone number"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setPhoneError(null) }}
            style={inputStyle}
          />
          {phoneError && <p style={errorStyle}>{phoneError}</p>}
          <button onClick={submitPhone} disabled={busy} style={btnStyle(busy)}>
            {busy ? '…' : 'Continue'}
          </button>
          <button
            onClick={skipPhone}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fg-55)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 14,
              padding: '10px',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            Skip for now
          </button>
        </div>
      )}
      </div>

      <CameraDeniedSheet
        open={deniedWhich !== null}
        which={deniedWhich ?? 'camera'}
        onClose={() => setDeniedWhich(null)}
        onChooseLibrary={deniedWhich === 'camera' ? () => { setDeniedWhich(null); chooseFromLibrary() } : undefined}
      />

      {user && (
        <AvatarUploader
          ref={uploaderRef}
          userId={user.id}
          onDone={(_fullUrl, diamondUrl) => {
            setAvatarPreview(diamondUrl)
            refreshProfile()
          }}
          onCancel={() => {}}
          onCropOpenChange={setCropOpen}
        />
      )}
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

function outlineBtnStyle(busy: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '13px 0',
    borderRadius: 14,
    border: '1.5px solid var(--fg-25)',
    background: 'transparent',
    color: busy ? 'var(--fg-40)' : 'var(--fg)',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 14,
    fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer',
    transition: 'opacity 150ms ease',
  }
}

function accountCardStyle(selected: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '16px 18px',
    borderRadius: 12,
    border: `1.5px solid ${selected ? 'var(--fg)' : 'var(--fg-18)'}`,
    background: selected ? 'var(--fg-08)' : 'transparent',
    color: 'var(--fg)',
    fontFamily: '"Space Grotesk", sans-serif',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    display: 'block',
  }
}
