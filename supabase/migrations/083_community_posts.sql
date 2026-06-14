-- Neighborhood community wall posts.
-- Wall is scoped by SEXTANT (region); a post stores both the author's exact
-- neighborhood (for lost-pet alerts later) and sextant (for wall scoping).
-- Status is set server-side by the submit-community-post edge function after AI
-- moderation: clean → 'published', flagged/uncertain → 'pending' (admin review).
create table if not exists public.community_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  neighborhood text not null,
  sextant     text not null check (sextant in ('N','NE','NW','SE','SW','S')),
  post_type   text not null default 'personal' check (post_type in ('personal','business','lost_pet')),
  title       text,
  body        text,
  image_url   text,
  status      text not null default 'pending' check (status in ('pending','published','rejected','expired')),
  is_paid     boolean not null default false,
  flagged     boolean not null default false,
  flag_reason text,
  expires_at  timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason in ('duplicate','wrong_date','bad_image','not_an_event','other')),
  rejection_note   text,
  created_at  timestamptz not null default now()
);

create index if not exists community_posts_sextant_status_idx on public.community_posts (sextant, status, created_at desc);
create index if not exists community_posts_author_idx on public.community_posts (author_id);

alter table public.community_posts enable row level security;

-- Read: published + non-expired in the viewer's sextant; own posts (any status,
-- so an author sees their own pending one); admins see all.
create policy "community read scoped"
  on public.community_posts for select to authenticated
  using (
    (status = 'published'
      and (expires_at is null or expires_at > now())
      and sextant = (select p.home_sextant from public.profiles p where p.id = auth.uid()))
    or author_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- Insert: an authed user may insert their own row. The submit edge function
-- (service role, auth.uid() = null) sets the moderated status; a direct client
-- insert is forced to 'pending' by the trigger below (can't self-publish).
create policy "community insert own"
  on public.community_posts for insert to authenticated
  with check (author_id = auth.uid());

-- Update: admins only (moderation actions).
create policy "community admin update"
  on public.community_posts for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Force pending for non-admin direct inserts; service-role (edge function) inserts
-- have auth.uid() = null and are exempt, so their moderated status stands.
create or replace function public.community_set_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is null then new.author_id := auth.uid(); end if;
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.status := 'pending';
  end if;
  return new;
end; $$;

create trigger community_set_status_trg before insert on public.community_posts
  for each row execute function public.community_set_status();
