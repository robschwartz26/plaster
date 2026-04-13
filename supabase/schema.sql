-- ============================================================
-- Plaster schema
-- Run this in the Supabase SQL editor after project creation.
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  avatar_url  text,
  bio         text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- ── venues ──────────────────────────────────────────────────
create table if not exists public.venues (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  neighborhood     text,
  address          text,
  location_lat     double precision,
  location_lng     double precision,
  website          text,
  instagram        text,
  avatar_url       text,
  cover_url        text,
  is_verified      boolean not null default false,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.venues enable row level security;

create policy "Venues are viewable by everyone"
  on public.venues for select using (true);

create policy "Authenticated users can create venues"
  on public.venues for insert with check (auth.role() = 'authenticated');

create policy "Venue creators can update their venues"
  on public.venues for update using (auth.uid() = created_by);

-- ── events ──────────────────────────────────────────────────
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid references public.venues(id) on delete cascade,
  title            text not null,
  description      text,
  category         text,
  poster_url       text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  is_recurring     boolean not null default false,
  recurrence_rule  text,
  neighborhood     text,
  address          text,
  location_lat     double precision,
  location_lng     double precision,
  view_count       integer not null default 0,
  created_at       timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Events are viewable by everyone"
  on public.events for select using (true);

create policy "Authenticated users can create events"
  on public.events for insert with check (auth.role() = 'authenticated');

create policy "Event creators can update via venue ownership"
  on public.events for update using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and v.created_by = auth.uid()
    )
  );

-- ── attendees ───────────────────────────────────────────────
create table if not exists public.attendees (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.attendees enable row level security;

create policy "Attendees are viewable by everyone"
  on public.attendees for select using (true);

create policy "Users can mark themselves as attending"
  on public.attendees for insert with check (auth.uid() = user_id);

create policy "Users can remove their own attendance"
  on public.attendees for delete using (auth.uid() = user_id);

-- ── venue_follows ────────────────────────────────────────────
create table if not exists public.venue_follows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  venue_id   uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, venue_id)
);

alter table public.venue_follows enable row level security;

create policy "Venue follows are viewable by everyone"
  on public.venue_follows for select using (true);

create policy "Users can follow venues"
  on public.venue_follows for insert with check (auth.uid() = user_id);

create policy "Users can unfollow venues"
  on public.venue_follows for delete using (auth.uid() = user_id);

-- ── event_wall_posts ─────────────────────────────────────────
create table if not exists public.event_wall_posts (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text,
  image_url  text,
  created_at timestamptz not null default now()
);

alter table public.event_wall_posts enable row level security;

create policy "Wall posts are viewable by everyone"
  on public.event_wall_posts for select using (true);

create policy "Authenticated users can post"
  on public.event_wall_posts for insert with check (auth.uid() = user_id);

create policy "Users can delete their own posts"
  on public.event_wall_posts for delete using (auth.uid() = user_id);

-- ── Storage bucket: posters ──────────────────────────────────
-- Run this separately or via Supabase dashboard:
-- insert into storage.buckets (id, name, public)
--   values ('posters', 'posters', true)
-- on conflict do nothing;

-- create policy "Anyone can read posters"
--   on storage.objects for select using (bucket_id = 'posters');

-- create policy "Authenticated users can upload posters"
--   on storage.objects for insert
--   with check (bucket_id = 'posters' and auth.role() = 'authenticated');
