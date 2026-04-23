import { useState } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { type Venue } from '@/components/admin/adminShared'

export function DuplicateVenueMerger({ groups, onMergeComplete }: { groups: Venue[][]; onMergeComplete: () => void }) {
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null)
  const [primaryIds, setPrimaryIds] = useState<Record<number, string>>({})
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({})
  const [merging, setMerging] = useState<number | null>(null)
  const [mergeSuccess, setMergeSuccess] = useState<Record<number, string>>({})

  const activeCount = groups.filter((_, i) => !mergeSuccess[i]).length
  if (!groups.length || !activeCount) return null

  const loadCounts = async (venueIds: string[]) => {
    const { data } = await supabaseAdmin.from('events').select('venue_id').in('venue_id', venueIds)
    const counts: Record<string, number> = {}
    venueIds.forEach(id => { counts[id] = 0 })
    for (const row of data ?? []) if (row.venue_id) counts[row.venue_id] = (counts[row.venue_id] ?? 0) + 1
    setEventCounts(prev => ({ ...prev, ...counts }))
  }

  const handleExpand = async (i: number) => {
    if (expandedGroup === i) { setExpandedGroup(null); return }
    setExpandedGroup(i)
    await loadCounts(groups[i].map(v => v.id))
  }

  const handleMerge = async (groupIdx: number) => {
    const primaryId = primaryIds[groupIdx]
    if (!primaryId) return
    const group = groups[groupIdx]
    const primary = group.find(v => v.id === primaryId)!
    const duplicateIds = group.filter(v => v.id !== primaryId).map(v => v.id)
    setMerging(groupIdx)
    try {
      const { count } = await supabaseAdmin.from('events').select('*', { count: 'exact', head: true }).in('venue_id', duplicateIds)
      const evtCount = count ?? 0
      if (duplicateIds.length > 0) {
        const { error: upErr } = await supabaseAdmin.from('events').update({ venue_id: primaryId }).in('venue_id', duplicateIds)
        if (upErr) throw upErr
      }
      const { error: delErr } = await supabaseAdmin.from('venues').delete().in('id', duplicateIds)
      if (delErr) throw delErr
      setMergeSuccess(prev => ({
        ...prev,
        [groupIdx]: `${evtCount} event${evtCount !== 1 ? 's' : ''} repointed to ${primary.name}. ${duplicateIds.length} duplicate venue${duplicateIds.length !== 1 ? 's' : ''} deleted.`,
      }))
      onMergeComplete()
    } catch (e) {
      console.error('Merge failed:', e)
    } finally { setMerging(null) }
  }

  return (
    <section style={{ marginBottom: 8 }}>
      <div style={{ padding: '14px 16px', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, background: 'rgba(239,68,68,0.05)', marginBottom: 10 }}>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px 0' }}>Duplicate venues detected</p>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: 0 }}>
          {activeCount} venue group{activeCount !== 1 ? 's' : ''} may be duplicates. Review and merge to keep your data clean.
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
                  {group.map(v => v.name).join(' · ')}
                </span>
                <span style={{ color: 'var(--fg-40)', fontSize: 10, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
              </button>
              {isExpanded && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--fg-08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.map(v => (
                    <div key={v.id} style={{ padding: '10px 12px', borderRadius: 6, border: `1px solid ${primaryId === v.id ? 'rgba(168,85,247,0.55)' : 'var(--fg-18)'}`, background: primaryId === v.id ? 'rgba(168,85,247,0.08)' : 'rgba(240,236,227,0.02)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 2px 0' }}>{v.name}</p>
                        {v.address    && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '0 0 1px 0' }}>{v.address}</p>}
                        {v.neighborhood && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: 0 }}>{v.neighborhood}</p>}
                        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', margin: '4px 0 0 0' }}>
                          {eventCounts[v.id] !== undefined ? `${eventCounts[v.id]} event${eventCounts[v.id] !== 1 ? 's' : ''}` : '…'}
                        </p>
                      </div>
                      <button
                        onClick={() => setPrimaryIds(prev => ({ ...prev, [groupIdx]: v.id }))}
                        style={{ padding: '5px 10px', background: primaryId === v.id ? '#A855F7' : 'transparent', color: primaryId === v.id ? '#fff' : 'var(--fg-55)', border: `1px solid ${primaryId === v.id ? '#A855F7' : 'var(--fg-18)'}`, borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {primaryId === v.id ? '✓ Keeping' : 'Keep this one'}
                      </button>
                    </div>
                  ))}
                  {primaryId && (
                    <button
                      onClick={() => handleMerge(groupIdx)}
                      disabled={merging === groupIdx}
                      style={{ padding: '9px 0', background: merging === groupIdx ? 'var(--fg-18)' : 'rgba(239,68,68,0.85)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, cursor: merging === groupIdx ? 'default' : 'pointer' }}
                    >
                      {merging === groupIdx ? 'Merging…' : `Merge & Delete ${group.length - 1} duplicate${group.length - 1 !== 1 ? 's' : ''}`}
                    </button>
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
