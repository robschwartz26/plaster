-- ============================================================
-- Migration 003: event likes
-- Run in Supabase SQL editor.
-- ============================================================

-- ── like_count on events ─────────────────────────────────────
alter table public.events
  add column if not exists like_count integer not null default 0;

-- ── event_likes ──────────────────────────────────────────────
create table if not exists public.event_likes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.event_likes enable row level security;

create policy "Likes are viewable by everyone"
  on public.event_likes for select using (true);

create policy "Authenticated users can like"
  on public.event_likes for insert with check (auth.uid() = user_id);

create policy "Users can unlike their own likes"
  on public.event_likes for delete using (auth.uid() = user_id);

-- ── Safe like_count increment/decrement ──────────────────────
-- Using security definer so the update bypasses event-level RLS
create or replace function public.add_like_count(p_event_id uuid, delta integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.events
  set like_count = greatest(0, like_count + delta)
  where id = p_event_id;
$$;
