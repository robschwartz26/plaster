-- Migration 034: Group chats
--
-- Existing schema (008_messaging) supports many-to-many already via conversation_members.
-- This adds: optional name, creator tracking, and SECURITY DEFINER RPCs to create
-- group conversations and add members (since current RLS only allows users to
-- insert their own membership).

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create a conversation with a list of members (caller is automatically added).
-- Returns the new conversation's id.
CREATE OR REPLACE FUNCTION public.create_conversation_with_members(
  p_member_ids uuid[],
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_conv_id uuid;
  v_member_id uuid;
  v_all_members uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one member required';
  END IF;

  -- Build full member list (caller + provided IDs, deduplicated)
  v_all_members := ARRAY(SELECT DISTINCT unnest(array_append(p_member_ids, v_user_id)));

  -- Validate all members exist as profiles
  IF (SELECT COUNT(*) FROM profiles WHERE id = ANY(v_all_members)) != array_length(v_all_members, 1) THEN
    RAISE EXCEPTION 'One or more member IDs are invalid';
  END IF;

  -- Create conversation
  INSERT INTO conversations (name, created_by)
  VALUES (p_name, v_user_id)
  RETURNING id INTO v_conv_id;

  -- Insert all members
  FOREACH v_member_id IN ARRAY v_all_members
  LOOP
    INSERT INTO conversation_members (conversation_id, user_id)
    VALUES (v_conv_id, v_member_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_conversation_with_members(uuid[], text) TO authenticated;

-- Add members to an existing conversation. Caller must already be a member.
-- New members see full message history (no backfill restriction — they just become members).
CREATE OR REPLACE FUNCTION public.add_members_to_conversation(
  p_conversation_id uuid,
  p_member_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_added_count integer := 0;
  v_is_member boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must already be in the conversation
  SELECT EXISTS(
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = v_user_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'You are not a member of this conversation';
  END IF;

  -- Add each new member (skip if already in)
  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    -- Skip caller (already in) and validate member exists
    IF v_member_id = v_user_id THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_member_id) THEN CONTINUE; END IF;

    INSERT INTO conversation_members (conversation_id, user_id)
    VALUES (p_conversation_id, v_member_id)
    ON CONFLICT DO NOTHING;

    -- Count actual inserts (ON CONFLICT DO NOTHING returns 0 affected rows)
    IF FOUND THEN
      v_added_count := v_added_count + 1;
    END IF;
  END LOOP;

  RETURN v_added_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_members_to_conversation(uuid, uuid[]) TO authenticated;
