-- ── Daily metrics snapshot ────────────────────────────────────────────────────
-- An analytics panel is mostly trends, and a trend needs yesterday. The live
-- tables answer "how many now" and nothing else: how many venues had an upcoming
-- show last Tuesday is not recoverable once Tuesday passes. So one row per day,
-- captured by pg_cron, starting immediately — every day without this is a data
-- point that cannot be bought back later.
--
-- Two kinds of number live here and they behave differently:
--
--   FLOW   things that happened that day (signups, events added, RSVPs). These
--          have a created_at, so history IS reconstructible and the backfill at
--          the bottom fills them in from the beginning of the project.
--
--   STOCK  things true at a moment (venues total, pending queue depth, active
--          devices). Mostly reconstructible from created_at/starts_at too, with
--          one exception called out below.
--
-- device_* columns are NULLABLE on purpose: device_tokens.last_seen_at is
-- overwritten on every app launch, so there is no history to recover. Those
-- columns are null for every backfilled day and real from today forward. A null
-- means "not measured", never zero — the panel must not draw it as a floor.

create table if not exists public.metrics_daily (
  day date primary key,

  -- ── The wall ──────────────────────────────────────────────────────────────
  events_published_total  int not null default 0,  -- live events as of that day
  events_upcoming         int not null default 0,  -- published, still in future
  events_added            int not null default 0,  -- FLOW: created that day
  events_with_poster      int not null default 0,

  -- ── Coverage ──────────────────────────────────────────────────────────────
  venues_total            int not null default 0,
  venues_with_upcoming    int not null default 0,
  neighborhoods_covered   int not null default 0,
  venues_missing_coords   int not null default 0,

  -- ── Pipeline ──────────────────────────────────────────────────────────────
  events_pending          int not null default 0,
  orphans_open            int not null default 0,

  -- ── People ────────────────────────────────────────────────────────────────
  profiles_total          int not null default 0,
  signups                 int not null default 0,  -- FLOW
  rsvps                   int not null default 0,  -- FLOW
  likes                   int not null default 0,  -- FLOW
  posts                   int not null default 0,  -- FLOW
  follows                 int not null default 0,  -- FLOW

  -- ── Devices (no history — null before today) ──────────────────────────────
  devices_total           int,
  devices_ios             int,
  devices_android         int,
  active_devices_7d       int,
  active_devices_30d      int,
  active_users_7d         int,   -- distinct humans, not devices

  captured_at             timestamptz not null default now()
);

comment on table public.metrics_daily is
  'One row per calendar day (Portland time) of Plaster metrics. FLOW columns count that day; STOCK columns are the value as of end of that day. device_* and active_* are null for days backfilled before the job existed, because last_seen_at keeps no history.';

alter table public.metrics_daily enable row level security;

-- Read is admin-only; writes come from the SECURITY DEFINER capture function.
drop policy if exists "admin read metrics" on public.metrics_daily;
create policy "admin read metrics" on public.metrics_daily
  for select using (public.is_admin(auth.uid()));

-- RLS decides WHICH rows; this decides whether SELECT is permitted at all.
-- Without it the policy matches nothing and the panel quietly renders zeros.
grant select on public.metrics_daily to authenticated;

-- ── Capture one day ───────────────────────────────────────────────────────────
-- p_live=true means "today": device numbers are measurable. For a backfilled day
-- they are left null rather than filled with a number that would be a lie.
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
  -- End of the captured day, Portland time, as an instant.
  d_end timestamptz := ((p_day + 1)::timestamp at time zone 'America/Los_Angeles');
  d_beg timestamptz := (p_day::timestamp at time zone 'America/Los_Angeles');
begin
  insert into public.metrics_daily as m (
    day,
    events_published_total, events_upcoming, events_added, events_with_poster,
    venues_total, venues_with_upcoming, neighborhoods_covered, venues_missing_coords,
    events_pending, orphans_open,
    profiles_total, signups, rsvps, likes, posts, follows,
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
    -- Never overwrite a real device reading with a null from a backfill rerun.
    devices_total      = coalesce(excluded.devices_total,      m.devices_total),
    devices_ios        = coalesce(excluded.devices_ios,        m.devices_ios),
    devices_android    = coalesce(excluded.devices_android,    m.devices_android),
    active_devices_7d  = coalesce(excluded.active_devices_7d,  m.active_devices_7d),
    active_devices_30d = coalesce(excluded.active_devices_30d, m.active_devices_30d),
    active_users_7d    = coalesce(excluded.active_users_7d,    m.active_users_7d),
    captured_at        = now();
end;
$$;

-- ── Schedule: 00:20 Portland, after midnight rolls over ───────────────────────
-- 08:20 UTC = 00:20 PST / 01:20 PDT. Captures the day that just ended.
select cron.unschedule('metrics-daily-capture')
 where exists (select 1 from cron.job where jobname = 'metrics-daily-capture');

-- Wrapper so the schedule body stays a single statement: pg_cron takes one
-- command, and a two-statement body is a silent half-run waiting to happen.
-- Re-captures yesterday (a late-evening row is incomplete until the day closes)
-- and then today.
create or replace function public.capture_metrics_cron()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  -- Yesterday goes back with p_live=false: its flow columns are now final, but
  -- device counts are an as-of-now reading and stamping today's onto yesterday
  -- would quietly fabricate history. The upsert's coalesce keeps whatever was
  -- genuinely measured yesterday.
  perform public.capture_daily_metrics(today - 1, false);
  perform public.capture_daily_metrics(today, true);
end;
$fn$;

select cron.schedule('metrics-daily-capture', '20 8 * * *',
  $$ select public.capture_metrics_cron(); $$);

-- ── Backfill every day since the first event was created ──────────────────────
-- Flow columns are exact. Stock columns are reconstructed from created_at and
-- are therefore as-of-now in one respect: an event rejected today counts as
-- never-published on every past day. For a wall that publishes far more than it
-- rejects this is a rounding error, and it is the only history obtainable.
do $$
declare
  first_day date;
  d date;
begin
  select least(
    (select min(created_at) from events),
    (select min(created_at) from profiles)
  )::date into first_day;
  if first_day is null then return; end if;

  d := first_day;
  while d < (now() at time zone 'America/Los_Angeles')::date loop
    perform public.capture_daily_metrics(d, false);
    d := d + 1;
  end loop;
end $$;

-- Today, with live device numbers.
select public.capture_daily_metrics((now() at time zone 'America/Los_Angeles')::date, true);
