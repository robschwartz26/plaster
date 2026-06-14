import { useState } from 'react'
import { SEXTANTS, SEXTANT_LABELS, neighborhoodsBySextant, type Sextant } from '@/lib/neighborhoods'

// Searchable single-select of all Portland neighborhoods, grouped under sextant
// headers with typeahead. Shared by onboarding + profile edit. onChange hands
// back both the neighborhood name (the chip) and its sextant (wall scoping).
export function NeighborhoodPicker({ value, onChange }: {
  value: string | null
  onChange: (name: string, sextant: Sextant) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const anyMatch = SEXTANTS.some(sx => neighborhoodsBySextant(sx).some(n => !q || n.name.toLowerCase().includes(q)))

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search neighborhoods… (e.g. Kenton)"
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        style={searchStyle}
      />
      <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--fg-15)', borderRadius: 10 }}>
        {SEXTANTS.map(sx => {
          const items = neighborhoodsBySextant(sx).filter(n => !q || n.name.toLowerCase().includes(q))
          if (!items.length) return null
          return (
            <div key={sx}>
              <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', padding: '6px 12px', fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', borderBottom: '1px solid var(--fg-08)' }}>
                {SEXTANT_LABELS[sx]}
              </div>
              {items.map(n => {
                const active = value === n.name
                return (
                  <button
                    key={n.name}
                    type="button"
                    onClick={() => onChange(n.name, n.sextant)}
                    style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: active ? 'rgba(168,85,247,0.12)' : 'transparent', border: 'none', borderBottom: '1px solid var(--fg-08)', color: active ? '#A855F7' : 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: active ? 700 : 500, cursor: 'pointer' }}
                  >
                    {n.name}
                  </button>
                )
              })}
            </div>
          )
        })}
        {!anyMatch && (
          <p style={{ padding: 12, margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>No match — try a different spelling.</p>
        )}
      </div>
    </div>
  )
}

const searchStyle: React.CSSProperties = { width: '100%', background: 'rgba(240,236,227,0.05)', border: '1px solid var(--fg-18)', borderRadius: 8, padding: '11px 14px', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, outline: 'none', boxSizing: 'border-box' }
