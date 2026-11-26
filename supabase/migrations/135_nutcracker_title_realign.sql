-- ── Finish a rename that reached one of eleven rows ───────────────────────
-- The Keller's Balanchine run is 11 published dates. Retitling one of them to
-- add "Ballet" left 1 row on the new title and 10 on the old — and because a
-- run is recognised by venue + title, that row is now a stranger to its own
-- series: opening it offers no siblings at all.
--
-- These rows carry no recurrence_group_id (none of the 31 Nutcracker rows on
-- the wall do), which is exactly why the edit panel cannot lean on that column.
--
-- Bringing the other ten to the new title is what the rename was for, and it
-- makes the run whole again.
update public.events
   set title = 'George Balanchine''s The Nutcracker® Ballet'
 where status = 'published'
   and title = 'George Balanchine''s The Nutcracker®';
