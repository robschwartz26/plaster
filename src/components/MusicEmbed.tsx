import { useState } from 'react'
import { parseMusicEmbed } from '@/lib/musicEmbed'

// Renders a Spotify/Bandcamp player from a stored music_embed_url.
//
// PRIVACY: by default this is CLICK-TO-LOAD — it shows a facade and fires ZERO
// third-party requests until the viewer taps "Play". Only then is the iframe mounted,
// so simply viewing a profile sets no Spotify/Bandcamp cookies and leaks no IP.
// Pass autoLoad (e.g. the editor's own preview) to mount immediately.
//
// SECURITY: parseMusicEmbed() re-validates the url at render (defence in depth) — a
// value that doesn't resolve to an allowlisted embed produces NO iframe. We host
// nothing; the player streams from the artist's own catalog. The sandbox grants only
// the minimum both players need to run (scripts/same-origin/popups); allow=
// "encrypted-media" is the sole feature (playback DRM).
export function MusicEmbed({ url, autoLoad = false }: { url: string | null | undefined; autoLoad?: boolean }) {
  const embed = parseMusicEmbed(url)
  const [loaded, setLoaded] = useState(autoLoad)
  if (!embed) return null

  if (!loaded) {
    const label = embed.provider === 'spotify' ? 'Spotify' : 'Bandcamp'
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        aria-label={`Load ${label} player`}
        style={{
          width: '100%', height: Math.min(embed.height, 152),
          borderRadius: 10, border: '1px solid var(--fg-15)', background: 'var(--fg-08)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 18px', fontFamily: '"Space Grotesk", sans-serif', textAlign: 'left',
        }}
      >
        <span style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid var(--fg-40)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ width: 0, height: 0, marginLeft: 3, borderLeft: '11px solid var(--fg-65)', borderTop: '7px solid transparent', borderBottom: '7px solid transparent' }} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>Play on {label}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-40)' }}>loads a {label} player</span>
        </span>
      </button>
    )
  }

  return (
    <iframe
      src={embed.embedSrc}
      title={embed.title}
      width="100%"
      height={embed.height}
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      allow="encrypted-media"
      referrerPolicy="no-referrer-when-downgrade"
      style={{ border: 0, borderRadius: 10, display: 'block', width: '100%', background: 'transparent' }}
    />
  )
}
