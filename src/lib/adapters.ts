import { type Event as MockEvent } from '@/data/mockEvents'
import { type DbEvent } from '@/lib/supabase'
import { type WallEvent } from '@/types/event'

// Default gradients per category for DB events that have no poster yet.
// Both colors are vivid — no near-black, no gray.
const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  Music:    ['#4c1d95', '#7c3aed'],
  Drag:     ['#831843', '#ec4899'],
  Dance:    ['#7c2d12', '#f97316'],
  Comedy:   ['#1e3a5f', '#38bdf8'],
  Literary: ['#3730a3', '#818cf8'],
  Art:      ['#365314', '#a3e635'],
  Film:     ['#0c4a6e', '#38bdf8'],
  Trivia:   ['#7c2d12', '#fb923c'],
  Other:    ['#2e1065', '#a855f7'],
}
const DEFAULT_GRADIENT: [string, string] = ['#2e1065', '#7c3aed']

export function mockEventToWallEvent(e: MockEvent): WallEvent {
  return {
    id: e.id,
    title: e.title,
    venue_id: null,
    venue_name: e.venue_name,
    starts_at: e.starts_at,
    category: e.category,
    poster_url: null,
    color1: e.color1,
    color2: e.color2,
    view_count: 0,
    like_count: 0,
  }
}

export function dbEventToWallEvent(e: DbEvent): WallEvent {
  const cat = e.category ?? 'Other'
  const [c1, c2] = CATEGORY_GRADIENTS[cat] ?? DEFAULT_GRADIENT
  return {
    id: e.id,
    title: e.title,
    venue_id: e.venue_id,
    venue_name: e.venues?.name ?? 'Unknown venue',
    starts_at: e.starts_at,
    category: cat,
    poster_url: e.poster_url,
    fill_frame: e.fill_frame ?? false,
    color1: c1,
    color2: c2,
    view_count: e.view_count,
    like_count: e.like_count ?? 0,
  }
}
