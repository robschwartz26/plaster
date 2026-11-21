-- ── Data fix: Silverton Christmas Market was filed under The Den ──────────────
-- The travelportland.com scrape attached 31 Silverton Christmas Market dates to
-- The Den (a Portland club on SE Yamhill), 45 miles from where the market
-- actually is. Two had already been moved to the right venue by hand, but only
-- the venue_id was changed — the event rows kept The Den's address and
-- neighborhood, so they still plotted in inner SE Portland on the map.
--
-- Four fields have to move together for an event to really change venue:
--   venue_id      what the info page links to
--   address       what the info page prints and the map geocodes
--   neighborhood  what the neighborhood filter and the venue board group by
--   description   the AI wrote "Silverton Christmas Market at The Den" into the
--                 blurb itself, so the wrong venue is baked into the prose too
--
-- All 31 share one identical description, so the replace is exact rather than a
-- guess. Scoped to the two venue ids involved so no other event can be caught.

update public.events
   set venue_id     = '57904be5-950c-4fa0-9deb-a1b43034bd34',  -- Silverton Christmas Market
       address      = 'Oregon Garden Resort, 895 W Main St, Silverton, OR 97381',
       neighborhood = 'Silverton',
       description  = replace(description, 'at The Den', 'at the Oregon Garden Resort')
 where title ilike '%Silverton Christmas Market%'
   and venue_id in (
     'ce582062-0096-4092-b221-28255a4231ac',   -- The Den (wrong)
     '57904be5-950c-4fa0-9deb-a1b43034bd34'    -- already moved, address still wrong
   );

-- ── Two more from the same scrape, which are NOT the Christmas Market ────────
-- "Thanksgiving at the Resort" (Nov 26) and "Winterfest" (Dec 6) also landed on
-- The Den with The Den's address. Their own blurbs give them away: a "Garden
-- View Restaurant" and an "Aerial Tree Walk" are Oregon Garden Resort, which is
-- the site the Christmas Market runs on but is a different venue with its own
-- year-round programme. Filing them under the Market would just be a second
-- wrong answer, so they go back through the New venues intake instead.
--
-- Two steps, because relink CREATES events (firecrawl-ingest: "inserts as
-- PENDING (→ Review), marks the orphan linked"). Parking an orphan while the
-- published copy still exists would leave a duplicate on the wall.
--
--   1. park a row in ingest_orphans so they surface as "Oregon Garden Resort"
--      on the New venues card, 2 events waiting
--   2. mark the published copies rejected — the same thing the Reject button
--      does, so the rows and posters survive and this is reversible
--
-- Both have 0 attendees, 0 likes, 0 views and 0 wall posts, so nothing a person
-- did is lost. raw_venue_website is left null deliberately: the resort's URL is
-- not in the data and guessing it would just pre-fill the intake form wrong.

insert into public.ingest_orphans
  (title, starts_at, raw_venue_name, raw_venue_address, category,
   description, source_url, image_url, status)
select e.title, e.starts_at,
       'Oregon Garden Resort',
       '895 W Main St, Silverton, OR 97381',
       e.category,
       replace(e.description, 'The Den', 'the Oregon Garden Resort'),
       e.source_url, e.poster_url, 'open'
  from public.events e
 where e.id in (
   '136b3c16-ba3d-45f4-9d19-faf7e6c22092',  -- Thanksgiving at the Resort, Nov 26
   '7a57e0e8-f920-4678-b0bd-95d058a19848'   -- Winterfest, Dec 6
 )
   and not exists (
     select 1 from public.ingest_orphans o
      where o.title = e.title and o.starts_at = e.starts_at and o.status = 'open'
   );

update public.events
   set status           = 'rejected',
       rejection_reason = 'other',
       rejection_note   = 'Oregon Garden Resort event mis-filed at The Den by the travelportland scrape; re-parked in New venues intake (migration 114)',
       reviewed_at      = now()
 where id in (
   '136b3c16-ba3d-45f4-9d19-faf7e6c22092',
   '7a57e0e8-f920-4678-b0bd-95d058a19848'
 );
