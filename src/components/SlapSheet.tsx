import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Diamond } from '@/components/Diamond'
import { fetchFriends, fetchCrews, slapFriends, type SlapFriend, type SlapCrew } from '@/lib/slap'

// "Slap your friends" picker: recent crews (existing group chats) as one-tap
// presets + a friends list, merged selection. Confirm creates/reuses the thread
// and posts the slap message. No RSVP — a slap is an invitation.
export function SlapSheet({ event, onClose, onSlapped }: {
  event: { id: string; title: string; venue_name: string | null; starts_at: string | null }
  onClose: () => void
  onSlapped: (conversationId: string, count: number) => void
}) {
  const { user } = useAuth()
  const [crews, setCrews] = useState<SlapCrew[]>([])
  const [friends, setFriends] = useState<SlapFriend[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    Promise.all([fetchCrews(user.id), fetchFriends(user.id)]).then(([c, f]) => {
      setCrews(c); setFriends(f); setLoading(false)
    })
  }, [user])

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function pickCrew(crew: SlapCrew) {
    setSelected(prev => { const n = new Set(prev); crew.members.forEach(m => n.add(m.id)); return n })
  }

  async function confirm() {
    if (!user || selected.size === 0 || busy) return
    setBusy(true); setError('')
    try {
      const { conversationId } = await slapFriends({
        eventId: event.id, eventTitle: event.title, venueName: event.venue_name, startsAt: event.starts_at,
        selectedIds: [...selected], userId: user.id,
      })
      onSlapped(conversationId, selected.size)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the slap.')
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: '16px 16px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.2 }}>Who's coming to {event.title}?</p>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
          <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)' }}>Tap friends to add — they'll get a group chat.</p>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px' }}>
          {loading ? (
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', padding: '12px 0' }}>Loading…</p>
          ) : (
            <>
              {crews.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={sectionLabel}>Recent crews</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {crews.map(crew => {
                      const allIn = crew.members.length > 0 && crew.members.every(m => selected.has(m.id))
                      return (
                        <button key={crew.conversationId} onClick={() => pickCrew(crew)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: `1px solid ${allIn ? 'var(--fg-40)' : 'var(--fg-12, var(--fg-15))'}`, background: allIn ? 'var(--fg-08)' : 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                          <div style={{ display: 'flex', flexShrink: 0, width: Math.min(crew.members.length, 3) * 14 + 10 }}>
                            {crew.members.slice(0, 3).map((m, i) => (
                              <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                                <Diamond diamondUrl={m.avatar_diamond_url} fallbackUrl={m.avatar_url} size={24} />
                              </div>
                            ))}
                          </div>
                          <span style={{ flex: 1, minWidth: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {crew.name || crew.members.map(m => m.username ? `@${m.username}` : '?').join(', ')}
                          </span>
                          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', flexShrink: 0 }}>{crew.members.length}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <p style={sectionLabel}>Friends</p>
              {friends.length === 0 ? (
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', padding: '4px 0 12px' }}>Follow some people first, then you can slap them to shows.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {friends.map(f => {
                    const on = selected.has(f.id)
                    return (
                      <button key={f.id} onClick={() => toggle(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--fg-08)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                        <Diamond diamondUrl={f.avatar_diamond_url} fallbackUrl={f.avatar_url} size={34} />
                        <span style={{ flex: 1, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>@{f.username ?? 'someone'}</span>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${on ? '#4ade80' : 'var(--fg-18)'}`, background: on ? '#4ade80' : 'transparent', color: '#0c0b0b', fontSize: 13, fontWeight: 700 }}>{on ? '✓' : ''}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '12px 18px 16px' }}>
          {error && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.9)', margin: '0 0 8px' }}>{error}</p>}
          <button
            onClick={confirm}
            disabled={selected.size === 0 || busy}
            style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: selected.size === 0 ? 'var(--fg-15)' : 'var(--fg)', color: selected.size === 0 ? 'var(--fg-40)' : 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, cursor: (selected.size === 0 || busy) ? 'default' : 'pointer' }}
          >
            {busy ? 'Slapping…' : selected.size === 0 ? 'Slap friends' : `Slap ${selected.size} friend${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = { fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '0 0 8px' }
