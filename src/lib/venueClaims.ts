import { supabase } from '@/lib/supabase'

// Data layer for venue self-claiming: an unattached venue ACCOUNT requests
// attachment to a venues row; admin approves (admin_approve_venue_claim RPC
// sets profiles.venue_id) or rejects. Mirrors eventClaims.ts.

export type VenueClaimStatus = 'pending' | 'approved' | 'rejected'

export interface MyVenueClaim {
  id: string
  venue_id: string
  status: VenueClaimStatus
}

export interface PendingVenueClaim {
  id: string
  venue_id: string
  requested_at: string
  venue: { name: string | null; neighborhood: string | null } | null
  claimant: { username: string | null; avatar_diamond_url: string | null } | null
}

/** The signed-in venue account's most recent claim, if any. */
export async function fetchMyVenueClaim(profileId: string): Promise<MyVenueClaim | null> {
  const { data } = await supabase
    .from('venue_claims')
    .select('id, venue_id, status')
    .eq('profile_id', profileId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as MyVenueClaim | null) ?? null
}

/** File a claim + fire the email alert (alert failure never blocks the claim). */
export async function submitVenueClaim(profileId: string, venueId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('venue_claims')
    .insert({ profile_id: profileId, venue_id: venueId })
  if (error) {
    if (error.code === '23505') return { error: 'You already have a claim pending.' }
    return { error: error.message }
  }
  supabase.functions.invoke('claim-alert', { body: { kind: 'venue_claim' } })
    .then(({ error: e }) => { if (e) console.warn('[venueClaims] alert email failed:', e) })
  return { error: null }
}

/** Admin: open queue. */
export async function fetchPendingVenueClaims(): Promise<PendingVenueClaim[]> {
  const { data } = await supabase
    .from('venue_claims')
    .select('id, venue_id, requested_at, venue:venues(name, neighborhood), claimant:profiles!venue_claims_profile_id_fkey(username, avatar_diamond_url)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
  return (data as unknown as PendingVenueClaim[] | null) ?? []
}

export async function approveVenueClaim(claimId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_approve_venue_claim', { p_claim_id: claimId })
  return { error: error?.message ?? null }
}

export async function rejectVenueClaim(claimId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_reject_venue_claim', { p_claim_id: claimId })
  return { error: error?.message ?? null }
}

// ── Public artist tags (poster info panel) ─────────────────────────────

export interface ArtistTag {
  artist_id: string
  username: string | null
  avatar_diamond_url: string | null
}

/** Approved artist tags for an event — SECURITY DEFINER RPC, works for guests. */
export async function fetchArtistTags(eventId: string): Promise<ArtistTag[]> {
  const { data } = await supabase.rpc('event_artist_tags', { p_event_id: eventId })
  return (data as ArtistTag[] | null) ?? []
}
