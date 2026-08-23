-- Migration 096: activate the founder account ("Plaster Bob")
--
-- Flags the @PlasterBob profile is_official = true, which turns on the auto-follow
-- trigger from migration 095: every NEW signup now auto-follows Bob (one-way,
-- accepted), seeding their LINE UP feed from day one. Bob does not follow back
-- and existing users are NOT backfilled here (see follow-up).
--
-- Idempotent and environment-safe: a no-op anywhere the account doesn't exist.

update public.profiles set is_official = true where username_ci = 'plasterbob';
