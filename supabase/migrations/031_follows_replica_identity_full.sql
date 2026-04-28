-- Enable REPLICA IDENTITY FULL on follows so realtime DELETE events
-- include full row data. Without this, DELETE events only include the primary key,
-- which means filters like 'following_id=eq.X' on the realtime channel can't match
-- on DELETE — causing the UI to miss real-time DELETE notifications and only
-- update on next refresh.
ALTER TABLE public.follows REPLICA IDENTITY FULL;
