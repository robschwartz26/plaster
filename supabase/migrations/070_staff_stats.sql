-- Aggregate stats for the admin Review panel
create or replace function public.staff_stats()
returns table (
  pending_count  bigint,
  approved_7d    bigint,
  rejected_7d    bigint
)
language sql security definer set search_path = public stable as $$
  select
    (select count(*) from public.events where status = 'pending'),
    (select count(*) from public.events where status = 'published'
       and reviewed_at is not null and reviewed_at > now() - interval '7 days'),
    (select count(*) from public.events where status = 'rejected'
       and reviewed_at is not null and reviewed_at > now() - interval '7 days')
  where public.is_admin(auth.uid());
$$;
grant execute on function public.staff_stats() to authenticated;
