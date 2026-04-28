-- LineUp activity feed: schema and RPCs.
-- Activities are NOT stored in their own table — they're derived at query time
-- from four source tables (attendees, event_wall_posts, follows, event_likes).
-- The activity_likes table records likes ON activities. activities are identified
-- by composite (activity_type, source_id) since they're not real rows.
-- Feed order is round-robin chronological: each "round" pulls one most-recent
-- activity per actor. Round 2 starts only after round 1 finishes.

CREATE TABLE IF NOT EXISTS public.activity_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type text NOT NULL CHECK (activity_type IN ('rsvp', 'wall_post', 'venue_post', 'like')),
  source_id uuid NOT NULL,
  liker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_type, source_id, liker_id)
);

CREATE INDEX IF NOT EXISTS activity_likes_source_idx ON public.activity_likes (activity_type, source_id);
CREATE INDEX IF NOT EXISTS activity_likes_liker_idx ON public.activity_likes (liker_id);

ALTER TABLE public.activity_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read activity_likes for authenticated"
  ON public.activity_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users insert own activity_likes"
  ON public.activity_likes FOR INSERT
  TO authenticated
  WITH CHECK (liker_id = auth.uid());

CREATE POLICY "Users delete own activity_likes"
  ON public.activity_likes FOR DELETE
  TO authenticated
  USING (liker_id = auth.uid());

-- The activity_feed RPC. Returns round-robin chronological activities from
-- people the viewer follows. Pagination via composite (round_num, created_at) cursor.
-- Must DROP first because RETURNS TABLE shape may differ from any prior version.
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
    COALESCE((SELECT COUNT(*)::integer FROM activity_likes al WHERE al.activity_type = r.a_type AND al.source_id = r.a_source_id), 0),
    EXISTS (SELECT 1 FROM activity_likes al WHERE al.activity_type = r.a_type AND al.source_id = r.a_source_id AND al.liker_id = v_user_id),
    r.r_round_num,
    r.a_created_at
  FROM ranked r
  JOIN profiles actor ON actor.id = r.a_actor_id
  LEFT JOIN events e ON e.id = r.a_event_id
  WHERE
    -- Composite cursor: skip rows with (round_num, created_at) <= cursor
    before_round IS NULL OR before_cursor IS NULL OR
    r.r_round_num > before_round OR
    (r.r_round_num = before_round AND r.a_created_at < before_cursor)
  ORDER BY r.r_round_num ASC, r.a_created_at DESC
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activity_feed(integer, timestamptz, integer) TO authenticated;

-- Like an activity. Inserts into activity_likes AND a notification to the actor.
CREATE OR REPLACE FUNCTION public.like_activity(
  in_activity_type text,
  in_source_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actor_id uuid;
  v_event_id uuid;
BEGIN
  IF v_user_id IS NULL OR in_source_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or invalid source id';
  END IF;

  CASE in_activity_type
    WHEN 'rsvp' THEN
      SELECT a.user_id, a.event_id INTO v_actor_id, v_event_id FROM attendees a WHERE a.id = in_source_id;
    WHEN 'wall_post' THEN
      SELECT ewp.user_id, ewp.event_id INTO v_actor_id, v_event_id FROM event_wall_posts ewp WHERE ewp.id = in_source_id;
    WHEN 'venue_post' THEN
      SELECT ewp.user_id, ewp.event_id INTO v_actor_id, v_event_id FROM event_wall_posts ewp WHERE ewp.id = in_source_id;
    WHEN 'like' THEN
      RAISE EXCEPTION 'Cannot like a like activity';
    ELSE
      RAISE EXCEPTION 'Unknown activity type: %', in_activity_type;
  END CASE;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Source activity not found';
  END IF;

  IF v_actor_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot like your own activity';
  END IF;

  INSERT INTO activity_likes (activity_type, source_id, liker_id)
    VALUES (in_activity_type, in_source_id, v_user_id)
  ON CONFLICT (activity_type, source_id, liker_id) DO NOTHING;

  INSERT INTO notifications (recipient_id, sender_id, kind, target_event_id, body_preview, created_at)
    VALUES (v_actor_id, v_user_id, 'activity_like:' || in_activity_type, v_event_id, NULL, NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.like_activity(text, uuid) TO authenticated;

-- Unlike an activity.
CREATE OR REPLACE FUNCTION public.unlike_activity(
  in_activity_type text,
  in_source_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM activity_likes
  WHERE activity_type = in_activity_type
    AND source_id = in_source_id
    AND liker_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlike_activity(text, uuid) TO authenticated;
