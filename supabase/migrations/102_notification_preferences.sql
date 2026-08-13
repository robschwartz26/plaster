-- Migration 102: per-user notification preferences (thoughtful controls)
--
-- One row per user; every category defaults ON (absence of a row = all on).
-- A BEFORE INSERT gate on notifications enforces prefs at the single choke
-- point — no matter which trigger/function writes the row, a muted category
-- never creates it (so in-app AND push both stay silent; pushes ride rows).
-- Moderation/admin kinds (warning, va_approved, va_declined) are NEVER muted.
-- push_enabled is a master switch read by the push-notification edge fn:
-- rows still appear in-app, but the phone stays quiet.

CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  messages      boolean NOT NULL DEFAULT true,  -- 'message'
  replies       boolean NOT NULL DEFAULT true,  -- 'reply', 'mention'
  follows       boolean NOT NULL DEFAULT true,  -- 'follow', 'follow_accepted'
  likes         boolean NOT NULL DEFAULT true,  -- 'activity_like:*'
  slaps         boolean NOT NULL DEFAULT true,  -- 'slap'
  new_shows     boolean NOT NULL DEFAULT true,  -- 'venue_new_show'
  reminders     boolean NOT NULL DEFAULT true,  -- 'show_reminder'
  community     boolean NOT NULL DEFAULT true,  -- 'lost_pet'
  push_enabled  boolean NOT NULL DEFAULT true,  -- master device-push switch
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_select_own" ON public.user_notification_prefs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "prefs_insert_own" ON public.user_notification_prefs
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "prefs_update_own" ON public.user_notification_prefs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- kind → category gate; missing prefs row = everything allowed
CREATE OR REPLACE FUNCTION public.notification_allowed(p_recipient uuid, p_kind text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  p public.user_notification_prefs;
BEGIN
  -- moderation/admin lines are never mutable
  IF p_kind IN ('warning', 'va_approved', 'va_declined') THEN RETURN true; END IF;

  SELECT * INTO p FROM public.user_notification_prefs WHERE user_id = p_recipient;
  IF NOT FOUND THEN RETURN true; END IF;

  RETURN CASE
    WHEN p_kind = 'message' THEN p.messages
    WHEN p_kind IN ('reply', 'mention') THEN p.replies
    WHEN p_kind IN ('follow', 'follow_accepted') THEN p.follows
    WHEN p_kind LIKE 'activity_like:%' THEN p.likes
    WHEN p_kind = 'slap' THEN p.slaps
    WHEN p_kind = 'venue_new_show' THEN p.new_shows
    WHEN p_kind = 'show_reminder' THEN p.reminders
    WHEN p_kind = 'lost_pet' THEN p.community
    ELSE true
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.gate_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.notification_allowed(NEW.recipient_id, NEW.kind) THEN
    RETURN NULL; -- muted category: the notification simply never exists
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_pref_gate ON public.notifications;
CREATE TRIGGER notifications_pref_gate
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.gate_notification_insert();
