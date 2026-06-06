create or replace function public.admin_pending_events()
returns table (
  id uuid, title text, starts_at timestamptz, venue_id uuid, venue_name text,
  poster_url text, category text, created_by uuid, uploader text, created_at timestamptz,
  is_duplicate boolean, duplicate_of uuid
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
          = (e.starts_at at time zone 'America/Los_Angeles')::date limit 1) as duplicate_of
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.profiles p on p.id = e.created_by
  where e.status='pending' and public.is_admin(auth.uid())
  order by p.username nulls last, e.starts_at;
$$;
grant execute on function public.admin_pending_events() to authenticated;
