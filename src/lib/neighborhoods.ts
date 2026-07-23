// Portland neighborhood → sextant taxonomy (canonical).
//
// 94 City-recognized neighborhood associations grouped into the six address
// sextants (N/NE/NW/SE/SW/S — S is the post-2020 downtown sextant). Reconciled
// against the City roster + Wikipedia, with border cases locked by Rob.
//
// Used for: profile identity (home_neighborhood = the chip) + community-wall
// scoping (home_sextant = the region the wall covers).
//
// NOTE: venue.neighborhood tagging still uses the OLD flat region list in
// adminShared.ts (Northeast/Southeast/… + district nicknames) and is intentionally
// left untouched here. TODO(neighborhoods): migrate venue tagging + VenueBoard
// grouping onto this structured taxonomy in a later pass.

export const SEXTANTS = ['N', 'NE', 'NW', 'SE', 'SW', 'S'] as const
export type Sextant = typeof SEXTANTS[number]

export const SEXTANT_LABELS: Record<Sextant, string> = {
  N: 'North',
  NE: 'Northeast',
  NW: 'Northwest',
  SE: 'Southeast',
  SW: 'Southwest',
  S: 'South',
}

export interface Neighborhood {
  name: string
  sextant: Sextant
}

// Locked border cases (span boundaries — assigned deliberately, not auto-guessed):
//   Eliot→N · Goose Hollow→SW · Old Town/Chinatown→S · Downtown→S ·
//   Madison South→NE · Hosford-Abernethy→SE · Sullivan's Gulch→NE.
// FLAG: Wilkes / Russell / Glenfair are placed in SE per Rob's "far-east SE"
//   correction, though they sit in outer NE geographically — revisit if needed.
export const NEIGHBORHOODS: Neighborhood[] = [
  // ── N — North (14) ──
  { name: 'Arbor Lodge', sextant: 'N' },
  { name: 'Boise', sextant: 'N' },
  { name: 'Bridgeton', sextant: 'N' },
  { name: 'Cathedral Park', sextant: 'N' },
  { name: 'East Columbia', sextant: 'N' },
  { name: 'Eliot', sextant: 'N' },
  { name: 'Hayden Island', sextant: 'N' },
  { name: 'Humboldt', sextant: 'N' },
  { name: 'Kenton', sextant: 'N' },
  { name: 'Overlook', sextant: 'N' },
  { name: 'Piedmont', sextant: 'N' },
  { name: 'Portsmouth', sextant: 'N' },
  { name: 'St. Johns', sextant: 'N' },
  { name: 'University Park', sextant: 'N' },

  // ── NE — Northeast (23) ──
  { name: 'Alameda', sextant: 'NE' },
  { name: 'Alberta', sextant: 'NE' }, // district corridor (Alberta Arts), not an official assoc — but people identify with it
  { name: 'Argay Terrace', sextant: 'NE' },
  { name: 'Beaumont-Wilshire', sextant: 'NE' },
  { name: 'Concordia', sextant: 'NE' },
  { name: 'Cully', sextant: 'NE' },
  { name: 'Grant Park', sextant: 'NE' },
  { name: 'Hollywood', sextant: 'NE' },
  { name: 'Irvington', sextant: 'NE' },
  { name: 'King', sextant: 'NE' },
  { name: 'Laurelhurst', sextant: 'NE' },
  { name: 'Lloyd District', sextant: 'NE' },
  { name: 'Madison South', sextant: 'NE' },
  { name: 'Parkrose', sextant: 'NE' },
  { name: 'Parkrose Heights', sextant: 'NE' },
  { name: 'Rose City Park', sextant: 'NE' },
  { name: 'Roseway', sextant: 'NE' },
  { name: 'Sabin', sextant: 'NE' },
  { name: "Sullivan's Gulch", sextant: 'NE' },
  { name: 'Sumner', sextant: 'NE' },
  { name: 'Sunderland', sextant: 'NE' },
  { name: 'Vernon', sextant: 'NE' },
  { name: 'Woodland Park', sextant: 'NE' },
  { name: 'Woodlawn', sextant: 'NE' },

  // ── NW — Northwest (8) ──
  { name: 'Arlington Heights', sextant: 'NW' },
  { name: 'Forest Park', sextant: 'NW' },
  { name: 'Hillside', sextant: 'NW' },
  { name: 'Linnton', sextant: 'NW' },
  { name: 'Northwest District', sextant: 'NW' },
  { name: 'Northwest Heights', sextant: 'NW' },
  { name: 'Pearl District', sextant: 'NW' },
  { name: 'Sylvan-Highlands', sextant: 'NW' },

  // ── SE — Southeast (28) ──
  { name: 'Ardenwald-Johnson Creek', sextant: 'SE' },
  { name: 'Brentwood-Darlington', sextant: 'SE' },
  { name: 'Brooklyn', sextant: 'SE' },
  { name: 'Buckman', sextant: 'SE' },
  { name: 'Centennial', sextant: 'SE' },
  { name: 'Creston-Kenilworth', sextant: 'SE' },
  { name: 'Eastmoreland', sextant: 'SE' },
  { name: 'Foster-Powell', sextant: 'SE' },
  { name: 'Glenfair', sextant: 'SE' },
  { name: 'Hazelwood', sextant: 'SE' },
  { name: 'Hosford-Abernethy', sextant: 'SE' },
  { name: 'Kerns', sextant: 'SE' },
  { name: 'Lents', sextant: 'SE' },
  { name: 'Mill Park', sextant: 'SE' },
  { name: 'Montavilla', sextant: 'SE' },
  { name: 'Mt. Scott-Arleta', sextant: 'SE' },
  { name: 'Mt. Tabor', sextant: 'SE' },
  { name: 'North Tabor', sextant: 'SE' },
  { name: 'Pleasant Valley', sextant: 'SE' },
  { name: 'Powellhurst-Gilbert', sextant: 'SE' },
  { name: 'Reed', sextant: 'SE' },
  { name: 'Richmond', sextant: 'SE' },
  { name: 'Russell', sextant: 'SE' },
  { name: 'Sellwood-Moreland', sextant: 'SE' },
  { name: 'South Tabor', sextant: 'SE' },
  { name: 'Sunnyside', sextant: 'SE' },
  { name: 'Wilkes', sextant: 'SE' },
  { name: 'Woodstock', sextant: 'SE' },

  // ── SW — Southwest (18) ──
  { name: 'Arnold Creek', sextant: 'SW' },
  { name: 'Ashcreek', sextant: 'SW' },
  { name: 'Bridlemile', sextant: 'SW' },
  { name: 'Collins View', sextant: 'SW' },
  { name: 'Crestwood', sextant: 'SW' },
  { name: 'Far Southwest', sextant: 'SW' },
  { name: 'Goose Hollow', sextant: 'SW' },
  { name: 'Hayhurst', sextant: 'SW' },
  { name: 'Healy Heights', sextant: 'SW' },
  { name: 'Hillsdale', sextant: 'SW' },
  { name: 'Homestead', sextant: 'SW' },
  { name: 'Maplewood', sextant: 'SW' },
  { name: 'Markham', sextant: 'SW' },
  { name: 'Marshall Park', sextant: 'SW' },
  { name: 'Multnomah', sextant: 'SW' },
  { name: 'South Burlingame', sextant: 'SW' },
  { name: 'Southwest Hills', sextant: 'SW' },
  { name: 'West Portland Park', sextant: 'SW' },

  // ── S — South (3, post-2020 downtown sextant) ──
  { name: 'Downtown', sextant: 'S' },
  { name: 'Old Town/Chinatown', sextant: 'S' },
  { name: 'South Portland', sextant: 'S' },
]

