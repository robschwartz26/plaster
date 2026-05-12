-- Migration 048: reply notification trigger
--
-- When someone replies to a wall post (event_wall_posts row with parent_id
-- set), notify the parent post's author with kind='reply'.
--
-- If the reply also @mentions the parent author, they'll get both a 'reply'
-- and a 'mention' notification — intentional, they're different signals.

-- ── Extend kind CHECK (idempotent rebuild) ────────────────────────────────

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
    'reply'
  ));

-- ── Trigger function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_wall_post_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_author_id uuid;
  v_preview text;
BEGIN
  -- Only fire for replies (posts with parent_id set), not top-level posts
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip soft-deleted posts
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the parent post's author
  SELECT user_id INTO v_parent_author_id
  FROM public.event_wall_posts
  WHERE id = NEW.parent_id;

  IF v_parent_author_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't notify on self-reply
  IF v_parent_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Block/mute checks
  IF public.is_blocked_either_way(NEW.user_id, v_parent_author_id) THEN
    RETURN NEW;
  END IF;

  IF public.is_muted_by(v_parent_author_id, NEW.user_id) THEN
    RETURN NEW;
  END IF;

  -- 200-char preview of the reply body
  v_preview := CASE
    WHEN NEW.body IS NULL OR length(NEW.body) = 0 THEN NULL
    WHEN length(NEW.body) > 200 THEN substring(NEW.body FROM 1 FOR 197) || '...'
    ELSE NEW.body
  END;

  INSERT INTO public.notifications (
    recipient_id, sender_id, kind, target_event_id, target_post_id, body_preview
  ) VALUES (
    v_parent_author_id,
    NEW.user_id,
    'reply',
    NEW.event_id,
    NEW.id,
    v_preview
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wall_posts_after_insert_notify_reply ON public.event_wall_posts;
CREATE TRIGGER wall_posts_after_insert_notify_reply
  AFTER INSERT ON public.event_wall_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_wall_post_reply();
