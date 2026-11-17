// Holiday events — the stretch from the first Christmas market to New Year's Eve
// puts enough tree-lighting and Nutcracker on the wall to bury everything else,
// so the Wall carries a chip that hides them. This decides what counts.
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

export function isHolidayEvent(e: { title?: string | null; starts_at?: string | null }): boolean {
  const t = (e.title ?? '').trim()
  if (!t) return false
  return HOLIDAY_RE.test(t) && inHolidaySeason(e.starts_at)
}
