-- Admin-assigned venue ownership. One worker per venue (PK on venue_id).
-- The board is the source of truth; no notifications in v1.
create table if not exists public.staff_venue_assignments (
  venue_id    uuid primary key references public.venues(id) on delete cascade,
  worker_id   uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now()
);

alter table public.staff_venue_assignments enable row level security;

-- All staff can read the assignment board (mirrors the staff_chat read pattern).
create policy "staff can read assignments"
  on public.staff_venue_assignments for select
  using (public.can_ingest(auth.uid()));

-- Only admins can assign / reassign / unassign.
create policy "admin can insert assignments"
  on public.staff_venue_assignments for insert to authenticated
  with check (public.is_admin(auth.uid()));
create policy "admin can update assignments"
  on public.staff_venue_assignments for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin can delete assignments"
  on public.staff_venue_assignments for delete to authenticated
  using (public.is_admin(auth.uid()));
