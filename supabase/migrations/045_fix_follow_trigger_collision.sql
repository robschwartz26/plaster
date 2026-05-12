-- Migration 045: Fix function name collision from migration 044
--
-- Migration 044 named its notification function handle_follow_insert(),
-- which silently overwrote the same-named function from migration 024
-- (which auto-accepts artist/venue follows). Result:
--   1. Auto-accept logic destroyed → all follows to artists/venues stay pending
--   2. Duplicate notifications → both 024's BEFORE trigger and 044's
--      AFTER trigger now call the same notification code
--
-- Fix: restore the original handle_follow_insert (auto-accept) and move
-- the notification logic to a distinctly-named function.

-- ── Part A: restore original handle_follow_insert (auto-accept) ───────────
-- Exact body from migration 024 — do not modify.

CREATE OR REPLACE FUNCTION public.handle_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_type text;
BEGIN
  SELECT account_type INTO v_target_type FROM profiles WHERE id = NEW.following_id;
  IF v_target_type IN ('artist', 'venue') THEN
    NEW.status := 'accepted';
    NEW.accepted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- ── Part B: notification function under a distinct name ───────────────────

CREATE OR REPLACE FUNCTION public.notify_on_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if either party has blocked the other
  IF public.is_blocked_either_way(NEW.follower_id, NEW.following_id) THEN
    RETURN NEW;
  END IF;

  -- Skip if the followee has muted the follower
  IF public.is_muted_by(NEW.following_id, NEW.follower_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    recipient_id, sender_id, kind, body_preview
  ) VALUES (
    NEW.following_id,
    NEW.follower_id,
    'follow',
    NULL
  );

  RETURN NEW;
END;
$$;

-- ── Part C: repoint AFTER trigger to the new function name ────────────────

DROP TRIGGER IF EXISTS follows_after_insert_notify ON public.follows;
CREATE TRIGGER follows_after_insert_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_follow_insert();
