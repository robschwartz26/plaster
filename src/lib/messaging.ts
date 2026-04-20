import { supabase } from './supabase'

export async function createOrGetConversation(otherUserId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_or_get_conversation', {
    other_user_id: otherUserId,
  })

  if (error) {
    console.error('[msg-debug] rpc failed:', JSON.stringify(error))
    return null
  }

  return data as string | null
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
