-- ================================================================
-- Migration 041: list_my_blocks_and_mutes RPC
--
-- The restrictive_profiles_block_filter policy added in migration 040
-- correctly hides blocked users from queries on the profiles table.
-- That includes the BLOCKER's own queries — so a vanilla "SELECT
-- profiles WHERE id IN (my blocks)" returns zero rows.
--
-- This RPC bypasses RLS (SECURITY DEFINER) but is gated to only
-- return profile data for users the CALLER has personally blocked
-- or muted. Cannot be used to discover anyone else's block/mute lists.
-- ================================================================

CREATE OR REPLACE FUNCTION public.list_my_blocks_and_mutes()
RETURNS TABLE (
  kind text,
  id uuid,
  username text,
  avatar_diamond_url text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    'block'::text AS kind,
    p.id,
    p.username,
    p.avatar_diamond_url,
    p.avatar_url,
    ub.created_at
  FROM public.user_blocks ub
  JOIN public.profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = auth.uid()

  UNION ALL

  SELECT
    'mute'::text,
    p.id,
    p.username,
    p.avatar_diamond_url,
    p.avatar_url,
    um.created_at
  FROM public.user_mutes um
  JOIN public.profiles p ON p.id = um.muted_id
  WHERE um.muter_id = auth.uid()

  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_blocks_and_mutes() TO authenticated;
