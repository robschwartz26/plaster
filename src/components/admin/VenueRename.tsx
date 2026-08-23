import { useState } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import type { Venue } from '@/components/admin/adminShared'

// Rename venues in place. RLS allows admins to UPDATE venues; events reference
// the venue by id, so every show at a renamed venue picks up the new name
// automatically (wall, map, venue page).
export function VenueRename({ venues, onRenamed }: { venues: Venue[]; onRenamed: () => void }) {
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const q = query.trim().toLowerCase()
  const matches = q
    ? venues.filter(v => v.name.toLowerCase().includes(q)).slice(0, 30)
    : []

  async function rename(v: Venue) {
    const next = (drafts[v.id] ?? v.name).trim()
    if (!next || next === v.name) return
    setSavingId(v.id); setErr(''); setSavedId(null)
    const { error } = await supabaseAdmin.from('venues').update({ name: next }).eq('id', v.id)
    setSavingId(null)
    if (error) { setErr(`${v.name}: ${error.message}`); return }
    setSavedId(v.id)
    setDrafts(d => { const n = { ...d }; delete n[v.id]; return n })
    onRenamed() // refetch the venue list
    setTimeout(() => setSavedId(cur => cur === v.id ? null : cur), 2500)
  }

  return (
    <div style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--fg-55)', lineHeight: 1.5 }}>
        Search a venue, edit its name, and save. Every show at that venue updates automatically.
      </p>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search venues…"
        autoCapitalize="none" spellCheck={false}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          border: '1px solid var(--fg-15)', background: 'var(--fg-08)',
          color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12,
        }}
      />
      {err && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#e05555' }}>{err}</p>}

      {q && matches.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-40)' }}>No venues match "{query}".</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matches.map(v => {
          const draft = drafts[v.id] ?? v.name
          const changed = draft.trim() !== v.name && draft.trim().length > 0
          return (
            <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={draft}
                onChange={e => setDrafts(d => ({ ...d, [v.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && changed) rename(v) }}
                style={{
                  flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 8,
                  border: `1px solid ${changed ? 'var(--fg-40)' : 'var(--fg-15)'}`,
                  background: 'var(--bg)', color: 'var(--fg)',
                  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => rename(v)}
                disabled={!changed || savingId === v.id}
                style={{
                  flexShrink: 0, padding: '9px 14px', borderRadius: 8, border: 'none',
                  background: savedId === v.id ? '#4ade80' : changed ? '#A855F7' : 'var(--fg-15)',
                  color: changed || savedId === v.id ? '#fff' : 'var(--fg-40)',
                  fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700,
                  cursor: changed && savingId !== v.id ? 'pointer' : 'default', whiteSpace: 'nowrap',
                }}
              >
                {savingId === v.id ? 'Saving…' : savedId === v.id ? '✓ Saved' : 'Rename'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
