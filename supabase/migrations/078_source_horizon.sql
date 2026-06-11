-- ── Configurable ingest horizon per registered source ─────────────────────────
-- How far ahead (days) a source's scrape window reaches. Pre-existing sources
-- keep the old behavior via the 120 default; the UI defaults NEW sources to 60.

ALTER TABLE public.venue_sources
  ADD COLUMN IF NOT EXISTS horizon_days int NOT NULL DEFAULT 120;
