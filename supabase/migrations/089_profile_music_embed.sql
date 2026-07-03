-- Layer 1 of "the poster you can hear": an artist's LISTEN embed on their profile.
-- Stores the raw Spotify/Bandcamp link the artist pastes. The app validates the
-- host + shape and constructs the sandboxed iframe src ITSELF (never raw <iframe> HTML,
-- never arbitrary domains). We host no audio — the player streams from the artist's
-- own catalog on Spotify/Bandcamp.
--
-- Visibility inherits from the existing profiles RLS
--   (is_public = true) OR (auth.uid() = id) OR is_admin(auth.uid())
-- plus the restrictive block-filter, so a private (or blocked) artist's player hides
-- with their profile automatically — no extra gating needed.
alter table public.profiles
  add column if not exists music_embed_url text null;
