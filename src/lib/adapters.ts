import { type DbEvent } from '@/lib/supabase'
import { type WallEvent } from '@/types/event'
import { getGradient } from '@/lib/categories'

export function dbEventToWallEvent(e: DbEvent): WallEvent {
  const cat = e.category ?? 'Other'
  const [c1, c2] = getGradient(cat)
  return {
    id: e.id,
    title: e.title,
    venue_id: e.venue_id,
    venue_name: e.venues?.name ?? 'Unknown venue',
    starts_at: e.starts_at,
    category: cat,
    poster_url: e.poster_url,
    fill_frame: e.fill_frame ?? false,
    focal_x: e.focal_x ?? 0.5,
    focal_y: e.focal_y ?? 0.5,
    poster_offset_x: e.poster_offset_x ?? 0,
    poster_offset_y: e.poster_offset_y ?? 0,
    color1: c1,
    color2: c2,
    view_count: e.view_count,
    like_count: e.like_count ?? 0,
  }
}
