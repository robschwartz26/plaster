-- Custom group-chat image (Instagram/iMessage style). The name column already
-- exists; members can already UPDATE their conversations (update_conversations_if_member
-- RLS policy), which covers both name and avatar_url — no new policy needed.
alter table public.conversations
  add column if not exists avatar_url text null;
