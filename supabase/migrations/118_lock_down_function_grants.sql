-- ── Revoke the PUBLIC execute default on two functions ───────────────────────
-- Found by probing production with the anon key: both of these answered an
-- unauthenticated caller.
--
-- Root cause is a Postgres default, not a missing GRANT. CREATE FUNCTION grants
-- EXECUTE to PUBLIC automatically, and PUBLIC includes anon. A later
-- "GRANT ... TO authenticated" therefore does nothing to close it — it adds a
-- grant that was already implied. The only thing that closes it is an explicit
-- REVOKE FROM PUBLIC, which neither function had.
--
-- NOT touching the other SECURITY DEFINER functions in one sweep. Several are
-- called from inside RLS policy expressions, which evaluate as the *querying*
-- role — is_admin() alone appears in policies across eight migrations — so a
-- blanket revoke would lock legitimate users out of their own rows. That audit
-- wants doing one function at a time with the policies in front of you.

-- ── match_contacts: phone/email hash lookup ──────────────────────────────────
-- 051 and 052 granted it to authenticated and assumed that was the boundary.
-- Anonymous callers could reach it, which matters more than it looks: a phone
-- number is ten digits, so SHA-256 of an E.164 number is brute-forceable by
-- anyone with a laptop. Open to anon, that is a scriptable "is this number on
-- Plaster?" oracle against the whole North American numbering plan. Behind
-- authentication it still wants rate limiting, but it is no longer anonymous.
revoke execute on function public.match_contacts(text[]) from public;
revoke execute on function public.match_contacts(text[]) from anon;
grant  execute on function public.match_contacts(text[]) to authenticated;

-- ── capture_daily_metrics / capture_metrics_cron: my own omission in 115 ─────
-- No client role should ever call these. pg_cron runs as the job owner and the
-- edge function uses the service role, neither of which needs a PUBLIC grant.
-- Left open, an anonymous caller could write rows for arbitrary dates into
-- metrics_daily and re-run twenty-odd aggregate counts over events on demand —
-- junk data and a free compute amplifier.
revoke execute on function public.capture_daily_metrics(date, boolean) from public;
revoke execute on function public.capture_daily_metrics(date, boolean) from anon;
revoke execute on function public.capture_daily_metrics(date, boolean) from authenticated;

revoke execute on function public.capture_metrics_cron() from public;
revoke execute on function public.capture_metrics_cron() from anon;
revoke execute on function public.capture_metrics_cron() from authenticated;
