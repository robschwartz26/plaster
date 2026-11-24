-- ── Real active-user history, from event_views ────────────────────────────────
-- 115 measured "active" from device_tokens.last_seen_at, which has two problems:
-- it only exists for people who granted push (24 rows against Capgo's 48 live
-- devices), and it is overwritten on each launch so it carries no history.
--
-- event_views has viewed_at and user_id per row. That gives genuine daily and
-- weekly actives, AND it is backfillable — the history is already sitting there.
-- The device_* columns stay: they are the only iOS/Android split available.

alter table public.metrics_daily
  add column if not exists views      int not null default 0,  -- FLOW: posters opened
  add column if not exists viewers    int not null default 0,  -- distinct signed-in humans (DAU)
  add column if not exists viewers_7d int not null default 0;  -- distinct over trailing 7 days (WAU)

comment on column public.metrics_daily.viewers is
  'Distinct signed-in users who opened at least one event that day. Guests are not counted (event_views.user_id is null for them), so this is a floor, not a total.';

create or replace function public.capture_daily_metrics(
  p_day date default (now() at time zone 'America/Los_Angeles')::date,
  p_live boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d_end timestamptz := ((p_day + 1)::timestamp at time zone 'America/Los_Angeles');
  d_beg timestamptz := (p_day::timestamp at time zone 'America/Los_Angeles');
  d_7   timestamptz := ((p_day - 6)::timestamp at time zone 'America/Los_Angeles');
begin
  insert into public.metrics_daily as m (
    day,
    events_published_total, events_upcoming, events_added, events_with_poster,
    venues_total, venues_with_upcoming, neighborhoods_covered, venues_missing_coords,
    events_pending, orphans_open,
    profiles_total, signups, rsvps, likes, posts, follows,
    views, viewers, viewers_7d,
    devices_total, devices_ios, devices_android,
    active_devices_7d, active_devices_30d, active_users_7d,
    captured_at
  )
  select
    p_day,
    (select count(*) from events e where e.status = 'published' and e.created_at < d_end),
    (select count(*) from events e where e.status = 'published' and e.created_at < d_end and e.starts_at >= d_beg),
    (select count(*) from events e where e.created_at >= d_beg and e.created_at < d_end),
    (select count(*) from events e where e.status = 'published' and e.created_at < d_end and e.poster_url is not null),

    (select count(*) from venues v where v.created_at < d_end),
    (select count(distinct e.venue_id) from events e
      where e.status = 'published' and e.created_at < d_end and e.starts_at >= d_beg and e.venue_id is not null),
    (select count(distinct v.neighborhood) from venues v where v.created_at < d_end and v.neighborhood is not null),
    (select count(*) from venues v where v.created_at < d_end and v.location_lat is null),

    (select count(*) from events e where e.status = 'pending' and e.created_at < d_end),
    (select count(*) from ingest_orphans o where o.status = 'open' and o.created_at < d_end),

    (select count(*) from profiles p where p.created_at < d_end),
    (select count(*) from profiles p where p.created_at >= d_beg and p.created_at < d_end),
    (select count(*) from attendees a where a.created_at >= d_beg and a.created_at < d_end),
    (select count(*) from event_likes l where l.created_at >= d_beg and l.created_at < d_end),
    (select count(*) from event_wall_posts w where w.created_at >= d_beg and w.created_at < d_end and w.deleted_at is null),
    (select count(*) from follows f where f.created_at >= d_beg and f.created_at < d_end),

    (select count(*) from event_views v where v.viewed_at >= d_beg and v.viewed_at < d_end),
    (select count(distinct v.user_id) from event_views v
      where v.viewed_at >= d_beg and v.viewed_at < d_end and v.user_id is not null),
    (select count(distinct v.user_id) from event_views v
      where v.viewed_at >= d_7 and v.viewed_at < d_end and v.user_id is not null),

    case when p_live then (select count(*) from device_tokens) end,
    case when p_live then (select count(*) from device_tokens where platform = 'ios') end,
    case when p_live then (select count(*) from device_tokens where platform = 'android') end,
    case when p_live then (select count(*) from device_tokens where last_seen_at >= now() - interval '7 days') end,
    case when p_live then (select count(*) from device_tokens where last_seen_at >= now() - interval '30 days') end,
    case when p_live then (select count(distinct user_id) from device_tokens where last_seen_at >= now() - interval '7 days') end,
    now()
  on conflict (day) do update set
    events_published_total = excluded.events_published_total,
    events_upcoming        = excluded.events_upcoming,
    events_added           = excluded.events_added,
    events_with_poster     = excluded.events_with_poster,
    venues_total           = excluded.venues_total,
    venues_with_upcoming   = excluded.venues_with_upcoming,
    neighborhoods_covered  = excluded.neighborhoods_covered,
    venues_missing_coords  = excluded.venues_missing_coords,
    events_pending         = excluded.events_pending,
    orphans_open           = excluded.orphans_open,
    profiles_total         = excluded.profiles_total,
    signups                = excluded.signups,
    rsvps                  = excluded.rsvps,
    likes                  = excluded.likes,
    posts                  = excluded.posts,
    follows                = excluded.follows,
    views                  = excluded.views,
    viewers                = excluded.viewers,
    viewers_7d             = excluded.viewers_7d,
    devices_total      = coalesce(excluded.devices_total,      m.devices_total),
    devices_ios        = coalesce(excluded.devices_ios,        m.devices_ios),
    devices_android    = coalesce(excluded.devices_android,    m.devices_android),
    active_devices_7d  = coalesce(excluded.active_devices_7d,  m.active_devices_7d),
    active_devices_30d = coalesce(excluded.active_devices_30d, m.active_devices_30d),
    active_users_7d    = coalesce(excluded.active_users_7d,    m.active_users_7d),
    captured_at        = now();
end;
$$;

-- Re-run the backfill so the three new columns get their history.
do $$
declare first_day date; d date;
begin
  select min(day) into first_day from public.metrics_daily;
  if first_day is null then return; end if;
  d := first_day;
  while d < (now() at time zone 'America/Los_Angeles')::date loop
    perform public.capture_daily_metrics(d, false);
    d := d + 1;
  end loop;
end $$;

select public.capture_daily_metrics((now() at time zone 'America/Los_Angeles')::date, true);
