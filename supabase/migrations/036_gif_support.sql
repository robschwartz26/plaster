-- Migration 036: GIF / media support for messages and wall posts
--
-- Adds media_url, media_type, media_width, media_height, media_source_id to:
--   messages (DMs) and event_wall_posts (poster wall posts)
-- Recreates activity_feed to surface media_url + media_type from wall/venue posts.
-- Full function body reproduced from 032; only RETURNS TABLE shape and combined CTE
-- projection are extended — logic and security settings are unchanged.

-- 1. Add media columns to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS media_source_id text;

DO $$ BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_media_type_check
    CHECK (media_type IN ('gif', 'video') OR media_type IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add media columns to event_wall_posts
ALTER TABLE public.event_wall_posts
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS media_source_id text;

DO $$ BEGIN
  ALTER TABLE public.event_wall_posts
    ADD CONSTRAINT event_wall_posts_media_type_check
    CHECK (media_type IN ('gif', 'video') OR media_type IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Recreate activity_feed to surface media_url + media_type from wall/venue posts.
DROP FUNCTION IF EXISTS public.activity_feed(integer, timestamptz, integer);

CREATE FUNCTION public.activity_feed(
  before_round integer DEFAULT NULL,
  before_cursor timestamptz DEFAULT NULL,
  page_size integer DEFAULT 50
)
RETURNS TABLE (
  activity_type text,
  source_id uuid,
  actor_id uuid,
  actor_username text,
  actor_avatar_diamond_url text,
  actor_account_type text,
  target_event_id uuid,
  target_event_title text,
  target_event_starts_at timestamptz,
  target_event_poster_url text,
  body_preview text,
  media_url text,
  media_type text,
  like_count integer,
  viewer_has_liked boolean,
  round_num integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH viewer_follows AS (
    SELECT f.following_id AS followed_user_id
    FROM follows f
    WHERE f.follower_id = v_user_id
      AND f.status = 'accepted'
  ),
  combined AS (
    SELECT
      'rsvp'::text AS a_type,
      a.id AS a_source_id,
      a.user_id AS a_actor_id,
      a.event_id AS a_event_id,
      NULL::text AS a_body_preview,
      NULL::text AS a_media_url,
      NULL::text AS a_media_type,
      a.created_at AS a_created_at
    FROM attendees a
    JOIN viewer_follows vf ON vf.followed_user_id = a.user_id

    UNION ALL

    SELECT
      'wall_post'::text,
      ewp.id,
      ewp.user_id,
      ewp.event_id,
      LEFT(COALESCE(ewp.body, ''), 80),
      ewp.media_url,
      ewp.media_type,
      ewp.created_at
    FROM event_wall_posts ewp
    JOIN viewer_follows vf ON vf.followed_user_id = ewp.user_id
    WHERE ewp.parent_id IS NULL
      AND ewp.is_venue_post = false
      AND ewp.deleted_at IS NULL

    UNION ALL

    SELECT
      'venue_post'::text,
      ewp.id,
      ewp.user_id,
      ewp.event_id,
      LEFT(COALESCE(ewp.body, ''), 80),
      ewp.media_url,
      ewp.media_type,
      ewp.created_at
    FROM event_wall_posts ewp
    JOIN viewer_follows vf ON vf.followed_user_id = ewp.user_id
    WHERE ewp.is_venue_post = true
      AND ewp.deleted_at IS NULL

    UNION ALL

    SELECT
      'like'::text,
      el.id,
      el.user_id,
      el.event_id,
      NULL::text,
      NULL::text,
      NULL::text,
      el.created_at
    FROM event_likes el
    JOIN viewer_follows vf ON vf.followed_user_id = el.user_id
  ),
  ranked AS (
    SELECT
      c.*,
      ROW_NUMBER() OVER (PARTITION BY c.a_actor_id ORDER BY c.a_created_at DESC)::integer AS r_round_num
    FROM combined c
  )
  SELECT
    r.a_type,
    r.a_source_id,
    r.a_actor_id,
    actor.username,
    actor.avatar_diamond_url,
    actor.account_type,
    r.a_event_id,
    e.title,
    e.starts_at,
    e.poster_url,
    r.a_body_preview,
    r.a_media_url,
    r.a_media_type,
    COALESCE((SELECT COUNT(*)::integer FROM activity_likes al WHERE al.activity_type = r.a_type AND al.source_id = r.a_source_id), 0),
    EXISTS (SELECT 1 FROM activity_likes al WHERE al.activity_type = r.a_type AND al.source_id = r.a_source_id AND al.liker_id = v_user_id),
    r.r_round_num,
    r.a_created_at
  FROM ranked r
  JOIN profiles actor ON actor.id = r.a_actor_id
  LEFT JOIN events e ON e.id = r.a_event_id
  WHERE
    before_round IS NULL OR before_cursor IS NULL OR
    r.r_round_num > before_round OR
    (r.r_round_num = before_round AND r.a_created_at < before_cursor)
  ORDER BY r.r_round_num ASC, r.a_created_at DESC
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activity_feed(integer, timestamptz, integer) TO authenticated;
