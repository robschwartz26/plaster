/**
 * useUserMutes
 *
 * Same shape as useUserBlocks but for one-way mutes.
 * Mutes are silent — the muted user is never notified.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export function useUserMutes() {
  const { user } = useAuth()
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setMutedIds(new Set()); setLoading(false); return }
    const { data, error } = await supabase
      .from('user_mutes')
      .select('muted_id')
      .eq('muter_id', user.id)
    if (error) {
      console.error('[useUserMutes] fetch failed:', error)
      setLoading(false)
      return
    }
    setMutedIds(new Set((data ?? []).map(r => r.muted_id as string)))
    setLoading(false)
  }, [user?.id])

  useEffect(() => { refresh() }, [user?.id])

  const mute = useCallback(async (targetId: string) => {
    if (!user) return { error: new Error('not authenticated') }
    const { error } = await supabase
      .from('user_mutes')
      .insert({ muter_id: user.id, muted_id: targetId })
    if (error) {
      console.error('[useUserMutes] mute failed:', error)
      return { error }
    }
    setMutedIds(prev => new Set(prev).add(targetId))
    return { error: null }
  }, [user?.id])

  const unmute = useCallback(async (targetId: string) => {
    if (!user) return { error: new Error('not authenticated') }
    const { error } = await supabase
      .from('user_mutes')
      .delete()
      .eq('muter_id', user.id)
      .eq('muted_id', targetId)
    if (error) {
      console.error('[useUserMutes] unmute failed:', error)
      return { error }
    }
    setMutedIds(prev => {
      const next = new Set(prev)
      next.delete(targetId)
      return next
    })
    return { error: null }
  }, [user?.id])

  const isMuted = useCallback((targetId: string) => mutedIds.has(targetId), [mutedIds])

  return { mutedIds, isMuted, mute, unmute, loading, refresh }
}
