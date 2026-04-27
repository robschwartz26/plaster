-- Add view_count to events (column already exists on some envs — safe no-op)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS events_view_count_idx ON public.events(view_count DESC);

-- Track per-user per-day dedup so reloads don't inflate
CREATE TABLE IF NOT EXISTS public.event_views (
  user_id  uuid NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  view_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id, view_date)
);

CREATE INDEX IF NOT EXISTS event_views_event_id_idx ON public.event_views(event_id);

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

-- RPC: atomically register a view, deduped per user-event-day
CREATE OR REPLACE FUNCTION public.register_event_view(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO event_views (user_id, event_id, view_date)
  VALUES (v_user_id, p_event_id, CURRENT_DATE)
  ON CONFLICT (user_id, event_id, view_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    UPDATE events SET view_count = view_count + 1 WHERE id = p_event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_event_view(uuid) TO authenticated;
