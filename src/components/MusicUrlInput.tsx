import { useEffect, useState } from 'react'
import { parseMusicEmbed, isBandcampPageUrl } from '@/lib/musicEmbed'
import { resolveBandcamp } from '@/lib/resolveMusicEmbed'
import { MusicEmbed } from '@/components/MusicEmbed'

// Reusable Spotify/Bandcamp link input: validates, resolves Bandcamp page urls via
// the edge function (debounced), and previews the player. Reports the storable
// (effective) url + validity to the parent via onEffectiveChange. The parent keeps
// the raw text in `value`.
export function MusicUrlInput({
  value,
  onChange,
  onEffectiveChange,
  placeholder = 'Paste a Spotify or Bandcamp link',
}: {
  value: string
  onChange: (v: string) => void
  onEffectiveChange?: (effective: string, valid: boolean) => void
  placeholder?: string
}) {
  const [resolvedEmbed, setResolvedEmbed] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  // Bandcamp page urls carry no player id → resolve server-side (debounced).
  useEffect(() => {
    const raw = value.trim()
    setResolveError(null)
    if (!raw || parseMusicEmbed(raw) || !isBandcampPageUrl(raw)) {
      setResolvedEmbed(null); setResolving(false); return
    }
    setResolvedEmbed(null); setResolving(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const { embedSrc, error } = await resolveBandcamp(raw)
      if (cancelled) return
      setResolving(false)
      if (embedSrc && parseMusicEmbed(embedSrc)) setResolvedEmbed(embedSrc)
      else setResolveError(error ?? 'Could not load that Bandcamp link.')
    }, 600)
    return () => { cancelled = true; clearTimeout(t) }
  }, [value])

  const effective = parseMusicEmbed(value) ? value.trim() : (resolvedEmbed ?? '')
  const valid = !!parseMusicEmbed(effective)
  const bad = value.trim() !== '' && !valid && !resolving

  useEffect(() => { onEffectiveChange?.(effective, valid) }, [effective, valid]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <input
        type="url"
        inputMode="url"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${bad ? 'var(--sold-out)' : 'var(--fg-18)'}`, background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
      />
      <p style={{ margin: '6px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', lineHeight: 1.5 }}>
        Paste your Spotify or Bandcamp link — track, album, or artist.
      </p>
      {resolving && (
        <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>Loading that Bandcamp link…</p>
      )}
      {bad && (
        <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--sold-out)' }}>
          {resolveError ?? 'Paste a Spotify or Bandcamp link.'}
        </p>
      )}
      {valid && (
        <div style={{ marginTop: 12 }}>
          <MusicEmbed url={effective} autoLoad />
        </div>
      )}
    </>
  )
}
