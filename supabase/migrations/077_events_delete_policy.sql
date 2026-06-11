-- ── Admin delete on events ────────────────────────────────────────────────────
-- The events table had NO DELETE policy (default-deny): deletes returned
-- success-with-0-rows, so AdminEditModal closed as if it worked while the event
-- survived. Admins (is_admin() helper from 063) may delete.

CREATE POLICY "events_delete" ON public.events
  FOR DELETE USING (public.is_admin(auth.uid()));
