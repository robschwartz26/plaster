import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { NEIGHBORHOODS } from '@/components/admin/adminShared'

// A neighborhood picker that is not a closed list. Portland's sextants plus the
// curated metro cities are always there; anything an admin has already written in
// on an existing venue joins them automatically, so "Silverton" is typed once and
// is in the dropdown for every venue after it. "Other" reveals a text field.

const OTHER = '__other_hood__'

// One fetch per page load, shared by every form that mounts the picker.
let cached: string[] | null = null
let inflight: Promise<string[]> | null = null

async function fetchVenueNeighborhoods(): Promise<string[]> {
  const { data, error } = await supabase.from('venues').select('neighborhood').not('neighborhood', 'is', null)
  if (error) { console.warn('[NeighborhoodSelect] fetch failed', error); return [] }
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of (data ?? []) as { neighborhood: string | null }[]) {
    const v = (r.neighborhood ?? '').trim()
    const k = v.toLowerCase()
    if (!v || seen.has(k)) continue
    seen.add(k); out.push(v)
  }
  cached = out
  return out
}

function loadFromVenues(): Promise<string[]> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) inflight = fetchVenueNeighborhoods()
  return inflight
}

// Lets a freshly created venue's neighborhood show up without a reload.
export function rememberNeighborhood(n: string | null | undefined) {
  const v = (n ?? '').trim()
  if (!v || !cached) return
  if (!cached.some(x => x.toLowerCase() === v.toLowerCase())) cached = [...cached, v]
}

export function useNeighborhoodOptions(extra: (string | null | undefined)[] = []): string[] {
  const [fromDb, setFromDb] = useState<string[]>(cached ?? [])
  useEffect(() => {
    let live = true
    loadFromVenues().then(list => { if (live) setFromDb(list) })
    return () => { live = false }
  }, [])
  const extraKey = extra.filter(Boolean).join('|')
  return useMemo(() => {
    const seen = new Set(NEIGHBORHOODS.map(n => n.toLowerCase()))
    const written: string[] = []
    for (const n of [...fromDb, ...extra]) {
      const v = (n ?? '').trim()
      const k = v.toLowerCase()
      if (!v || seen.has(k)) continue
      seen.add(k); written.push(v)
    }
    written.sort((a, b) => a.localeCompare(b))
    // Curated order first (Portland areas, then metro cities), write-ins after.
    return [...NEIGHBORHOODS, ...written]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDb, extraKey])
}

export function NeighborhoodSelect({ value, onChange, style, options }: {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  options?: string[]          // pass to share one list across sibling forms
}) {
  const fallback = useNeighborhoodOptions([value])
  const opts = options ?? fallback
  const [typing, setTyping] = useState(false)
  // A value that isn't in the list (hand-typed, or loaded off an older venue)
  // keeps the text field open so it stays visible and editable.
  const known = opts.some(o => o.toLowerCase() === value.trim().toLowerCase())
  const writing = typing || (!!value.trim() && !known)

  return (
    <>
      <select
        value={writing ? OTHER : value}
        onChange={e => {
          if (e.target.value === OTHER) { setTyping(true); onChange('') }
          else { setTyping(false); onChange(e.target.value) }
        }}
        style={style}
      >
        <option value="">— neighborhood / city —</option>
        {opts.map(n => <option key={n} value={n}>{n}</option>)}
        <option value={OTHER}>Other — write one in…</option>
      </select>
      {writing && (
        <input
          autoFocus={typing}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="City or neighborhood (e.g. Silverton)"
          style={style}
        />
      )}
    </>
  )
}
