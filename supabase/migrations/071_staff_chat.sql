-- Staff-only shared chat room
create table public.staff_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index staff_chat_messages_created_at_idx on public.staff_chat_messages(created_at);

alter table public.staff_chat_messages enable row level security;

create policy "staff can read chat"
  on public.staff_chat_messages for select
  using (public.can_ingest(auth.uid()));

create policy "staff can send chat"
  on public.staff_chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_ingest(auth.uid()));

-- Enable realtime for live chat updates
alter publication supabase_realtime add table public.staff_chat_messages;
