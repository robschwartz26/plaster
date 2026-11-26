-- ── The Portland Ballet, Sun Nov 29 — two shows, not two copies ────────────
-- 130 set both Nov 29 rows to 14:00, treating a duplicate as the problem. The
-- source actually lists TWO Sunday performances: "Sun, Nov 29, 2026 at 2:00 PM
-- (14:00) & 5:00 PM (17:00)". So the second row is a real second show and only
-- its time was wrong — both had taken the 20:00 fallback.
--
-- Caught by auditing every upcoming event for same venue + title + date, which
-- returned exactly one duplicate out of 1,856.

update public.events
   set starts_at = (date '2026-11-29'::timestamp + time '17:00') at time zone 'America/Los_Angeles',
       time_tbd = false
 where id = (
   select id from public.events
    where title ilike '%Portland Ballet%'
      and status = 'published'
      and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-29'
    order by created_at desc
    limit 1)
   and (select count(*) from public.events
         where title ilike '%Portland Ballet%'
           and status = 'published'
           and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-29') > 1;
