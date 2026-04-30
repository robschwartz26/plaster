import { useState, useEffect, useRef } from 'react'
import { searchGifs, trendingGifs, gifToSelected, type KlipyGif, type SelectedGif } from '@/lib/klipy'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  open: boolean
  onSelect: (gif: SelectedGif, query: string) => void
  onClose: () => void
}

export function GifPicker({ open, onSelect, onClose }: Props) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState<KlipyGif[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setQuery(''); return }
    setLoading(true)
    trendingGifs(1, 30, user?.id)
      .then(res => { setGifs(res.data ?? []); setLoading(false) })
      .catch(() => { setGifs([]); setLoading(false) })
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [open, user])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setLoading(true)
      trendingGifs(1, 30, user?.id)
        .then(res => { setGifs(res.data ?? []); setLoading(false) })
        .catch(() => { setGifs([]); setLoading(false) })
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      searchGifs(q, 1, 30, user?.id)
        .then(res => { setGifs(res.data ?? []); setLoading(false) })
        .catch(() => { setGifs([]); setLoading(false) })
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, open, user])

  if (!open) return null

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 320, background: 'var(--bg)',
      borderTop: '1px solid var(--fg-15)',
      zIndex: 50, display: 'flex', flexDirection: 'column',
    }}>
      {/* Search bar with KLIPY attribution */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', flexShrink: 0,
        borderBottom: '1px solid var(--fg-08)',
      }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search KLIPY"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            flex: 1, padding: '7px 12px', borderRadius: 16,
            border: '1px solid var(--fg-15)', background: 'var(--fg-08)',
            color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 13, outline: 'none',
          }}
        />
        <img
          src="/klipy-attribution.svg"
          alt="Powered by KLIPY"
          style={{ height: 16, width: 'auto', flexShrink: 0, opacity: 0.7 }}
        />
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-40)', fontSize: 20, lineHeight: 1, padding: '4px 6px', flexShrink: 0 }}
          aria-label="Close GIF picker"
        >×</button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: '24px 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
            Loading…
          </p>
        ) : gifs.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '24px 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
            No results
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {gifs.map(gif => {
              const thumb = gif.file.xs?.gif?.url ?? gif.file.sm?.gif?.url ?? ''
              if (!thumb) return null
              return (
                <button
                  key={gif.id}
                  onClick={() => onSelect(gifToSelected(gif), query.trim())}
                  style={{
                    padding: 0, border: 'none',
                    background: gif.blur_preview ? `url(${gif.blur_preview})` : 'var(--fg-08)',
                    backgroundSize: 'cover',
                    cursor: 'pointer', borderRadius: 4, overflow: 'hidden',
                    aspectRatio: '1',
                  }}
                  aria-label={gif.title ?? 'GIF'}
                >
                  <img
                    src={thumb}
                    alt={gif.title ?? ''}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
