-- ── Mark 15 probable-fallback times as TBA ──────────────────────────────────
-- Found with no external source, by each run disagreeing with itself: a series
-- holding fifteen 7:30 performances and one at 8:00 is telling you which one is
-- wrong. Twelve of the fifteen are the FIRST date of their run — a run's opener
-- is ingested separately from the schedule list, without a time, and takes
-- ptTimestamp's 20:00 fallback.
--
-- Verified against source for one of them: Artists Rep lists Eulogy's opening
-- Tue Apr 13 2027 at 7:30 PM, and we hold 20:00. The other nineteen dates of
-- that run are correct.
--
-- Marked TBA rather than snapped to each run's dominant time. The inference is
-- strong for the twelve evening-dominant runs, but it is still inference, and
-- three of the fifteen (Nutcracker, Kim's Convenience, We're All Mad Here) are
-- matinee-dominant runs whose openers ARE evening shows — snapping those to
-- 14:00 would replace a wrong time with a worse one. A blank is honest; a
-- confident wrong time sends someone to a closed door.
--
-- starts_at keeps its placeholder so the wall's ordering and grouping still
-- work; time_tbd is what makes it render "Time TBA" instead of 8:00 PM.

update public.events
   set time_tbd = true
 where status = 'published'
   and starts_at > now()
   and (starts_at at time zone 'America/Los_Angeles')::time = time '20:00'
   and id in (
  '0c0a7a0d-4851-48bd-ac9a-1bc127d92b7e',  -- 2026-12-03  The Neon Room at Helium: David Jolly  (run runs at 19:30, x2)
  'd5561d80-0160-467f-9f2f-0f3f4ed3f666',  -- 2026-12-05  George Balanchine's The Nutcracker®  (run runs at 14:00, x8)
  'abab354e-5ce0-40d1-ab1a-9bc102bb4cc3',  -- 2026-12-10  The Neon Room at Helium: Jourdain Fisher  (run runs at 19:30, x2)
  '7be07d29-80e2-466c-b9ec-453597f43f9e',  -- 2026-12-11  Christmas Ships Parade  (run runs at 19:00, x4)
  '6156aeed-36da-4e13-bd93-09534eb4f2c6',  -- 2026-12-28  The Neon Room at Helium: Kelly Ryan  (run runs at 19:30, x2)
  '5fdb1efa-9276-4571-b46f-fb6f8a087ce7',  -- 2027-01-15  Kim's Convenience  (run runs at 14:00, x9)
  '9bd84002-8880-4a6b-9f93-031ade9a2b3c',  -- 2027-02-02  Slay  (run runs at 19:30, x14)
  '8351d796-5137-431c-aa27-6d2dbbf0361b',  -- 2027-02-12  A Funny Thing Happened On The Way To The Gynec  (run runs at 19:30, x10)
  '39a4681b-47a3-48c5-8508-4eaefd0368ed',  -- 2027-02-13  We're All Mad Here (Alice in Wonderland)  (run runs at 14:00, x3)
  '0f6e2709-c5e8-46a9-8d4a-5a05738c63ce',  -- 2027-02-21  The 39 Steps  (run runs at 19:30, x12)
  '47bcf233-9a40-4def-a6a6-e513639c02eb',  -- 2027-03-21  Furlough's Paradise  (run runs at 19:30, x15)
  '64140c97-31dd-4f0b-b08f-10a7ee82e4d7',  -- 2027-04-07  Covenant  (run runs at 19:30, x9)
  '45721565-5ef6-4554-a26b-6b229916ba31',  -- 2027-04-13  Eulogy, or How to Plan Your Own Funeral (and h  (run runs at 19:30, x15)
  '8e6de353-c58f-43ae-8a91-5d5b6fcd11ba',  -- 2027-04-30  The Miss Julie Ritual  (run runs at 19:30, x10)
  '7d2f0996-84c6-4deb-b00d-7ab2d367b9e6'   -- 2027-05-23  Peter Pan Goes Wrong  (run runs at 19:30, x14)
);
