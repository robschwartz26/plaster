-- ── "New Year's Eve with Oregon Symphony" — a concert listed in November ───
-- Sixteen rows under this title: fifteen at 12:00 noon spread across Nov 19 to
-- Dec 12, and one on Dec 30. The Oregon Symphony's New Year's Eve concert is
-- Beethoven's Ninth, and we already hold it correctly under that name:
-- Wed Dec 30 and Thu Dec 31, both 19:30, which matches the hall's listing.
--
-- So every row under this second title is wrong. The fifteen noon dates are a
-- listing-page mis-ingest — the event card picked up off a season calendar and
-- stamped onto each date the page showed, at the page's own layout time rather
-- than a performance time. A New Year's Eve concert does not happen on Nov 19.
-- The Dec 30 row is a straight duplicate of the Beethoven's Ninth Dec 30 row:
-- same venue, same date, same 19:30.
--
-- This was reported in the admin's third-party audit and I wrongly dismissed
-- it, having searched only for "Beethoven" and found no noon dates. The rows
-- were under the other title the whole time. The duplicate-audit that followed
-- missed the Dec 30 collision for the same reason: it keyed on venue + title +
-- date, so the same concert under two names looked like two concerts.

update public.events
   set status = 'rejected', rejection_reason = 'duplicate',
       rejection_note = 'The Oregon Symphony NYE concert is held correctly as "New Year''s Eve with Beethoven''s Ninth" on Dec 30 and Dec 31 at 19:30. These rows are a season-calendar mis-ingest: fifteen noon dates in Nov-Dec plus a duplicate of Dec 30.',
       reviewed_at = now()
 where title = 'New Year''s Eve with Oregon Symphony'
   and status = 'published';
