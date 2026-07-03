-- Layer 2 of "the poster you can hear": an artist self-claims a show and attaches a
-- per-show track. Claims stay 'pending' until an admin approves; only approved claims
-- with a track surface on the poster. We host no audio — the track is a validated
-- Spotify/Bandcamp link rendered by the same sandboxed, click-to-load player.
create table if not exists public.event_artists (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  artist_id    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  track_url    text,                         -- per-show link; validated client-side + at render
  requested_at timestamptz not null default now(),
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  unique (event_id, artist_id)
);

create index if not exists event_artists_event_approved_idx
  on public.event_artists(event_id) where status = 'approved';

alter table public.event_artists enable row level security;

-- Approved claims are public (so any viewer's poster can play). You always see your
-- own claim (any status); admins see everything.
create policy event_artists_select on public.event_artists for select
  using (status = 'approved' or artist_id = auth.uid() or public.is_admin(auth.uid()));

-- An artist account may create ONLY its own pending claim (no self-approval, no
-- claiming on someone else's behalf).
create policy event_artists_insert on public.event_artists for insert
  with check (
    artist_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'artist')
  );

-- Approve / reject is admin-only.
create policy event_artists_update on public.event_artists for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Artists can withdraw their own claim; admins can remove any.
create policy event_artists_delete on public.event_artists for delete
  using (artist_id = auth.uid() or public.is_admin(auth.uid()));
