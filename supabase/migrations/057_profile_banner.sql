-- (a) Add banner columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url      text,
  ADD COLUMN IF NOT EXISTS banner_focal_y  real NOT NULL DEFAULT 0.5;

COMMENT ON COLUMN public.profiles.banner_url     IS 'Wide banner image for venue/artist profile pages.';
COMMENT ON COLUMN public.profiles.banner_focal_y IS 'Vertical focal point 0..1 for banner object-position.';

-- (b) Recreate admin RPC with imagery fields
DROP FUNCTION IF EXISTS public.admin_list_venues_with_account_status();

CREATE OR REPLACE FUNCTION public.admin_list_venues_with_account_status()
RETURNS TABLE (
  venue_id                  uuid,
  venue_name                text,
  neighborhood              text,
  address                   text,
  has_account               boolean,
  account_profile_id        uuid,
  account_username          text,
  account_banner_url        text,
  account_avatar_diamond_url text
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
    p.username                    AS account_username,
    p.banner_url                  AS account_banner_url,
    p.avatar_diamond_url          AS account_avatar_diamond_url
  FROM public.venues v
  LEFT JOIN public.profiles p ON p.venue_id = v.id
  ORDER BY v.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_venues_with_account_status() TO authenticated;
