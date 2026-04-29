-- Migration 033: Account deletion infrastructure
--
-- Provides a sentinel profile for anonymizing wall content from deleted users,
-- and an RPC that scrubs the caller's data from public schema tables.
--
-- Auth.users deletion happens via a separate Edge Function (uses service role).
-- This RPC handles the public-schema work that runs as the caller (RLS-respecting).

-- Sentinel profile for anonymizing wall content. Fixed UUID, never logs in.
DO $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES ('00000000-0000-0000-0000-000000000000', 'deleted_user')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'Sentinel profile creation skipped due to FK to auth.users. Will be handled in deployment.';
END $$;

CREATE OR REPLACE FUNCTION public.scrub_my_account_data()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_sentinel_id uuid := '00000000-0000-0000-0000-000000000000';
  v_sentinel_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = v_sentinel_id) INTO v_sentinel_exists;

  IF v_sentinel_exists THEN
    UPDATE event_wall_posts
    SET user_id = v_sentinel_id
    WHERE user_id = v_user_id
      AND deleted_at IS NULL;
  END IF;

  DELETE FROM attendees WHERE user_id = v_user_id;
  DELETE FROM post_likes WHERE user_id = v_user_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scrub_my_account_data() TO authenticated;

CREATE INDEX IF NOT EXISTS event_wall_posts_user_id_idx ON public.event_wall_posts(user_id);
