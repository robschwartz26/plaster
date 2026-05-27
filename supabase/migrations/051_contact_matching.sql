-- ================================================================
-- Migration 051: contact matching — hash columns + secure match RPC
--
-- Privacy model:
--   Phone numbers and emails are NEVER stored in plaintext. The client
--   normalises a phone to E.164 and SHA-256 hashes both values before
--   they leave the device — only the hex digest arrives here. These
--   columns are write-only from client-facing roles: column-level
--   REVOKE prevents the `authenticated` and `anon` PostgREST roles
--   from SELECTing them directly. The only sanctioned read path is
--   match_contacts(), a SECURITY DEFINER function that accepts a
--   client-supplied array of hashes, matches them against the table,
--   and returns only safe display columns (id, username, avatar urls,
--   account_type). Hashes must be discarded client-side immediately
--   after matching and must never be logged, cached, or sent to any
--   third party.
--
-- Note: profiles_select RLS policy allows any authenticated user to
--   read all columns of public profiles. Column-level REVOKE below
--   closes the gap for phone_hash / email_hash. If hashes ever need
--   stronger isolation, move them to a separate table.
-- ================================================================

-- 1. Hash columns (no raw PII ever stored)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_hash text,
  ADD COLUMN IF NOT EXISTS email_hash text;

COMMENT ON COLUMN public.profiles.phone_hash IS
  'SHA-256 hex of E.164-normalised phone. NEVER expose in client-facing SELECTs or views — read only via match_contacts() SECURITY DEFINER RPC.';

COMMENT ON COLUMN public.profiles.email_hash IS
  'SHA-256 hex of lowercased-trimmed email. NEVER expose in client-facing SELECTs or views — read only via match_contacts() SECURITY DEFINER RPC.';

-- 2. Indexes for O(1) hash lookups
CREATE INDEX IF NOT EXISTS profiles_phone_hash_idx ON public.profiles (phone_hash);
CREATE INDEX IF NOT EXISTS profiles_email_hash_idx ON public.profiles (email_hash);

-- 3. Column-level security: prevent PostgREST roles from reading hashes
--    directly. SECURITY DEFINER functions run as their owner (postgres)
--    and are unaffected by these revocations.
REVOKE SELECT (phone_hash, email_hash) ON public.profiles FROM authenticated;
REVOKE SELECT (phone_hash, email_hash) ON public.profiles FROM anon;

-- 4. Secure match RPC — returns display columns only, never the hashes
CREATE OR REPLACE FUNCTION public.match_contacts(hashes text[])
  RETURNS TABLE (
    id                 uuid,
    username           text,
    avatar_diamond_url text,
    avatar_url         text,
    account_type       text
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
    p.account_type
  FROM public.profiles p
  WHERE (p.phone_hash = ANY(hashes) OR p.email_hash = ANY(hashes))
    AND p.id <> auth.uid()
    AND p.is_suspended = false
    AND p.is_public = true;
$$;

GRANT EXECUTE ON FUNCTION public.match_contacts(text[]) TO authenticated;
