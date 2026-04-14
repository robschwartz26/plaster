export type Category =
  | 'Music'
  | 'Drag'
  | 'Dance'
  | 'Comedy'
  | 'Literary'
  | 'Art'
  | 'Film'
  | 'Trivia'
  | 'Other'

export interface Event {
  id: string
  title: string
  venue_name: string
  starts_at: string // ISO datetime
  category: Category
  color1: string
  color2: string
}

// Generate a date string N days from today at a given time
function dayOffset(n: number, time: string): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${time}`
}

// Five days of mock events, always relative to today.
// All color pairs are vivid — no near-black, no gray.
export const mockEvents: Event[] = [
  // ── Day 0 (today) ────────────────────────────────────────────
  {
    id: 'mock-1',
    title: 'Holocene Late Night',
    venue_name: 'Holocene',
    starts_at: dayOffset(0, '21:00:00'),
    category: 'Music',
    color1: '#4c1d95',
    color2: '#7c3aed',
  },
  {
    id: 'mock-2',
    title: 'Drag Me to the Moon',
    venue_name: "Dante's",
    starts_at: dayOffset(0, '22:00:00'),
    category: 'Drag',
    color1: '#831843',
    color2: '#ec4899',
  },
  {
    id: 'mock-3',
    title: 'Monday Trivia Night',
    venue_name: 'Breakside Brewery',
    starts_at: dayOffset(0, '19:00:00'),
    category: 'Trivia',
    color1: '#7c2d12',
    color2: '#fb923c',
  },
  {
    id: 'mock-4',
    title: 'Open Mic Comedy',
    venue_name: 'Jackdaw',
    starts_at: dayOffset(0, '20:00:00'),
    category: 'Comedy',
    color1: '#1e3a5f',
    color2: '#38bdf8',
  },

  // ── Day 1 (tomorrow) ─────────────────────────────────────────
  {
    id: 'mock-5',
    title: "Poets at Powell's",
    venue_name: "Powell's Books",
    starts_at: dayOffset(1, '19:30:00'),
    category: 'Literary',
    color1: '#3730a3',
    color2: '#818cf8',
  },
  {
    id: 'mock-6',
    title: 'Cumbia Noche',
    venue_name: 'The Good Foot',
    starts_at: dayOffset(1, '21:30:00'),
    category: 'Dance',
    color1: '#7c2d12',
    color2: '#f97316',
  },
  {
    id: 'mock-7',
    title: 'Mississippi Indie Sessions',
    venue_name: 'Mississippi Studios',
    starts_at: dayOffset(1, '20:00:00'),
    category: 'Music',
    color1: '#14532d',
    color2: '#4ade80',
  },
  {
    id: 'mock-8',
    title: 'Late Cinema: Eraserhead',
    venue_name: 'Clinton St. Theater',
    starts_at: dayOffset(1, '22:30:00'),
    category: 'Film',
    color1: '#312e81',
    color2: '#a5b4fc',
  },

  // ── Day 2 ─────────────────────────────────────────────────────
  {
    id: 'mock-9',
    title: 'Crystal Ballroom Showcase',
    venue_name: 'Crystal Ballroom',
    starts_at: dayOffset(2, '20:00:00'),
    category: 'Music',
    color1: '#2e1065',
    color2: '#a855f7',
  },
  {
    id: 'mock-10',
    title: 'Darkroom Print Show',
    venue_name: 'Jackdaw',
    starts_at: dayOffset(2, '18:00:00'),
    category: 'Art',
    color1: '#365314',
    color2: '#a3e635',
  },
  {
    id: 'mock-11',
    title: 'Wednesday Night Comedy',
    venue_name: 'Holocene',
    starts_at: dayOffset(2, '21:00:00'),
    category: 'Comedy',
    color1: '#1e3a5f',
    color2: '#3b82f6',
  },
  {
    id: 'mock-12',
    title: 'Drag Extravaganza',
    venue_name: "Dante's",
    starts_at: dayOffset(2, '22:00:00'),
    category: 'Drag',
    color1: '#4a044e',
    color2: '#d946ef',
  },

  // ── Day 3 ─────────────────────────────────────────────────────
  {
    id: 'mock-13',
    title: 'Doug Fir Sessions',
    venue_name: 'Doug Fir Lounge',
    starts_at: dayOffset(3, '20:00:00'),
    category: 'Music',
    color1: '#134e4a',
    color2: '#2dd4bf',
  },
  {
    id: 'mock-14',
    title: 'Revolution Hall Presents',
    venue_name: 'Revolution Hall',
    starts_at: dayOffset(3, '19:30:00'),
    category: 'Music',
    color1: '#881337',
    color2: '#fb7185',
  },
  {
    id: 'mock-15',
    title: 'Thursday Trivia Showdown',
    venue_name: 'Breakside Brewery',
    starts_at: dayOffset(3, '19:00:00'),
    category: 'Trivia',
    color1: '#5b21b6',
    color2: '#c4b5fd',
  },
  {
    id: 'mock-16',
    title: 'Flamenco Night',
    venue_name: 'Wonder Ballroom',
    starts_at: dayOffset(3, '21:00:00'),
    category: 'Dance',
    color1: '#7f1d1d',
    color2: '#ef4444',
  },

  // ── Day 4 ─────────────────────────────────────────────────────
  {
    id: 'mock-17',
    title: 'Wonder Ballroom All-Nighter',
    venue_name: 'Wonder Ballroom',
    starts_at: dayOffset(4, '22:00:00'),
    category: 'Music',
    color1: '#3b0764',
    color2: '#a855f7',
  },
  {
    id: 'mock-18',
    title: 'Midnight Drag Brunch',
    venue_name: "Dante's",
    starts_at: dayOffset(4, '23:00:00'),
    category: 'Drag',
    color1: '#881337',
    color2: '#fb7185',
  },
  {
    id: 'mock-19',
    title: 'Zine Fest After Party',
    venue_name: "Powell's Books",
    starts_at: dayOffset(4, '18:00:00'),
    category: 'Literary',
    color1: '#1e3a8a',
    color2: '#60a5fa',
  },
  {
    id: 'mock-20',
    title: 'Friday Film Club',
    venue_name: 'Clinton St. Theater',
    starts_at: dayOffset(4, '21:00:00'),
    category: 'Film',
    color1: '#0c4a6e',
    color2: '#38bdf8',
  },
]
