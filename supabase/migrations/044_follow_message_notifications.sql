-- Migration 044: follow + message notification triggers
--
-- Adds DB-level triggers so that:
--   1. When user A follows user B → B gets a 'follow' notification
--   2. When a message is sent → each other conversation member gets a 'message' notification
--
-- Both respect block/mute state. No client code changes needed.

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
    'message'
  ));

-- ── Part B: follow notification ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_follow_insert()
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

DROP TRIGGER IF EXISTS follows_after_insert_notify ON public.follows;
CREATE TRIGGER follows_after_insert_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_follow_insert();

-- ── Part C: message notification ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_member record;
  v_preview text;
BEGIN
  -- Shouldn't fire for deleted messages, but guard just in case
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Build an 80-char preview (NULL for GIF-only messages with no body)
  v_preview := CASE
    WHEN NEW.body IS NULL OR length(NEW.body) = 0 THEN NULL
    WHEN length(NEW.body) > 80 THEN substring(NEW.body FROM 1 FOR 77) || '...'
    ELSE NEW.body
  END;

  -- Notify every other active conversation member
  FOR r_member IN
    SELECT user_id
    FROM public.conversation_members
    WHERE conversation_id = NEW.conversation_id
      AND user_id <> NEW.sender_id
  LOOP
    IF public.is_blocked_either_way(r_member.user_id, NEW.sender_id) THEN
      CONTINUE;
    END IF;

    IF public.is_muted_by(r_member.user_id, NEW.sender_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (
      recipient_id, sender_id, kind, body_preview
    ) VALUES (
      r_member.user_id,
      NEW.sender_id,
      'message',
      v_preview
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_after_insert_notify ON public.messages;
CREATE TRIGGER messages_after_insert_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_message_insert();