// Flat name list — for any existing code that just needs the names.
export const NEIGHBORHOOD_NAMES: string[] = NEIGHBORHOODS.map(n => n.name)

// User-friendly aliases → official NA name. "Alberta" is a commercial-district
// nickname for the Concordia corridor; Nob Hill/Slabtown are the Northwest
// District; Ladd's Addition is Hosford-Abernethy; etc. Excluded unincorporated
// areas Portlanders sometimes claim (Raleigh Hills, Garden Home, West Slope) are
// Multnomah County, not City NAs — left out, kept here as a note for later.
export const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  'Alberta': 'Concordia',
  'Nob Hill': 'Northwest District',
  'Slabtown': 'Northwest District',
  'Alphabet District': 'Northwest District',
  "Ladd's Addition": 'Hosford-Abernethy',
  'Belmont': 'Sunnyside',
  'Hawthorne': 'Sunnyside',
  'Division': 'Richmond',
  'South Waterfront': 'South Portland',
  'Marquam Hill': 'Homestead',
  'Old Town': 'Old Town/Chinatown',
  'Chinatown': 'Old Town/Chinatown',
  'Multnomah Village': 'Multnomah',
}

const BY_NAME: Record<string, Sextant> = Object.fromEntries(NEIGHBORHOODS.map(n => [n.name, n.sextant]))

// Resolve a possibly-aliased name to its official NA name.
export function resolveNeighborhood(name: string): string {
  return NEIGHBORHOOD_ALIASES[name] ?? name
}

// Sextant for a neighborhood name (handles aliases). Undefined if unknown.
export function sextantOf(name: string): Sextant | undefined {
  return BY_NAME[resolveNeighborhood(name)]
}

// All neighborhoods in a sextant, in canonical order.
export function neighborhoodsBySextant(sextant: Sextant): Neighborhood[] {
  return NEIGHBORHOODS.filter(n => n.sextant === sextant)
}
