import { useEffect, useRef, useState } from 'react'
import type { WallEvent } from '@/types/event'

// Fading paper-disc media rail on the 1-col poster face (focused view only). Music →
// Spotify/YouTube/Google; Comedy → YouTube/Google. Summons on arrival + on tap, fades
// after ~6s. Discs carry data-artist-rail so PosterCard's gesture guard ignores taps
// on them (no stolen swipe / double-tap-like). Universal search links only.

type Disc = 'spotify' | 'youtube' | 'google'
const RAIL_CONFIG: Record<string, Disc[]> = {
  'Live Music': ['spotify', 'youtube', 'google'],
  'Jazz':       ['spotify', 'youtube', 'google'],
  'Classical':  ['spotify', 'youtube', 'google'],
  'Dance':      ['spotify', 'youtube', 'google'],
  'Comedy':     ['youtube', 'google'],
  'Drag':       ['youtube', 'google'],   // performers have real YT presence
  'Film':       ['youtube', 'google'],   // YouTube search = the trailer
  'Theater':    ['google'],
  'Burlesque':  ['google'],
  'Art':        ['google'],
  'Literary':   ['google'],
  'Spoken':     ['google'],
  'Trivia':     ['google'],
  'Karaoke':    ['google'],
  'Other':      ['google'],
}
export function hasRail(category: string | null | undefined): boolean {
  return !!category && category in RAIL_CONFIG
}
function cleanArtist(e: WallEvent): string {
  const raw = (e.artist_name && e.artist_name.trim()) || e.title || ''
  return raw
    .replace(/\s*[([]\s*sold[\s-]?out\s*[)\]]/gi, '')
    .replace(/\bsold[\s-]?out\b\s*[:\-–]?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}
// Google gets a genre qualifier so the search lands on the right person —
// "…band" for musicians, "…comedian" for comedy (not "John Mulaney band").
const GOOGLE_SUFFIX: Record<string, string> = {
  'Live Music': 'band', 'Jazz': 'jazz', 'Classical': 'classical', 'Dance': 'band',
  'Comedy': 'comedian', 'Drag': 'drag queen', 'Theater': 'play Portland',
  'Burlesque': 'burlesque', 'Film': 'film', 'Art': 'artist', 'Literary': 'author',
  'Spoken': 'poet', 'Trivia': 'trivia Portland', 'Karaoke': 'Portland',
  'Other': 'Portland',
}
const HREF: Record<Disc, (q: string, category: string) => string> = {
  spotify: q => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  youtube: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  google:  (q, category) => `https://www.google.com/search?q=${encodeURIComponent(`${q} ${GOOGLE_SUFFIX[category] ?? 'band'}`)}`,
}

// Discs are always paper-and-ink, NOT theme-aware: a black disc on the dark night
// poster disappears, so we pin the day colors (cream paper #f0ece3 + ink #0c0b0b)
// in both themes.
const PAPER = '#f0ece3'
const INK = '#0c0b0b'
const svgBase = { width: 17, height: 17, viewBox: '0 0 26 26', fill: 'none', stroke: INK, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const ICON: Record<Disc, React.ReactNode> = {
  youtube: (
    <svg {...svgBase}>
      <rect x="3.5" y="7" width="19" height="12" rx="3.6" strokeWidth="2" />
      <path d="M11 10.2 L16.6 13 L11 15.8 Z" fill={INK} stroke="none" />
    </svg>
  ),
  spotify: (
    <svg {...svgBase}>
      <circle cx="13" cy="13" r="9.6" strokeWidth="2" />
      <path d="M8 10.6 c3.6-1.05 7.2-0.6 10 1.05" strokeWidth="1.9" />
      <path d="M8.5 13.5 c2.95-0.85 5.9-0.45 8.3 0.95" strokeWidth="1.9" />
      <path d="M9 16.2 c2.35-0.65 4.7-0.35 6.7 0.8" strokeWidth="1.9" />
    </svg>
  ),
  google: (
    <svg {...svgBase}>
      <path d="M13 13 H21.4" strokeWidth="2.3" />
      <path d="M21.4 13 A8.4 8.4 0 1 1 18.9 7" strokeWidth="2.3" />
    </svg>
  ),
}

// ring: optional 1.5px ink outline for near-beige posters (default off — dialed later).
export function ArtistRail({ event, summon, ring = false }: { event: WallEvent; summon: number; ring?: boolean }) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setVisible(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), 6000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [summon])

  const discs = RAIL_CONFIG[event.category] ?? []
  const q = cleanArtist(event)
  if (discs.length === 0 || !q) return null

  return (
    <div data-artist-rail style={{
      position: 'absolute', right: 8, bottom: 'calc(env(safe-area-inset-bottom) + 44px)',
      display: 'flex', flexDirection: 'column', gap: 10, zIndex: 8,
      pointerEvents: 'none', opacity: visible ? 1 : 0, transition: 'opacity 1.2s ease',
    }}>
      {discs.map(kind => (
        <a
          key={kind}
          data-artist-rail
          href={HREF[kind](q, event.category)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search this artist on ${kind}`}
          style={{
            pointerEvents: visible ? 'auto' : 'none',
            width: 36, height: 36, borderRadius: '50%',
            background: PAPER,
            boxShadow: '0 1px 5px rgba(0,0,0,0.42)',
            border: ring ? `1.5px solid ${INK}` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', flexShrink: 0,
          }}
        >
          {ICON[kind]}
        </a>
      ))}
    </div>
  )
}
