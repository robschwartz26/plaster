-- 111_venue_prominence.sql
--
-- A second ordering for the staff Venue board: by how much a room matters to
-- Portland, not by which quadrant it sits in. Neighborhood order answers "whose
-- patch is this"; prominence answers "what hurts most if it goes empty".
--
--   1  marquee      the big rooms and institutions
--   2  core         the mid-size and indie rooms that define going out here
--   3  neighborhood smaller bars, cafes, markets, parks, one-off spaces
--   null unranked   NEW VENUES LAND HERE and sort last, so the board keeps
--                   working as venues are added without anyone tiering them
--
-- Seeded by name. A venue not named below stays null on purpose.

alter table venues add column if not exists prominence smallint;

alter table venues drop constraint if exists venues_prominence_range;
alter table venues add constraint venues_prominence_range
  check (prominence is null or prominence between 1 and 3);

comment on column venues.prominence is
  '1=marquee, 2=core, 3=neighborhood, null=unranked (new venues). Staff venue board ordering only; nothing user-facing reads it.';

create index if not exists venues_prominence_idx on venues (prominence nulls last, name);

update venues set prominence = 1 where name in (
  'Moda Center','Theater of the Clouds','Veterans Memorial Coliseum',
  'Keller Auditorium','Arlene Schnitzer Concert Hall','McMenamins Crystal Ballroom',
  'Roseland Theater','Revolution Hall','Wonder Ballroom','Aladdin Theater',
  'Hayden Homes Amphitheater','McMenamins Edgefield','Oregon Convention Center'
);

update venues set prominence = 2 where name in (
  'Mississippi Studios','Holocene','Dante''s','Star Theater','Polaris Hall',
  'Alberta Rose Theatre','Jack London Revue','The Goodfoot','Kelly''s Olympian',
  'Turn! Turn! Turn!','Showbar','The 1905','Hawthorne Theatre',
  'McMenamins Mission Theater','McMenamins White Eagle Saloon','McMenamins Al''s Den',
  'McMenamins Kennedy School','Lola''s Room','Darcelle XV Showplace',
  'The Siren Theater','Curious Comedy Theater','Curious Comedy Annex Theater',
  'Portland Center Stage','Newmark Theatre','Winningstad Theatre',
  'The Old Church Concert Hall','Powell''s City of Books','Cinema 21',
  'Clinton Street Theater','Academy Theater','Tomorrow Theater','Living Room Theaters',
  'NO FUN','Laurelthirst Public House','The World Famous Kenton Club',
  'Ponderosa Lounge & Grill','Atlantis Lounge at Mississippi Pizza Pub'
);

-- Everything else that is a real room, as opposed to a park, market or campus.
update venues set prominence = 3 where prominence is null and name in (
  'Black Water Bar PDX','Bunk Bar','Camp Bar','CineMagic','Hawthorne Lounge',
  'High Limit Room','High Water Mark Lounge','Holy Ghost','Kickstand Comedy',
  'Nova PDX','REALM PDX','Swan Dive','The Alibi','The Coffin','The Den',
  'The Get Down','The Showdown','The Snug','Tomorrow''s Verse - Taproom & Bottle Shop',
  'Twilight Cafe and Bar','Waypost Bar & Venue','Midtown Beer Garden',
  'Arbor Beer Lodge','Granada Theater','Literary Arts Bookstore & Cafe',
  'Jordan Schnitzer Japanese Arts Learning Center','Powell''s Books at Cedar Hills Crossing',
  'McMenamins Grand Lodge'
);

-- Stray newline in a neighborhood value, which split Holocene into its own
-- "Southeast\n" group on the board.
update venues set neighborhood = btrim(neighborhood)
  where neighborhood is distinct from btrim(neighborhood);
