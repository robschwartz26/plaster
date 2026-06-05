CREATE OR REPLACE FUNCTION public.nearby_venue_accounts(
  user_lat double precision,
  user_lng double precision,
  max_results int default 12
)
RETURNS TABLE (
  profile_id          uuid,
  username            text,
  venue_name          text,
  neighborhood        text,
  avatar_diamond_url  text,
  distance_km         double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.id, p.username, v.name, v.neighborhood, p.avatar_diamond_url,
    6371 * acos(least(1.0,
      cos(radians(user_lat)) * cos(radians(v.location_lat)) *
      cos(radians(v.location_lng) - radians(user_lng)) +
      sin(radians(user_lat)) * sin(radians(v.location_lat))
    )) AS distance_km
  FROM profiles p
  JOIN venues v ON v.id = p.venue_id
  WHERE p.account_type = 'venue'
    AND p.is_public = true
    AND v.location_lat IS NOT NULL
    AND v.location_lng IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = auth.uid() AND f.following_id = p.id
    )
  ORDER BY distance_km ASC
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_venue_accounts(double precision, double precision, int) TO authenticated;
