-- ── Extend notifications.kind CHECK ────────────────────────────────────────
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
    'va_declined',
    'show_reminder',
    'venue_new_show'
  ));

-- ── Trigger function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_followers_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid;
BEGIN
  -- Only fire when status transitions TO published
  IF NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.status IS NOT DISTINCT FROM 'published') THEN RETURN NEW; END IF;
  -- Skip events that already started
  IF NEW.starts_at <= now() THEN RETURN NEW; END IF;

  -- Recurring guard: only notify for the soonest future date in a series
  IF NEW.recurrence_group_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.events
      WHERE recurrence_group_id = NEW.recurrence_group_id
        AND status = 'published'
        AND starts_at < NEW.starts_at
        AND id <> NEW.id
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Find the venue's account profile (not every venue has one yet)
  SELECT vp.id INTO v_sender
  FROM public.profiles vp
  WHERE vp.venue_id = NEW.venue_id
    AND vp.account_type = 'venue'
  LIMIT 1;

  IF v_sender IS NULL THEN RETURN NEW; END IF;

  -- One notification per accepted follower of that venue account
  INSERT INTO public.notifications (recipient_id, sender_id, kind, target_event_id, body_preview)
  SELECT
    f.follower_id,
    v_sender,
    'venue_new_show',
    NEW.id,
    left(NEW.title, 120)
  FROM public.follows f
  WHERE f.following_id = v_sender
    AND f.status = 'accepted';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_after_publish_notify ON public.events;
CREATE TRIGGER events_after_publish_notify
  AFTER INSERT OR UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_followers_on_publish();
