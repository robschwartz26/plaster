-- 110_orphan_extra_dates.sql
--
-- Lets a schedule be grabbed in the Clipper for a brand-new venue, before any
-- event exists to hang the dates on.
--
-- A capture whose venue Plaster does not know is parked in ingest_orphans — no
-- events row is created at all, so the Clipper's "Grab schedule" had nothing to
-- attach to. The dates are read at grab time and stashed here; the relink path
-- then creates one pending event per date instead of a single one.
--
-- Stores the EXTRACTED DATES, not the screenshots: a handful of
-- {date, time} objects is a few hundred bytes, where the images would be
-- hundreds of KB each sitting in Postgres.

alter table ingest_orphans
  add column if not exists extra_dates jsonb not null default '[]'::jsonb;

comment on column ingest_orphans.extra_dates is
  'Additional occurrence dates captured for this orphan before it had an event: [{"date":"YYYY-MM-DD","time":"HH:MM"|null}]. Expanded into one pending event per date at relink.';

-- Guard the shape so a malformed write cannot break the relink loop.
alter table ingest_orphans
  drop constraint if exists ingest_orphans_extra_dates_is_array;
alter table ingest_orphans
  add constraint ingest_orphans_extra_dates_is_array
  check (jsonb_typeof(extra_dates) = 'array');
