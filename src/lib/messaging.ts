import { supabase } from './supabase'

/**
 * Returns the ID of the 1-on-1 conversation between the current user and otherUserId.
 * If one exists, returns it. If not, creates a new conversation + 2 members rows.
 */
export async function createOrGetConversation(otherUserId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (user.id === otherUserId) return null

  // Look for existing 1-on-1 conversation between these two users
  // Strategy: find conversations where I am a member, then check if otherUserId is also a member
  const { data: myConvs } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', user.id)

  if (myConvs && myConvs.length) {
    const ids = myConvs.map((c: { conversation_id: string }) => c.conversation_id)
    const { data: shared } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', otherUserId)
      .in('conversation_id', ids)

    if (shared && shared.length) {
      return (shared[0] as { conversation_id: string }).conversation_id
    }
  }

  // Create new
  const { data: newConv, error: convErr } = await supabase
    .from('conversations')
    .insert({})
    .select('id')
    .single()

  if (convErr || !newConv) {
    console.error('Failed to create conversation:', convErr)
    return null
  }

  const { error: memberErr } = await supabase
    .from('conversation_members')
    .insert([
      { conversation_id: newConv.id, user_id: user.id },
      { conversation_id: newConv.id, user_id: otherUserId },
    ])

  if (memberErr) {
    console.error('Failed to insert conversation members:', memberErr)
    return null
  }

  return newConv.id
}

export async function markConversationRead(conversationId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
}
