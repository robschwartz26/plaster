-- ================================================================
-- Migration 052: match_contacts — return matched hashes for client contact-name pairing
--
-- Privacy note: we only ever echo back hashes the caller themselves supplied.
-- No new information is leaked — this tells the caller WHICH of their own
-- contact hashes matched, so the client can look up the contact display name
-- from its local hash→contact map without a second round-trip.
-- ================================================================

DROP FUNCTION IF EXISTS public.match_contacts(text[]);

CREATE OR REPLACE FUNCTION public.match_contacts(hashes text[])
  RETURNS TABLE (
    id                 uuid,
    username           text,
    avatar_diamond_url text,
    avatar_url         text,
    account_type       text,
    matched_phone_hash text,
    matched_email_hash text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.avatar_diamond_url,
    p.avatar_url,
    p.account_type,
    CASE WHEN p.phone_hash = ANY(hashes) THEN p.phone_hash ELSE NULL END,
    CASE WHEN p.email_hash = ANY(hashes) THEN p.email_hash ELSE NULL END
  FROM public.profiles p
  WHERE (p.phone_hash = ANY(hashes) OR p.email_hash = ANY(hashes))
    AND p.id <> auth.uid()
    AND p.is_suspended = false
    AND p.is_public = true;
$$;

GRANT EXECUTE ON FUNCTION public.match_contacts(text[]) TO authenticated;
