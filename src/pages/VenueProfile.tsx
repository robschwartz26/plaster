import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { AccountProfile } from '@/components/AccountProfile'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMyVenueClaim, submitVenueClaim, type MyVenueClaim } from '@/lib/venueClaims'

export function VenueProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  // "Claim this venue" — shown only to venue ACCOUNTS that aren't attached to
  // a venue yet. Filing a claim emails plasterpdx@ and lands in the staff
  // Review queue; approval sets profiles.venue_id (one venue per account,
  // enforced in RLS + the approve RPC).
  const isUnattachedVenueAccount =
    !!user && profile?.account_type === 'venue' && !(profile as { venue_id?: string | null }).venue_id
  const [myClaim, setMyClaim] = useState<MyVenueClaim | null>(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimErr, setClaimErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!isUnattachedVenueAccount || !user) return
    fetchMyVenueClaim(user.id).then(setMyClaim)
  }, [isUnattachedVenueAccount, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fileClaim() {
    if (!user || !id || claimBusy) return
    setClaimBusy(true); setClaimErr(null)
    const { error } = await submitVenueClaim(user.id, id)
    setClaimBusy(false)
    if (error) { setClaimErr(error); return }
    setConfirming(false)
    setMyClaim({ id: 'pending-local', venue_id: id, status: 'pending' })
  }

  const pendingHere = myClaim?.status === 'pending' && myClaim.venue_id === id
  const pendingElsewhere = myClaim?.status === 'pending' && myClaim.venue_id !== id

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlasterHeader
        leftAction={
          <button style={headerIconBtn()} onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
        }
      />

      {isUnattachedVenueAccount && (
        <div style={{ flexShrink: 0, padding: '10px 16px', borderBottom: '1px solid var(--fg-08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pendingHere ? (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
              ✓ Claim sent — we'll review it shortly and attach this venue to your account.
            </p>
          ) : pendingElsewhere ? (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
              You already have a venue claim pending review.
            </p>
          ) : confirming ? (
            <>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>
                Claim this venue for your account?
              </p>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.4 }}>
                We'll review it — once approved, this venue's page and shows are yours. One venue per account.
              </p>
              {claimErr && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--sold-out)' }}>{claimErr}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={fileClaim} disabled={claimBusy}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#A855F7', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: claimBusy ? 0.6 : 1 }}>
                  {claimBusy ? 'Sending…' : 'Send claim'}
                </button>
                <button onClick={() => setConfirming(false)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--fg-25)', background: 'none', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setConfirming(true)}
              style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 20, border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.1)', color: '#A855F7', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Claim this venue
            </button>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {id && <AccountProfile venueId={id} />}
      </div>
    </div>
  )
}
