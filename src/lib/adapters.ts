import { type DbEvent } from '@/lib/supabase'
import { type WallEvent } from '@/types/event'
import { getGradient } from '@/lib/categories'

// Exactly the event columns the wall renders — the slim wall fetch selects these,
// and a full DbEvent row also satisfies it (the localStorage cache path). Long-text
// fields like `description` are intentionally excluded; the 1-col info panel
// lazy-fetches detail on demand, so the wall payload stays small.
export type WallEventRow = Pick<DbEvent,
  | 'id' | 'title' | 'venue_id' | 'starts_at' | 'category' | 'poster_url'
  | 'fill_frame' | 'focal_x' | 'focal_y' | 'poster_offset_x' | 'poster_offset_y'
  | 'view_count' | 'like_count' | 'sold_out' | 'sold_out_report_count'
  | 'show_times' | 'trending_score' | 'recurrence_group_id' | 'venues'
>

export function dbEventToWallEvent(e: WallEventRow): WallEvent {
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
    sold_out: e.sold_out ?? false,
    sold_out_report_count: e.sold_out_report_count ?? 0,
    show_times: e.show_times ?? null,
    trending_score: Number(e.trending_score ?? 0),
    recurrence_group_id: e.recurrence_group_id ?? null,
  }
}
