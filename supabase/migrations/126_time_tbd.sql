-- ── Never invent a time ──────────────────────────────────────────────────────
-- ptTimestamp() falls back to 20:00 when a source prints no time, in both
-- firecrawl-ingest and scrape-sources. That default then looks exactly like a
-- real 8pm show: it reached the wall as Pittock Mansion opening at 8pm (a
-- museum whose last admission is 3:30), FAN EXPO at 8pm, Portland Saturday
-- Market at 8pm, and a phantom third performance of Little Shop of Horrors.
--
-- The ingester already KNOWS. Its payload carries time_display, empty whenever
-- no time was parsed, and the AutoIngest preview even shows it. But
-- time_display is not a column on events, so the fact is discarded at save and
-- Review cannot tell an invented 8pm from a real one.
--
-- This persists it. starts_at stays non-null — the wall sorts and groups by it,
-- and a null would break the grid — so an unknown time keeps a placeholder
-- instant and this flag says the clock part is not real. The UI shows
-- "Time TBA" instead of the placeholder, and Review asks for a time.
--
-- NOT backfilled. 417 upcoming events sit at 20:00 and most are genuine 8pm
-- shows; flagging them wholesale would replace a wrong time with a wrong
-- "unknown" on hundreds of correct listings. Known-bad ones are corrected
-- individually (124, 125, and the Dec 20 fix below).

alter table public.events
  add column if not exists time_tbd boolean not null default false;

comment on column public.events.time_tbd is
  'True when the source printed no start time and starts_at carries a placeholder clock. Display "Time TBA" rather than the placeholder, and prompt for a real time in Review. Never set by a backfill — only by an ingest that found no time, or by an admin.';

-- ── Review queue needs it ───────────────────────────────────────────────────
drop function if exists public.admin_pending_events();
create or replace function public.admin_pending_events()
returns table (
  id uuid, title text, starts_at timestamptz, venue_id uuid, venue_name text,
  poster_url text, category text, created_by uuid, uploader text, created_at timestamptz,
  is_duplicate boolean, duplicate_of uuid,
  source_url text, ai_confidence int, flag_note text,
  passed_review boolean, description text, address text, sold_out boolean,
  is_holiday boolean, description_breaks boolean, time_tbd boolean
)
language sql security definer set search_path = public stable as $$
  select e.id, e.title, e.starts_at, e.venue_id, v.name, e.poster_url, e.category,
    e.created_by, p.username, e.created_at,
    exists (select 1 from public.events pub
      where pub.status='published' and pub.venue_id=e.venue_id and lower(pub.title)=lower(e.title)
        and (pub.starts_at at time zone 'America/Los_Angeles')::date
          = (e.starts_at at time zone 'America/Los_Angeles')::date) as is_duplicate,
    (select pub.id from public.events pub
      where pub.status='published' and pub.venue_id=e.venue_id and lower(pub.title)=lower(e.title)
        and (pub.starts_at at time zone 'America/Los_Angeles')::date
          = (e.starts_at at time zone 'America/Los_Angeles')::date limit 1) as duplicate_of,
    e.source_url, e.ai_confidence, e.flag_note,
    e.passed_review, e.description, e.address, e.sold_out,
    e.is_holiday, e.description_breaks, e.time_tbd
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.profiles p on p.id = e.created_by
  where e.status='pending' and public.is_admin(auth.uid())
  order by p.username nulls last, e.starts_at;
$$;
grant execute on function public.admin_pending_events() to authenticated;

-- ── Little Shop of Horrors: a performance that does not exist ───────────────
-- Dec 20 carries three showtimes — 2:00, 7:30 and 8:00 — where Portland Center
-- Stage's calendar lists a 2:00 matinee and a 7:30 evening only. The 8pm is
-- the same fallback, appended as an extra rather than replacing a real time.
update public.events
   set show_times = (
         select array_agg(t order by t)
           from unnest(show_times) as t
          where (t at time zone 'America/Los_Angeles')::time <> time '20:00')
 where title ilike '%Little Shop of Horrors%'
   and status = 'published'
   and (starts_at at time zone 'America/Los_Angeles')::date = date '2026-12-20'
   and show_times is not null;
