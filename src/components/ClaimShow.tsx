import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { isValidMusicUrl } from '@/lib/musicEmbed'
import { MusicUrlInput } from '@/components/MusicUrlInput'
import { fetchMyClaim, submitClaim, withdrawClaim, type MyClaim } from '@/lib/eventClaims'

// Artist-only "this is my show" claim UI, shown in the poster info panel.
// The artist pastes a per-show track; the claim is pending until an admin approves.
// Renders nothing for non-artist accounts and signed-out viewers.
export function ClaimShow({ eventId, active }: { eventId: string; active: boolean }) {
  const { user, profile } = useAuth()
  const isArtist = profile?.account_type === 'artist'

  const [claim, setClaim] = useState<MyClaim | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [trackUrl, setTrackUrl] = useState('')
  const [effective, setEffective] = useState('')
  const [valid, setValid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active || !user || !isArtist) return
    let cancelled = false
    fetchMyClaim(eventId, user.id).then(c => { if (!cancelled) { setClaim(c); setLoaded(true) } })
    return () => { cancelled = true }
  }, [active, user?.id, isArtist, eventId])

  if (!user || !isArtist) return null

  async function submit() {
    if (!user) return
    const url = effective.trim()
    if (!url || !isValidMusicUrl(url)) { setError('Paste a Spotify or Bandcamp link.'); return }
    setBusy(true); setError(null)
    const { error: e } = await submitClaim(eventId, user.id, url)
    setBusy(false)
    if (e) { setError(e); return }
    setOpen(false); setTrackUrl(''); setEffective(''); setValid(false)
    const c = await fetchMyClaim(eventId, user.id)
    setClaim(c)
  }

  async function withdraw() {
    if (!claim) return
    setBusy(true)
    await withdrawClaim(claim.id)
    setBusy(false)
    setClaim(null)
  }

  // ── Existing claim states ──
  if (loaded && claim) {
    const label =
      claim.status === 'approved' ? '✓ Your track is live on this poster' :
      claim.status === 'rejected' ? 'Your claim wasn’t approved' :
      '⏳ Your claim is pending review'
    const tone = claim.status === 'approved' ? 'var(--fg-65)' : claim.status === 'rejected' ? 'var(--sold-out)' : 'var(--fg-55)'
    return (
      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--fg-08)', background: 'var(--fg-08)' }}>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: tone }}>{label}</p>
        <button onClick={withdraw} disabled={busy} style={ghostBtn}>{busy ? '…' : (claim.status === 'rejected' ? 'Remove & try again' : 'Withdraw claim')}</button>
      </div>
    )
  }

  // ── No claim yet ──
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 12, border: '1.5px solid var(--fg-18)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span aria-hidden>🎵</span> This is my show — add your track
      </button>
    )
  }

  return (
    <div style={{ marginTop: 16, padding: '14px', borderRadius: 12, border: '1px solid var(--fg-15)', background: 'var(--fg-08)' }}>
      <p style={{ margin: '0 0 8px', fontFamily: '"Barlow Condensed", sans-serif', fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>
        Add your track
      </p>
      <MusicUrlInput
        value={trackUrl}
        onChange={setTrackUrl}
        onEffectiveChange={(eff, ok) => { setEffective(eff); setValid(ok) }}
      />
      {error && <p style={{ margin: '6px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--sold-out)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !valid} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: valid ? 'var(--fg)' : 'var(--fg-25)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, cursor: busy || !valid ? 'default' : 'pointer' }}>
          {busy ? 'Submitting…' : 'Submit for review'}
        </button>
        <button onClick={() => { setOpen(false); setError(null) }} disabled={busy} style={ghostBtn}>Cancel</button>
      </div>
      <p style={{ margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', lineHeight: 1.5 }}>
        A Plaster admin reviews claims before your track appears on the poster.
      </p>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  marginTop: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--fg-18)',
  background: 'transparent', color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
