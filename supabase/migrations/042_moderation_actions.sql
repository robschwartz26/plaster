-- ================================================================
-- Migration 042: moderation actions for admin report resolution
--
-- Adds infrastructure for the admin reports queue UI:
--
-- 1. profiles.is_suspended boolean column. Soft-suspended users can
--    sign in and view content but are blocked from posting,
--    messaging, liking. Reversible.
--
-- 2. Extends notifications_kind_check enum to allow 'warning' so
--    admins can send a warning to a user that surfaces in their
--    notification inbox.
--
-- 3. RESTRICTIVE policies on event_wall_posts INSERT, post_likes
--    INSERT, event_likes INSERT, attendees INSERT, messages INSERT
--    that block suspended users. Existing RLS policies are
--    untouched.
--
-- 4. admin_resolve_report RPC — atomic transaction that handles
--    dismiss / delete-content / warn-user / soft-suspend with the
--    correct side-effects. Admin-only. Updates report status, sets
--    reviewed_by + reviewed_at, applies the chosen action.
--
-- 5. NOT included in this migration but documented as a comment:
--    a manual_hard_suspend SQL block to copy/paste into Supabase
--    Studio when an admin needs the nuclear option (kills sessions,
--    blocks future signins). Not exposed to UI by design.
-- ================================================================

-- ── 1. profiles.is_suspended ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended
  ON public.profiles(is_suspended)
  WHERE is_suspended = true;

-- ── 2. notifications kind enum extension ────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'mention',
    'activity_like:rsvp',
    'activity_like:wall_post',
    'activity_like:venue_post',
    'warning'
  ));

-- ── 3. RESTRICTIVE policies blocking suspended users ────────────
-- These layer on top of existing PERMISSIVE policies. Suspended
-- users can still read content, but cannot insert new content or
-- interactions.

-- Helper: returns true if caller is suspended.
CREATE OR REPLACE FUNCTION public.is_caller_suspended()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_suspended FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_caller_suspended() TO authenticated;

-- Block suspended users from posting wall posts
CREATE POLICY "restrictive_wall_posts_no_suspended" ON public.event_wall_posts
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- Block suspended users from sending messages
CREATE POLICY "restrictive_messages_no_suspended" ON public.messages
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- Block suspended users from liking posts
CREATE POLICY "restrictive_post_likes_no_suspended" ON public.post_likes
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- Block suspended users from liking events
CREATE POLICY "restrictive_event_likes_no_suspended" ON public.event_likes
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- Block suspended users from attending events
CREATE POLICY "restrictive_attendees_no_suspended" ON public.attendees
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- Block suspended users from following
CREATE POLICY "restrictive_follows_no_suspended" ON public.follows
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- Block suspended users from blocking/muting/reporting (cuts off
-- abuse vectors where suspended account creates noise)
CREATE POLICY "restrictive_user_blocks_no_suspended" ON public.user_blocks
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

CREATE POLICY "restrictive_user_mutes_no_suspended" ON public.user_mutes
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

CREATE POLICY "restrictive_content_reports_no_suspended" ON public.content_reports
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- Block suspended users from liking activity feed items
CREATE POLICY "restrictive_activity_likes_no_suspended" ON public.activity_likes
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_caller_suspended());

-- ── 4. admin_resolve_report RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_action text,        -- 'dismiss' | 'delete_content' | 'warn_user' | 'suspend_user'
  p_admin_notes text DEFAULT NULL,
  p_warning_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_report record;
  v_new_status text;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not authenticated');
  END IF;

  IF NOT public.is_admin(v_admin_id) THEN
    RETURN jsonb_build_object('error', 'not authorized');
  END IF;

  IF p_action NOT IN ('dismiss', 'delete_content', 'warn_user', 'suspend_user') THEN
    RETURN jsonb_build_object('error', 'invalid action');
  END IF;

  SELECT * INTO v_report FROM public.content_reports WHERE id = p_report_id;
  IF v_report.id IS NULL THEN
    RETURN jsonb_build_object('error', 'report not found');
  END IF;

  -- Apply the action's side effect FIRST. If it fails, status stays unchanged.
  IF p_action = 'delete_content' THEN
    IF v_report.target_kind = 'wall_post' THEN
      UPDATE public.event_wall_posts
         SET deleted_at = now(), deleted_by = v_admin_id, body = '[deleted]'
       WHERE id = v_report.target_id;
    ELSIF v_report.target_kind = 'message' THEN
      UPDATE public.messages
         SET deleted_at = now()
       WHERE id = v_report.target_id;
    ELSIF v_report.target_kind = 'profile' THEN
      -- Deleting a profile via report = soft-suspend the user.
      -- We don't outright delete account on a report — too destructive.
      UPDATE public.profiles
         SET is_suspended = true
       WHERE id = v_report.target_user_id;
    END IF;
    v_new_status := 'resolved';

  ELSIF p_action = 'warn_user' THEN
    INSERT INTO public.notifications (
      recipient_id, sender_id, kind, body_preview
    ) VALUES (
      v_report.target_user_id,
      v_admin_id,
      'warning',
      COALESCE(p_warning_message, 'Your content was reported and reviewed. Please review the Plaster Terms of Use.')
    );
    v_new_status := 'resolved';

  ELSIF p_action = 'suspend_user' THEN
    UPDATE public.profiles
       SET is_suspended = true
     WHERE id = v_report.target_user_id;
    v_new_status := 'resolved';

  ELSIF p_action = 'dismiss' THEN
    v_new_status := 'dismissed';
  END IF;

  -- Update report status
  UPDATE public.content_reports
     SET status = v_new_status,
         admin_notes = p_admin_notes,
         reviewed_by = v_admin_id,
         reviewed_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('result', 'ok', 'status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text, text) TO authenticated;

-- ── 5. RPC: admin_set_reviewing — light-touch state change ──────
-- "I'm working on this" without taking final action.
CREATE OR REPLACE FUNCTION public.admin_set_report_reviewing(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.content_reports
     SET status = 'reviewing'
   WHERE id = p_report_id AND status = 'open';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_report_reviewing(uuid) TO authenticated;

-- ── 6. RPC: admin_unsuspend_user — reverses soft suspend ───────
CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.profiles
     SET is_suspended = false
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) TO authenticated;

-- ================================================================
-- MANUAL HARD SUSPEND (NOT EXPOSED TO UI — INTENTIONAL FRICTION)
-- ================================================================
-- For severe violations where soft suspend isn't enough, run the
-- following SQL block from the Supabase Studio SQL editor. This
-- (a) signs the user out of all current sessions
-- (b) blocks future signins by setting auth.users.banned_until
--
-- This is NOT wrapped in a function or exposed via the admin UI
-- to prevent accidental hard-suspensions. To hard suspend:
--
--   UPDATE auth.users
--      SET banned_until = '9999-12-31 23:59:59+00'
--    WHERE id = '<UUID>';
--
-- To reverse a hard suspend:
--
--   UPDATE auth.users
--      SET banned_until = NULL
--    WHERE id = '<UUID>';
--
-- Reference: https://supabase.com/docs/guides/auth/managing-user-data
-- ================================================================
