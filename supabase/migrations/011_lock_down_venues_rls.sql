-- Migration 011: lock down venues RLS
-- UPDATE/DELETE now requires is_admin() or created_by ownership.
-- SELECT and INSERT are unchanged.

-- Drop the existing creator-only UPDATE policy (no admin escape, no WITH CHECK)
DROP POLICY IF EXISTS "Venue creators can update their venues" ON public.venues;

CREATE POLICY "Venue creator or admin can update venues"
  ON public.venues FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR created_by = auth.uid());

-- Add DELETE policy (previously absent — no one could delete)
CREATE POLICY "Venue creator or admin can delete venues"
  ON public.venues FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid());
