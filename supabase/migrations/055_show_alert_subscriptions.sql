-- (a) show_alert_subscriptions table
CREATE TABLE IF NOT EXISTS public.show_alert_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  account_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (subscriber_id, account_id)
);

alter table public.show_alert_subscriptions enable row level security;

create policy "view own show alert subs" on public.show_alert_subscriptions
  for select using (auth.uid() = subscriber_id);
create policy "create own show alert subs" on public.show_alert_subscriptions
  for insert with check (auth.uid() = subscriber_id);
create policy "delete own show alert subs" on public.show_alert_subscriptions
  for delete using (auth.uid() = subscriber_id);

create index show_alert_subs_account_idx    on public.show_alert_subscriptions(account_id);
create index show_alert_subs_subscriber_idx on public.show_alert_subscriptions(subscriber_id);

-- (b) Add 'show_reminder' to notifications kind CHECK
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'mention','activity_like:rsvp','activity_like:wall_post','activity_like:venue_post',
    'warning','follow','message','follow_accepted','reply','va_approved','va_declined',
    'show_reminder'
  ));
