// Music embed parser/validator — Layer 1 of "the poster you can hear".
//
// SECURITY MODEL: link-in, iframe-built-by-us. We NEVER accept raw <iframe> HTML or
// arbitrary domains. We accept only a URL whose host is on the allowlist
// (open.spotify.com / bandcamp.com / *.bandcamp.com), extract the id ourselves, and
// CONSTRUCT the embed src. parseMusicEmbed() is the single source of truth and is
// called BOTH on input (editor validation + preview) AND at render (defence in depth),
// so a tampered stored value can never reach an <iframe src>.

export type MusicProvider = 'spotify' | 'bandcamp'

export interface MusicEmbed {
  provider: MusicProvider
  /** The src WE construct and put in the iframe — always an allowlisted embed URL. */
  embedSrc: string
  height: number
  title: string
}

const SPOTIFY_TYPES = ['track', 'album', 'artist', 'playlist', 'episode', 'show'] as const
type SpotifyType = (typeof SPOTIFY_TYPES)[number]

// Spotify ids are base62. Be lenient on length, strict on charset.
const SPOTIFY_ID_RE = /^[A-Za-z0-9]{8,40}$/
// Bandcamp EmbeddedPlayer ids are numeric.
const BANDCAMP_ID_RE = /^\d{3,20}$/

/** Normalise loose input into a URL (tolerate a missing scheme) or return null. */
function toURL(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withScheme)
  } catch {
    return null
  }
}

function parseSpotify(u: URL): MusicEmbed | null {
  if (u.hostname !== 'open.spotify.com') return null
  // Path may be /{type}/{id}, /embed/{type}/{id}, or /intl-xx/{type}/{id}.
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs[0] === 'embed') segs.shift()
  if (/^intl-[a-z]{2}$/i.test(segs[0] ?? '')) segs.shift()
  const [type, id] = segs
  if (!SPOTIFY_TYPES.includes(type as SpotifyType)) return null
  if (!id || !SPOTIFY_ID_RE.test(id)) return null
  const t = type as SpotifyType
  const compact = t === 'track' || t === 'episode'
  return {
    provider: 'spotify',
    embedSrc: `https://open.spotify.com/embed/${t}/${id}`,
    height: compact ? 152 : 352,
    title: `Spotify ${t} player`,
  }
}

function parseBandcamp(u: URL): MusicEmbed | null {
  const okHost = u.hostname === 'bandcamp.com' || u.hostname.endsWith('.bandcamp.com')
  if (!okHost) return null
  // We can only build a player from the EmbeddedPlayer link (Share → Embed), which
  // carries the numeric id as an `album=NNN` / `track=NNN` path segment. A plain
  // page URL (name.bandcamp.com/track/slug) does NOT contain the id — reject it.
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs[0]?.toLowerCase() !== 'embeddedplayer') return null
  let kind: 'album' | 'track' | null = null
  let id: string | null = null
  for (const seg of segs) {
    const m = /^(album|track)=(\d+)$/.exec(seg)
    if (m) { kind = m[1] as 'album' | 'track'; id = m[2]; break }
  }
  if (!kind || !id || !BANDCAMP_ID_RE.test(id)) return null
  // Construct our own player src with our own params (never pass theirs through).
  const params = `${kind}=${id}/size=large/bgcol=333333/linkcol=ffffff/tracklist=false/transparent=true`
  return {
    provider: 'bandcamp',
    embedSrc: `https://bandcamp.com/EmbeddedPlayer/${params}/`,
    height: kind === 'album' ? 470 : 120,
    title: `Bandcamp ${kind} player`,
  }
}

/**
 * Parse a pasted Spotify/Bandcamp link into a safe, self-constructed embed.
 * Returns null for anything not on the allowlist or not resolvable — callers
 * must treat null as "invalid / do not render".
 */
export function parseMusicEmbed(raw: string | null | undefined): MusicEmbed | null {
  if (!raw) return null
  const u = toURL(raw)
  if (!u) return null
  if (u.protocol !== 'https:') return null
  return parseSpotify(u) ?? parseBandcamp(u)
}

/** True if the input resolves to a valid Spotify/Bandcamp embed. */
export function isValidMusicUrl(raw: string | null | undefined): boolean {
  return parseMusicEmbed(raw) !== null
}
