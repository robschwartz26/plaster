-- Migration 095: official accounts + founder auto-follow ("Plaster Bob")
--
-- Every new user automatically follows any account flagged is_official, on
-- signup, ONE-DIRECTIONAL and auto-accepted — so their LINE UP feed is seeded
-- from day one by the official account's posts (welcome, featured shows). The
-- official account does NOT follow back (no fake reciprocity, no firehose feed
-- for the founder). Only NEW signups going forward; existing users are not
-- backfilled by design.
--
-- Notifications: an official/broadcast account followed by everyone must not be
-- pinged on every signup. Rather than touch the shared notify_on_follow_insert()
-- (which the whole app's follow flow depends on — risky while in App Review), we
-- reuse the transaction-local skip flag it already honors (migration 047):
-- follow_official_accounts() sets app.skip_followee_follow_notification='true'
-- before inserting, so the followee 'follow' notification is skipped. The new
-- follower still gets a single 'follow_accepted' ("you're following Plaster Bob"),
-- which is a gentle welcome pointing them at the account.
--
-- This whole migration is INERT until an account is flagged is_official: the
-- trigger fires on every signup but follows nothing until then.

-- ── Official flag ─────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_official boolean not null default false;

-- ── Auto-follow official accounts on new profile ──────────────────────────
create or replace function public.follow_official_accounts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Don't ping official (broadcast) accounts on every signup — reuse the
  -- transaction-local skip flag that notify_on_follow_insert() already honors
  -- (migration 047). Scoped to this signup transaction; auto-resets on commit.
  perform set_config('app.skip_followee_follow_notification', 'true', true);

  insert into public.follows (follower_id, following_id, status, accepted_at)
  select new.id, p.id, 'accepted', now()
  from public.profiles p
  where p.is_official = true
    and p.id <> new.id
  on conflict (follower_id, following_id) do nothing;

  perform set_config('app.skip_followee_follow_notification', 'false', true);
  return new;
end;
$$;

drop trigger if exists profiles_follow_official on public.profiles;
create trigger profiles_follow_official
  after insert on public.profiles
  for each row execute function public.follow_official_accounts();
