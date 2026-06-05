create or replace function consolidate_events(p_keep_id uuid, p_remove_ids uuid[])
returns void language plpgsql security definer as $$
declare v_times timestamptz[];
begin
  -- gather every distinct showtime across the kept + removed events
  select array_agg(distinct ts order by ts) into v_times from (
    select starts_at as ts from events where id = p_keep_id
    union all select starts_at from events where id = any(p_remove_ids)
    union all select unnest(show_times) from events where id = p_keep_id and show_times is not null
    union all select unnest(show_times) from events where id = any(p_remove_ids) and show_times is not null
  ) t;

  update events set
    starts_at  = v_times[1],
    show_times = case when array_length(v_times,1) > 1 then v_times else null end
    where id = p_keep_id;

  -- preserve RSVPs: move attendees onto the kept event, dropping any that would collide
  delete from attendees a where a.event_id = any(p_remove_ids)
    and exists (select 1 from attendees k where k.event_id = p_keep_id and k.user_id = a.user_id);
  update attendees set event_id = p_keep_id where event_id = any(p_remove_ids);

  -- clear the removed events' remaining child rows so the delete can't hit a FK error
  delete from event_likes where event_id = any(p_remove_ids);
  delete from event_views where event_id = any(p_remove_ids);
  delete from sold_out_reports where event_id = any(p_remove_ids);

  delete from events where id = any(p_remove_ids);
end; $$;
grant execute on function consolidate_events(uuid, uuid[]) to authenticated;
