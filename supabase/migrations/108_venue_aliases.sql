-- Venue aliases — alternate spellings/names that should resolve to a venue.
--
-- Problem: the clipper (firecrawl-ingest) matches a clipped venue name against
-- our venues by fuzzy name similarity (>= 0.85). Real-world spelling variants —
-- "Twilight Cafe" vs "Twilight Cafe & Bar", "&" vs "and", accents — score below
-- threshold and get parked as new-venue orphans every single time.
--
-- Fix: when an admin relinks an orphan to an existing venue on the New Venues
-- screen, remember the clipped spelling here. firecrawl-ingest's resolveVenue
-- then matches against name AND aliases, so that spelling auto-matches forever.
--
-- Written only via the service role (edge function) after an admin relink; the
-- column inherits the venues table's existing RLS (public SELECT, admin write).

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

-- GIN index so alias containment/overlap lookups stay fast as the list grows.
CREATE INDEX IF NOT EXISTS venues_aliases_gin ON public.venues USING gin (aliases);
