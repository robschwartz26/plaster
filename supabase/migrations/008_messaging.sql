-- Conversations (1-on-1 for v1, structure supports group later)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- Members of a conversation
create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conv_created on messages(conversation_id, created_at desc);
create index if not exists idx_conv_members_user on conversation_members(user_id);
create index if not exists idx_conversations_last_msg on conversations(last_message_at desc);

-- RLS
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

-- Conversations: select if you're a member
create policy "select_conversations_if_member" on conversations
  for select using (
    exists (select 1 from conversation_members cm
      where cm.conversation_id = conversations.id and cm.user_id = auth.uid())
  );

-- Conversations: any authenticated user can create (they'll add themselves as a member in the same transaction)
create policy "insert_conversations_authenticated" on conversations
  for insert with check (auth.uid() is not null);

-- Conversations: update last_message_at if you're a member
create policy "update_conversations_if_member" on conversations
  for update using (
    exists (select 1 from conversation_members cm
      where cm.conversation_id = conversations.id and cm.user_id = auth.uid())
  );

-- Conversation members: select members of conversations you're in
create policy "select_members_if_in_conversation" on conversation_members
  for select using (
    exists (select 1 from conversation_members cm
      where cm.conversation_id = conversation_members.conversation_id and cm.user_id = auth.uid())
  );

-- Conversation members: insert only your own membership
create policy "insert_own_membership" on conversation_members
  for insert with check (user_id = auth.uid());

-- Conversation members: update your own last_read_at
create policy "update_own_last_read" on conversation_members
  for update using (user_id = auth.uid());

-- Messages: select if you're a member of the conversation
create policy "select_messages_if_member" on messages
  for select using (
    exists (select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
  );

-- Messages: insert only as yourself, only in conversations you're a member of
create policy "insert_messages_if_member" on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
  );

-- Enable realtime
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
