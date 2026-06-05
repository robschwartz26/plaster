alter table events add column if not exists sold_out_report_count integer not null default 0;

create table if not exists sold_out_reports (
  event_id uuid references events(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);
alter table sold_out_reports enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='sold_out_reports'
                 and policyname='insert_own_sold_out_report') then
    create policy "insert_own_sold_out_report" on sold_out_reports
      for insert with check (user_id = auth.uid());
  end if;
end $$;

drop function if exists report_sold_out(uuid);
create or replace function report_sold_out(p_event_id uuid)
returns integer language plpgsql security definer as $$
declare v_count integer; v_title text;
begin
  insert into sold_out_reports(event_id, user_id) values (p_event_id, auth.uid())
    on conflict (event_id, user_id) do nothing;
  if not found then
    return (select sold_out_report_count from events where id = p_event_id);
  end if;
  update events set sold_out_report_count = sold_out_report_count + 1
    where id = p_event_id returning sold_out_report_count, title into v_count, v_title;
  if v_count >= 15 then
    update events set sold_out = true where id = p_event_id;
    update admin_notifications set dismissed = true
      where type='sold_out_report' and event_id=p_event_id;
  elsif exists (select 1 from admin_notifications
                where type='sold_out_report' and event_id=p_event_id and not dismissed) then
    update admin_notifications set
      message = v_count || ' people have flagged this as sold out', snoozed_until = null
      where type='sold_out_report' and event_id=p_event_id and not dismissed;
  else
    insert into admin_notifications(type, title, message, event_id)
      values ('sold_out_report', v_title,
              v_count || ' people have flagged this as sold out', p_event_id);
  end if;
  return v_count;
end; $$;
grant execute on function report_sold_out(uuid) to authenticated;

create or replace function confirm_sold_out(p_event_id uuid)
returns void language plpgsql security definer as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'admin only';
  end if;
  update events set sold_out = true where id = p_event_id;
  update admin_notifications set dismissed = true
    where type='sold_out_report' and event_id=p_event_id;
end; $$;
grant execute on function confirm_sold_out(uuid) to authenticated;
