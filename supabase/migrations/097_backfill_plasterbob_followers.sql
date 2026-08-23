-- Migration 097: one-time backfill — existing users follow @PlasterBob
--
-- The migration-095 trigger only auto-follows Bob for NEW signups; the beta users
-- who existed before activation (096) don't follow him and wouldn't see his posts.
-- This backfills them: every onboarded user (username set), except Bob, gets a
-- one-way accepted follow of Bob.
--
-- SILENT: the AFTER INSERT notification trigger is disabled for the bulk insert so
-- nobody gets a surprise "you're following PlasterBob" notification (Bob's welcome
-- posts do the introducing). Re-enabled immediately after. Idempotent (ON CONFLICT
-- DO NOTHING); no-op on any environment without the account.

alter table public.follows disable trigger follows_after_insert_notify;

insert into public.follows (follower_id, following_id, status, accepted_at)
select p.id, b.id, 'accepted', now()
from public.profiles p
cross join lateral (select id from public.profiles where username_ci = 'plasterbob' limit 1) b
where p.id <> b.id
  and p.username is not null
on conflict (follower_id, following_id) do nothing;

alter table public.follows enable trigger follows_after_insert_notify;
