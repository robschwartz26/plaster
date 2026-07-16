import { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { ReviewRowEditor } from '@/components/admin/ReviewRowEditor'
import { findDuplicateIds, type PendingEvent } from '@/components/admin/reviewShared'

interface VenueLite { id: string; name: string; neighborhood: string | null; address: string | null }

interface Stats {
  pending_count: number
  approved_7d: number
  rejected_7d: number
}

interface Props {
  onCountChange?: (n: number) => void
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Structured rejection reasons ─────────────────────────────
type RejectionReason = 'duplicate' | 'wrong_date' | 'bad_image' | 'not_an_event' | 'other'

const QUICK_REASONS: { value: Exclude<RejectionReason, 'other'>; label: string }[] = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'wrong_date', label: 'Wrong date' },
  { value: 'bad_image', label: 'Bad image' },
  { value: 'not_an_event', label: 'Not an event' },
]

const reasonChip: CSSProperties = {
  padding: '4px 9px', borderRadius: 5, flexShrink: 0,
  border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}

// Inline reason picker — the four quick reasons reject in one tap; "Other" reveals
// an optional short note then a confirm. Shared by per-row reject and Reject all.
function ReasonPicker({ onPick, onCancel, busy }: {
  onPick: (reason: RejectionReason, note: string | null) => void
  onCancel: () => void
  busy: boolean
}) {
  const [otherOpen, setOtherOpen] = useState(false)
  const [note, setNote] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: '1px solid var(--fg-15)', borderRadius: 8, background: 'var(--fg-08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
          Reason for rejection
        </span>
        <button onClick={onCancel} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {QUICK_REASONS.map(r => (
          <button key={r.value} disabled={busy} onClick={() => onPick(r.value, null)} style={reasonChip}>
            {r.label}
          </button>
        ))}
        <button
          disabled={busy}
          onClick={() => setOtherOpen(o => !o)}
          style={{ ...reasonChip, ...(otherOpen ? { borderColor: 'rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.1)', color: '#A855F7' } : null) }}
        >
          Other
        </button>
      </div>
      {otherOpen && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onPick('other', note.trim() || null) }}
            placeholder="Short note (optional)"
            style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--fg-15)', background: 'var(--bg)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, outline: 'none' }}
          />
          <button disabled={busy} onClick={() => onPick('other', note.trim() || null)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 12, cursor: busy ? 'wait' : 'pointer', flexShrink: 0 }}>
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export function AdminPendingEvents({ onCountChange }: Props = {}) {
  const { user } = useAuth()
  const [rows, setRows] = useState<PendingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyGroup, setBusyGroup] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectAllOpen, setRejectAllOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)   // row open in the editor
  const [venues, setVenues] = useState<VenueLite[]>([])

  // Duplicate flagging: intra-set dupes (same venue+date+title listed twice) OR the
  // RPC's is_duplicate (already published this date).
  const dupIds = useMemo(() => findDuplicateIds(rows), [rows])
  const isDup = (e: PendingEvent) => dupIds.has(e.id) || e.is_duplicate
  const flaggedDupes = rows.filter(isDup)

  useEffect(() => {
    supabase.from('venues').select('id, name, neighborhood, address').order('name')
      .then(({ data }) => setVenues((data ?? []) as VenueLite[]))
  }, [])

  async function rejectAllDuplicates() {
    if (!user || flaggedDupes.length === 0) return
    setBusyGroup('*')
    const { error } = await supabase.from('events')
      .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejection_reason: 'duplicate', rejection_note: null })
      .in('id', flaggedDupes.map(e => e.id))
    if (error) console.error('[AdminPendingEvents] reject duplicates failed', error)
    setBusyGroup(null)
    fetchPending()
  }

  const fetchPending = useCallback(async () => {
    setLoading(true)
    const [pendingRes, statsRes] = await Promise.all([
      supabase.rpc('admin_pending_events'),
      supabase.rpc('staff_stats'),
    ])
    if (pendingRes.error) {
      console.error('[AdminPendingEvents] fetch failed', pendingRes.error)
      setRows([])
      onCountChange?.(0)
    } else {
      // Review stage = pending events that have NOT yet passed review.
      const r = ((pendingRes.data ?? []) as PendingEvent[]).filter(e => !e.passed_review)
      setRows(r)
      onCountChange?.(r.length)
    }
    if (statsRes.data?.[0]) setStats(statsRes.data[0] as Stats)
    setLoading(false)
  }, [onCountChange])

  useEffect(() => { fetchPending() }, [fetchPending])

  // Pass review → moves the event to the Pending (live-preview) stage.
  async function passToPending(id: string) {
    if (!user) return
    setBusyId(id)
    const { error } = await supabase.from('events').update({ passed_review: true }).eq('id', id)
    setBusyId(null)
    if (error) console.error('[AdminPendingEvents] pass to pending failed', error)
    fetchPending()
  }

  async function reject(id: string, reason: RejectionReason, note: string | null) {
    if (!user) return
    setBusyId(id)
    const { error } = await supabase.from('events').update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
      rejection_note: note,
    }).eq('id', id)
    setBusyId(null)
    setRejectingId(null)
    if (error) console.error('[AdminPendingEvents] reject failed', error)
    fetchPending()
  }

  async function consolidate(e: PendingEvent) {
    if (!e.duplicate_of) return
    setBusyId(e.id)
    const { error } = await supabase.rpc('consolidate_events', {
      p_keep_id: e.duplicate_of,
      p_remove_ids: [e.id],
    })
    setBusyId(null)
    if (error) console.error('[AdminPendingEvents] consolidate failed', error)
    fetchPending()
  }

  async function passAll(group: PendingEvent[]) {
    if (!user) return
    const key = group[0].uploader ?? group[0].created_by
    setBusyGroup(key)
    await Promise.all(group.map(e =>
      supabase.from('events').update({ passed_review: true }).eq('id', e.id)
    ))
    setBusyGroup(null)
    fetchPending()
  }

  async function rejectAll(reason: RejectionReason, note: string | null) {
    if (!user || rows.length === 0) return
    setBusyGroup('*')
    const now = new Date().toISOString()
    // Batched: one update over every listed pending event, with the shared reason
    const { error } = await supabase.from('events')
      .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: now, rejection_reason: reason, rejection_note: note })
      .in('id', rows.map(e => e.id))
    if (error) console.error('[AdminPendingEvents] reject all failed', error)
    setBusyGroup(null)
    setRejectAllOpen(false)
    fetchPending()
  }

  async function rejectDuplicates(group: PendingEvent[]) {
    if (!user) return
    const dupes = group.filter(isDup)
    if (!dupes.length) return
    const key = group[0].uploader ?? group[0].created_by
    setBusyGroup(key)
    const now = new Date().toISOString()
    await Promise.all(dupes.map(e =>
      supabase.from('events').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: now, rejection_reason: 'duplicate', rejection_note: null }).eq('id', e.id)
    ))
    setBusyGroup(null)
    fetchPending()
  }

  const statsStrip = stats ? (
    <div style={{ display: 'flex', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
      {[
        { label: 'Pending', value: stats.pending_count, color: 'rgba(217,119,6,0.9)' },
        { label: 'Approved 7d', value: stats.approved_7d, color: '#4ade80' },
        { label: 'Rejected 7d', value: stats.rejected_7d, color: '#f87171' },
      ].map(({ label, value, color }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
            {value}
          </span>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-30)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  ) : null

  if (loading) {
    return (
      <>
        {statsStrip}
        <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>Loading…</p>
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <>
        {statsStrip}
        <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontStyle: 'italic' }}>
          No uploads waiting for review.
        </p>
      </>
    )
  }

  // Group by uploader (preserving order from RPC which orders by username then starts_at)
  const groupMap: Record<string, PendingEvent[]> = {}
  const groupOrder: string[] = []
  for (const row of rows) {
    const key = row.uploader ?? row.created_by
    if (!groupMap[key]) { groupMap[key] = []; groupOrder.push(key) }
    groupMap[key].push(row)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {statsStrip}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {flaggedDupes.length > 0 && (
              <button
                onClick={rejectAllDuplicates}
                disabled={busyGroup === '*'}
                style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, cursor: busyGroup === '*' ? 'wait' : 'pointer', opacity: busyGroup === '*' ? 0.5 : 1 }}
              >
                {busyGroup === '*' ? '…' : `Reject ${flaggedDupes.length} duplicate${flaggedDupes.length !== 1 ? 's' : ''}`}
              </button>
            )}
            <button
              onClick={() => setRejectAllOpen(o => !o)}
              disabled={busyGroup === '*'}
              style={{ padding: '5px 10px', background: rejectAllOpen ? 'rgba(239,68,68,0.1)' : 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: busyGroup === '*' ? 'wait' : 'pointer', opacity: busyGroup === '*' ? 0.5 : 1 }}
            >
              {busyGroup === '*' ? '…' : `Reject all (${rows.length})`}
            </button>
          </div>
        </div>
        {rejectAllOpen && (
          <div style={{ marginTop: 10 }}>
            <ReasonPicker busy={busyGroup === '*'} onCancel={() => setRejectAllOpen(false)} onPick={(reason, note) => rejectAll(reason, note)} />
          </div>
        )}
      </div>
      {groupOrder.map(key => {
        const group = groupMap[key]
        const isGroupBusy = busyGroup === key
        const dupeCount = group.filter(isDup).length

        return (
          <div key={key}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
                Uploaded by @{group[0].uploader ?? '(unknown)'} · {group.length}
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                {dupeCount > 0 && (
                  <button
                    onClick={() => rejectDuplicates(group)}
                    disabled={isGroupBusy}
                    style={{ padding: '5px 10px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: isGroupBusy ? 'wait' : 'pointer', opacity: isGroupBusy ? 0.5 : 1 }}
                  >
                    {isGroupBusy ? '…' : `Reject ${dupeCount} duplicate${dupeCount !== 1 ? 's' : ''}`}
                  </button>
                )}
                <button
                  onClick={() => passAll(group)}
                  disabled={isGroupBusy}
                  style={{ padding: '5px 10px', background: 'transparent', color: '#A855F7', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: isGroupBusy ? 'wait' : 'pointer', opacity: isGroupBusy ? 0.5 : 1 }}
                >
                  {isGroupBusy ? '…' : 'Pass all to Pending'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.map(e => {
                const isBusy = busyId === e.id || isGroupBusy
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1px solid ${isDup(e) ? 'rgba(239,68,68,0.3)' : 'var(--fg-15)'}`,
                      background: isDup(e) ? 'rgba(239,68,68,0.04)' : 'transparent',
                      fontFamily: '"Space Grotesk", sans-serif',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--fg-08)' }}>
                        {e.poster_url && <img src={e.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>{e.title}</span>
                          {isDup(e) && (
                            <span style={{
                              fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700,
                              letterSpacing: '0.08em', textTransform: 'uppercase',
                              color: '#ef4444', background: 'rgba(239,68,68,0.12)',
                              border: '1px solid rgba(239,68,68,0.3)', padding: '1px 6px', borderRadius: 3, flexShrink: 0,
                            }}>
                              {e.is_duplicate ? 'DUPLICATE · already published this date' : 'DUPLICATE · listed twice here'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--fg-55)' }}>
                          {e.venue_name} · {fmtDate(e.starts_at)} at {fmtTime(e.starts_at)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--fg-40)' }}>added {fmtShort(e.created_at)}</span>
                          {e.ai_confidence != null && (
                            <span style={{
                              fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700,
                              letterSpacing: '0.07em', textTransform: 'uppercase',
                              color: e.ai_confidence >= 80 ? '#4ade80' : e.ai_confidence >= 55 ? 'rgba(217,119,6,0.9)' : '#f87171',
                              background: e.ai_confidence >= 80 ? 'rgba(74,222,128,0.1)' : e.ai_confidence >= 55 ? 'rgba(217,119,6,0.1)' : 'rgba(248,113,113,0.1)',
                              border: `1px solid ${e.ai_confidence >= 80 ? 'rgba(74,222,128,0.3)' : e.ai_confidence >= 55 ? 'rgba(217,119,6,0.3)' : 'rgba(248,113,113,0.3)'}`,
                              padding: '1px 5px', borderRadius: 3,
                            }}>
                              AI {e.ai_confidence}%
                            </span>
                          )}
                          {e.source_url && (
                            <a href={e.source_url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} style={{ fontSize: 11, color: '#A855F7', textDecoration: 'none' }}>
                              source ↗
                            </a>
                          )}
                        </div>
                        {e.flag_note && (
                          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'rgba(217,119,6,0.9)', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 4, padding: '4px 8px', marginTop: 5 }}>
                            ⚑ {e.flag_note}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => passToPending(e.id)}
                        disabled={isBusy}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 13, cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.5 : 1 }}
                      >
                        {busyId === e.id ? '…' : 'Pass to Pending →'}
                      </button>
                      <button
                        onClick={() => setRejectingId(prev => prev === e.id ? null : e.id)}
                        disabled={isBusy}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid var(--fg-25)', background: rejectingId === e.id ? 'var(--fg-08)' : 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.5 : 1 }}
                      >
                        Reject
                      </button>
                      {e.is_duplicate && e.duplicate_of && (
                        <button
                          onClick={() => consolidate(e)}
                          disabled={isBusy}
                          style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid rgba(168,85,247,0.4)', background: 'transparent', color: '#A855F7', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 11, cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.5 : 1 }}
                        >
                          Consolidate → live show
                        </button>
                      )}
                    </div>
                    {rejectingId === e.id && (
                      <ReasonPicker
                        busy={busyId === e.id}
                        onCancel={() => setRejectingId(null)}
                        onPick={(reason, note) => reject(e.id, reason, note)}
                      />
                    )}

                    {/* Edit — text fields + poster re-upload + live info-page preview */}
                    <button
                      onClick={() => setEditingId(prev => prev === e.id ? null : e.id)}
                      style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, color: '#A855F7' }}
                    >
                      {editingId === e.id ? '▾ Hide editor' : '▸ Edit & preview info page'}
                    </button>
                    {editingId === e.id && (
                      <ReviewRowEditor row={e} venues={venues} onSaved={fetchPending} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
