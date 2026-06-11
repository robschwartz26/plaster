import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface PendingEvent {
  id: string
  title: string
  starts_at: string
  venue_id: string | null
  venue_name: string | null
  poster_url: string | null
  category: string | null
  created_by: string
  uploader: string | null
  created_at: string
  is_duplicate: boolean
  duplicate_of: string | null
  source_url: string | null
  ai_confidence: number | null
  flag_note: string | null
}

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

export function AdminPendingEvents({ onCountChange }: Props = {}) {
  const { user } = useAuth()
  const [rows, setRows] = useState<PendingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyGroup, setBusyGroup] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

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
      const r = (pendingRes.data ?? []) as PendingEvent[]
      setRows(r)
      onCountChange?.(r.length)
    }
    if (statsRes.data?.[0]) setStats(statsRes.data[0] as Stats)
    setLoading(false)
  }, [onCountChange])

  useEffect(() => { fetchPending() }, [fetchPending])

  async function approve(id: string) {
    if (!user) return
    setBusyId(id)
    const { error } = await supabase.from('events').update({
      status: 'published',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    setBusyId(null)
    if (error) console.error('[AdminPendingEvents] approve failed', error)
    fetchPending()
  }

  async function reject(id: string) {
    if (!user) return
    setBusyId(id)
    const { error } = await supabase.from('events').update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    setBusyId(null)
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

  async function approveAll(group: PendingEvent[]) {
    if (!user) return
    const key = group[0].uploader ?? group[0].created_by
    setBusyGroup(key)
    const now = new Date().toISOString()
    await Promise.all(group.map(e =>
      supabase.from('events').update({ status: 'published', reviewed_by: user.id, reviewed_at: now }).eq('id', e.id)
    ))
    setBusyGroup(null)
    fetchPending()
  }

  async function rejectAll() {
    if (!user || rows.length === 0) return
    if (!window.confirm(`Reject all ${rows.length} pending events? They never appeared publicly.`)) return
    setBusyGroup('*')
    const now = new Date().toISOString()
    // Batched: one update over every listed pending event
    const { error } = await supabase.from('events')
      .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: now })
      .in('id', rows.map(e => e.id))
    if (error) console.error('[AdminPendingEvents] reject all failed', error)
    setBusyGroup(null)
    fetchPending()
  }

  async function rejectDuplicates(group: PendingEvent[]) {
    if (!user) return
    const dupes = group.filter(e => e.is_duplicate)
    if (!dupes.length) return
    const key = group[0].uploader ?? group[0].created_by
    setBusyGroup(key)
    const now = new Date().toISOString()
    await Promise.all(dupes.map(e =>
      supabase.from('events').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: now }).eq('id', e.id)
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        {statsStrip}
        <button
          onClick={rejectAll}
          disabled={busyGroup === '*'}
          style={{ padding: '5px 10px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: busyGroup === '*' ? 'wait' : 'pointer', opacity: busyGroup === '*' ? 0.5 : 1, flexShrink: 0 }}
        >
          {busyGroup === '*' ? '…' : `Reject all (${rows.length})`}
        </button>
      </div>
      {groupOrder.map(key => {
        const group = groupMap[key]
        const isGroupBusy = busyGroup === key
        const dupeCount = group.filter(e => e.is_duplicate).length

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
                  onClick={() => approveAll(group)}
                  disabled={isGroupBusy}
                  style={{ padding: '5px 10px', background: 'transparent', color: '#A855F7', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: isGroupBusy ? 'wait' : 'pointer', opacity: isGroupBusy ? 0.5 : 1 }}
                >
                  {isGroupBusy ? '…' : 'Approve all'}
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
                      border: `1px solid ${e.is_duplicate ? 'rgba(239,68,68,0.3)' : 'var(--fg-15)'}`,
                      background: e.is_duplicate ? 'rgba(239,68,68,0.04)' : 'transparent',
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
                          {e.is_duplicate && (
                            <span style={{
                              fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700,
                              letterSpacing: '0.08em', textTransform: 'uppercase',
                              color: '#ef4444', background: 'rgba(239,68,68,0.12)',
                              border: '1px solid rgba(239,68,68,0.3)', padding: '1px 6px', borderRadius: 3, flexShrink: 0,
                            }}>
                              DUPLICATE · already published this date
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
                        onClick={() => approve(e.id)}
                        disabled={isBusy}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 13, cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.5 : 1 }}
                      >
                        {busyId === e.id ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => reject(e.id)}
                        disabled={isBusy}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy ? 0.5 : 1 }}
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
