import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Types ────────────────────────────────────────────────────

export interface DbEvent {
  id: string
  venue_id: string | null
  title: string
  description: string | null
  category: string | null
  poster_url: string | null
  starts_at: string
  ends_at: string | null
  is_recurring: boolean
  recurrence_rule: string | null
  neighborhood: string | null
  address: string | null
  location_lat: number | null
  location_lng: number | null
  fill_frame: boolean
  view_count: number
  like_count: number
  created_at: string
  venues?: { name: string } | null
}

export interface DbVenue {
  id: string
  name: string
  description: string | null
  neighborhood: string | null
  address: string | null
  location_lat: number | null
  location_lng: number | null
  hours?: string | null
  website: string | null
  instagram: string | null
  avatar_url: string | null
  cover_url: string | null
  is_verified: boolean
  created_at: string
}
