import { useState } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { type EventSummary } from '@/components/admin/adminShared'

function fmtLocalTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function eventTimeLabel(e: EventSummary) {
  const base = fmtLocalTime(e.starts_at)
  const extra = (e.show_times?.length ?? 0)
  return extra > 0 ? `${base} +${extra} time${extra !== 1 ? 's' : ''}` : base
}

export function DuplicateEventMerger({ groups, onMergeComplete }: { groups: EventSummary[][]; onMergeComplete: () => void }) {
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null)
  const [primaryIds, setPrimaryIds] = useState<Record<number, string>>({})
  const [merging, setMerging] = useState<number | null>(null)
  const [mergeSuccess, setMergeSuccess] = useState<Record<number, string>>({})
  const [mergeError, setMergeError] = useState<Record<number, string>>({})

  const activeCount = groups.filter((_, i) => !mergeSuccess[i]).length
  if (!groups.length || !activeCount) return null

  const handleExpand = (i: number) => {
    setExpandedGroup(expandedGroup === i ? null : i)
  }

  const handleMerge = async (groupIdx: number) => {
    const primaryId = primaryIds[groupIdx]
    if (!primaryId) return
    const group = groups[groupIdx]
    const keep = group.find(e => e.id === primaryId)!
    const removeIds = group.filter(e => e.id !== primaryId).map(e => e.id)
    setMerging(groupIdx)
    setMergeError(prev => { const next = { ...prev }; delete next[groupIdx]; return next })
    try {
      const { error } = await supabaseAdmin.rpc('consolidate_events', { p_keep_id: primaryId, p_remove_ids: removeIds })
      if (error) throw error
      setMergeSuccess(prev => ({ ...prev, [groupIdx]: `Consolidated into ${keep.title}.` }))
      onMergeComplete()
    } catch (e) {
      console.error('Consolidate failed:', e)
      setMergeError(prev => ({ ...prev, [groupIdx]: (e as Error).message || 'Consolidation failed' }))
    } finally { setMerging(null) }
  }

  return (
    <section style={{ marginBottom: 8 }}>
      <div style={{ padding: '14px 16px', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, background: 'rgba(239,68,68,0.05)', marginBottom: 10 }}>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px 0' }}>Duplicate events detected</p>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: 0 }}>
          {activeCount} event group{activeCount !== 1 ? 's' : ''} may be the same show — consolidate to one poster with all its show times.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((group, groupIdx) => {
          if (mergeSuccess[groupIdx]) return (
            <div key={groupIdx} style={{ padding: '10px 14px', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 7, background: 'rgba(74,222,128,0.05)' }}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#4ade80', margin: 0 }}>✓ {mergeSuccess[groupIdx]}</p>
            </div>
          )
          const isExpanded = expandedGroup === groupIdx
          const primaryId = primaryIds[groupIdx]
          return (
            <div key={groupIdx} style={{ border: '1px solid var(--fg-18)', borderRadius: 7, overflow: 'hidden' }}>
              <button onClick={() => handleExpand(groupIdx)} style={{ width: '100%', padding: '10px 14px', background: 'rgba(240,236,227,0.02)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-65)', textAlign: 'left' }}>
                  {group.map(e => e.title).join(' · ')}
                </span>
                <span style={{ color: 'var(--fg-40)', fontSize: 10, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
              </button>
              {isExpanded && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--fg-08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.map(e => (
                    <div key={e.id} style={{ padding: '10px 12px', borderRadius: 6, border: `1px solid ${primaryId === e.id ? 'rgba(168,85,247,0.55)' : 'var(--fg-18)'}`, background: primaryId === e.id ? 'rgba(168,85,247,0.08)' : 'rgba(240,236,227,0.02)', display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--fg-08)' }}>
                        {e.poster_url && <img src={e.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</p>
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: 0 }}>{eventTimeLabel(e)}</p>
                      </div>
                      <button
                        onClick={() => setPrimaryIds(prev => ({ ...prev, [groupIdx]: e.id }))}
                        style={{ padding: '5px 10px', background: primaryId === e.id ? '#A855F7' : 'transparent', color: primaryId === e.id ? '#fff' : 'var(--fg-55)', border: `1px solid ${primaryId === e.id ? '#A855F7' : 'var(--fg-18)'}`, borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {primaryId === e.id ? '✓ Keeping' : 'Keep this one'}
                      </button>
                    </div>
                  ))}
                  {primaryId && (
                    <>
                      <button
                        onClick={() => handleMerge(groupIdx)}
                        disabled={merging === groupIdx}
                        style={{ padding: '9px 0', background: merging === groupIdx ? 'var(--fg-18)' : '#A855F7', color: '#fff', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, cursor: merging === groupIdx ? 'default' : 'pointer' }}
                      >
                        {merging === groupIdx ? 'Consolidating…' : `Consolidate ${group.length} into one`}
                      </button>
                      {mergeError[groupIdx] && (
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#ef4444', margin: '2px 0 0 0' }}>{mergeError[groupIdx]}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
