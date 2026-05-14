-- ================================================================
-- Migration 043: device tokens for push notifications
--
-- Stores APNS/FCM device tokens per user so the server can dispatch
-- push notifications to the right devices. A user can have multiple
-- tokens (multiple devices, or fresh tokens after reinstall).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token           text NOT NULL,
  platform        text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user
  ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can manage their own tokens
CREATE POLICY "insert_own_tokens" ON public.device_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "select_own_tokens" ON public.device_tokens
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "update_own_tokens" ON public.device_tokens
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "delete_own_tokens" ON public.device_tokens
  FOR DELETE USING (user_id = auth.uid());
