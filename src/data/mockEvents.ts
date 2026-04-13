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

// Today = 2026-04-13 (Monday). Five days: Mon–Fri.
export const mockEvents: Event[] = [
  // Monday Apr 13
  {
    id: '1',
    title: 'Holocene Late Night',
    venue_name: 'Holocene',
    starts_at: '2026-04-13T21:00:00',
    category: 'Music',
    color1: '#1a0533',
    color2: '#7c3aed',
  },
  {
    id: '2',
    title: 'Drag Me to the Moon',
    venue_name: "Dante's",
    starts_at: '2026-04-13T22:00:00',
    category: 'Drag',
    color1: '#3b0764',
    color2: '#ec4899',
  },
  {
    id: '3',
    title: 'Monday Trivia Night',
    venue_name: 'Breakside Brewery',
    starts_at: '2026-04-13T19:00:00',
    category: 'Trivia',
    color1: '#1c1917',
    color2: '#78716c',
  },
  {
    id: '4',
    title: 'Open Mic Comedy',
    venue_name: 'Jackdaw',
    starts_at: '2026-04-13T20:00:00',
    category: 'Comedy',
    color1: '#0f172a',
    color2: '#0ea5e9',
  },

  // Tuesday Apr 14
  {
    id: '5',
    title: 'Poets at Powell\'s',
    venue_name: "Powell's Books",
    starts_at: '2026-04-14T19:30:00',
    category: 'Literary',
    color1: '#1e1b4b',
    color2: '#6366f1',
  },
  {
    id: '6',
    title: 'Cumbia Noche',
    venue_name: 'The Good Foot',
    starts_at: '2026-04-14T21:30:00',
    category: 'Dance',
    color1: '#431407',
    color2: '#f97316',
  },
  {
    id: '7',
    title: 'Mississippi Indie Sessions',
    venue_name: 'Mississippi Studios',
    starts_at: '2026-04-14T20:00:00',
    category: 'Music',
    color1: '#052e16',
    color2: '#22c55e',
  },
  {
    id: '8',
    title: 'Late Cinema: Eraserhead',
    venue_name: 'Clinton St. Theater',
    starts_at: '2026-04-14T22:30:00',
    category: 'Film',
    color1: '#0c0a09',
    color2: '#44403c',
  },

  // Wednesday Apr 15
  {
    id: '9',
    title: 'Crystal Ballroom Showcase',
    venue_name: 'Crystal Ballroom',
    starts_at: '2026-04-15T20:00:00',
    category: 'Music',
    color1: '#2e1065',
    color2: '#a855f7',
  },
  {
    id: '10',
    title: 'Darkroom Print Show',
    venue_name: 'Jackdaw',
    starts_at: '2026-04-15T18:00:00',
    category: 'Art',
    color1: '#0a0a0a',
    color2: '#525252',
  },
  {
    id: '11',
    title: 'Wednesday Night Comedy',
    venue_name: 'Holocene',
    starts_at: '2026-04-15T21:00:00',
    category: 'Comedy',
    color1: '#1e3a5f',
    color2: '#3b82f6',
  },
  {
    id: '12',
    title: 'Drag Extravaganza',
    venue_name: "Dante's",
    starts_at: '2026-04-15T22:00:00',
    category: 'Drag',
    color1: '#4a044e',
    color2: '#d946ef',
  },

  // Thursday Apr 16
  {
    id: '13',
    title: 'Doug Fir Sessions',
    venue_name: 'Doug Fir Lounge',
    starts_at: '2026-04-16T20:00:00',
    category: 'Music',
    color1: '#042f2e',
    color2: '#14b8a6',
  },
  {
    id: '14',
    title: 'Revolution Hall Presents',
    venue_name: 'Revolution Hall',
    starts_at: '2026-04-16T19:30:00',
    category: 'Music',
    color1: '#3f1728',
    color2: '#e11d48',
  },
  {
    id: '15',
    title: 'Thursday Trivia Showdown',
    venue_name: 'Breakside Brewery',
    starts_at: '2026-04-16T19:00:00',
    category: 'Trivia',
    color1: '#1c1917',
    color2: '#a8a29e',
  },
  {
    id: '16',
    title: 'Flamenco Night',
    venue_name: 'Wonder Ballroom',
    starts_at: '2026-04-16T21:00:00',
    category: 'Dance',
    color1: '#450a0a',
    color2: '#ef4444',
  },

  // Friday Apr 17
  {
    id: '17',
    title: 'Wonder Ballroom All-Nighter',
    venue_name: 'Wonder Ballroom',
    starts_at: '2026-04-17T22:00:00',
    category: 'Music',
    color1: '#0f0520',
    color2: '#8b5cf6',
  },
  {
    id: '18',
    title: 'Midnight Drag Brunch',
    venue_name: "Dante's",
    starts_at: '2026-04-17T23:00:00',
    category: 'Drag',
    color1: '#500724',
    color2: '#fb7185',
  },
  {
    id: '19',
    title: 'Zine Fest After Party',
    venue_name: "Powell's Books",
    starts_at: '2026-04-17T18:00:00',
    category: 'Literary',
    color1: '#172554',
    color2: '#60a5fa',
  },
  {
    id: '20',
    title: 'Friday Film Club',
    venue_name: 'Clinton St. Theater',
    starts_at: '2026-04-17T21:00:00',
    category: 'Film',
    color1: '#1a1a1a',
    color2: '#737373',
  },
]

// Group events by calendar date string "YYYY-MM-DD"
export function groupByDay(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>()
  for (const event of events) {
    const day = event.starts_at.slice(0, 10)
    const list = map.get(day) ?? []
    list.push(event)
    map.set(day, list)
  }
  return map
}

// All unique days in order
export function uniqueDays(events: Event[]): string[] {
  const days = new Set(events.map((e) => e.starts_at.slice(0, 10)))
  return [...days].sort()
}
