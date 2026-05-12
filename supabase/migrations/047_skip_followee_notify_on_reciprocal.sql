-- Migration 047: Fix duplicate notification when accepting a follow request.
--
-- When B accepts A's pending follow request, accept_follow_request does two
-- operations:
--   1. UPDATE the original A→B row to accepted (fires AFTER UPDATE trigger →
--      notify_on_follow_accepted → A gets 'follow_accepted' "you're following @B")
--   2. INSERT a reciprocal B→A row as accepted (fires AFTER INSERT trigger →
--      notify_on_follow_insert → A also gets a 'follow' "@B followed you", DUPLICATE)
--
-- Fix: accept_follow_request sets a session-local config flag right before
-- the reciprocal INSERT. notify_on_follow_insert checks this flag and, when
-- set, skips the followee 'follow' notification but still inserts
-- follow_accepted for the new follower (so B gets "you're following @A").
--
-- The flag is transaction-local (is_local=true), so it auto-resets when
-- accept_follow_request's implicit transaction commits. No leakage risk.
--
-- Every other INSERT (independent mutual-follows, first-time follows) is
-- unaffected — the flag is only ever set inside accept_follow_request.

-- ── Part A: update notify_on_follow_insert to respect the session flag ────

CREATE OR REPLACE FUNCTION public.notify_on_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skip_followee text;
BEGIN
  IF public.is_blocked_either_way(NEW.follower_id, NEW.following_id) THEN
    RETURN NEW;
  END IF;

  IF public.is_muted_by(NEW.following_id, NEW.follower_id) THEN
    RETURN NEW;
  END IF;

  -- When accept_follow_request inserts the reciprocal row it sets this flag
  -- so we skip the followee notification (the original requester already got
  -- their notification from the AFTER UPDATE trigger).
  v_skip_followee := current_setting('app.skip_followee_follow_notification', true);

  IF v_skip_followee IS DISTINCT FROM 'true' THEN
    INSERT INTO public.notifications (recipient_id, sender_id, kind, body_preview)
    VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.status);
  END IF;

  -- For accepted-at-insert follows, always notify the follower with follow_accepted
  -- (covers auto-accept for artist/venue targets AND the reciprocal-accept case).
  IF NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (recipient_id, sender_id, kind, body_preview)
    VALUES (NEW.follower_id, NEW.following_id, 'follow_accepted', NULL);
  END IF;

  RETURN NEW;
END;
$$;

-- ── Part B: update accept_follow_request to set flag before reciprocal INSERT ──

CREATE OR REPLACE FUNCTION public.accept_follow_request(follower_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row_count integer;
BEGIN
  IF v_user_id IS NULL OR follower_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or invalid follower id';
  END IF;
  IF v_user_id = follower_user_id THEN
    RAISE EXCEPTION 'Cannot accept your own follow request';
  END IF;

  -- Update the existing pending row to accepted.
  -- Fires AFTER UPDATE trigger → notify_on_follow_accepted → notifies the
  -- original requester with follow_accepted "you're following @B".
  UPDATE follows
    SET status = 'accepted',
        accepted_at = NOW()
  WHERE follower_id = follower_user_id
    AND following_id = v_user_id
    AND status = 'pending';

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'No pending follow request found from this user';
  END IF;

  -- Set session-local flag so notify_on_follow_insert skips the followee
  -- notification on the reciprocal row below. The original requester already
  -- got their notification from the AFTER UPDATE trigger above.
  PERFORM set_config('app.skip_followee_follow_notification', 'true', true);

  -- Insert the reverse direction to make it mutual.
  -- Fires AFTER INSERT trigger → notify_on_follow_insert, which skips the
  -- followee notification but still fires follow_accepted for B.
  INSERT INTO follows (follower_id, following_id, status, accepted_at)
    VALUES (v_user_id, follower_user_id, 'accepted', NOW())
  ON CONFLICT (follower_id, following_id) DO UPDATE
    SET status = 'accepted',
        accepted_at = COALESCE(follows.accepted_at, NOW());

  -- Reset flag explicitly (also resets automatically at transaction end).
  PERFORM set_config('app.skip_followee_follow_notification', 'false', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_follow_request(uuid) TO authenticated;
