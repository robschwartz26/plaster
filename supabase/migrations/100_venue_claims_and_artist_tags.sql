-- Migration 100: venue self-claiming + public artist tags
--
-- (a) venue_claims — a venue ACCOUNT (account_type='venue', not yet attached)
--     can request attachment to a venues row ("Claim this venue"). Pending
--     until admin approves; approval sets profiles.venue_id (the existing
--     attachment mechanism from 053) so their page/events light up.
--     One pending claim per account; an account that already has a venue_id
--     can never claim again (enforced in RLS); a venue already attached to
--     some account can't be approved for a second one (enforced in the RPC).
--
-- (b) event_artist_tags(p_event_id) — SECURITY DEFINER read of an event's
--     APPROVED artist claims (090) with the artist's public identity. Needed
--     because 099 locked profiles to authenticated: the info-panel artist tag
--     ("@lowdownbrass") is public content and must render for guests too.

-- ── (a) venue_claims ─────────────────────────────────────────────
create table if not exists public.venue_claims (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  venue_id     uuid not null references public.venues(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  note         text,
  requested_at timestamptz not null default now(),
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz
);

-- one live request per account
create unique index if not exists venue_claims_one_pending
  on public.venue_claims(profile_id) where status = 'pending';

create index if not exists venue_claims_status_idx
  on public.venue_claims(status, requested_at desc);

alter table public.venue_claims enable row level security;

-- A venue account may file ONLY its own pending claim, and only while unattached.
create policy venue_claims_insert on public.venue_claims for insert
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_type = 'venue' and p.venue_id is null
    )
  );

create policy venue_claims_select on public.venue_claims for select
  using (profile_id = auth.uid() or public.is_admin(auth.uid()));

-- Withdraw own pending claim; admins can remove any.
create policy venue_claims_delete on public.venue_claims for delete
  using ((profile_id = auth.uid() and status = 'pending') or public.is_admin(auth.uid()));

create policy venue_claims_update on public.venue_claims for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Approve: attach the profile to the venue + resolve the claim. Guards:
-- admin-only, claim pending, claimant still unattached, venue not already owned.
create or replace function public.admin_approve_venue_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.venue_claims;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  select * into v_claim from public.venue_claims where id = p_claim_id for update;
  if v_claim.id is null or v_claim.status <> 'pending' then
    raise exception 'claim not found or not pending';
  end if;
  if exists (select 1 from public.profiles where id = v_claim.profile_id and venue_id is not null) then
    raise exception 'account is already attached to a venue';
  end if;
  if exists (select 1 from public.profiles where venue_id = v_claim.venue_id) then
    raise exception 'venue is already claimed by another account';
  end if;

  update public.profiles set venue_id = v_claim.venue_id where id = v_claim.profile_id;

  update public.venue_claims
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_claim_id;

  -- other pending claims on the same venue are now moot
  update public.venue_claims
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where venue_id = v_claim.venue_id and status = 'pending' and id <> p_claim_id;
end;
$$;

create or replace function public.admin_reject_venue_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  update public.venue_claims
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_claim_id and status = 'pending';
end;
$$;

grant execute on function public.admin_approve_venue_claim(uuid) to authenticated;
grant execute on function public.admin_reject_venue_claim(uuid) to authenticated;

-- ── (b) public artist tags for a poster ──────────────────────────
create or replace function public.event_artist_tags(p_event_id uuid)
returns table (artist_id uuid, username text, avatar_diamond_url text)
language sql
security definer
stable
set search_path = public
as $$
  select ea.artist_id, p.username, p.avatar_diamond_url
  from public.event_artists ea
  join public.profiles p on p.id = ea.artist_id
  where ea.event_id = p_event_id and ea.status = 'approved'
  order by ea.reviewed_at asc nulls last;
$$;

grant execute on function public.event_artist_tags(uuid) to anon, authenticated;
