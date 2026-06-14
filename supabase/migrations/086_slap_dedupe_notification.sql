-- A slap message already gets its dedicated 'slap' notification (migration 085).
-- Stop the generic message-insert trigger from ALSO firing a 'message' shout for
-- it, so a slap produces exactly one notification. Normal text messages are
-- unaffected. Re-creates handle_message_insert() with an early return for slaps.
create or replace function public.handle_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_member record;
  v_preview text;
begin
  if NEW.deleted_at is not null then
    return NEW;
  end if;

  -- Slap messages notify via the dedicated 'slap' trigger — skip the generic one.
  if NEW.message_type = 'slap' then
    return NEW;
  end if;

  v_preview := case
    when NEW.body is null or length(NEW.body) = 0 then null
    when length(NEW.body) > 80 then substring(NEW.body from 1 for 77) || '...'
    else NEW.body
  end;

  for r_member in
    select user_id
    from public.conversation_members
    where conversation_id = NEW.conversation_id
      and user_id <> NEW.sender_id
  loop
    if public.is_blocked_either_way(r_member.user_id, NEW.sender_id) then
      continue;
    end if;
    if public.is_muted_by(r_member.user_id, NEW.sender_id) then
      continue;
    end if;

    insert into public.notifications (recipient_id, sender_id, kind, body_preview)
    values (r_member.user_id, NEW.sender_id, 'message', v_preview);
  end loop;

  return NEW;
end;
$$;
