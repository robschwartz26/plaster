-- Plaster Slap: invite friends to a show via a group chat; everyone RSVPs
-- independently. A slap is a structured message that renders as a tappable event
-- banner, and it notifies each other member with a deep-link to the thread.

-- Structured slap message.
alter table public.messages
  add column if not exists message_type text not null default 'text'
    check (message_type in ('text','slap')),
  add column if not exists event_id uuid references public.events(id) on delete set null;

-- Thread deep-link target for the slap notification.
alter table public.notifications
  add column if not exists target_conversation_id uuid
    references public.conversations(id) on delete cascade;

-- Allow the new notification kind.
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
    'lost_pet',
    'slap'
  ));

-- Notify every other member of the conversation when a slap message is posted.
create or replace function public.notify_on_slap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.message_type <> 'slap' then return NEW; end if;
  insert into public.notifications (recipient_id, sender_id, kind, target_conversation_id, target_event_id, body_preview)
  select cm.user_id, NEW.sender_id, 'slap', NEW.conversation_id, NEW.event_id, left(coalesce(NEW.body, 'Slap'), 120)
  from public.conversation_members cm
  where cm.conversation_id = NEW.conversation_id
    and cm.user_id <> NEW.sender_id;
  return NEW;
end;
$$;

drop trigger if exists messages_slap_notify on public.messages;
create trigger messages_slap_notify
  after insert on public.messages
  for each row execute function public.notify_on_slap();
