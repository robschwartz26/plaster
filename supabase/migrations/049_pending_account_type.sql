-- Migration 049: VA (venue/artist) account onboarding infrastructure
--
-- When a user signs up and selects 'artist' or 'venue' during onboarding,
-- the account_type stays 'person' until an admin approves the request.
-- The selection is captured in pending_account_type for admin review.
--
-- RPCs:
--   admin_approve_va_request(p_user_id) — sets account_type to pending value
--     and clears pending_account_type
--   admin_decline_va_request(p_user_id) — clears pending_account_type
--     without changing account_type

-- ── Column ───────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_account_type text
  CHECK (pending_account_type IS NULL OR pending_account_type IN ('artist', 'venue'));

CREATE INDEX IF NOT EXISTS profiles_pending_account_type_idx
  ON public.profiles(pending_account_type)
  WHERE pending_account_type IS NOT NULL;

COMMENT ON COLUMN public.profiles.pending_account_type IS
  'Set when a user requests VA account status during onboarding. Admin reviews and either approves (sets account_type and clears this) or declines (clears this).';

-- ── Admin: approve VA request ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_approve_va_request(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_pending text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT pending_account_type INTO v_pending
    FROM public.profiles WHERE id = p_user_id;

  IF v_pending IS NULL THEN
    RAISE EXCEPTION 'No pending VA request for this user';
  END IF;

  UPDATE public.profiles
     SET account_type = v_pending,
         pending_account_type = NULL
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_va_request(uuid) TO authenticated;

-- ── Admin: decline VA request ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_decline_va_request(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.profiles
     SET pending_account_type = NULL
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_decline_va_request(uuid) TO authenticated;
