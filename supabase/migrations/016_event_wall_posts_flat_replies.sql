-- Switch from tree-with-depth-limit to flat-replies model.
-- Replies can technically nest at any depth in the data model, but the UI
-- will flatten everything under the top-level parent.
-- Drop the 2-level depth check and replace with a simple insert policy.

DROP POLICY IF EXISTS "Users can insert posts up to 2 levels deep" ON public.event_wall_posts;

CREATE POLICY "Users can insert their own posts"
  ON public.event_wall_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
