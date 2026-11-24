-- ── Attended events become mutual-follows-only ───────────────────────────────
-- attendees_select has been `using (true)` since migration 004: any signed-in
-- account could read every RSVP row for every user. Not reachable anonymously
-- — anon has no grant and gets nothing — but "anyone who signs up" is not the
-- circle this app means.
--
-- The intent was already mutual-follow gating; it just never reached this
-- table. AccountProfile computes
--     isMutualFollow = following.has(id) && profileFollowsViewer
-- and gates the follow list on it. The attended grid was left ungated in both
-- the UI and the policy, and `show_social_publicly` — honoured in
-- list_followers, list_following and social_diamond_row — was never wired here
-- either. So a user could switch social activity off and still have their
-- nights out readable by any account.
--
-- For a nightlife app the leaked fact is where a named person will physically
-- be on a given date, which is worth more care than a like count.

-- ── Counts stay public, identities do not ────────────────────────────────────
-- RLS cannot tell "count these rows" from "read these rows", so narrowing the
-- policy would silently shrink the attendee number on every poster. The count
-- moves to its own function: an aggregate that names nobody.
--
-- Granting this to anon is a FIX, not a new exposure. Today a logged-out
-- visitor counts rows they cannot see and every poster reads 0 attendees.
create or replace function public.event_attendee_count(p_event_id uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int from public.attendees where event_id = p_event_id;
$$;

revoke execute on function public.event_attendee_count(uuid) from public;
grant  execute on function public.event_attendee_count(uuid) to anon, authenticated;

-- ── The policy ───────────────────────────────────────────────────────────────
-- are_mutual_follows() returns false when the two ids match, so "my own rows"
-- needs its own clause — without it a user loses their own LINE UP queue.
drop policy if exists "attendees_select" on public.attendees;
create policy "attendees_select" on public.attendees
  for select using (
    auth.uid() = user_id                       -- always your own
    or public.are_mutual_follows(user_id)      -- the circle you chose
    or public.is_admin(auth.uid())
  );
