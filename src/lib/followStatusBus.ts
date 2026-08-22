import { supabase } from '@/lib/supabase'

// One shared realtime subscription to `follows` for the whole app, instead of
// one per FollowButton. FindFriends renders 40+ buttons at once; previously
// that opened 40 server-side subscriptions and every follow change fired 40
// RPCs. Now: a single channel, and mounted buttons register a callback that
// fires (debounced) when follows changes.

type Listener = () => void
const listeners = new Set<Listener>()
let channel: ReturnType<typeof supabase.channel> | null = null
let currentUserId: string | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

function notify() {
  if (debounce) clearTimeout(debounce)
  // Collapse a burst of follows changes into one refresh round.
  debounce = setTimeout(() => { for (const l of listeners) l() }, 300)
}

/** Subscribe to follows-changed notifications. Returns an unsubscribe fn. */
export function subscribeFollowChanges(userId: string, cb: Listener): () => void {
  // (Re)open the shared channel if the user changed or it isn't open.
  if (!channel || currentUserId !== userId) {
    if (channel) supabase.removeChannel(channel)
    currentUserId = userId
    channel = supabase
      .channel(`follows-shared-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, notify)
      .subscribe()
  }
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && channel) {
      supabase.removeChannel(channel)
      channel = null
      currentUserId = null
      if (debounce) { clearTimeout(debounce); debounce = null }
    }
  }
}
