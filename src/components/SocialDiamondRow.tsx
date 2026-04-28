import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Diamond } from './Diamond'

type DiamondRowEntry = {
  id: string
  username: string
  avatar_diamond_url: string | null
  avatar_url: string | null
  account_type: string
  kind: 'pending_incoming' | 'following'
  follow_row_id: string
  created_at: string | null
}

interface Props {
  targetUserId: string
}

export function SocialDiamondRow({ targetUserId }: Props) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<DiamondRowEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetUserId) return
    let cancelled = false

    async function fetchData() {
      const { data, error } = await supabase.rpc('social_diamond_row', { target_user_id: targetUserId })
      if (!cancelled) {
        if (!error && Array.isArray(data)) setEntries(data as DiamondRowEntry[])
        setLoading(false)
      }
    }

    fetchData()

    // Two channels because postgres_changes filter doesn't support OR.
    const followerChannel = supabase
      .channel(`diamond-row-follower-${targetUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'follows',
        filter: `follower_id=eq.${targetUserId}`,
      }, fetchData)
      .subscribe()

    const followingChannel = supabase
      .channel(`diamond-row-following-${targetUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'follows',
        filter: `following_id=eq.${targetUserId}`,
      }, fetchData)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(followerChannel)
      supabase.removeChannel(followingChannel)
    }
  }, [targetUserId])

  if (loading || entries.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as React.CSSProperties}
      >
        {entries.map(entry => (
          <button
            key={entry.follow_row_id}
            onClick={() => navigate(`/profile/${entry.username}`)}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              width: 56,
            }}
          >
            <div style={{ position: 'relative' }}>
              <Diamond
                diamondUrl={entry.avatar_diamond_url}
                fallbackUrl={entry.avatar_url}
                size={48}
              />
              {entry.kind === 'pending_incoming' && (
                <div
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'var(--badge-bg)',
                    color: 'var(--badge-fg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1,
                    border: '1.5px solid var(--bg)',
                  }}
                  aria-label="Pending follow request"
                >
                  +
                </div>
              )}
            </div>
            <span style={{
              fontSize: 11,
              color: 'var(--fg-65)',
              fontFamily: '"Space Grotesk", sans-serif',
              maxWidth: 56,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              @{entry.username}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
