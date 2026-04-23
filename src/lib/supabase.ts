import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// ── Types ────────────────────────────────────────────────────

// DbEvent is the generated DB row type extended with the venues join
export type DbEvent = Database['public']['Tables']['events']['Row'] & {
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
