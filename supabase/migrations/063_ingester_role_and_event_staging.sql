-- ── (a) Ingester role flag ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_ingester boolean NOT NULL DEFAULT false;

-- ── (b) can_ingest helper ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_ingest(user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin OR is_ingester FROM profiles WHERE id = user_id), false)
$$;
GRANT EXECUTE ON FUNCTION public.can_ingest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_ingest(uuid) TO anon;

-- ── (c) Event staging columns ─────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('pending','published','rejected')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS events_status_idx    ON public.events(status);
CREATE INDEX IF NOT EXISTS events_created_by_idx ON public.events(created_by);

-- ── (d) BEFORE INSERT trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.events_set_ingest_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS events_set_ingest_status_trg ON public.events;
CREATE TRIGGER events_set_ingest_status_trg BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_ingest_status();

-- ── (e) SELECT policy ─────────────────────────────────────────
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
CREATE POLICY "events_select" ON public.events FOR SELECT
  USING (status = 'published' OR public.is_admin(auth.uid()) OR created_by = auth.uid());

-- ── (f) INSERT policy ─────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can create events" ON public.events;
CREATE POLICY "events_insert" ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.can_ingest(auth.uid()));

-- ── (g) UPDATE policy ─────────────────────────────────────────
DROP POLICY IF EXISTS "events_update" ON public.events;
CREATE POLICY "events_update" ON public.events FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM venues WHERE venues.id = events.venue_id AND venues.created_by = auth.uid())
    OR (created_by = auth.uid() AND status = 'pending')
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM venues WHERE venues.id = events.venue_id AND venues.created_by = auth.uid())
    OR (created_by = auth.uid() AND status <> 'published')
  );

-- ── (h) Feed functions — add status = 'published' filter ──────

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

CREATE OR REPLACE FUNCTION public.lineup_open_weekend_shows(p_user uuid, p_limit integer DEFAULT 12)
 RETURNS TABLE(event_id uuid, title text, starts_at timestamp with time zone, poster_url text, venue_name text, venue_account_id uuid, venue_diamond_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_busy_weeks as (
    select distinct date_trunc('week', (e.starts_at at time zone 'America/Los_Angeles'))::date as wk
    from public.attendees a
    join public.events e on e.id = a.event_id
    where a.user_id = p_user
      and e.starts_at >= now()
      and e.status = 'published'
      and extract(dow from (e.starts_at at time zone 'America/Los_Angeles')) in (0,5,6)
  )
  select e.id, e.title, e.starts_at, e.poster_url, v.name, vp.id, vp.avatar_diamond_url
  from public.follows f
  join public.profiles vp on vp.id = f.following_id and vp.account_type = 'venue'
  join public.venues v on v.id = vp.venue_id
  join public.events e on e.venue_id = v.id
  where f.follower_id = p_user
    and f.status = 'accepted'
    and e.starts_at >= now()
    and e.status = 'published'
    and extract(dow from (e.starts_at at time zone 'America/Los_Angeles')) in (0,5,6)
    and date_trunc('week', (e.starts_at at time zone 'America/Los_Angeles'))::date not in (select wk from my_busy_weeks)
  order by e.starts_at asc
  limit p_limit;
$function$;

GRANT EXECUTE ON FUNCTION public.lineup_open_weekend_shows(uuid, integer) TO anon, authenticated;
