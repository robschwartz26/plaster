-- Migration 038: extend notifications.kind CHECK to allow activity_like:* values
--
-- Migration 032 introduced the like_activity() RPC which inserts notifications
-- with kind = 'activity_like:rsvp' / 'activity_like:wall_post' / 'activity_like:venue_post',
-- but the notifications_kind_check constraint was never updated to permit those values.
-- Result: every call to like_activity() raised 23514 (check_violation) and the like
-- never persisted (the entire RPC transaction rolled back).
--
-- This migration drops the existing kind CHECK and replaces it with one that allows
-- 'mention' plus the three activity_like:* values.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'mention',
    'activity_like:rsvp',
    'activity_like:wall_post',
    'activity_like:venue_post'
  ));
