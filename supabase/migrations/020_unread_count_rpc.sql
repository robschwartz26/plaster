-- Returns combined count of:
-- 1. Unread shouts (notifications.read_at IS NULL for this user)
-- 2. Unread messages: messages newer than the user's last_read_at
--    on each conversation they're a member of, excluding their own messages

CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_shouts integer := 0;
  v_messages integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_shouts
  FROM notifications
  WHERE recipient_id = v_user_id AND read_at IS NULL;

  -- Messages count: unread messages across all of the user's conversations.
  -- messages.sender_id (not user_id) identifies who sent the message.
  SELECT COUNT(*) INTO v_messages
  FROM messages m
  JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
  WHERE cm.user_id = v_user_id
    AND m.sender_id != v_user_id
    AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at);

  RETURN v_shouts + v_messages;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_count() TO authenticated;
