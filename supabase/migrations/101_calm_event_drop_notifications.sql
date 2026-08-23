-- Migration 101: calm the event-drop firehose (anti-bombardment)
--
-- Problem: notify_followers_on_publish (075) writes one notification per
-- follower PER EVENT — a 40-event drop = 40 pings (and 40 pushes) to every
-- follower. Antithetical to Plaster's anti-extractive stance.
--
-- (a) Notifications: a follower now gets AT MOST ONE 'venue_new_show'
--     notification per ~day (20h window, across ALL venues/artists they
--     follow). The first publish of the day notifies; the rest stay quiet —
--     the LINE UP feed carries the rest of the story.
--
-- (b) LINE UP feed: activity_feed gains 'venue_show' items — events published
--     in the last 72h at venue accounts the viewer follows, CAPPED at 2 per
--     venue. The feed's existing per-actor round-robin then interleaves them
--     with friends' activity, so one venue's drop can never wallpaper the feed.

-- ── (a) throttled notifications ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_followers_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid;
BEGIN
  IF NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.status IS NOT DISTINCT FROM 'published') THEN RETURN NEW; END IF;
  IF NEW.starts_at <= now() THEN RETURN NEW; END IF;

  -- Recurring guard: only the soonest future date in a series
  IF NEW.recurrence_group_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.events
      WHERE recurrence_group_id = NEW.recurrence_group_id
        AND status = 'published'
        AND starts_at < NEW.starts_at
        AND id <> NEW.id
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT vp.id INTO v_sender
  FROM public.profiles vp
  WHERE vp.venue_id = NEW.venue_id
    AND vp.account_type = 'venue'
  LIMIT 1;

  IF v_sender IS NULL THEN RETURN NEW; END IF;

  -- ONE new-show notification per follower per ~day, across all their venues.
  INSERT INTO public.notifications (recipient_id, sender_id, kind, target_event_id, body_preview)
  SELECT
    f.follower_id,
    v_sender,
    'venue_new_show',
    NEW.id,
    left(NEW.title, 120)
  FROM public.follows f
  WHERE f.following_id = v_sender
    AND f.status = 'accepted'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id = f.follower_id
        AND n.kind = 'venue_new_show'
        AND n.created_at > now() - interval '20 hours'
    );

  RETURN NEW;
END;
$$;

-- speed up the daily-throttle probe
CREATE INDEX IF NOT EXISTS idx_notifications_newshow_throttle
  ON public.notifications (recipient_id, created_at)
  WHERE kind = 'venue_new_show';

-- ── (b) feed: fresh drops, 2 per venue, round-robin mixed ───────────────────
CREATE OR REPLACE FUNCTION public.activity_feed(before_round integer DEFAULT NULL::integer, before_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, page_size integer DEFAULT 50)
 RETURNS TABLE(activity_type text, source_id uuid, actor_id uuid, actor_username text, actor_avatar_diamond_url text, actor_account_type text, target_event_id uuid, target_event_title text, target_event_starts_at timestamp with time zone, target_event_poster_url text, body_preview text, media_url text, media_type text, like_count integer, viewer_has_liked boolean, round_num integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    UNION ALL

    -- Fresh drops from followed venue accounts: last 72h, upcoming only,
    -- MAX 2 PER VENUE — the round-robin below interleaves the rest.
    SELECT
      'venue_show'::text,
      d.event_id,
      d.venue_account_id,
      d.event_id,
      NULL::text,
      NULL::text,
      NULL::text,
      d.created_at
    FROM (
      SELECT
        e.id AS event_id,
        vp.id AS venue_account_id,
        e.created_at,
        ROW_NUMBER() OVER (PARTITION BY vp.id ORDER BY e.created_at DESC) AS rn
      FROM events e
      JOIN profiles vp ON vp.venue_id = e.venue_id AND vp.account_type = 'venue'
      JOIN viewer_follows vf ON vf.followed_user_id = vp.id
      WHERE e.status = 'published'
        AND e.starts_at > now()
        AND e.created_at > now() - interval '72 hours'
    ) d
    WHERE d.rn <= 2
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
  LEFT JOIN events e ON e.id = r.a_event_id AND e.status = 'published'
  WHERE
    before_round IS NULL OR before_cursor IS NULL OR
    r.r_round_num > before_round OR
    (r.r_round_num = before_round AND r.a_created_at < before_cursor)
  ORDER BY r.r_round_num ASC, r.a_created_at DESC
  LIMIT page_size;
END;
$function$;
