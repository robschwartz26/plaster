-- ── App Store download columns ────────────────────────────────────────────────
-- Filled by the appstore-metrics edge function from Apple's Sales and Trends
-- API, which reports one gzipped TSV per day.
--
-- Nullable, not default-0: Apple's data lags ~1 day and only goes back about
-- 365 days, so most of the backfilled history can never have a number. Null
-- means "Apple has no report for this day", which is not the same as "nobody
-- downloaded it", and the chart has to draw that as a gap rather than a zero.

alter table public.metrics_daily
  add column if not exists downloads_ios        int,  -- first-time installs
  add column if not exists redownloads_ios      int,  -- reinstalls / other devices
  add column if not exists updates_ios          int,  -- app updates, NOT downloads
  add column if not exists downloads_android    int,
  add column if not exists downloads_fetched_at timestamptz;

comment on column public.metrics_daily.downloads_ios is
  'First-time iOS installs for that day, from Apple Sales and Trends (product type identifiers 1/1F/1T). Null means no report, not zero. Updates are counted separately in updates_ios and are deliberately excluded here.';
