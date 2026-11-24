-- ── Rate-limit match_contacts ────────────────────────────────────────────────
-- 118 took this off the anonymous internet. It is still an oracle: hand it a
-- hash, learn whether that person is on Plaster. A phone number is ten digits,
-- so SHA-256 of an E.164 number is brute-forceable on a laptop, and no amount
-- of hashing changes that.
--
-- What rate limiting can and cannot do, stated plainly so nobody mistakes this
-- for more than it is:
--   • It CANNOT stop a targeted check. "Is this one person on Plaster?" costs a
--     single hash, and that is also exactly the feature working as designed.
--   • It CAN stop bulk enumeration — someone running a leaked list of Portland
--     numbers through a throwaway account to harvest the membership.
--
-- Limits are sized against a real phone, not a hypothetical one. FindFriends
-- sends the entire address book deduped in ONE call, two hashes per contact
-- (phone + email), so a 2,500-contact phone is a 5,000-hash call. Caps below
-- clear that with room, while putting a hard ceiling on daily harvest.

create table if not exists public.contact_match_calls (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  hash_count int  not null,
  called_at  timestamptz not null default now()
);

create index if not exists contact_match_calls_user_idx
  on public.contact_match_calls(user_id, called_at desc);

alter table public.contact_match_calls enable row level security;

-- Nobody reads this from the client. Admins can, for spotting abuse.
drop policy if exists "admin read contact match calls" on public.contact_match_calls;
create policy "admin read contact match calls" on public.contact_match_calls
  for select using (public.is_admin(auth.uid()));
grant select on public.contact_match_calls to authenticated;

-- ── The function, now plpgsql so it can count, log and refuse ────────────────
drop function if exists public.match_contacts(text[]);

create or replace function public.match_contacts(hashes text[])
  returns table (
    id                 uuid,
    username           text,
    avatar_diamond_url text,
    avatar_url         text,
    account_type       text,
    matched_phone_hash text,
    matched_email_hash text
  )
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller     uuid := auth.uid();
  n          int  := coalesce(array_length(hashes, 1), 0);
  calls_24h  int;
  hashes_24h int;
  MAX_PER_CALL constant int := 6000;   -- ~3,000 contacts in one sweep
  MAX_CALLS_24H constant int := 12;    -- re-syncing a few times a day is normal
  MAX_HASHES_24H constant int := 20000;
begin
  -- Defence in depth: 118 revoked anon's EXECUTE, but a function that trusts a
  -- grant it cannot see is one migration away from being open again.
  if caller is null then
    raise exception 'match_contacts requires a signed-in user'
      using errcode = '42501';
  end if;

  if n = 0 then return; end if;

  if n > MAX_PER_CALL then
    raise exception 'Too many contacts in one request (% of max %)', n, MAX_PER_CALL
      using errcode = 'P0001';
  end if;

  -- Self-maintaining: the window is 24h, so anything a week old is dead weight.
  delete from public.contact_match_calls
   where user_id = caller and called_at < now() - interval '7 days';

  select count(*), coalesce(sum(c.hash_count), 0)
    into calls_24h, hashes_24h
    from public.contact_match_calls c
   where c.user_id = caller and c.called_at > now() - interval '24 hours';

  if calls_24h >= MAX_CALLS_24H then
    raise exception 'Contact matching limit reached — try again tomorrow'
      using errcode = 'P0001';
  end if;

  if hashes_24h + n > MAX_HASHES_24H then
    raise exception 'Contact matching limit reached — try again tomorrow'
      using errcode = 'P0001';
  end if;

  insert into public.contact_match_calls (user_id, hash_count) values (caller, n);

  return query
    select p.id, p.username, p.avatar_diamond_url, p.avatar_url, p.account_type,
           case when p.phone_hash = any(hashes) then p.phone_hash else null end,
           case when p.email_hash = any(hashes) then p.email_hash else null end
      from public.profiles p
     where (p.phone_hash = any(hashes) or p.email_hash = any(hashes))
       and p.id <> caller
       and p.is_suspended = false
       and p.is_public = true;
end;
$$;

-- Re-apply 118's lockdown: DROP FUNCTION discarded the old grants, and CREATE
-- hands EXECUTE back to PUBLIC. Without these three lines this migration would
-- silently reopen the hole it exists to narrow.
revoke execute on function public.match_contacts(text[]) from public;
revoke execute on function public.match_contacts(text[]) from anon;
grant  execute on function public.match_contacts(text[]) to authenticated;
