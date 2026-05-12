-- Migration 046: follow_accepted notification kind + status in body_preview
--
-- Three things in one migration:
--
-- 1. Extend kind CHECK to allow 'follow_accepted'
--
-- 2. Update notify_on_follow_insert (created in 045) to:
--    - Store NEW.status in body_preview so the UI can render different
--      copy for pending ("wants to follow you") vs accepted ("followed you")
--    - For auto-accepted follows (artist/venue accounts), also fire a
--      follow_accepted notification back to the requester ("you're following @user")
--
-- 3. Add AFTER UPDATE trigger: when a pending follow is manually accepted,
--    notify the original requester with kind='follow_accepted'

-- ── Part A: extend kind CHECK ─────────────────────────────────────────────

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
    'follow_accepted'
  ));

-- ── Part B: update notify_on_follow_insert to carry status + handle auto-accept ──

CREATE OR REPLACE FUNCTION public.notify_on_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_blocked_either_way(NEW.follower_id, NEW.following_id) THEN
    RETURN NEW;
  END IF;

  IF public.is_muted_by(NEW.following_id, NEW.follower_id) THEN
    RETURN NEW;
  END IF;

  -- Notify the followee. body_preview carries the follow's status so the UI
  -- can render "wants to follow you" (pending) vs "followed you" (accepted).
  INSERT INTO public.notifications (recipient_id, sender_id, kind, body_preview)
  VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.status);

  -- For auto-accepted follows (artist/venue targets), also notify the follower
  -- that they're now following — so they get confirmation too.
  IF NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (recipient_id, sender_id, kind, body_preview)
    VALUES (NEW.follower_id, NEW.following_id, 'follow_accepted', NULL);
  END IF;

  RETURN NEW;
END;
$$;

-- ── Part C: AFTER UPDATE trigger for manual acceptance ────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_follow_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status transitions TO 'accepted'
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    IF public.is_blocked_either_way(NEW.follower_id, NEW.following_id) THEN
      RETURN NEW;
    END IF;

    IF public.is_muted_by(NEW.follower_id, NEW.following_id) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (recipient_id, sender_id, kind, body_preview)
    VALUES (NEW.follower_id, NEW.following_id, 'follow_accepted', NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_after_update_notify_accepted ON public.follows;
CREATE TRIGGER follows_after_update_notify_accepted
  AFTER UPDATE OF status ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_follow_accepted();
