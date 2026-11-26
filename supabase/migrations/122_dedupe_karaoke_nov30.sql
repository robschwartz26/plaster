-- ── One duplicate left by the date repair ───────────────────────────────────
-- 121 moved the 24 shifted Karaoke From Hell dates forward a day. One of them,
-- Sunday Nov 29, landed on Monday Nov 30 — where the original capture already
-- sat, because that Monday had been grabbed directly a minute earlier.
--
-- The two rows are interchangeable: same source_url, no recurrence_group_id on
-- either, one view each, zero attendees, likes or wall posts. Keeping the
-- earlier one (00:02:12, the direct capture) and retiring the later one from
-- the schedule batch.
--
-- Rejected rather than deleted: that is what the Reject button does, it takes
-- the event off the wall, and it is reversible if this turns out to be the
-- wrong copy.
update public.events
   set status           = 'rejected',
       rejection_reason = 'duplicate',
       rejection_note   = 'Duplicate of the Nov 30 capture, created when migration 121 shifted this row off Sunday Nov 29',
       reviewed_at      = now()
 where id = 'c59ab7bc-adaa-4c8f-b71c-5f4d3ee76e64';
