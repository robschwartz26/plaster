import { type CategoryName } from '@/lib/categories'
export type Category = CategoryName

export interface Event {
  id: string
  title: string
  venue_name: string
  starts_at: string // ISO datetime
  category: Category
  color1: string
  color2: string
}

// Mock events removed — wall shows only real Supabase events.
export const mockEvents: Event[] = []
