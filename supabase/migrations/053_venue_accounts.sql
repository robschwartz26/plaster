-- ================================================================
-- Migration 053: venue accounts foundation
--
-- Adds venue_id to profiles so admin-created auth users can be
-- linked to a venues row. Each venue can have at most one account.
--
-- New RPC:
--   admin_list_venues_with_account_status() — returns every venue
--   joined with its account status. Admin-only (SECURITY DEFINER,
--   checks is_admin on the caller's profile).
-- ================================================================

-- 1. Add venue_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS venue_id uuid
  REFERENCES public.venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_venue_id_idx
  ON public.profiles(venue_id);

-- One account per venue
CREATE UNIQUE INDEX IF NOT EXISTS profiles_venue_id_unique
  ON public.profiles(venue_id)
  WHERE venue_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.venue_id IS
  'Non-null only for admin-created venue accounts. Links profile to its source venues row.';

-- 2. Admin RPC: list all venues with account status
DROP FUNCTION IF EXISTS public.admin_list_venues_with_account_status();

CREATE OR REPLACE FUNCTION public.admin_list_venues_with_account_status()
RETURNS TABLE (
  venue_id          uuid,
  venue_name        text,
  neighborhood      text,
  address           text,
  has_account       boolean,
  account_profile_id uuid,
  account_username  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin
    FROM public.profiles
   WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT
    v.id                          AS venue_id,
    v.name                        AS venue_name,
    v.neighborhood                AS neighborhood,
    v.address                     AS address,
    (p.id IS NOT NULL)            AS has_account,
    p.id                          AS account_profile_id,
    p.username                    AS account_username
  FROM public.venues v
  LEFT JOIN public.profiles p ON p.venue_id = v.id
  ORDER BY v.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_venues_with_account_status() TO authenticated;
