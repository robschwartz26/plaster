-- Migration 103: admins manage the splash rotation from the app
-- Upload works via the existing authenticated INSERT policy on the posters
-- bucket; deletion had no policy at all. Narrow grant: admins may delete
-- ONLY splash/* objects — poster art stays undeletable from the client.
CREATE POLICY "admin_delete_splash" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'posters'
    AND name LIKE 'splash/%'
    AND public.is_admin(auth.uid())
  );
