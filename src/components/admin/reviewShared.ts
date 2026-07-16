import { CATEGORY_GRADIENTS, type CategoryName } from '@/lib/categories'
import type { WallEvent } from '@/types/event'

// Shared shape for the pending-review pipeline. Mirrors the admin_pending_events
// RPC (migration 091), which returns the summary fields plus passed_review +
// description/address/sold_out so the Review editor and Pending queue can render
// and edit the info page without extra per-row fetches.
export interface PendingEvent {
  id: string
  title: string
  starts_at: string
  venue_id: string | null
  venue_name: string | null
  poster_url: string | null
  category: string | null
  created_by: string
  uploader: string | null
  created_at: string
  is_duplicate: boolean
  duplicate_of: string | null
  source_url: string | null
  ai_confidence: number | null
  flag_note: string | null
  passed_review: boolean
  description: string | null
  address: string | null
  sold_out: boolean | null
}

// Flag INTRA-SET duplicates: same venue + Portland date + normalized title appearing
// more than once in this list (e.g. the same show ingested from two sources, or a
// relink that re-added one). Returns the ids to treat as duplicates — the FIRST
// occurrence in each group is kept, the rest are flagged.
function normTitle(s: string): string {
  return (s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim()
}
function ptDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(iso))
}
export function findDuplicateIds(rows: Array<{ id: string; venue_id: string | null; starts_at: string; title: string }>): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const r of rows) {
    const key = `${r.venue_id ?? ''}|${ptDate(r.starts_at)}|${normTitle(r.title)}`
    if (seen.has(key)) dupes.add(r.id)
    else seen.add(key)
  }
  return dupes
}

// Build a WallEvent from a pending row so EventInfoFace can render the live info
// page. color1/color2 come from the category gradient (same mapping the wall uses).
export function pendingToWallEvent(e: {
  id: string; title: string; venue_id: string | null; venue_name: string | null
  starts_at: string; category: string | null; poster_url: string | null; sold_out?: boolean | null
}): WallEvent {
  const grad = CATEGORY_GRADIENTS[(e.category ?? 'Other') as CategoryName] ?? CATEGORY_GRADIENTS['Other']
  return {
    id: e.id,
    title: e.title,
    venue_id: e.venue_id,
    venue_name: e.venue_name ?? '',
    starts_at: e.starts_at,
    category: e.category ?? 'Other',
    poster_url: e.poster_url,
    color1: grad[0],
    color2: grad[1],
    view_count: 0,
    like_count: 0,
    trending_score: 0,
    sold_out: e.sold_out ?? false,
    show_times: null,
  }
}
