-- ── Corrections from the re-run, live-searched audit ───────────────────────
-- The admin's third-party AI re-ran its checks with search actually enabled,
-- opening with: "in those earlier turns, I did not actually run a live web
-- search (even though my previous responses claimed I had)". So the first pass
-- was fabricated and this is the real one. Every claim below was still checked
-- against our own rows first; two were dropped for failing that check.
--
-- NOT applied, because our data contradicts the claim:
--   Beethoven's Ninth — claimed we list eleven 12:00 dates and omit 12/31. We
--   hold no 12:00 dates and already have Dec 30 and Dec 31 at 19:30, which is
--   what the claim says is correct.
--   Elsinore — re-check confirmed every date and first showtime is accurate.
--
-- NOT applied because they are additions, not corrections (listed at the end).

-- ── Dates shifted a day — the off-by-one signature again ───────────────────
-- INZO: "the two-night run is Friday, December 11 & Saturday, December 12 at
-- 9:00 PM, confirming your Thu 12/10 & Fri 12/11 dates are shifted by one day."
update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles')::date + 1)::timestamp + time '21:00'
       ) at time zone 'America/Los_Angeles'
 where title ilike '%INZO%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date in (date '2026-12-10', date '2026-12-11');

-- Oregon International Auto Show: runs Thu Feb 18 - Sun Feb 21 2027, not
-- Wed 17 - Sat 20. Shift a day, then each day gets its published opening.
update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles')::date + 1)::timestamp
         + case extract(dow from ((starts_at at time zone 'America/Los_Angeles')::date + 1))
             when 5 then time '12:00'   -- Friday opens at noon
             else time '10:00'          -- Thu, Sat, Sun open at 10am
           end
       ) at time zone 'America/Los_Angeles',
       time_tbd = false
 where title ilike '%Auto Show%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date
       between date '2027-02-17' and date '2027-02-20';

-- Ballet of Lights: scheduled for Sun Jan 24 2027, not Wed Jan 27.
update public.events
   set starts_at = (date '2027-01-24'::timestamp + time '15:30') at time zone 'America/Los_Angeles'
 where title ilike '%Ballet of Lights%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2027-01-27';

-- ── Times, where the source states one ─────────────────────────────────────
-- Omiyage Holiday Shop: open 10:00-16:00 Wed-Sun. 20:00 is the fallback.
update public.events
   set starts_at = (((starts_at at time zone 'America/Los_Angeles')::date)::timestamp + time '10:00')
                     at time zone 'America/Los_Angeles',
       time_tbd = false
 where title ilike '%Omiyage%' and status = 'published' and starts_at > now()
   and (starts_at at time zone 'America/Los_Angeles')::time = time '20:00';

-- Every Christmas Story Ever Told: evening shows at 7:30 PM. Corroborated in
-- our own rows — Thu 12/03 already sits at 19:30 while the rest took 20:00.
update public.events
   set starts_at = (((starts_at at time zone 'America/Los_Angeles')::date)::timestamp + time '19:30')
                     at time zone 'America/Los_Angeles',
       time_tbd = false
 where title ilike '%Every Christmas Story%' and status = 'published' and starts_at > now()
   and (starts_at at time zone 'America/Los_Angeles')::time = time '20:00';

-- FAN EXPO Portland 2027: Fri opens 3:00 PM, Sat 10:00 AM.
update public.events set starts_at = (date '2027-01-29'::timestamp + time '15:00') at time zone 'America/Los_Angeles', time_tbd = false
 where title ilike '%FAN EXPO%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2027-01-29';
update public.events set starts_at = (date '2027-01-30'::timestamp + time '10:00') at time zone 'America/Los_Angeles', time_tbd = false
 where title ilike '%FAN EXPO%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2027-01-30';

-- Winter Wonderland: Fri-Sun open 4:30 PM. Our Sat 11/28 is already 16:30.
update public.events set starts_at = (date '2026-11-27'::timestamp + time '16:30') at time zone 'America/Los_Angeles'
 where title ilike '%Winter Wonderland%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-27';

