import { supabase } from '@/lib/supabase'

// Dynamic table/column names defeat the generated Supabase types; this store only
// ever touches the known-safe user_blocks / user_mutes tables, so use a loose
// client for these queries. The hooks' public API stays fully typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// Shared, app-wide store for a user-relation set (blocks / mutes). Backs
// useUserBlocks + useUserMutes so that N components (e.g. one MentionInput per
// PosterCard in 1-col) share ONE fetch instead of each firing its own — which
// previously flooded the connection pool (ERR_INSUFFICIENT_RESOURCES) on the
// 5→1 col transition. Fetch is deduped per user and cached until the user changes.

export interface RelationStore {
  state: { ids: Set<string>; loading: boolean }
  ensure: (userId: string | null) => void
  refresh: (userId: string | null) => Promise<void>
  add: (userId: string | null, targetId: string) => Promise<{ error: Error | null }>
  remove: (userId: string | null, targetId: string) => Promise<{ error: Error | null }>
  subscribe: (cb: () => void) => () => void
}

export function createRelationStore(table: string, selfCol: string, otherCol: string, label: string): RelationStore {
  const state = { ids: new Set<string>(), loading: true }
  let loadedFor: string | null = null
  let inflightFor: string | null = null
  let inflight: Promise<void> | null = null
  const subs = new Set<() => void>()
  const notify = () => subs.forEach(fn => fn())

  async function doLoad(userId: string | null): Promise<void> {
    if (!userId) { state.ids = new Set(); state.loading = false; loadedFor = null; notify(); return }
    state.loading = true; notify()
    const { data, error } = await db.from(table).select(otherCol).eq(selfCol, userId)
    if (error) {
      console.error(`[${label}] fetch failed:`, error)
      state.loading = false; notify()
      return
    }
    state.ids = new Set((data ?? []).map((r: any) => String(r[otherCol])))
    state.loading = false
    loadedFor = userId
    notify()
  }

  function startLoad(userId: string | null) {
    inflightFor = userId
    inflight = doLoad(userId).finally(() => { inflightFor = null; inflight = null })
  }

  return {
    state,
    // Load once per user; no-op if already loaded or a load for this user is in flight.
    ensure(userId) {
      if (loadedFor === userId && !state.loading && inflightFor === null) return
      if (inflightFor === userId && inflight) return
      startLoad(userId)
    },
    refresh(userId) {
      startLoad(userId)
      return inflight ?? Promise.resolve()
    },
    async add(userId, targetId) {
      if (!userId) return { error: new Error('not authenticated') }
      const { error } = await db.from(table).insert({ [selfCol]: userId, [otherCol]: targetId })
      if (error) { console.error(`[${label}] add failed:`, error); return { error } }
      state.ids = new Set(state.ids).add(targetId); notify()
      return { error: null }
    },
    async remove(userId, targetId) {
      if (!userId) return { error: new Error('not authenticated') }
      const { error } = await db.from(table).delete().eq(selfCol, userId).eq(otherCol, targetId)
      if (error) { console.error(`[${label}] remove failed:`, error); return { error } }
      const next = new Set(state.ids); next.delete(targetId); state.ids = next; notify()
      return { error: null }
    },
    subscribe(cb) { subs.add(cb); return () => { subs.delete(cb) } },
  }
}

export const blocksStore = createRelationStore('user_blocks', 'blocker_id', 'blocked_id', 'useUserBlocks')
export const mutesStore  = createRelationStore('user_mutes',  'muter_id',  'muted_id',   'useUserMutes')
