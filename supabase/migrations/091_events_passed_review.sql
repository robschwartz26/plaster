-- ── Three-stage review flow ───────────────────────────────────────────────────
-- Review (edit) → Pending (live-app preview) → Live. Modeled with a boolean on
-- top of the existing status, so no CHECK-constraint change and no new status:
--   status='pending' AND passed_review=false  → Review queue (editable; ingested
--                                                and manual uploads land here)
--   status='pending' AND passed_review=true   → Pending queue (live-app format,
--                                                awaiting publish; can be sent back)
--   status='published'                        → Live
--   status='rejected'                         → Rejected
-- Transitions are plain admin UPDATEs (events_update RLS already permits admins):
--   pass review → passed_review=true ; send back → passed_review=false ;
--   publish → status='published' ; reject → status='rejected'.

alter table public.events
  add column if not exists passed_review boolean not null default false;

-- Partial index for the two pending sub-queues.
create index if not exists events_pending_stage_idx
  on public.events(status, passed_review) where status = 'pending';

-- Extend the pending RPC with passed_review (to split Review vs Pending) plus
-- description/address/sold_out so the Review editor can show + edit the info-page
-- text inline without a second fetch per row.
-- DROP first: CREATE OR REPLACE cannot change a function's OUT/return columns.
drop function if exists public.admin_pending_events();
create or replace function public.admin_pending_events()
returns table (
  id uuid, title text, starts_at timestamptz, venue_id uuid, venue_name text,
  poster_url text, category text, created_by uuid, uploader text, created_at timestamptz,
  is_duplicate boolean, duplicate_of uuid,
  source_url text, ai_confidence int, flag_note text,
  passed_review boolean, description text, address text, sold_out boolean
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
    e.passed_review, e.description, e.address, e.sold_out
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.profiles p on p.id = e.created_by
  where e.status='pending' and public.is_admin(auth.uid())
  order by p.username nulls last, e.starts_at;
$$;
grant execute on function public.admin_pending_events() to authenticated;
