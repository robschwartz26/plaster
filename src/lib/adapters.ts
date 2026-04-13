import { type Event as MockEvent } from '@/data/mockEvents'
import { type DbEvent } from '@/lib/supabase'
import { type WallEvent } from '@/types/event'

// Default gradients per category for DB events that have no poster yet
const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  Music:    ['#1a0533', '#7c3aed'],
  Drag:     ['#3b0764', '#ec4899'],
  Dance:    ['#431407', '#f97316'],
  Comedy:   ['#0f172a', '#0ea5e9'],
  Literary: ['#1e1b4b', '#6366f1'],
  Art:      ['#0a0a0a', '#525252'],
  Film:     ['#1a1a1a', '#737373'],
  Trivia:   ['#1c1917', '#78716c'],
  Other:    ['#0f0520', '#8b5cf6'],
}
const DEFAULT_GRADIENT: [string, string] = ['#111', '#333']

export function mockEventToWallEvent(e: MockEvent): WallEvent {
  return {
    id: e.id,
    title: e.title,
    venue_name: e.venue_name,
    starts_at: e.starts_at,
    category: e.category,
    poster_url: null,
    color1: e.color1,
    color2: e.color2,
  }
}

export function dbEventToWallEvent(e: DbEvent): WallEvent {
  const cat = e.category ?? 'Other'
  const [c1, c2] = CATEGORY_GRADIENTS[cat] ?? DEFAULT_GRADIENT
  return {
    id: e.id,
    title: e.title,
    venue_name: e.venues?.name ?? 'Unknown venue',
    starts_at: e.starts_at,
    category: cat,
    poster_url: e.poster_url,
    color1: c1,
    color2: c2,
  }
}
