import { parseMusicEmbed } from '@/lib/musicEmbed'

// Renders a Spotify/Bandcamp player from a stored music_embed_url.
// - Re-validates the URL at render (defence in depth): a value that doesn't resolve
//   to an allowlisted embed produces NO iframe.
// - We host nothing; the player streams from the artist's own catalog.
// - loading="lazy" defers the third-party load until near-viewport.
// - Sandbox is tight: only allow-scripts / allow-same-origin / allow-popups, which is
//   the minimum both players need to run. No forms, modals, or top-navigation.
//   allow="encrypted-media" is the only feature granted (playback DRM).
export function MusicEmbed({ url }: { url: string | null | undefined }) {
  const embed = parseMusicEmbed(url)
  if (!embed) return null
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
