-- Drop redundant legacy policies that duplicate or override the new ones
DROP POLICY IF EXISTS posts_insert ON public.event_wall_posts;
DROP POLICY IF EXISTS posts_delete ON public.event_wall_posts;
DROP POLICY IF EXISTS posts_select ON public.event_wall_posts;

-- Drop the malformed depth-check policy and recreate with correct subquery
DROP POLICY IF EXISTS "Users can insert posts up to 2 levels deep" ON public.event_wall_posts;

CREATE POLICY "Users can insert posts up to 2 levels deep"
  ON public.event_wall_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      parent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.event_wall_posts parent
        WHERE parent.id = event_wall_posts.parent_id
          AND parent.parent_id IS NULL
      )
    )
  );

-- Add admin-override delete policy so admins can delete any post
CREATE POLICY "Admins can delete any post"
  ON public.event_wall_posts FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Add admin-override update policy for soft-delete via the RPC
-- (delete_wall_post uses SECURITY DEFINER so this isn't strictly needed,
-- but having it explicit makes admin moderation possible from other paths too)
CREATE POLICY "Admins can update any post"
  ON public.event_wall_posts FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
