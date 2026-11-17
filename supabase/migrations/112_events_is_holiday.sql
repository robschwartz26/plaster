-- ── Holiday classification ────────────────────────────────────────────────────
-- The Wall's Holiday chip read holiday-ness off the title in the client. That is
-- fine for "A Christmas Carol" and hopeless for "Snow Bar Chorale", so the call
-- moves into the database where a human can correct it from the Review queue.
--
-- Shape: a plain boolean, seeded on INSERT by the same title rule the client used,
-- then owned by whoever reviews the event. The trigger is BEFORE INSERT ONLY —
-- an admin un-marking something in Review must stay un-marked.

alter table public.events
  add column if not exists is_holiday boolean not null default false;

-- Partial index: the chip asks for the true rows and nothing else.
create index if not exists events_is_holiday_idx
  on public.events(starts_at) where is_holiday;

-- The title rule. Mirrors src/lib/holiday.ts — keep the two in step.
-- NOTE: Postgres ARE spells a word boundary \y, NOT \b (\b is a backspace here).
create or replace function public.holiday_by_title(p_title text, p_starts_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_title, '') ~* (
    -- the season itself
    'holiday|holidaze|christmas|xmas|\ynoel\y|\yyule\y|yuletide|\yadvent\y|nativity|festivus'
    -- Hanukkah / Kwanzaa
    '|hanukk?ah|chanukah|menorah|\ylatke|kwanzaa'
    -- figures
    '|\ysanta\y|\yst\.? nick\y|kris ?kringle|krampus|rudolph|reindeer|\yscrooge\y|bah humbug|tiny tim'
    -- the repertoire
    '|nutcracker|handel''?s messiah|messiah sing|polar express|miracle on 34th'
    '|wonderful life|\yelf\y|deck the hall|silent night|white christmas'
    -- trappings
    '|\yjingle|mistletoe|\ysleigh|gingerbread|tree lighting|zoolights'
    '|\ycarol(s|ers?|l?ing)\y|ugly sweater|secret santa'
    -- Thanksgiving opens the season: Friendsgiving, Yachtsgiving, the rest
    '|[a-z]+sgiving\y'
    -- winter framing (never bare "winter" — that eats winter tours and the
    -- Winter Raptor Identification birding walks, which are not holiday events)
    '|winter wonderland|winterfest|wintertide|winter market|winter lights'
    '|\ysolstice\y|midwinter'
    -- New Year — broad, because the season window below rules out June
    '|new year|\ynye\y'
  )
  and (
    p_starts_at is null
    -- Nov 1 → Jan 6, Portland time. The window is what lets "Santa" and "Elf"
    -- be keywords at all without catching Santa Cruz or a March screening.
    or extract(month from (p_starts_at at time zone 'America/Los_Angeles')) in (11, 12)
    or (extract(month from (p_starts_at at time zone 'America/Los_Angeles')) = 1
        and extract(day from (p_starts_at at time zone 'America/Los_Angeles')) <= 6)
  );
$$;

-- Seed on the way in. An insert that states is_holiday = true keeps it.
create or replace function public.events_seed_is_holiday()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.is_holiday, false) = false then
    new.is_holiday := public.holiday_by_title(new.title, new.starts_at);
  end if;
  return new;
end;
$$;

drop trigger if exists events_seed_is_holiday_trg on public.events;
create trigger events_seed_is_holiday_trg
  before insert on public.events
  for each row execute function public.events_seed_is_holiday();

-- Backfill everything already in the table by the same rule.
update public.events
   set is_holiday = true
 where is_holiday = false
   and public.holiday_by_title(title, starts_at);

-- ── Review queue needs the flag ───────────────────────────────────────────────
-- DROP first: CREATE OR REPLACE cannot change a function's return columns.
drop function if exists public.admin_pending_events();
create or replace function public.admin_pending_events()
returns table (
  id uuid, title text, starts_at timestamptz, venue_id uuid, venue_name text,
  poster_url text, category text, created_by uuid, uploader text, created_at timestamptz,
  is_duplicate boolean, duplicate_of uuid,
  source_url text, ai_confidence int, flag_note text,
  passed_review boolean, description text, address text, sold_out boolean,
  is_holiday boolean
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
    e.is_holiday
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.profiles p on p.id = e.created_by
  where e.status='pending' and public.is_admin(auth.uid())
  order by p.username nulls last, e.starts_at;
$$;
grant execute on function public.admin_pending_events() to authenticated;
