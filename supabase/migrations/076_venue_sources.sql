-- ── Auto-ingest pilot: per-venue scrape sources ───────────────────────────────
-- A row = one URL we scrape for structured event data (JSON-LD now; ics/api/ai
-- scrape types reserved). Managed from /admin (Auto-Ingest section); processed by
-- the scrape-sources edge function, which inserts events as status='pending' into
-- the existing review pipeline.

create table if not exists public.venue_sources (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  source_url text not null,
  source_type text not null default 'jsonld' check (source_type in ('jsonld','ics','api','ai_scrape')),
  default_category text not null default 'Live Music',
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_run_note text,
  unique (venue_id, source_url)
);

alter table public.venue_sources enable row level security;

create policy "admin all" on public.venue_sources
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
