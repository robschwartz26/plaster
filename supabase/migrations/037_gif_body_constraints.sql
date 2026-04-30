-- Migration 037: Make body nullable on messages + event_wall_posts so GIF-only
-- messages and posts can be sent. Replace the strict char_length checks with
-- versions that allow empty/null body, and add a CHECK that requires either
-- a non-empty body OR a media_url.

-- ── messages ──────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_body_check;

ALTER TABLE public.messages
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_check
    CHECK (body IS NULL OR char_length(body) BETWEEN 0 AND 2000);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_or_media_required
    CHECK (
      (body IS NOT NULL AND char_length(body) > 0)
      OR media_url IS NOT NULL
    );

-- ── event_wall_posts ──────────────────────────────────────────────────────

ALTER TABLE public.event_wall_posts
  DROP CONSTRAINT IF EXISTS event_wall_posts_body_check;

ALTER TABLE public.event_wall_posts
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.event_wall_posts
  ADD CONSTRAINT event_wall_posts_body_check
    CHECK (body IS NULL OR char_length(body) BETWEEN 0 AND 280);

ALTER TABLE public.event_wall_posts
  ADD CONSTRAINT event_wall_posts_body_or_media_required
    CHECK (
      (body IS NOT NULL AND char_length(body) > 0)
      OR media_url IS NOT NULL
    );
