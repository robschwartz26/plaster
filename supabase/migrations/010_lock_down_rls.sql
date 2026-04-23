-- Fix 1: Enable RLS on admin_notifications (was fully open)
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write admin_notifications
CREATE POLICY "admin_notifications_select"
  ON admin_notifications FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_notifications_insert"
  ON admin_notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin_notifications_update"
  ON admin_notifications FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin_notifications_delete"
  ON admin_notifications FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Fix 2: Profiles SELECT — enforce is_public flag
-- Must DROP old permissive policy first; otherwise it ORs with the new one and wins
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (
    is_public = true
    OR auth.uid() = id
    OR public.is_admin(auth.uid())
  );

-- Fix 3: Events UPDATE — narrow the broad "any authenticated user" bypass
-- Drop the existing catch-all policy before replacing it
DROP POLICY IF EXISTS "Admin can update events" ON events;

CREATE POLICY "events_update"
  ON events FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM venues
      WHERE venues.id = events.venue_id
        AND venues.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM venues
      WHERE venues.id = events.venue_id
        AND venues.created_by = auth.uid()
    )
  );
