import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type FollowStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'following' | 'mutual' | 'self'

export function FollowButton({ targetUserId, size = 'large' }: { targetUserId: string; size?: 'large' | 'small' }) {
  const { user } = useAuth()
  const [status,                setStatus]                = useState<FollowStatus | null>(null)
  const [loading,               setLoading]               = useState(false)
  const [expandedAcceptDecline, setExpandedAcceptDecline] = useState(false)

  const refreshStatus = useCallback(() => {
    if (!user) return
    supabase.rpc('follow_status', { other_user_id: targetUserId })
      .then(({ data }) => {
        if (typeof data === 'string') {
          setStatus(data as FollowStatus)
          if (data !== 'pending_incoming') setExpandedAcceptDecline(false)
        }
      })
  }, [user, targetUserId])

  useEffect(() => {
    if (!user) return
    refreshStatus()
    const channel = supabase
      .channel(`follow-status-${user.id}-${targetUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, () => refreshStatus())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, targetUserId, refreshStatus])

  if (!user || status === 'self' || status === null) return null

  async function handleClick() {
    if (loading || !user) return
    setLoading(true)
    if (status === 'none') {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId })
    } else if (status === 'pending_outgoing') {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId)
    } else if (status === 'following' || status === 'mutual') {
      await supabase.rpc('unfollow_user', { other_user_id: targetUserId })
    } else if (status === 'pending_incoming') {
      setExpandedAcceptDecline(true)
      setLoading(false)
      return
    }
    await refreshStatus()
    setLoading(false)
  }

  async function handleAccept() {
    if (loading || !user) return
    setLoading(true)
    await supabase.rpc('accept_follow_request', { follower_user_id: targetUserId })
    setExpandedAcceptDecline(false)
    await refreshStatus()
    setLoading(false)
  }

  async function handleDecline() {
    if (loading || !user) return
    setLoading(true)
    await supabase.rpc('decline_follow_request', { follower_user_id: targetUserId })
    setExpandedAcceptDecline(false)
    await refreshStatus()
    setLoading(false)
  }

  const btnSize: React.CSSProperties = size === 'small'
    ? { padding: '6px 14px', borderRadius: 20, fontSize: 12 }
    : { flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 13 }

  if (status === 'pending_incoming' && expandedAcceptDecline) {
    return (
      <div style={{ display: 'flex', gap: 10, flex: 1 }}>
        <button
          onClick={handleAccept}
          disabled={loading}
          style={{
            flex: 1, ...btnSize,
            border: 'none', background: 'var(--fg)', color: 'var(--bg)',
            fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          disabled={loading}
          style={{
            flex: 1, ...btnSize,
            border: '1.5px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-55)',
            fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          Decline
        </button>
      </div>
    )
  }

  const label = status === 'pending_incoming' ? 'Pending request'
              : status === 'pending_outgoing'  ? 'Pending'
              : status === 'mutual'            ? 'Following'
              : status === 'following'         ? 'Following'
              : 'Follow'

  const isOutlineStyle = status !== 'none'

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        ...btnSize,
        border: isOutlineStyle ? '1.5px solid var(--fg-25)' : 'none',
        background: isOutlineStyle ? 'transparent' : 'var(--fg)',
        color: isOutlineStyle ? 'var(--fg-55)' : 'var(--bg)',
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}
