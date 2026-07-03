import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { MusicEmbed } from '@/components/MusicEmbed'
import { fetchPendingClaims, decideClaim, type PendingClaim } from '@/lib/eventClaims'

// Admin review queue for artist show-claims. Approve → the artist's track goes live
// on that event's poster; Reject → dismissed. Mounted in the staff Review panel.
export function AdminEventClaims() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PendingClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setRows(await fetchPendingClaims())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(id: string, status: 'approved' | 'rejected') {
    if (!user) return
    setBusyId(id)
    await decideClaim(id, status, user.id)
    setBusyId(null)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  if (loading || rows.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      <p style={{ margin: 0, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-65)' }}>
        Show claims ({rows.length})
      </p>
      {rows.map(r => {
        const busy = busyId === r.id
        return (
          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 10, border: '1px solid var(--fg-15)' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 46, height: 68, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--fg-08)' }}>
                {r.event?.poster_url && <img src={r.event.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{r.event?.title ?? '(event)'}</p>
                <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>
                  claimed by <strong style={{ color: 'var(--fg-65)' }}>@{r.artist?.username ?? 'someone'}</strong>
                </p>
              </div>
            </div>
            {r.track_url && <MusicEmbed url={r.track_url} />}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => decide(r.id, 'approved')} disabled={busy} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>Approve</button>
              <button onClick={() => decide(r.id, 'rejected')} disabled={busy} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 12, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>Reject</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
