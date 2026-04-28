-- searchUsers: returns up to 8 users whose username starts with the given prefix.
-- Excludes the calling user. Ranks users with prior interaction first.
-- Interaction = either user has posted a wall post that mentions the other, OR
-- they have a shared message conversation (future-friendly, but harmless if no DMs yet).

CREATE OR REPLACE FUNCTION public.search_users(p_query text)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  has_interacted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_query IS NULL OR length(p_query) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH interacted AS (
    -- People who have shouted me (created notifications targeting me)
    SELECT DISTINCT n.sender_id AS user_id
    FROM notifications n
    WHERE n.recipient_id = v_user_id AND n.sender_id IS NOT NULL
    UNION
    -- People I have shouted (notifications I sent)
    SELECT DISTINCT n.recipient_id AS user_id
    FROM notifications n
    WHERE n.sender_id = v_user_id
  )
  SELECT
    p.id,
    p.username,
    p.avatar_diamond_url,
    p.avatar_url,
    EXISTS (SELECT 1 FROM interacted i WHERE i.user_id = p.id) AS has_interacted
  FROM profiles p
  WHERE p.id != v_user_id
    AND p.username IS NOT NULL
    AND LOWER(p.username) LIKE LOWER(p_query) || '%'
  ORDER BY
    has_interacted DESC,
    LOWER(p.username) ASC
  LIMIT 8;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;
