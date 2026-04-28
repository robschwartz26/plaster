-- Update list_followers and list_following to respect profiles.show_social_publicly.
-- If target has show_social_publicly=true: anyone can see (no gating).
-- If target has show_social_publicly=false: only the user themselves or mutual follows can see.
-- Note: artists and venues bypass this entirely — their followers/following are always public.
-- Must DROP first because the return type gains account_type (PG won't replace with different signature).

DROP FUNCTION IF EXISTS public.list_followers(uuid);
DROP FUNCTION IF EXISTS public.list_following(uuid);

CREATE FUNCTION public.list_followers(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  account_type text,
  followed_at timestamptz
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

  -- Artists and venues: always public
  -- Persons: respect show_social_publicly; if private, gate to self + mutual follows
  IF v_target_type = 'person' AND target_user_id != v_user_id AND NOT COALESCE(v_target_public, true) THEN
    IF NOT public.are_mutual_follows(target_user_id) THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.avatar_diamond_url, p.avatar_url, p.account_type, f.accepted_at
  FROM follows f
  JOIN profiles p ON p.id = f.follower_id
  WHERE f.following_id = target_user_id AND f.status = 'accepted'
  ORDER BY f.accepted_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_followers(uuid) TO authenticated;

CREATE FUNCTION public.list_following(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  account_type text,
  followed_at timestamptz
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

  IF v_target_type = 'person' AND target_user_id != v_user_id AND NOT COALESCE(v_target_public, true) THEN
    IF NOT public.are_mutual_follows(target_user_id) THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.avatar_diamond_url, p.avatar_url, p.account_type, f.accepted_at
  FROM follows f
  JOIN profiles p ON p.id = f.following_id
  WHERE f.follower_id = target_user_id AND f.status = 'accepted'
  ORDER BY f.accepted_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_following(uuid) TO authenticated;
