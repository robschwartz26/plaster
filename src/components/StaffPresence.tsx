import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Diamond } from '@/components/Diamond'

interface RosterMember {
  id: string
  username: string | null
  avatar_diamond_url: string | null
  avatar_url: string | null
  is_admin: boolean
}

export function StaffPresence() {
  const { user } = useAuth()
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())

  // Load roster once on mount
  useEffect(() => {
    supabase.rpc('staff_roster').then(({ data }) => {
      if (data) setRoster(data as RosterMember[])
    })
  }, [])

  // Join presence channel
  useEffect(() => {
    if (!user) return

    const channel = supabase.channel('staff-presence', {
      config: { presence: { key: user.id } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      setOnline(new Set(Object.keys(channel.presenceState())))
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() })
      }
    })

    return () => { supabase.removeChannel(channel) }
  }, [user])

  if (roster.length === 0) return null

  // Sort: online first, then alpha
  const sorted = [...roster].sort((a, b) => {
    const aOnline = online.has(a.id) ? 0 : 1
    const bOnline = online.has(b.id) ? 0 : 1
    if (aOnline !== bOnline) return aOnline - bOnline
    return (a.username ?? '').localeCompare(b.username ?? '')
  })

  return (
    <div>
      <div style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--fg-30)',
        marginBottom: 10,
      }}>
        Who's online
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(m => {
          const isOnline = online.has(m.id)
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Diamond
                diamondUrl={m.avatar_diamond_url}
                fallbackUrl={m.avatar_url}
                size={26}
                altText={m.username ?? undefined}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 12, fontWeight: 600,
                  color: m.is_admin ? '#A855F7' : 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  display: 'block',
                }}>
                  @{m.username ?? m.id.slice(0, 8)}
                  {m.is_admin && (
                    <span style={{
                      marginLeft: 5,
                      fontFamily: '"Barlow Condensed", sans-serif',
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'rgba(168,85,247,0.6)',
                    }}>admin</span>
                  )}
                </span>
              </div>

              {/* Status dot */}
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: isOnline ? '#22c55e' : '#cabfae',
                opacity: isOnline ? 1 : 0.5,
                transition: 'background 0.4s ease, opacity 0.4s ease',
              }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
