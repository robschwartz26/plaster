-- ── Data fix: two residencies published one day early ───────────────────────
-- The Clipper's "grab more dates" path rebuilt each captured date from the
-- source event's UTC hour instead of its Portland wall clock. A 9pm Portland
-- show is 05:00 UTC the NEXT day, so `date @ 05:00 UTC` resolved to the evening
-- BEFORE. Every date the model read landed one day early. Code fixed in
-- firecrawl-ingest (portlandHHMM).
--
-- Found by fingerprint rather than by eye: a correctly built series holds a
-- constant LOCAL time across a DST change, while one built from a fixed UTC
-- instant drifts by an hour. Scanning all 1,868 upcoming published events for
-- "one UTC time, two local times" returned exactly two series — these. A
-- weekday-based scan missed both and flagged a dozen innocent theatre runs
-- (a Friday evening plus a Saturday matinee is a real schedule).
--
-- Times come from each venue's own words, not from the existing rows:
--   Dante's      "Every Monday ... doors 8 PM, the show kicks off at 9 PM"
--   Devil's Pt   "every Friday and Sunday at 9PM"
-- Both are 21:00, which also matches parseShowTime()'s rule of preferring the
-- show time over the door time.
--
-- DST: both runs cross the March 2027 change, so a fixed +24h would move half
-- the dates by an hour. Rebuilding from the local date plus a literal local
-- time and converting back is the only arithmetic that survives the boundary.

-- ── Karaoke From Hell @ Dante's — Mondays ───────────────────────────────────
-- 24 rows on Sunday. The 29 correct Mondays carry dow=1 and are untouched.
update public.events e
   set starts_at = (
         ((e.starts_at at time zone 'America/Los_Angeles')::date + 1)::timestamp
         + time '21:00'
       ) at time zone 'America/Los_Angeles'
 where e.title ilike '%Karaoke From Hell%'
   and e.status = 'published'
   and extract(dow from (e.starts_at at time zone 'America/Los_Angeles')) = 0  -- Sunday
   and e.starts_at > now();

-- ── Stripparaoke @ Devil's Point — Fridays and Sundays ──────────────────────
-- 40 rows sit on Thursday and Saturday, exactly one day before the real run.
-- The single Friday row is the original capture, made four minutes before the
-- schedule grab, and is already correct — dow=5 keeps it out of this update.
update public.events e
   set starts_at = (
         ((e.starts_at at time zone 'America/Los_Angeles')::date + 1)::timestamp
         + time '21:00'
       ) at time zone 'America/Los_Angeles'
 where e.title ilike '%Stripparaoke%'
   and e.status = 'published'
   and extract(dow from (e.starts_at at time zone 'America/Los_Angeles')) in (4, 6)  -- Thu, Sat
   and e.starts_at > now();
