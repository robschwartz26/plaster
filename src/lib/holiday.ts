// Holiday events — the stretch from Thanksgiving to New Year's Eve is a fifth of
// everything on the wall, so it gets its own filter chip. Not a real category
// (the DB knows nothing about it): it's a read of the title, so a show stays
// filed under Live Music or Theater and still answers to Holiday.
//
// Detection is by TITLE, deliberately: the wall's event query doesn't fetch
// descriptions (see EVENT_SELECT in Wall.tsx) and a holiday show says so in its
// name. Patterns are anchored with \b where a substring would otherwise collide
// — 'advent' must not catch "Bigfoot's Adventure", 'elf' must not catch "self".

const PATTERNS = [
  // The season itself
  'holiday', 'holidaze', 'christmas', 'xmas', '\\bnoel\\b', '\\byule\\b', 'yuletide',
  '\\badvent\\b', 'nativity', 'festivus',
  // Hanukkah / Kwanzaa
  'hanukk?ah', 'chanukah', 'menorah', '\\blatke', 'kwanzaa',
  // Figures
  '\\bsanta\\b', '\\bst\\.? nick\\b', 'kris ?kringle', 'krampus', 'rudolph', 'reindeer',
  '\\bscrooge\\b', 'bah humbug', 'tiny tim',
  // The repertoire
  'nutcracker', "handel'?s messiah", 'messiah sing',
  'polar express', 'miracle on 34th', 'wonderful life', '\\belf\\b',
  'deck the hall', 'silent night', 'white christmas',
  // Trappings
  '\\bjingle', 'mistletoe', '\\bsleigh', 'gingerbread', 'tree lighting',
  'zoolights', '\\bcarol(?:s|ers?|l?ing)\\b', 'ugly sweater', 'secret santa',
  // Thanksgiving opens the season — "Friendsgiving", "Yachtsgiving" and the rest
  '[a-z]+sgiving\\b',
  // Winter framing (never bare 'winter' — that would eat every winter tour and
  // every winter birding walk, both of which are on the wall right now)
  'winter wonderland', 'winterfest', 'wintertide', 'winter market', 'winter lights',
  '\\bsolstice\\b', 'midwinter',
  // New Year — broad, because the season window already rules out June
  'new year', '\\bnye\\b',
]

const HOLIDAY_RE = new RegExp(PATTERNS.join('|'), 'i')

// Nov 1 → Jan 6. A keyword alone isn't enough: "Santa Cruz" in June is a band,
// and a December "Elf" screening is the movie. The window does most of the work
// of keeping false positives off the wall the rest of the year.
function inHolidaySeason(startsAt: string | null | undefined): boolean {
  if (!startsAt) return true          // undated — judge on the title alone
  const d = new Date(startsAt)
  if (Number.isNaN(d.getTime())) return true
  const m = d.getMonth()              // 0-indexed
  if (m === 10 || m === 11) return true              // November, December
  if (m === 0 && d.getDate() <= 6) return true       // through Twelfth Night
  return false
}

// The chip's filter value. Deliberately not in CATEGORIES — it cuts across them.
export const HOLIDAY_FILTER = 'Holiday'

// The stored flag is authoritative — it is seeded from this same title rule on
// insert (migration 112) and then owned by whoever reviews the event, so an
// admin un-marking something in Review has to stick. The title rule is only a
// fallback for rows that don't carry the column (preview objects, mock data).
export function isHolidayEvent(e: {
  title?: string | null
  starts_at?: string | null
  is_holiday?: boolean | null
}): boolean {
  if (typeof e.is_holiday === 'boolean') return e.is_holiday
  return matchesHolidayTitle(e.title, e.starts_at)
}

// Exported for the Review queue, which lights its Holiday button for a title
// that reads as holiday even before anyone has confirmed it.
export function matchesHolidayTitle(title: string | null | undefined, startsAt?: string | null): boolean {
  const t = (title ?? '').trim()
  if (!t) return false
  return HOLIDAY_RE.test(t) && inHolidaySeason(startsAt)
}
