-- 109_venue_account_access.sql
-- Handoff tracking for venue accounts.
--
-- SECURITY: this table deliberately stores NO password and NO secret. Venue
-- account passwords are generated on demand at hand-off time (the
-- create-venue-account edge function's `regenerate` action resets the account
-- and returns the new password exactly once, over HTTPS, to an admin). Nothing
-- sensitive is ever persisted, so a leak of this table exposes no credentials.
--
-- What it DOES track: which venue has an account, when access was last
-- generated, and whether/where it was delivered — so admins can see at a glance
-- which venues have been handed their page.

create table if not exists public.venue_account_access (
  venue_id          uuid primary key references public.venues(id)   on delete cascade,
  profile_id        uuid references public.profiles(id)             on delete set null,
  username          text,
  last_generated_at timestamptz,
  last_generated_by uuid references public.profiles(id)             on delete set null,
  delivered_at      timestamptz,
  delivered_to      text,
  note              text,
  created_at        timestamptz not null default now()
);

comment on table public.venue_account_access is
  'Venue-account handoff tracking. Contains no passwords or secrets by design.';

create index if not exists venue_account_access_delivered_idx
  on public.venue_account_access (delivered_at);

alter table public.venue_account_access enable row level security;

-- Admin-only, both directions. The edge function writes with the service role
-- (which bypasses RLS); no non-admin client can read or write this table.
drop policy if exists venue_account_access_admin_all on public.venue_account_access;
create policy venue_account_access_admin_all
  on public.venue_account_access
  for all
  using      (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
