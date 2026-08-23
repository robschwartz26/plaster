-- Migration 107: collapse the inbox N+1. loadInbox() previously fired one
-- limit-1 query PER conversation for the last-message preview (30 conversations
-- = 30 round-trips on every MSG tab mount). This returns the latest message for
-- all of the caller's conversations in one call, using the existing
-- (conversation_id, created_at DESC) index via DISTINCT ON.
CREATE OR REPLACE FUNCTION public.latest_messages(p_conv_ids uuid[])
  RETURNS TABLE (
    conversation_id uuid,
    body text,
    sender_id uuid,
    created_at timestamptz,
    media_type text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id, m.body, m.sender_id, m.created_at, m.media_type
  FROM public.messages m
  WHERE m.conversation_id = ANY(p_conv_ids)
    -- caller must be a member of the conversation (SECURITY DEFINER bypasses RLS)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = m.conversation_id
        AND cm.user_id = auth.uid()
    )
  ORDER BY m.conversation_id, m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.latest_messages(uuid[]) TO authenticated;
