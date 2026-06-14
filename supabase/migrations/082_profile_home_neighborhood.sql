-- Declared neighborhood identity on the profile.
-- home_neighborhood = the specific neighborhood (the identity chip).
-- home_sextant      = its region (N/NE/NW/SE/SW/S) — stored at signup so the
--   community wall can scope by region without a per-query name lookup.
alter table public.profiles
  add column if not exists home_neighborhood text null,
  add column if not exists home_sextant text null
    check (home_sextant in ('N','NE','NW','SE','SW','S'));
