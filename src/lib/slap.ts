import { supabase } from '@/lib/supabase'

export interface SlapFriend {
  id: string
  username: string | null
  avatar_diamond_url: string | null
  avatar_url: string | null
}

export interface SlapCrew {
  conversationId: string
  name: string | null
  members: SlapFriend[] // excludes the current user
}

// People the current user follows (accepted) — the invitable set.
export async function fetchFriends(userId: string): Promise<SlapFriend[]> {
  const { data: f } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .eq('status', 'accepted')
  const ids = [...new Set((f ?? []).map(r => r.following_id))]
  if (!ids.length) return []
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, avatar_diamond_url, avatar_url')
    .in('id', ids)
  return (profs ?? []).sort((a, b) => (a.username ?? '').localeCompare(b.username ?? '')) as SlapFriend[]
}

// The user's existing GROUP conversations (member count > 2) → "recent crews".
export async function fetchCrews(userId: string): Promise<SlapCrew[]> {
  const { data: mine } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId)
  const convIds = [...new Set((mine ?? []).map(r => r.conversation_id))]
  if (!convIds.length) return []

  const { data: members } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id')
    .in('conversation_id', convIds)
  const byConv: Record<string, string[]> = {}
  for (const m of members ?? []) (byConv[m.conversation_id] ??= []).push(m.user_id)

  const groupIds = convIds.filter(cid => (byConv[cid]?.length ?? 0) > 2)
  if (!groupIds.length) return []

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, name, last_message_at')
    .in('id', groupIds)
  const convMeta: Record<string, { name: string | null; last: string }> = {}
  for (const c of convs ?? []) convMeta[c.id] = { name: c.name, last: c.last_message_at }

  const otherIds = [...new Set(groupIds.flatMap(cid => byConv[cid].filter(id => id !== userId)))]
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, avatar_diamond_url, avatar_url')
    .in('id', otherIds)
  const profMap: Record<string, SlapFriend> = {}
  for (const p of profs ?? []) profMap[p.id] = p as SlapFriend

  return groupIds
    .map(cid => ({
      conversationId: cid,
      name: convMeta[cid]?.name ?? null,
      members: byConv[cid].filter(id => id !== userId).map(id => profMap[id]).filter(Boolean),
    }))
    .sort((a, b) => (convMeta[b.conversationId]?.last ?? '').localeCompare(convMeta[a.conversationId]?.last ?? ''))
}

// Resolve the target thread (reuse exact-member match, or add to an existing
// thread already slapped for this event, else create), then post the slap
// message. No RSVP happens here — a slap is an invitation.
export async function slapFriends(params: {
  eventId: string
  eventTitle: string
  venueName: string | null
  startsAt: string | null
  selectedIds: string[]
  userId: string
}): Promise<{ conversationId: string }> {
  const { eventId, eventTitle, venueName, startsAt, selectedIds, userId } = params
  const targets = [...new Set(selectedIds.filter(id => id && id !== userId))]
  if (!targets.length) throw new Error('Pick at least one friend.')

  const want = new Set([userId, ...targets])
  let convId: string | null = null

  // Load my conversations + their full member sets.
  const { data: mine } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', userId)
  const myConvIds = [...new Set((mine ?? []).map(r => r.conversation_id))]
  const setByConv: Record<string, Set<string>> = {}
  if (myConvIds.length) {
    const { data: allMemb } = await supabase.from('conversation_members').select('conversation_id, user_id').in('conversation_id', myConvIds)
    for (const r of allMemb ?? []) (setByConv[r.conversation_id] ??= new Set()).add(r.user_id)

    // 1. Exact member-set match → reuse as-is.
    for (const [cid, set] of Object.entries(setByConv)) {
      if (set.size === want.size && [...want].every(id => set.has(id))) { convId = cid; break }
    }

    // 2. A thread already slapped for THIS event whose members ⊆ want → add the new people.
    if (!convId) {
      const { data: slapMsgs } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('event_id', eventId)
        .eq('message_type', 'slap')
        .in('conversation_id', myConvIds)
      for (const cid of [...new Set((slapMsgs ?? []).map(m => m.conversation_id))]) {
        const set = setByConv[cid]
        if (set && [...set].every(id => want.has(id))) {
          const toAdd = targets.filter(id => !set.has(id))
          if (toAdd.length) await supabase.rpc('add_members_to_conversation', { p_conversation_id: cid, p_member_ids: toAdd })
          convId = cid
          break
        }
      }
    }
  }

  // 3. Otherwise create a fresh, event-titled thread.
  if (!convId) {
    const { data, error } = await supabase.rpc('create_conversation_with_members', { p_member_ids: targets, p_name: eventTitle })
    if (error) throw error
    convId = data as string
  }

  const dateStr = startsAt ? new Date(startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
  const fallback = `🤚 slapped you all to go to ${eventTitle}${venueName ? ` at ${venueName}` : ''}${dateStr ? ` on ${dateStr}` : ''} — who's in?`
  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: convId, sender_id: userId, body: fallback, message_type: 'slap', event_id: eventId,
  })
  if (msgErr) throw msgErr
  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)

  return { conversationId: convId }
}
