-- Migration 105: data fix — 7 Siren Theater events scraped before the
-- deterministic-year fix landed with +1-year slips (June/July 2026 shows
-- recorded as 2027; one title literally says "Tour 2026"). Restore the real
-- dates; all are now in the past, so they simply leave the upcoming wall.
UPDATE events
SET starts_at = starts_at - interval '1 year',
    ends_at   = CASE WHEN ends_at IS NOT NULL THEN ends_at - interval '1 year' END
WHERE id IN (
  'a475f2dc-2ca4-45ab-abd2-68660b9c208f', -- The Aces (night 1)
  'b3ae49ce-2886-4ec0-abba-ee8398f4ce31', -- The Aces (night 2)
  'c1543488-f176-4fc2-9481-3e65a95187b8', -- Sam Taggart (night 1)
  'bfc1e843-6530-46ac-98ad-2b8eacb9cb67', -- Sam Taggart (night 2)
  'f9c1534d-291f-4b7d-ad15-9ce371c5a9ea', -- Sketch Comedy Festival (day 1)
  '79937e12-9d03-4c7f-9796-1c9fdc8f3baf', -- Sketch Comedy Festival (day 2)
  '978e8ff5-fe30-4cf4-92b3-fde732876820'  -- Sketch Comedy Festival (day 3)
);
