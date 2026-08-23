-- Migration 106: indexes for hot query paths flagged in the Aug 2026 audit.
-- Postgres does NOT auto-index foreign keys, and composite unique indexes
-- can't serve a filter on their trailing column — so these filters were doing
-- sequential scans on the largest / fastest-growing tables.

-- events(venue_id): venue pages, duplicate detection, batch import all filter here.
CREATE INDEX IF NOT EXISTS events_venue_id_idx ON public.events (venue_id);

-- attendees(user_id): LINE UP, YOU attended list, feed joins filter by user alone
-- (the existing unique index is (event_id, user_id) — wrong leading column).
CREATE INDEX IF NOT EXISTS attendees_user_id_idx ON public.attendees (user_id);

-- event_likes(user_id): Wall + Map liked-set fetch, feed joins — same story.
CREATE INDEX IF NOT EXISTS event_likes_user_id_idx ON public.event_likes (user_id);

-- events(recurrence_group_id, starts_at): the publish trigger probes recurring
-- series with EXISTS(... WHERE recurrence_group_id = ... AND starts_at < ...);
-- during "Approve All" that ran a seq scan per row. Partial — most events
-- aren't recurring.
CREATE INDEX IF NOT EXISTS events_recurrence_group_idx
  ON public.events (recurrence_group_id, starts_at)
  WHERE recurrence_group_id IS NOT NULL;
