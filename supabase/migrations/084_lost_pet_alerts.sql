-- Lost-pet alerts: when a lost_pet community post is published (admin approval),
-- notify everyone whose declared neighborhood EXACTLY matches the post's
-- neighborhood. Animals only; one alert per approved post.

-- 1. Allow the new notification kind.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'mention',
    'activity_like:rsvp',
    'activity_like:wall_post',
    'activity_like:venue_post',
    'warning',
    'follow',
    'message',
    'follow_accepted',
    'reply',
    'va_approved',
    'va_declined',
    'show_reminder',
    'venue_new_show',
    'lost_pet'
  ));

-- 2. Deep-link target for community posts.
alter table public.notifications
  add column if not exists target_community_post_id uuid
    references public.community_posts(id) on delete cascade;

-- 3. Fan-out trigger — fires on transition to published for a lost_pet post.
create or replace function public.notify_neighborhood_on_lost_pet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.post_type <> 'lost_pet' then return NEW; end if;
  if NEW.status <> 'published' then return NEW; end if;
  -- one alert per post: skip if it was already published
  if TG_OP = 'UPDATE' and (OLD.status is not distinct from 'published') then return NEW; end if;

  insert into public.notifications (recipient_id, sender_id, kind, target_community_post_id, body_preview)
  select p.id, NEW.author_id, 'lost_pet', NEW.id, left(coalesce(NEW.title, 'Lost pet'), 120)
  from public.profiles p
  where p.home_neighborhood = NEW.neighborhood
    and p.id <> NEW.author_id;

  return NEW;
end;
$$;

drop trigger if exists community_lost_pet_notify on public.community_posts;
create trigger community_lost_pet_notify
  after insert or update of status on public.community_posts
  for each row execute function public.notify_neighborhood_on_lost_pet();
