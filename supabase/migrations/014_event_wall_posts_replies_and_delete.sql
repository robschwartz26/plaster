-- Add columns for replies and soft-delete
ALTER TABLE public.event_wall_posts
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.event_wall_posts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Index for efficient reply lookups
CREATE INDEX IF NOT EXISTS event_wall_posts_parent_id_idx
  ON public.event_wall_posts(parent_id)
  WHERE parent_id IS NOT NULL;

-- Index for filtering out deleted posts efficiently
CREATE INDEX IF NOT EXISTS event_wall_posts_active_idx
  ON public.event_wall_posts(event_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- RPC: smart delete a post
-- Hard deletes if no replies exist; soft deletes if replies exist
-- Author can delete their own; admin can delete any
CREATE OR REPLACE FUNCTION public.delete_wall_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_post_author uuid;
  v_is_admin boolean;
  v_has_replies boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not authenticated');
  END IF;

  -- Get the post author and check it exists
  SELECT user_id INTO v_post_author
  FROM event_wall_posts
  WHERE id = p_post_id AND deleted_at IS NULL;

  IF v_post_author IS NULL THEN
    RETURN jsonb_build_object('error', 'post not found or already deleted');
  END IF;

  -- Check permissions: author or admin
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;

  IF v_post_author != v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('error', 'not authorized');
  END IF;

  -- Check if there are non-deleted replies
  SELECT EXISTS (
    SELECT 1 FROM event_wall_posts
    WHERE parent_id = p_post_id AND deleted_at IS NULL
  ) INTO v_has_replies;

  IF v_has_replies THEN
    -- Soft delete: mark deleted, keep row for tombstone
    UPDATE event_wall_posts
    SET deleted_at = NOW(),
        deleted_by = v_user_id,
        body = '[deleted]'
    WHERE id = p_post_id;

    RETURN jsonb_build_object('result', 'soft_deleted');
  ELSE
    -- Hard delete: row gone
    DELETE FROM event_wall_posts WHERE id = p_post_id;

    RETURN jsonb_build_object('result', 'hard_deleted');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_wall_post(uuid) TO authenticated;

-- Update RLS for INSERT to enforce 2-level depth limit
-- Drop the existing insert policy if present, recreate with depth check
DROP POLICY IF EXISTS "Users can insert their own posts" ON public.event_wall_posts;
DROP POLICY IF EXISTS "Authenticated users can post" ON public.event_wall_posts;

CREATE POLICY "Users can insert posts up to 2 levels deep"
  ON public.event_wall_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      parent_id IS NULL  -- top-level post, always allowed
      OR (
        -- reply: must be a reply to a top-level post (level 2 max)
        SELECT parent_id IS NULL FROM event_wall_posts WHERE id = parent_id
      )
    )
  );
