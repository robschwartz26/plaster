import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Diamond } from './Diamond'

export interface PickedUser {
  id: string
  username: string
  avatar_diamond_url: string | null
  avatar_url: string | null
}

interface Props {
  initialSelected?: PickedUser[]
  excludedIds?: Set<string>
  onChange: (selected: PickedUser[]) => void
  placeholder?: string
}

export function UserPicker({ initialSelected = [], excludedIds, onChange, placeholder = 'Search @username' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedUser[]>([])
  const [selected, setSelected] = useState<PickedUser[]>(initialSelected)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    onChange(selected)
  }, [selected, onChange])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_users', { p_query: query.trim() })
      setSearching(false)
      if (error || !Array.isArray(data)) {
        setResults([])
        return
      }
      const selectedIds = new Set(selected.map(s => s.id))
      const filtered = (data as any[])
        .filter(u => !selectedIds.has(u.id) && !(excludedIds?.has(u.id)))
        .map(u => ({
          id: u.id,
          username: u.username,
          avatar_diamond_url: u.avatar_diamond_url,
          avatar_url: u.avatar_url,
        }))
      setResults(filtered)
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, selected, excludedIds])

  function pickUser(u: PickedUser) {
    setSelected(prev => [...prev, u])
    setQuery('')
    setResults([])
  }

  function removeUser(id: string) {
    setSelected(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selected.map(u => (
            <div key={u.id} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 4px',
              borderRadius: 14,
              background: 'var(--fg-08)',
              border: '1px solid var(--fg-15)',
            }}>
              <Diamond diamondUrl={u.avatar_diamond_url} size={20} />
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                @{u.username}
              </span>
              <button
                onClick={() => removeUser(u.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                aria-label={`Remove ${u.username}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--fg-25)',
          background: 'var(--fg-08)',
          color: 'var(--fg)',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 14,
          outline: 'none',
          boxSizing: 'border-box',
        }}
        autoFocus
      />

      {/* Results dropdown */}
      {query.trim() && (
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--fg-15)',
          borderRadius: 8,
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {searching && results.length === 0 ? (
            <div style={{ padding: '14px 12px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '14px 12px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
              No matches
            </div>
          ) : (
            results.map(u => (
              <button
                key={u.id}
                onClick={() => pickUser(u)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--fg-08)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Diamond diamondUrl={u.avatar_diamond_url} size={28} />
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>
                  @{u.username}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
