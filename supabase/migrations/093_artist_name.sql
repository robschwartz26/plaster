-- ── Artist name for the media rail ────────────────────────────────────────────
-- The clean headliner/performer name (no tour/presenter cruft), so the 1-col poster's
-- artist rail (YouTube/Spotify/Google discs) can search a tidy query. Populated by the
-- ingesters going forward; the rail falls back to a cleaned title when null.

alter table public.events
  add column if not exists artist_name text;

-- Carry it through the orphan → relink round-trip too.
alter table public.ingest_orphans
  add column if not exists artist_name text;
