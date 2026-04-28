import { useState, useEffect, useCallback } from 'react'
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
  const [entries,    setEntries]    = useState<DiamondRowEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modalEntry, setModalEntry] = useState<DiamondRowEntry | null>(null)

  const fetchData = useCallback(async () => {
    if (!targetUserId) return
    const { data, error } = await supabase.rpc('social_diamond_row', { target_user_id: targetUserId })
    if (!error && Array.isArray(data)) {
      setEntries(data as DiamondRowEntry[])
      setModalEntry(prev => {
        if (!prev) return null
        if ((data as DiamondRowEntry[])?.some(e => e.follow_row_id === prev.follow_row_id)) return prev
        return null
      })
    }
    setLoading(false)
  }, [targetUserId])

  useEffect(() => {
    if (!targetUserId) return
    fetchData()

    const channel = supabase
      .channel(`diamond-row-${targetUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows', filter: `follower_id=eq.${targetUserId}` }, () => { fetchData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows', filter: `following_id=eq.${targetUserId}` }, () => { fetchData() })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [targetUserId, fetchData])

  async function handleAccept(entry: DiamondRowEntry) {
    console.log('[SocialDiamondRow] handleAccept fired, entry:', entry)
    const result = await supabase.rpc('accept_follow_request', { follower_user_id: entry.id })
    console.log('[SocialDiamondRow] accept result:', result)
    setModalEntry(null)
    await fetchData()
  }

  async function handleDecline(entry: DiamondRowEntry) {
    console.log('[SocialDiamondRow] handleDecline fired, entry:', entry)
    const result = await supabase.rpc('decline_follow_request', { follower_user_id: entry.id })
    console.log('[SocialDiamondRow] decline result:', result)
    setModalEntry(null)
    await fetchData()
  }

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
        {entries.map(entry => {
          const isPending = entry.kind === 'pending_incoming'

          return (
            <div
              key={entry.follow_row_id}
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                width: 80,
              }}
            >
              <div
                onClick={() => navigate(`/profile/${entry.username}`)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                <div style={{ position: 'relative' }}>
                  <Diamond
                    diamondUrl={entry.avatar_diamond_url}
                    fallbackUrl={entry.avatar_url}
                    size={48}
                  />
                  {isPending && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -2, right: -2,
                        width: 18, height: 18,
                        borderRadius: '50%',
                        background: 'var(--badge-bg)',
                        color: 'var(--badge-fg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, lineHeight: 1,
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
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  @{entry.username}
                </span>
              </div>

              {/* Pending button or invisible placeholder for layout consistency */}
              <div style={{ width: '100%', height: 24, marginTop: 2 }}>
                {isPending && (
                  <button
                    onClick={() => setModalEntry(entry)}
                    style={{
                      width: '100%',
                      padding: '3px 0',
                      borderRadius: 12,
                      border: '1px solid var(--fg-25)',
                      background: 'transparent',
                      color: 'var(--fg-55)',
                      fontFamily: '"Space Grotesk", sans-serif',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Pending
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Accept/Decline modal */}
      {modalEntry && (
        <div
          onClick={() => setModalEntry(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)',
              borderRadius: 16,
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              minWidth: 280,
              maxWidth: 320,
            }}
          >
            <Diamond
              diamondUrl={modalEntry.avatar_diamond_url}
              fallbackUrl={modalEntry.avatar_url}
              size={120}
            />
            <p style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--fg)',
              fontFamily: '"Space Grotesk", sans-serif',
            }}>
              @{modalEntry.username}
            </p>
            <p style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--fg-55)',
              fontFamily: '"Space Grotesk", sans-serif',
              textAlign: 'center',
            }}>
              wants to follow you
            </p>
            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
              <button
                onClick={() => handleAccept(modalEntry)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Accept
              </button>
              <button
                onClick={() => handleDecline(modalEntry)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: '1.5px solid var(--fg-25)',
                  background: 'transparent',
                  color: 'var(--fg-55)',
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
