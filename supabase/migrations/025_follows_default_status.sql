-- Add default 'pending' to follows.status so client inserts can omit it.
-- The BEFORE INSERT trigger handles auto-accept for artist/venue targets.
ALTER TABLE public.follows ALTER COLUMN status SET DEFAULT 'pending';