-- Sleigh Rides on the Explorer: two nights sail earlier than the standard 7pm.
update public.events set starts_at = (date '2026-12-19'::timestamp + time '18:00') at time zone 'America/Los_Angeles'
 where title ilike '%Sleigh Rides%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-12-19';
update public.events set starts_at = (date '2026-12-20'::timestamp + time '17:00') at time zone 'America/Los_Angeles'
 where title ilike '%Sleigh Rides%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-12-20';

-- The Debut: first screening on opening day is 1:30 PM.
update public.events set starts_at = (date '2026-12-24'::timestamp + time '13:30') at time zone 'America/Los_Angeles'
 where title ilike '%The Debut%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-12-24';

-- Stravinsky's Petrushka: the Saturday performance is an evening show.
update public.events set starts_at = (date '2027-06-05'::timestamp + time '19:30') at time zone 'America/Los_Angeles'
 where title ilike '%Petrushka%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2027-06-05';

-- The Portland Ballet: Sunday is 2:00 PM, not 8:00. Saturday's 17:00 already
-- matches the source, which is part of why this source is credible.
update public.events set starts_at = (date '2026-11-29'::timestamp + time '14:00') at time zone 'America/Los_Angeles', time_tbd = false
 where title ilike '%Portland Ballet%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-29';

-- ── Dates the venue does not hold ──────────────────────────────────────────
-- Peacock Lane runs Dec 15-31; a Dec 13 listing predates the run.
update public.events
   set status = 'rejected', rejection_reason = 'wrong_date',
       rejection_note = 'Peacock Lane runs Dec 15-31 2026; Dec 13 is before opening night.',
       reviewed_at = now()
 where title ilike '%Peacock Lane%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-12-13';

-- Omiyage closes Dec 23; Dec 26 and Dec 30 are past the end of the run.
update public.events
   set status = 'rejected', rejection_reason = 'wrong_date',
       rejection_note = 'Omiyage Holiday Shop runs Nov 27 - Dec 23 2026; this date is after it closes.',
       reviewed_at = now()
 where title ilike '%Omiyage%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date in (date '2026-12-26', date '2026-12-30');

-- ── Unverifiable, so blanked rather than guessed ───────────────────────────
-- Bird Alliance has not published its Winter 2027 calendar. Their birding days
-- run mornings, and our own other Raptor rows are 08:00 and 10:00, so 15:00 is
-- almost certainly an end time or an offset — but "almost certainly" is not a
-- time to print.
update public.events
   set time_tbd = true
 where title ilike '%Raptor%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::time = time '15:00';

-- Singing Christmas Tree: the duplicate is objectively ours — two rows on the
-- same Sunday. Retire the later one.
update public.events
   set status = 'rejected', rejection_reason = 'duplicate',
       rejection_note = 'Second copy of the Sun Nov 29 performance.',
       reviewed_at = now()
 where id = (
   select id from public.events
    where title ilike '%Singing Christmas Tree%' and status = 'published'
      and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-29'
    order by created_at desc limit 1)
   and (select count(*) from public.events
         where title ilike '%Singing Christmas Tree%' and status = 'published'
           and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-29') > 1;

-- Only Nov 28's 6:00 PM is sourced; the rest of the run has no stated time, so
-- those stay blank rather than inheriting one date's hour.
update public.events set starts_at = (date '2026-11-28'::timestamp + time '18:00') at time zone 'America/Los_Angeles', time_tbd = false
 where title ilike '%Singing Christmas Tree%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-28';
update public.events set time_tbd = true
 where title ilike '%Singing Christmas Tree%' and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::time = time '20:00';

-- ── Additions, deliberately not made here ──────────────────────────────────
--   FAN EXPO          Sun 2027-01-31 (10:00) missing
--   Winter Wonderland Nov 29 Bike the Lights, Nov 30 & Dec 1 Lights & Leashes
--   Peacock Lane      opening night Tue Dec 15
--   Omiyage           Dec 23, and the Sundays the run includes
--   Furlough's Parad. closing day Sun 2027-05-02
--   Pittock Mansion   Jan 2-10 2027 (Jan 1 closed)
-- Each needs an event created rather than corrected, which is a different
-- decision from fixing a wrong one.
