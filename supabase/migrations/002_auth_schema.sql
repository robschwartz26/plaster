-- ============================================================
-- Migration 002: auth schema additions
-- Run in Supabase SQL editor.
-- ============================================================

-- ── Extend profiles ──────────────────────────────────────────
alter table public.profiles
  add column if not exists is_public  boolean  not null default true,
  add column if not exists interests  text[]   not null default '{}';

-- ── Auto-create profile row on new user signup ────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── follows ──────────────────────────────────────────────────
create table if not exists public.follows (
  id            uuid primary key default gen_random_uuid(),
  follower_id   uuid not null references public.profiles(id) on delete cascade,
  following_id  uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'accepted'
                  check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  unique (follower_id, following_id)
);

alter table public.follows enable row level security;

create policy "Follows are viewable by everyone"
  on public.follows for select using (true);

create policy "Users can follow others"
  on public.follows for insert with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

create policy "Users can accept incoming requests"
  on public.follows for update using (auth.uid() = following_id);

-- Storage bucket for avatars (run once, or via Supabase dashboard)
-- insert into storage.buckets (id, name, public)
--   values ('avatars', 'avatars', true)
-- on conflict do nothing;
--
-- create policy "Anyone can read avatars"
--   on storage.objects for select using (bucket_id = 'avatars');
--
-- create policy "Authenticated users can upload avatars"
--   on storage.objects for insert
--   with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
--
-- create policy "Users can update own avatar"
--   on storage.objects for update
--   using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
