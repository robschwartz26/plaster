import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { EventInfoFace } from '@/components/admin/EventInfoFace'
import { pendingToWallEvent, findDuplicateIds, needsPhoto, type PendingEvent } from '@/components/admin/reviewShared'

// Pending stage: events that have passed review and are awaiting publish. Shown in
// live-app format (poster + the real info-page face) so you see exactly how each
// will look live. Per-event: Publish → Live, Send back → Review, Delete. Plus batch
// Approve all / Send all back for when the workflow is trusted.
export function AdminPendingQueue({ onCountChange }: { onCountChange?: (n: number) => void } = {}) {
  const { user } = useAuth()
  const [rows, setRows] = useState<PendingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAll, setBusyAll] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [err, setErr] = useState('')

  // Flag intra-set duplicates (same venue+date+title listed more than once here) OR
  // the RPC's is_duplicate (already published this date).
  const dupIds = useMemo(() => findDuplicateIds(rows), [rows])
  const isDup = (e: PendingEvent) => dupIds.has(e.id) || e.is_duplicate
  const flaggedDupes = rows.filter(isDup)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_pending_events')
    if (error) { console.error('[AdminPendingQueue] fetch failed', error); setRows([]); onCountChange?.(0) }
    else {
      const r = ((data ?? []) as PendingEvent[]).filter(e => e.passed_review)
      setRows(r); onCountChange?.(r.length)
    }
    setLoading(false)
  }, [onCountChange])

  useEffect(() => { fetchPending() }, [fetchPending])

  async function publish(id: string) {
    if (!user) return
    setBusyId(id); setErr('')
    const { error } = await supabase.from('events').update({ status: 'published', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', id)
    setBusyId(null)
    if (error) { setErr(error.message); return }
    fetchPending()
  }

  async function sendBack(id: string) {
    setBusyId(id); setErr('')
    const { error } = await supabase.from('events').update({ passed_review: false }).eq('id', id)
    setBusyId(null)
    if (error) { setErr(error.message); return }
    fetchPending()
  }

  async function del(id: string) {
    setBusyId(id); setErr('')
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id')
    setBusyId(null); setConfirmDelete(null)
    if (error || !data || data.length === 0) { setErr(error?.message || 'Delete blocked (0 rows) — are you admin?'); return }
    fetchPending()
  }

  async function approveAll() {
    if (!user) return
    const publishable = rows.filter(e => !needsPhoto(e))  // never auto-publish a photo-less event
    if (publishable.length === 0) return
    setBusyAll(true); setErr('')
    const { error } = await supabase.from('events')
      .update({ status: 'published', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .in('id', publishable.map(e => e.id))
    setBusyAll(false)
    if (error) { setErr(error.message); return }
    fetchPending()
  }

  async function sendAllBack() {
    if (rows.length === 0) return
    setBusyAll(true); setErr('')
    const { error } = await supabase.from('events').update({ passed_review: false }).in('id', rows.map(e => e.id))
    setBusyAll(false)
    if (error) { setErr(error.message); return }
    fetchPending()
  }

  async function rejectDuplicates() {
    if (!user || flaggedDupes.length === 0) return
    setBusyAll(true); setErr('')
    const { error } = await supabase.from('events')
      .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejection_reason: 'duplicate', rejection_note: null })
      .in('id', flaggedDupes.map(e => e.id))
    setBusyAll(false)
    if (error) { setErr(error.message); return }
    fetchPending()
  }

  if (loading) return <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>Loading…</p>
  if (rows.length === 0) return <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontStyle: 'italic' }}>Nothing in Pending — events you pass from Review land here.</p>

  return (
    <div style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
      {/* Batch toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--fg-65)' }}><strong>{rows.length}</strong> awaiting publish</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {flaggedDupes.length > 0 && (
            <button onClick={rejectDuplicates} disabled={busyAll} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: busyAll ? 'wait' : 'pointer', opacity: busyAll ? 0.6 : 1 }}>
              {busyAll ? '…' : `Reject ${flaggedDupes.length} duplicate${flaggedDupes.length !== 1 ? 's' : ''}`}
            </button>
          )}
          <button onClick={approveAll} disabled={busyAll} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#A855F7', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busyAll ? 'wait' : 'pointer', opacity: busyAll ? 0.6 : 1 }}>
            {busyAll ? '…' : `Approve all (${rows.length}) → Live`}
          </button>
          <button onClick={sendAllBack} disabled={busyAll} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontSize: 13, fontWeight: 600, cursor: busyAll ? 'wait' : 'pointer', opacity: busyAll ? 0.6 : 1 }}>
            Send all back
          </button>
        </div>
      </div>
      {err && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#e05555' }}>{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {rows.map(e => {
          const isBusy = busyId === e.id || busyAll
          return (
            <div key={e.id} style={{ border: `1px solid ${isDup(e) ? 'rgba(239,68,68,0.4)' : 'var(--fg-15)'}`, background: isDup(e) ? 'rgba(239,68,68,0.04)' : 'transparent', borderRadius: 12, padding: 12 }}>
              {isDup(e) && (
                <div style={{ marginBottom: 10, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ef4444' }}>
                  ⚠ Duplicate · {e.is_duplicate ? 'already published this date' : 'listed twice here'}
                </div>
              )}
              {needsPhoto(e) && (
                <div style={{ marginBottom: 10, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#e0a050' }}>
                  📷 Needs photo · send back to Review to add art before publishing
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {/* poster */}
                <div style={{ width: 170, flexShrink: 0 }}>
                  <div style={{ position: 'relative', paddingBottom: '150%', borderRadius: 8, overflow: 'hidden', background: 'var(--fg-08)' }}>
                    {e.poster_url
                      ? <img src={e.poster_url} alt={e.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-30)', fontSize: 11 }}>no poster</div>}
                  </div>
                </div>
                {/* info-page face */}
                <div style={{ flex: 1, minWidth: 240 }}>
                  <EventInfoFace event={pendingToWallEvent(e)} description={e.description} address={e.address} />
                </div>
              </div>

              {/* actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={() => publish(e.id)} disabled={isBusy || needsPhoto(e)} title={needsPhoto(e) ? 'Needs a photo — send back to Review to add one' : undefined} style={{ flex: 1, minWidth: 120, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontWeight: 700, fontSize: 13, cursor: isBusy || needsPhoto(e) ? 'not-allowed' : 'pointer', opacity: isBusy || needsPhoto(e) ? 0.5 : 1 }}>
                  {busyId === e.id ? '…' : needsPhoto(e) ? 'Needs photo' : 'Publish → Live'}
                </button>
                <button onClick={() => sendBack(e.id)} disabled={isBusy} style={{ flex: 1, minWidth: 120, padding: '9px 0', borderRadius: 8, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontWeight: 600, fontSize: 13, cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.5 : 1 }}>
                  ← Send back to Review
                </button>
                {confirmDelete === e.id ? (
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => del(e.id)} disabled={isBusy} style={{ padding: '9px 12px', borderRadius: 8, border: 'none', background: '#e05555', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{busyId === e.id ? '…' : 'Delete'}</button>
                    <button onClick={() => setConfirmDelete(null)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(e.id)} disabled={isBusy} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(224,85,85,0.5)', background: 'transparent', color: '#e05555', fontWeight: 700, fontSize: 13, cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.5 : 1 }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
