/**
 * useUserMutes
 *
 * Same shape as useUserBlocks but for one-way mutes. Mutes are silent — the
 * muted user is never notified.
 *
 * Backed by a shared module-level store (src/lib/userRelationStore.ts) so N
 * callers share ONE fetch per user instead of each firing its own request.
 */

import { useEffect, useReducer, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { mutesStore } from '@/lib/userRelationStore'

export function useUserMutes() {
  const { user } = useAuth()
  const [, force] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const unsub = mutesStore.subscribe(force)
    mutesStore.ensure(user?.id ?? null)
    return unsub
  }, [user?.id])

  const isMuted = useCallback((targetId: string) => mutesStore.state.ids.has(targetId), [])
  const mute    = useCallback((targetId: string) => mutesStore.add(user?.id ?? null, targetId), [user?.id])
  const unmute  = useCallback((targetId: string) => mutesStore.remove(user?.id ?? null, targetId), [user?.id])
  const refresh = useCallback(() => mutesStore.refresh(user?.id ?? null), [user?.id])

  return { mutedIds: mutesStore.state.ids, isMuted, mute, unmute, loading: mutesStore.state.loading, refresh }
}
