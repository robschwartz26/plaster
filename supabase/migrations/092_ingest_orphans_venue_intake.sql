-- ── New-venue intake: extra columns on the orphan queue ───────────────────────
-- The firecrawl-ingester parks events at UNKNOWN venues here (named on the page but
-- not yet in our venues table) instead of misattributing them to the dropdown venue.
-- We add:
--   category            — so the real category survives the park → relink round-trip
--                          (the old scrape-sources relink hardcoded 'Live Music').
--   raw_venue_address   — scraped venue address, to PRE-FILL the intake form.
--   raw_venue_website   — scraped venue website, to pre-fill the intake form.

alter table public.ingest_orphans
  add column if not exists category          text,
  add column if not exists raw_venue_address text,
  add column if not exists raw_venue_website text;

create index if not exists ingest_orphans_open_idx
  on public.ingest_orphans(raw_venue_name) where status = 'open';
