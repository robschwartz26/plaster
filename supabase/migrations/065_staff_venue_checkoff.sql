create table if not exists public.staff_venue_checkoff (
  worker_id  uuid not null references public.profiles(id) on delete cascade,
  venue_id   uuid not null references public.venues(id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (worker_id, venue_id)
);
alter table public.staff_venue_checkoff enable row level security;
create policy "own checkoff select" on public.staff_venue_checkoff for select using (auth.uid() = worker_id);
create policy "own checkoff insert" on public.staff_venue_checkoff for insert with check (auth.uid() = worker_id);
create policy "own checkoff delete" on public.staff_venue_checkoff for delete using (auth.uid() = worker_id);
