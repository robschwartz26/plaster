-- ── Corrections from a live-searched third-party audit ─────────────────────
-- Source: a Gemini conversation the admin ran against screenshots of the wall,
-- exported 2026-11-25. Treated as a worklist, not as truth — that transcript
-- admits "the system temporarily restricted external search tools during that
-- specific image-analysis step", so its early verdicts had no live lookups, and
-- one of them (High Tea at 09:30 called wrong, then confirmed correct on
-- re-check) was wrong. Only claims that are BOTH live-searched AND corroborated
-- by our own data are applied here.

-- ── Scream Society PDX — 6:00 PM, not 8:00 ─────────────────────────────────
-- Corroborated internally: of 31 rows we hold, exactly ONE is 18:00 and thirty
-- are 20:00. The single odd row is the correct one — it came in with a real
-- time while the rest took the fallback. The outlier check in 128 cannot catch
-- this shape, because here 20:00 is the MAJORITY; it only looks for 8pm as a
-- minority against a dominant other time.
update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles')::date)::timestamp + time '18:00'
       ) at time zone 'America/Los_Angeles',
       time_tbd = false
 where title ilike '%Scream Society%'
   and status = 'published'
   and starts_at > now()
   and (starts_at at time zone 'America/Los_Angeles')::time = time '20:00';

-- ── Portland Saturday Market — opens 10am ──────────────────────────────────
-- "Officially runs every Saturday through Dec 19, 2026 from 10:00 AM - 5:00 PM."
-- 123 moved these off Friday but left the fallback hour, noting there was no
-- source for the real one. Now there is.
update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles')::date)::timestamp + time '10:00'
       ) at time zone 'America/Los_Angeles',
       time_tbd = false
 where title ilike '%Portland Saturday Market%'
   and status = 'published'
   and starts_at > now()
   and (starts_at at time zone 'America/Los_Angeles')::time = time '20:00';

-- ── Christmas Ships Parade — the Willamette fleet departs at 7pm ───────────
-- "departs Riverplace Marina at 7:00 PM on Mon 12/07, Tue 12/08, Wed 12/09,
-- Fri 12/11, and Wed 12/16." Our other four dates are already 19:00; only the
-- Friday carried the 8pm fallback, which 127 marked TBA. Now it has a real time.
update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles')::date)::timestamp + time '19:00'
       ) at time zone 'America/Los_Angeles',
       time_tbd = false
 where title ilike '%Christmas Ships%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-12-11';

-- ── Two events parsed to midnight ──────────────────────────────────────────
-- 00:00 is not a time anyone programmes; it is a parse failure that landed on
-- the date boundary rather than on the 20:00 fallback.
-- Trivia-sippi has a sourced time: "Runs every Wednesday from 6:00 PM-7:30 PM".
update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles')::date)::timestamp + time '18:00'
       ) at time zone 'America/Los_Angeles',
       time_tbd = false
 where title ilike '%Trivia-sippi%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::time = time '00:00';

-- The Movie Quiz has no sourced time, so it gets a blank rather than a guess.
update public.events
   set time_tbd = true
 where title ilike '%The Movie Quiz%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::time = time '00:00';
