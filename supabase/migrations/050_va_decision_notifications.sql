-- ================================================================
-- Migration 050: VA decision notifications
--
-- Extends notifications.kind enum to include va_approved and va_declined.
-- Updates admin_approve_va_request and admin_decline_va_request to
-- insert an in-app notification for the user atomically with the
-- state change. Matches the pattern from admin_resolve_report.
-- ================================================================

-- ── Extend notifications kind enum ───────────────────────────────

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'mention',
    'activity_like:rsvp',
    'activity_like:wall_post',
    'activity_like:venue_post',
    'warning',
    'follow',
    'message',
    'follow_accepted',
    'reply',
    'va_approved',
    'va_declined'
  ));

-- ── Update admin_approve_va_request to insert notification ───────

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

  -- Flip account_type, clear pending
  UPDATE public.profiles
     SET account_type = v_pending,
         pending_account_type = NULL
   WHERE id = p_user_id;

  -- Notify the user. body_preview stores 'artist' or 'venue' so the
  -- client can render "Your artist account has been approved"
  INSERT INTO public.notifications (
    recipient_id, sender_id, kind, body_preview
  ) VALUES (
    p_user_id,
    v_admin_id,
    'va_approved',
    v_pending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_va_request(uuid) TO authenticated;

-- ── Update admin_decline_va_request to insert notification ───────

CREATE OR REPLACE FUNCTION public.admin_decline_va_request(p_user_id uuid)
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

  -- Capture the pending value before clearing it
  SELECT pending_account_type INTO v_pending FROM public.profiles WHERE id = p_user_id;

  -- Clear pending, don't change account_type
  UPDATE public.profiles
     SET pending_account_type = NULL
   WHERE id = p_user_id;

  -- Only notify if there was actually a pending request to decline
  IF v_pending IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, sender_id, kind, body_preview
    ) VALUES (
      p_user_id,
      v_admin_id,
      'va_declined',
      v_pending
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_decline_va_request(uuid) TO authenticated;
