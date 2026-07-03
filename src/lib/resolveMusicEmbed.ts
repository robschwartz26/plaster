import { supabase } from '@/lib/supabase'

// Client wrapper for the resolve-music-embed edge function (Layer 1.5).
// Turns a plain Bandcamp album/track PAGE url into an EmbeddedPlayer link by fetching
// the page server-side (the numeric id isn't in the url). Spotify never needs this —
// it's parsed client-side. The returned embedSrc is re-validated by parseMusicEmbed()
// before it's ever stored or rendered.
export async function resolveBandcamp(url: string): Promise<{ embedSrc?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-music-embed', { body: { url } })
    if (error) return { error: error.message || 'Could not load that Bandcamp link.' }
    if (data && typeof data.embedSrc === 'string') return { embedSrc: data.embedSrc }
    return { error: (data && data.error) || 'Could not find a player on that Bandcamp page.' }
  } catch {
    return { error: 'Could not load that Bandcamp link.' }
  }
}
