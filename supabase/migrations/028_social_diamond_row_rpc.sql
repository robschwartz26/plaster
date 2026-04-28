-- Dedicated RPC for the social diamond row UI surface.
-- Returns pending incoming follow requests first (only when viewing your own profile),
-- then accepted follows (people the target user follows), ordered most-recent first.
-- Respects profiles.show_social_publicly: if private and viewer isn't them or a mutual
-- follow, returns empty.

CREATE OR REPLACE FUNCTION public.social_diamond_row(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  account_type text,
  kind text,
  follow_row_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_target_type text;
  v_target_public boolean;
BEGIN
  IF v_user_id IS NULL OR target_user_id IS NULL THEN RETURN; END IF;

  SELECT account_type, show_social_publicly INTO v_target_type, v_target_public
  FROM profiles WHERE id = target_user_id;

  -- Privacy gate: persons with show_social_publicly=false are visible only to themselves
  -- or mutual follows. Artists/venues are always public.
  IF v_target_type = 'person' AND target_user_id != v_user_id AND NOT COALESCE(v_target_public, true) THEN
    IF NOT public.are_mutual_follows(target_user_id) THEN RETURN; END IF;
  END IF;

  -- Pending incoming requests (only when viewing your OWN profile)
  IF target_user_id = v_user_id THEN
    RETURN QUERY
    SELECT
      p.id,
      p.username,
      p.avatar_diamond_url,
      p.avatar_url,
      p.account_type,
      'pending_incoming'::text AS kind,
      f.id AS follow_row_id,
      f.created_at
    FROM follows f
    JOIN profiles p ON p.id = f.follower_id
    WHERE f.following_id = v_user_id
      AND f.status = 'pending'
    ORDER BY f.created_at DESC;
  END IF;

  -- Accepted follows (people the target follows)
  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.avatar_diamond_url,
    p.avatar_url,
    p.account_type,
    'following'::text AS kind,
    f.id AS follow_row_id,
    f.accepted_at AS created_at
  FROM follows f
  JOIN profiles p ON p.id = f.following_id
  WHERE f.follower_id = target_user_id
    AND f.status = 'accepted'
  ORDER BY f.accepted_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.social_diamond_row(uuid) TO authenticated;
