-- ── Opt-in line breaks in descriptions ────────────────────────────────────────
-- Descriptions render in a plain <p>, so newlines collapse and a bulleted list
-- comes out as a run-on paragraph. The fix is CSS (white-space: pre-line), but
-- applying it to every event changes how 5,319 existing descriptions render at
-- once. Only one of them contains a newline today, so the blast radius is tiny
-- — but "tiny" is not "chosen", so this makes it a per-event switch instead.
--
-- Default false: every existing row keeps rendering exactly as it does now.
-- An admin flips it from the Review editor for the events that want it.

alter table public.events
  add column if not exists description_breaks boolean not null default false;

comment on column public.events.description_breaks is
  'When true the info page renders the description with white-space: pre-line, so typed newlines become real line breaks. Default false keeps the legacy single-paragraph rendering.';

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
  is_holiday boolean, description_breaks boolean
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
    e.is_holiday, e.description_breaks
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.profiles p on p.id = e.created_by
  where e.status='pending' and public.is_admin(auth.uid())
  order by p.username nulls last, e.starts_at;
$$;
grant execute on function public.admin_pending_events() to authenticated;
