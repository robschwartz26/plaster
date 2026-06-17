/**
 * useUserBlocks
 *
 * Current user's set of blocked user IDs, for client-side filtering of
 * SECURITY DEFINER RPCs that bypass RLS (activity_feed, search_users, …).
 *
 * Backed by a shared module-level store (src/lib/userRelationStore.ts): no
 * matter how many components call this hook, the set is fetched ONCE per user
 * and shared, so a screen full of MentionInputs doesn't flood the connection
 * pool. Mutations update the shared set optimistically.
 */

import { useEffect, useReducer, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { blocksStore } from '@/lib/userRelationStore'

export function useUserBlocks() {
  const { user } = useAuth()
  const [, force] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const unsub = blocksStore.subscribe(force)
    blocksStore.ensure(user?.id ?? null)
    return unsub
  }, [user?.id])

  const isBlocked = useCallback((targetId: string) => blocksStore.state.ids.has(targetId), [])
  const block     = useCallback((targetId: string) => blocksStore.add(user?.id ?? null, targetId), [user?.id])
  const unblock   = useCallback((targetId: string) => blocksStore.remove(user?.id ?? null, targetId), [user?.id])
  const refresh   = useCallback(() => blocksStore.refresh(user?.id ?? null), [user?.id])

  return { blockedIds: blocksStore.state.ids, isBlocked, block, unblock, loading: blocksStore.state.loading, refresh }
}
