-- Fix column ambiguity in social_diamond_row.
-- 'account_type' is both a column on profiles AND a column name in the RETURN TABLE,
-- causing PG to throw 42702 (ambiguous column reference) on the SELECT INTO.
-- Qualify the source column name to disambiguate.

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

  -- Fully qualify column names to avoid ambiguity with function's RETURNS TABLE columns
  SELECT profiles.account_type, profiles.show_social_publicly
    INTO v_target_type, v_target_public
  FROM profiles WHERE profiles.id = target_user_id;

  IF v_target_type = 'person' AND target_user_id != v_user_id AND NOT COALESCE(v_target_public, true) THEN
    IF NOT public.are_mutual_follows(target_user_id) THEN RETURN; END IF;
  END IF;

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
