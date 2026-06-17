-- Co-member identity inside shared conversations.
--
-- The profiles SELECT RLS policy is:
--   (is_public = true) OR (auth.uid() = id) OR is_admin(auth.uid())
-- There is no follower (or co-member) exception, so a PRIVATE member of a group
-- you're in is hidden from you entirely: no name, no diamond, no message-bubble
-- avatar. That breaks group chat — you see their messages but not who they are.
--
-- Shared conversation membership is the consent (this is how iMessage/WhatsApp/
-- Signal behave): if we're in a thread together you can see my username + avatar.
-- This SECURITY DEFINER function returns identity-level fields ONLY, scoped to
-- people who share a conversation with the caller, and still honors blocks
-- (the restrictive block filter is bypassed by SECURITY DEFINER, so we re-apply
-- it manually). The full-resolution portrait is NOT returned here — fetching it
-- still goes through the is_public RLS, so a private member's full photo stays
-- private (AvatarFullscreen shows a locked state).

CREATE OR REPLACE FUNCTION public.get_my_conversation_members()
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.username, p.avatar_diamond_url, p.avatar_url
  FROM public.conversation_members me
  JOIN public.conversation_members other
    ON other.conversation_id = me.conversation_id
  JOIN public.profiles p
    ON p.id = other.user_id
  WHERE me.user_id = auth.uid()
    AND other.user_id <> auth.uid()
    AND NOT public.is_blocked_either_way(auth.uid(), p.id);
$$;

REVOKE ALL ON FUNCTION public.get_my_conversation_members() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_conversation_members() TO authenticated;
