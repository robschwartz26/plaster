create index if not exists events_status_starts_at_idx on public.events (status, starts_at);
create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists venues_neighborhood_idx on public.venues (neighborhood);
