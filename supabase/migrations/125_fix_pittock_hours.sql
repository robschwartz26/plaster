-- ── Pittock Mansion: Home for the Holidays — times and a closure ────────────
-- 41 rows ingested in three batches two minutes apart. Thirteen carry the real
-- opening time (09:00) and two the real Tuesday time (12:00); the other
-- twenty-six are 20:00, the ingester's fallback hour and not a time the
-- mansion is ever open — last admission is 3:30pm.
--
-- Pittock's published hours for the run:
--   Wed-Mon  9:00 AM - 4:00 PM
--   Tuesday  12:00 PM - 4:00 PM (opens at noon)
--   Closed   Thanksgiving Nov 26, Christmas Dec 25, New Year's Day Jan 1
--
-- Thanksgiving and New Year's are correctly absent already. Christmas is not.

update public.events
   set starts_at = (
         ((starts_at at time zone 'America/Los_Angeles')::date)::timestamp
         + case when extract(dow from (starts_at at time zone 'America/Los_Angeles')) = 2
                then time '12:00'    -- Tuesday opens at noon
                else time '09:00' end
       ) at time zone 'America/Los_Angeles'
 where title ilike '%Pittock%Home for the Holidays%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::time = time '20:00';

update public.events
   set status = 'rejected', rejection_reason = 'wrong_date',
       rejection_note = 'Pittock Mansion is closed Christmas Day; the run skips Dec 25.',
       reviewed_at = now()
 where title ilike '%Pittock%Home for the Holidays%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-12-25';

-- NOT done here: the run goes through Jan 10 2027 and our last date is Dec 30,
-- so Jan 2-10 (nine days, Jan 1 closed) are missing. Adding them means
-- creating events rather than correcting them — left for a human.
