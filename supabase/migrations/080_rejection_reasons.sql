-- Structured rejection reasons for pending events.
-- Admins pick a reason when rejecting; the uploading worker sees it back in their
-- own upload history (the feedback loop — workers learn the house standards).

alter table public.events
  add column if not exists rejection_reason text null
    check (rejection_reason in ('duplicate','wrong_date','bad_image','not_an_event','other')),
  add column if not exists rejection_note text null;

-- upload_history gains rejection_reason + rejection_note. The RETURNS TABLE shape
-- changes, so the old function must be dropped before re-create.
drop function if exists public.upload_history(int);

create or replace function public.upload_history(p_limit int default 200)
returns table (id uuid, title text, poster_url text, starts_at timestamptz, created_at timestamptz,
  status text, category text, venue_name text, neighborhood text, uploader text,
  rejection_reason text, rejection_note text)
language sql security definer set search_path = public stable as $$
  select e.id, e.title, e.poster_url, e.starts_at, e.created_at, e.status, e.category,
         v.name, v.neighborhood, p.username, e.rejection_reason, e.rejection_note
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.profiles p on p.id = e.created_by
  where public.is_admin(auth.uid())
     or (e.created_by = auth.uid() and public.can_ingest(auth.uid()))
  order by e.created_at desc
  limit p_limit;
$$;
grant execute on function public.upload_history(int) to authenticated;
