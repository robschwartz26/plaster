-- ── Two showtimes on one day belong on one card ────────────────────────────
-- The Portland Ballet plays BodyVox twice on Sun Nov 29, at 2:00 PM and
-- 5:00 PM. 130 and 131 corrected both times but left them as two rows, so the
-- wall showed the same poster twice — once reading 2PM, once 5PM.
--
-- The app already has the right shape for this and uses it elsewhere (Little
-- Shop of Horrors renders "2:00 PM & 7:30 PM" from one card): starts_at holds
-- the earliest show and show_times lists every time that day. firecrawl-ingest
-- states the rule outright — "ONE row with show_times (a single poster listing
-- both times), never two rows / never a dropped time" — this pair simply
-- predates it, having been assembled by hand from a third-party audit.
--
-- Scanned all 1,832 upcoming events for the same shape: this was the only one.

-- The 2pm row becomes the card, carrying both times.
update public.events
   set show_times = array[
         (date '2026-11-29'::timestamp + time '14:00') at time zone 'America/Los_Angeles',
         (date '2026-11-29'::timestamp + time '17:00') at time zone 'America/Los_Angeles'
       ]
 where title ilike '%Portland Ballet%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-29'
   and (starts_at at time zone 'America/Los_Angeles')::time = time '14:00';

-- The 5pm row is now represented inside that card.
update public.events
   set status = 'rejected', rejection_reason = 'duplicate',
       rejection_note = 'Merged into the Nov 29 card as a second show time (2:00 PM & 5:00 PM) rather than a separate poster.',
       reviewed_at = now()
 where title ilike '%Portland Ballet%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-11-29'
   and (starts_at at time zone 'America/Los_Angeles')::time = time '17:00';
