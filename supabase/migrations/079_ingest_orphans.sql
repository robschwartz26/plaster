-- ── Orphan queue: scraped events at unknown venues ────────────────────────────
-- Parked instead of dropped. Raw extraction stored verbatim (remote image_url,
-- unrewritten description) — re-host + voice rewrite happen at relink, when the
-- venue exists and the full insert pipeline runs.

create table if not exists public.ingest_orphans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  raw_venue_name text,
  image_url text,
  description text,
  source_url text,
  event_url text,
  sold_out boolean default false,
  confidence numeric,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  status text not null default 'open' check (status in ('open','linked','discarded')),
  linked_venue_id uuid,
  linked_event_id uuid
);

alter table public.ingest_orphans enable row level security;

create policy "admin all" on public.ingest_orphans
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
