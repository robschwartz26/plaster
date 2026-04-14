-- 004_event_interactions.sql
-- Run in Supabase SQL editor (Dashboard → SQL Editor)
-- Adds: add_view_count RPC, attendees, event_wall_posts, post_likes, add_post_like_count RPC

-- ── add_view_count ─────────────────────────────────────────────────────────
create or replace function add_view_count(p_event_id uuid, delta integer)
returns void
language sql
security definer
as $$
  update events
  set view_count = greatest(0, view_count + delta)
  where id = p_event_id;
$$;

-- ── attendees ──────────────────────────────────────────────────────────────
create table if not exists attendees (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  user_id     uuid not null,
  created_at  timestamptz default now(),
  unique(event_id, user_id)
);

alter table attendees enable row level security;

drop policy if exists "attendees_select" on attendees;
create policy "attendees_select" on attendees for select using (true);

drop policy if exists "attendees_insert" on attendees;
create policy "attendees_insert" on attendees for insert with check (auth.uid() = user_id);

drop policy if exists "attendees_delete" on attendees;
create policy "attendees_delete" on attendees for delete using (auth.uid() = user_id);

-- ── event_wall_posts ───────────────────────────────────────────────────────
create table if not exists event_wall_posts (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  user_id       uuid not null,
  body          text not null check (char_length(body) between 1 and 280),
  is_venue_post boolean not null default false,
  created_at    timestamptz default now()
);

alter table event_wall_posts
  add column if not exists like_count integer not null default 0;

alter table event_wall_posts enable row level security;

drop policy if exists "posts_select" on event_wall_posts;
create policy "posts_select" on event_wall_posts for select using (true);

drop policy if exists "posts_insert" on event_wall_posts;
create policy "posts_insert" on event_wall_posts for insert with check (auth.uid() = user_id);

drop policy if exists "posts_delete" on event_wall_posts;
create policy "posts_delete" on event_wall_posts for delete using (auth.uid() = user_id);

-- ── post_likes ─────────────────────────────────────────────────────────────
create table if not exists post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references event_wall_posts(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

alter table post_likes enable row level security;

drop policy if exists "post_likes_select" on post_likes;
create policy "post_likes_select" on post_likes for select using (true);

drop policy if exists "post_likes_insert" on post_likes;
create policy "post_likes_insert" on post_likes for insert with check (auth.uid() = user_id);

drop policy if exists "post_likes_delete" on post_likes;
create policy "post_likes_delete" on post_likes for delete using (auth.uid() = user_id);

-- ── add_post_like_count ────────────────────────────────────────────────────
create or replace function add_post_like_count(p_post_id uuid, delta integer)
returns void
language sql
security definer
as $$
  update event_wall_posts
  set like_count = greatest(0, like_count + delta)
  where id = p_post_id;
$$;
