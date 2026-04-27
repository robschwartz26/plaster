-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('mention')),
  target_event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  target_post_id uuid REFERENCES public.event_wall_posts(id) ON DELETE CASCADE,
  body_preview text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON public.notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications(recipient_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (recipient_id = auth.uid());

-- Intentionally NO INSERT policy — only SECURITY DEFINER functions create rows.

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.process_wall_post_mentions(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post record;
  v_username text;
  v_recipient_id uuid;
  v_count integer := 0;
BEGIN
  SELECT id, user_id, body, event_id INTO v_post
  FROM event_wall_posts
  WHERE id = p_post_id AND deleted_at IS NULL;

  IF v_post.id IS NULL OR v_post.body IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_username IN
    SELECT DISTINCT (regexp_matches(v_post.body, '@([A-Za-z0-9_]+)', 'g'))[1]
  LOOP
    SELECT id INTO v_recipient_id
    FROM profiles
    WHERE LOWER(username) = LOWER(v_username);

    IF v_recipient_id IS NULL OR v_recipient_id = v_post.user_id THEN
      CONTINUE;
    END IF;

    INSERT INTO notifications (
      recipient_id, sender_id, kind,
      target_event_id, target_post_id,
      body_preview
    )
    VALUES (
      v_recipient_id, v_post.user_id, 'mention',
      v_post.event_id, v_post.id,
      LEFT(v_post.body, 200)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_wall_post_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND NEW.body IS NOT NULL THEN
    PERFORM process_wall_post_mentions(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_wall_posts_after_insert_mentions ON public.event_wall_posts;
CREATE TRIGGER event_wall_posts_after_insert_mentions
  AFTER INSERT ON public.event_wall_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_wall_post_insert();
