-- Migration 094: case-insensitive usernames (industry standard)
--
-- Usernames are unique and looked up CASE-INSENSITIVELY, but stored and
-- displayed with the exact case the user chose (so @plasterBob shows its capital
-- B, while @plasterbob / @PLASTERBOB all resolve to the same account and nobody
-- can register a different-case copy to impersonate).
--
-- A stored generated column username_ci = lower(username) backs both the unique
-- constraint and case-insensitive app lookups (PostgREST can .eq on it directly,
-- and it handles underscores correctly, which an ilike match would not).
--
-- Verified against prod 2026-07-17: 0 case-collisions among existing usernames,
-- so the unique index builds cleanly.

alter table public.profiles
  add column if not exists username_ci text
  generated always as (lower(username)) stored;

-- Unique across all casings. Partial: username (hence username_ci) is null until
-- the user picks a handle in onboarding, and many nulls must be allowed.
create unique index if not exists profiles_username_ci_key
  on public.profiles (username_ci)
  where username_ci is not null;
