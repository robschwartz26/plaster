CREATE OR REPLACE FUNCTION public.lineup_open_weekend_shows(p_user uuid, p_limit integer DEFAULT 12)
 RETURNS TABLE(event_id uuid, title text, starts_at timestamp with time zone, poster_url text, venue_name text, venue_account_id uuid, venue_diamond_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_busy_weeks as (
    select distinct date_trunc('week', (e.starts_at at time zone 'America/Los_Angeles'))::date as wk
    from public.attendees a
    join public.events e on e.id = a.event_id
    where a.user_id = p_user
      and e.starts_at >= now()
      and extract(dow from (e.starts_at at time zone 'America/Los_Angeles')) in (0,5,6)
  )
  select e.id, e.title, e.starts_at, e.poster_url, v.name, vp.id, vp.avatar_diamond_url
  from public.follows f
  join public.profiles vp on vp.id = f.following_id and vp.account_type = 'venue'
  join public.venues v on v.id = vp.venue_id
  join public.events e on e.venue_id = v.id
  where f.follower_id = p_user
    and f.status = 'accepted'
    and e.starts_at >= now()
    and extract(dow from (e.starts_at at time zone 'America/Los_Angeles')) in (0,5,6)
    and date_trunc('week', (e.starts_at at time zone 'America/Los_Angeles'))::date not in (select wk from my_busy_weeks)
  order by e.starts_at asc
  limit p_limit;
$function$;

grant execute on function public.lineup_open_weekend_shows(uuid, integer) to anon, authenticated;
