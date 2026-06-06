create or replace function public.staff_roster()
returns table (id uuid, username text, avatar_diamond_url text, avatar_url text, is_admin boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.username, p.avatar_diamond_url, p.avatar_url, p.is_admin
  from public.profiles p
  where (p.is_ingester = true or p.is_admin = true)
    and public.can_ingest(auth.uid())   -- only staff can read the roster
  order by p.is_admin desc, p.username;
$$;
grant execute on function public.staff_roster() to authenticated;
