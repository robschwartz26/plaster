-- ── Column + index ──────────────────────────────────────────────────────────
alter table public.events add column if not exists trending_score numeric not null default 0;

create index if not exists events_trending_idx
  on public.events (trending_score desc) where status = 'published';

-- ── Refresh function ─────────────────────────────────────────────────────────
create or replace function public.refresh_trending_scores()
returns void
language sql security definer set search_path = public as $$
  -- Zero out past / non-published events first
  update public.events
  set trending_score = 0
  where status <> 'published' or starts_at < now() - interval '6 hours';

  -- Recompute scores for live published events
  update public.events e
  set trending_score = sub.score
  from (
    select e2.id,
      ( coalesce(v.cnt, 0) * 1.0
      + coalesce(l.cnt, 0) * 4.0
      + coalesce(a.cnt, 0) * 10.0
      ) as score
    from public.events e2
    left join (
      select event_id, count(*) cnt
      from public.event_views
      where viewed_at > now() - interval '7 days'
      group by 1
    ) v on v.event_id = e2.id
    left join (
      select event_id, count(*) cnt
      from public.event_likes
      where created_at > now() - interval '7 days'
      group by 1
    ) l on l.event_id = e2.id
    left join (
      select event_id, count(*) cnt
      from public.attendees
      where created_at > now() - interval '7 days'
      group by 1
    ) a on a.event_id = e2.id
    where e2.status = 'published'
      and e2.starts_at >= now() - interval '6 hours'
  ) sub
  where sub.id = e.id;
$$;

-- ── Schedule via pg_cron every 30 minutes ───────────────────────────────────
create extension if not exists pg_cron;

select cron.unschedule('trending-scores-refresh')
where exists (select 1 from cron.job where jobname = 'trending-scores-refresh');

select cron.schedule('trending-scores-refresh', '*/30 * * * *',
  $$ select public.refresh_trending_scores(); $$);

-- ── Seed scores now ──────────────────────────────────────────────────────────
select public.refresh_trending_scores();
