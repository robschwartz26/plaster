-- Soft-delete for messages and conversation dismissal

-- 1. messages.deleted_at — sender can hide their own message
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. conversation_members.deleted_at — user can dismiss a convo from their inbox
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 3. RPC: soft-delete one message (sender only)
CREATE OR REPLACE FUNCTION soft_delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET deleted_at = now()
  WHERE id = p_message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NULL;
END;
$$;

-- 4. RPC: dismiss a conversation (hides it from the calling user's inbox)
CREATE OR REPLACE FUNCTION dismiss_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_members
  SET deleted_at = now()
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();
END;
$$;

-- 5. Trigger: a new message restores any dismissed member rows so the convo
--    reappears in the inbox of users who had swiped it away
CREATE OR REPLACE FUNCTION restore_dismissed_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_members
  SET deleted_at = NULL
  WHERE conversation_id = NEW.conversation_id
    AND deleted_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restore_dismissed_on_new_message ON messages;
CREATE TRIGGER restore_dismissed_on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION restore_dismissed_conversation();

GRANT EXECUTE ON FUNCTION soft_delete_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION dismiss_conversation(uuid) TO authenticated;
