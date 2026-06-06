-- Staff clock-in / clock-out tracking
create table if not exists public.staff_shifts (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references auth.users(id) on delete cascade,
  clock_in    timestamptz not null default now(),
  clock_out   timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.staff_shifts enable row level security;

-- Workers can only see/manage their own shifts
create policy "staff can manage own shifts"
  on public.staff_shifts for all
  using (worker_id = auth.uid() and public.can_ingest(auth.uid()))
  with check (worker_id = auth.uid() and public.can_ingest(auth.uid()));
