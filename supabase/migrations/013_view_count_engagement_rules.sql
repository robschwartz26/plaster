-- Reset all view counts to start fresh under new rules
UPDATE events SET view_count = 0;

-- Drop the existing event_views table (per-day dedup, wrong shape now)
DROP TABLE IF EXISTS public.event_views CASCADE;

-- Recreate with timestamp-based dedup for 3-hour refractory window
CREATE TABLE public.event_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX event_views_user_event_recent_idx
  ON public.event_views(user_id, event_id, viewed_at DESC);
CREATE INDEX event_views_event_id_idx
  ON public.event_views(event_id);

ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own views"
  ON public.event_views FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read own views"
  ON public.event_views FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all views"
  ON public.event_views FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Replace the RPC with 3-hour refractory dedup
CREATE OR REPLACE FUNCTION public.register_event_view(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_recent_view_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM event_views
    WHERE user_id = v_user_id
      AND event_id = p_event_id
      AND viewed_at > NOW() - INTERVAL '3 hours'
  ) INTO v_recent_view_exists;

  IF NOT v_recent_view_exists THEN
    INSERT INTO event_views (user_id, event_id, viewed_at)
    VALUES (v_user_id, p_event_id, NOW());

    UPDATE events SET view_count = view_count + 1 WHERE id = p_event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_event_view(uuid) TO authenticated;
