-- (a) Reminder function
CREATE OR REPLACE FUNCTION public.send_show_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
  v_count integer;
BEGIN
  WITH sent AS (
    INSERT INTO public.notifications (recipient_id, sender_id, kind, body_preview, target_event_id)
    SELECT
      s.subscriber_id,
      vp.id,
      'show_reminder',
      e.title || ' at ' || v.name || ', ' ||
        to_char(e.starts_at AT TIME ZONE 'America/Los_Angeles', 'FMHH12:MI AM'),
      e.id
    FROM public.events e
    JOIN public.venues v    ON v.id   = e.venue_id
    JOIN public.profiles vp ON vp.venue_id = v.id AND vp.account_type = 'venue'
    JOIN public.show_alert_subscriptions s ON s.account_id = vp.id
    WHERE (e.starts_at AT TIME ZONE 'America/Los_Angeles')::date = v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = s.subscriber_id
          AND n.target_event_id = e.id
          AND n.kind = 'show_reminder'
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM sent;
  RETURN v_count;
END;
$$;

-- Only pg_cron (postgres role) should call this — no grant to authenticated.

-- (b) Schedule via pg_cron: 16:00 UTC daily (≈ 8–9 am Portland, DST-safe)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('show-reminders-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'show-reminders-daily');

SELECT cron.schedule('show-reminders-daily', '0 16 * * *', $$ SELECT public.send_show_reminders(); $$);
