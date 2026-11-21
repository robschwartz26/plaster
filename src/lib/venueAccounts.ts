import { supabase } from '@/lib/supabase'

// A venue without an account has no page: /venue/:id renders AccountProfile,
// which resolves the venue through profiles.venue_id and shows "Not found" when
// there isn't one. So an account is not an extra — it is the thing that makes a
// venue reachable, and every path that creates a venue should create one.
//
// Why this is a helper and not a database trigger: the account needs
// auth.admin.createUser (a real auth user, hashed password, identity row), which
// SQL cannot do. A trigger would mean pg_net, a service-role credential stored
// in the database, and a service-role bypass in the edge function's admin guard
// — new infrastructure and a new secret surface for four call sites that all
// already hold an admin session. If venue creation ever moves server-side, a
// database webhook becomes the right answer instead.
//
// Deliberately non-fatal: a venue that exists without its account is recoverable
// (Staff → Venues → "Create accounts for all N missing venues" is idempotent and
// still there as a backstop). A venue that failed to save because its account
// errored is just lost work.
export async function ensureVenueAccount(venueId: string): Promise<{ error: string | null }> {
  try {
    // silent: creates the account without generating or storing a password.
    // One is issued later, per venue, via "Send access" if the venue asks.
    const { error } = await supabase.functions.invoke('create-venue-account', {
      body: { venue_id: venueId, silent: true },
    })
    if (error) throw error
    return { error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[ensureVenueAccount] no account for venue', venueId, '—', msg,
      '· recoverable from Staff → Venues → Create accounts for all missing venues')
    return { error: msg }
  }
}
