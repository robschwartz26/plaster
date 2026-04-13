// Unified wall event type — used by all UI components.
// Both mock data and Supabase DB events are normalized to this shape.
export interface WallEvent {
  id: string
  title: string
  venue_name: string
  starts_at: string
  category: string
  poster_url: string | null
  // Gradient fallback shown when no poster_url
  color1: string
  color2: string
  view_count: number
  like_count: number // no DB column yet — always 0 until likes table exists
}
