import { useEffect, useState, useCallback } from 'react'
import { Diamond } from '@/components/Diamond'
import { fetchPendingVenueClaims, approveVenueClaim, rejectVenueClaim, type PendingVenueClaim } from '@/lib/venueClaims'

// Admin review queue for venue self-claims. Approve → admin_approve_venue_claim
// RPC attaches profiles.venue_id (their page + shows light up); Reject → dismissed.
// Mounted in the staff Review panel beside show claims.
export function AdminVenueClaims() {
  const [rows, setRows] = useState<PendingVenueClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setRows(await fetchPendingVenueClaims())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(id: string, approve: boolean) {
    setBusyId(id); setError(null)
    const { error: e } = approve ? await approveVenueClaim(id) : await rejectVenueClaim(id)
    setBusyId(null)
    if (e) { setError(e); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  if (loading || rows.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      <p style={{ margin: 0, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-65)' }}>
        Venue claims ({rows.length})
      </p>
      {error && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--sold-out)' }}>{error}</p>}
      {rows.map(r => {
        const busy = busyId === r.id
        return (
          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 10, border: '1px solid var(--fg-15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Diamond diamondUrl={r.claimant?.avatar_diamond_url ?? null} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                  @{r.claimant?.username ?? 'someone'} → {r.venue?.name ?? '(venue)'}
                </p>
                <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>
                  {r.venue?.neighborhood ? `${r.venue.neighborhood} · ` : ''}wants this venue attached to their account
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => decide(r.id, true)} disabled={busy} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>Approve</button>
              <button onClick={() => decide(r.id, false)} disabled={busy} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 12, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>Reject</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
