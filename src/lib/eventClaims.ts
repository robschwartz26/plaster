import { supabase } from '@/lib/supabase'

// Data layer for Layer 2 — artist self-claims a show + attaches a per-show track.
// RLS enforces the rules (approved = public, own claim visible, artist-only insert,
// admin-only approve); this module is just typed queries.

export type ClaimStatus = 'pending' | 'approved' | 'rejected'

export interface MyClaim {
  id: string
  status: ClaimStatus
  track_url: string | null
}

export interface PendingClaim {
  id: string
  event_id: string
  track_url: string | null
  requested_at: string
  event: { title: string | null; poster_url: string | null; starts_at: string | null } | null
  artist: { username: string | null; avatar_diamond_url: string | null } | null
}

/** Approved track to play on a poster (earliest-approved claim that has a track). */
export async function fetchApprovedTrack(eventId: string): Promise<{ trackUrl: string; username: string | null } | null> {
  const { data } = await supabase
    .from('event_artists')
    .select('track_url, artist:profiles!artist_id(username)')
    .eq('event_id', eventId)
    .eq('status', 'approved')
    .not('track_url', 'is', null)
    .order('reviewed_at', { ascending: true })
    .limit(1)
  const row = (data as unknown as { track_url: string | null; artist: { username: string | null } | null }[] | null)?.[0]
  if (!row?.track_url) return null
  return { trackUrl: row.track_url, username: row.artist?.username ?? null }
}

/** The current user's own claim for this event (any status), if any. */
export async function fetchMyClaim(eventId: string, userId: string): Promise<MyClaim | null> {
  const { data } = await supabase
    .from('event_artists')
    .select('id, status, track_url')
    .eq('event_id', eventId)
    .eq('artist_id', userId)
    .maybeSingle()
  return (data as MyClaim | null) ?? null
}

export async function submitClaim(eventId: string, userId: string, trackUrl: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('event_artists')
    .insert({ event_id: eventId, artist_id: userId, track_url: trackUrl, status: 'pending' })
  return error ? { error: error.message } : {}
}

export async function withdrawClaim(id: string): Promise<void> {
  await supabase.from('event_artists').delete().eq('id', id)
}

// ── Admin ──────────────────────────────────────────────────────────────────
export async function fetchPendingClaims(): Promise<PendingClaim[]> {
  const { data } = await supabase
    .from('event_artists')
    .select('id, event_id, track_url, requested_at, event:events!event_id(title, poster_url, starts_at), artist:profiles!artist_id(username, avatar_diamond_url)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
  return (data as unknown as PendingClaim[] | null) ?? []
}

export async function decideClaim(id: string, status: 'approved' | 'rejected', reviewerId: string): Promise<void> {
  await supabase
    .from('event_artists')
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
}
