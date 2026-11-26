-- ── Two series whose dates contradict their own descriptions ────────────────
-- Found by auditing all 1,864 upcoming published events with descriptions:
-- extract the weekday the text claims, compare with the weekday the row
-- actually falls on. Eight flagged, five were a naive regex catching only the
-- first day of a real "Saturday or Sunday" run, one (Beaumont Cribbage) is a
-- genuine last-Thursday-of-the-month tournament the description omits. These
-- two are real.

-- ── Portland Saturday Market ────────────────────────────────────────────────
-- "Every Saturday from March through December" — five of six rows are Fridays,
-- all written in one batch on Nov 19.
--
-- Nov 20 goes first and separately: shifting it forward would land on Nov 21,
-- where the one correct Saturday row already sits. Rejecting it before the
-- shift runs also keeps it out of the shift's own status filter.
update public.events
   set status           = 'rejected',
       rejection_reason = 'duplicate',
       rejection_note   = 'Friday Nov 20 is the Saturday Nov 21 market, which is already published',
       reviewed_at      = now()
 where title ilike '%Portland Saturday Market%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-20';

-- The rest move to the Saturday they belong on, local wall clock preserved.
update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles') + interval '1 day')
       ) at time zone 'America/Los_Angeles'
 where title ilike '%Portland Saturday Market%'
   and status = 'published'
   and extract(dow from (starts_at at time zone 'America/Los_Angeles')) = 5  -- Friday
   and starts_at > now();

-- NOTE: the time stays at 20:00 and is still wrong — an outdoor daytime market
-- does not open at 8pm. The description gives no hours and travelportland's
-- page was not captured with any, so there is nothing to correct it FROM.
-- Deliberately left for a human rather than guessed at.

-- ── The Jackstraw Boys @ Laurelthirst ───────────────────────────────────────
-- "2nd and 4th Tuesdays", and the only upcoming row is Wednesday Nov 10 2027.
-- A year slip: Nov 10 2026 was a Tuesday and fits the pattern exactly, so the
-- model wrote the right day in the wrong year, and that date is now past.
-- Retired rather than moved — there is no correct future date to move it to.
-- (firecrawl-ingest has a phantom +1-year guard that did not catch this one.)
update public.events
   set status           = 'rejected',
       rejection_reason = 'wrong_date',
       rejection_note   = 'Year slip: intended Tue Nov 10 2026, stored as Wed Nov 10 2027. Series is 2nd and 4th Tuesdays.',
       reviewed_at      = now()
 where title ilike '%Jackstraw%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2027-11-10';
