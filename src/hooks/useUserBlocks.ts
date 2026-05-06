/**
 * useUserBlocks
 *
 * Fetches and caches the current user's set of blocked user IDs.
 * Used for client-side filtering of SECURITY DEFINER RPCs that
 * bypass RLS (activity_feed, search_users, social_diamond_row).
 *
 * The set is fetched once on mount and refreshed when the user's
 * auth state changes. Mutations (block/unblock) update the local
 * set optimistically, so callers don't need to wait for refetch.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export function useUserBlocks() {
  const { user } = useAuth()
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setBlockedIds(new Set()); setLoading(false); return }
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', user.id)
    if (error) {
      console.error('[useUserBlocks] fetch failed:', error)
      setLoading(false)
      return
    }
    setBlockedIds(new Set((data ?? []).map(r => r.blocked_id as string)))
    setLoading(false)
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  const block = useCallback(async (targetId: string) => {
    if (!user) return { error: new Error('not authenticated') }
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: user.id, blocked_id: targetId })
    if (error) {
      console.error('[useUserBlocks] block failed:', error)
      return { error }
    }
    setBlockedIds(prev => new Set(prev).add(targetId))
    return { error: null }
  }, [user])

  const unblock = useCallback(async (targetId: string) => {
    if (!user) return { error: new Error('not authenticated') }
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetId)
    if (error) {
      console.error('[useUserBlocks] unblock failed:', error)
      return { error }
    }
    setBlockedIds(prev => {
      const next = new Set(prev)
      next.delete(targetId)
      return next
    })
    return { error: null }
  }, [user])

  const isBlocked = useCallback((targetId: string) => blockedIds.has(targetId), [blockedIds])

  return { blockedIds, isBlocked, block, unblock, loading, refresh }
}
