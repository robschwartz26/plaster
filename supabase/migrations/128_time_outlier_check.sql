-- ── Standing check: an 8pm that disagrees with its own run ──────────────────
-- The strongest detector found today needs no source page. A series holding
-- fifteen 7:30 performances and one at 8:00 names its own outlier, because
-- 20:00 is ptTimestamp's fallback hour. Run by hand it found 15 events, twelve
-- of them the opening date of a theatre run — the one date ingested separately
-- from the schedule list, without a time.
--
-- 126 stops new events inventing a time. This catches the ones that slip
-- through anyway: a source that prints a wrong time, a hand-entered mistake,
-- or an ingest path nobody has wired yet.
--
-- It NOTIFIES, never edits. Three of the fifteen were matinee-dominant runs
-- whose openers genuinely are evening shows, so an auto-correct would have
-- traded a wrong time for a worse one. A human decides; the notification
-- carries a one-click "Mark Time TBA".

create or replace function public.flag_time_outliers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  with upcoming as (
    select e.id, e.venue_id, lower(btrim(e.title)) as t, e.title,
           (e.starts_at at time zone 'America/Los_Angeles')::time as lt
      from public.events e
     where e.status = 'published'
       and e.starts_at > now()
       and e.time_tbd = false          -- already acknowledged as unknown
  ),
  counts as (
    select venue_id, t, lt, count(*) as c from upcoming group by venue_id, t, lt
  ),
  -- the run's own busiest time, ignoring the suspect hour
  dom as (
    select distinct on (venue_id, t) venue_id, t, lt as dom_lt, c as dom_c
      from counts
     where lt <> time '20:00'
     order by venue_id, t, c desc
  ),
  at8 as (
    select venue_id, t, count(*) as c8 from upcoming where lt = time '20:00'
     group by venue_id, t
  ),
  flagged as (
    select u.id, u.title, d.dom_lt, d.dom_c
      from upcoming u
      join at8 a on a.venue_id is not distinct from u.venue_id and a.t = u.t
      join dom d on d.venue_id is not distinct from u.venue_id and d.t = u.t
     where u.lt = time '20:00'
       and a.c8 <= 2                   -- a minority, not the run's actual time
       and d.dom_c >= 2
       and a.c8 < d.dom_c
  )
  insert into public.admin_notifications (type, title, message, event_id)
  select 'time_outlier',
         left(f.title, 80) || ' — 8:00 PM looks wrong',
         'Every other date in this run is at ' || trim(to_char(f.dom_lt, 'HH12:MI AM'))
           || ' (' || f.dom_c || ' dates). This one says 8:00 PM, which is the time the '
           || 'ingester falls back to when a source prints none. Mark it Time TBA, or '
           || 'dismiss if 8pm is genuinely right.',
         f.id
    from flagged f
   where not exists (
     select 1 from public.admin_notifications an
      where an.event_id = f.id
        and an.type = 'time_outlier'
        and an.dismissed = false);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.flag_time_outliers() from public;
revoke execute on function public.flag_time_outliers() from anon;
revoke execute on function public.flag_time_outliers() from authenticated;

-- 00:40 Portland, after the metrics capture at 00:20.
select cron.unschedule('time-outlier-check')
 where exists (select 1 from cron.job where jobname = 'time-outlier-check');
select cron.schedule('time-outlier-check', '40 8 * * *',
  $$ select public.flag_time_outliers(); $$);

-- Seed now. The 15 already found are time_tbd = true and are skipped, so this
-- surfaces only anything new.
select public.flag_time_outliers();
