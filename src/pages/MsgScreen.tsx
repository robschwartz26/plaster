import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { PlasterHeader } from '@/components/PlasterHeader'

// ── Types ──────────────────────────────────────────────────────────────────

interface MockConv {
  id: string
  name: string
  isGroup: boolean
  avatar: string
  avatar2?: string
  lastMessage: string
  timestamp: string
  unread: boolean
}

interface MockMsg {
  id: string
  senderId: string
  content: string | null
  eventId?: string
  ts: string
}

interface MockEvent {
  id: string
  title: string
  venue: string
  starts_at: string
  poster_url: string | null
  color: string
}

// ── Mock data ──────────────────────────────────────────────────────────────

const mockConvs: MockConv[] = [
  { id: 'c1', name: 'neonrose',   isGroup: false, avatar: '#7c3aed',            lastMessage: 'are you going to Stumpfest?',          timestamp: '2m',  unread: true  },
  { id: 'c2', name: 'bobbybones', isGroup: false, avatar: '#ec4899',            lastMessage: 'check this show out',                  timestamp: '1h',  unread: false },
  { id: 'c3', name: 'NE Crew',    isGroup: true,  avatar: '#fb923c', avatar2: '#a3e635', lastMessage: 'drummerboy: I can get us on the list', timestamp: 'Thu', unread: true  },
]

const mockMsgs: Record<string, MockMsg[]> = {
  c1: [
    { id: 'm1', senderId: 'neonrose',   content: 'hey are you going to Stumpfest XI?',          ts: '9:41 AM' },
    { id: 'm2', senderId: 'me',         content: 'yes! Mississippi Studios on Saturday right?',  ts: '9:43 AM' },
    { id: 'm3', senderId: 'neonrose',   content: '12 bands, 2 days, all ages — gonna be wild',  ts: '9:44 AM' },
    { id: 'm4', senderId: 'me',         content: 'are you going to Stumpfest?',                  ts: '9:45 AM' },
  ],
  c2: [
    { id: 'm5', senderId: 'bobbybones', content: 'check this show out 👀',                       ts: '11:20 AM' },
    { id: 'm6', senderId: 'bobbybones', content: null, eventId: 'ev1',                           ts: '11:20 AM' },
    { id: 'm7', senderId: 'me',         content: 'omg yes we have to go',                        ts: '11:22 AM' },
  ],
  c3: [
    { id: 'm8',  senderId: 'jazzfan99',  content: "who's coming to Weird Nightmare at Polaris?", ts: 'Thu 8:00 PM' },
    { id: 'm9',  senderId: 'drummerboy', content: 'I can get us on the list',                    ts: 'Thu 8:15 PM' },
    { id: 'm10', senderId: 'me',         content: '🙌',                                          ts: 'Thu 8:16 PM' },
  ],
}

const mockEventCards: Record<string, MockEvent> = {
  ev1: { id: 'ev1', title: 'Stumpfest XI', venue: 'Mississippi Studios', starts_at: '2026-04-19T19:00:00', poster_url: null, color: '#3730a3' },
}

const upcomingEvents: MockEvent[] = [
  { id: 'ev1', title: 'Stumpfest XI',                  venue: 'Mississippi Studios', starts_at: '2026-04-19T19:00:00', poster_url: null, color: '#3730a3' },
  { id: 'ev2', title: 'Weird Nightmare',               venue: 'Polaris Hall',        starts_at: '2026-04-22T20:00:00', poster_url: null, color: '#0c4a6e' },
  { id: 'ev3', title: 'Babes in Canyon',               venue: 'Holocene',            starts_at: '2026-04-26T20:00:00', poster_url: null, color: '#365314' },
  { id: 'ev4', title: 'Laffy Taffy: Freaknik Edition', venue: 'Holocene',            starts_at: '2026-04-25T22:00:00', poster_url: null, color: '#7c2d12' },
  { id: 'ev5', title: 'Marshall Crenshaw',             venue: 'Polaris Hall',        starts_at: '2026-04-28T19:30:00', poster_url: null, color: '#1e3a5f' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DiamondAvatar({ color, size = 36 }: { color: string; size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      background: color,
      clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
      flexShrink: 0,
    }} />
  )
}

function StackedDiamondAvatar({ color1, color2, size = 36 }: { color1: string; color2: string; size?: number }) {
  const s = size * 0.72
  const offset = size * 0.28
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: 0, top: offset * 0.5, width: s, height: s, background: color2, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
      <div style={{ position: 'absolute', right: 0, bottom: offset * 0.5, width: s, height: s, background: color1, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
    </div>
  )
}

function EventCard({ event, compact = false }: { event: MockEvent; compact?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--fg-08)',
      borderRadius: 10,
      padding: compact ? '6px 10px' : '8px 10px',
      border: '1px solid var(--fg-15)',
      maxWidth: 240,
    }}>
      <div style={{ width: compact ? 30 : 40, height: compact ? 45 : 60, borderRadius: 4, background: event.color, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
        {event.poster_url && <img src={event.poster_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
        </p>
        <p style={{ margin: '2px 0 0', fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
          {event.venue}
        </p>
        <p style={{ margin: '1px 0 0', fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '0.06em', color: 'var(--fg-25)' }}>
          {fmtDate(event.starts_at)}
        </p>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export function MsgScreen() {
  useAuth()
  const [activeConvId, setActiveConvId]   = useState<string | null>(null)
  const [searchQuery, setSearchQuery]     = useState('')
  const [messageText, setMessageText]     = useState('')
  const [localMsgs, setLocalMsgs]         = useState(mockMsgs)
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [pendingEvent, setPendingEvent]   = useState<MockEvent | null>(null)
  const [showCompose, setShowCompose]     = useState(false)
  const [composeSearch, setComposeSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConv   = mockConvs.find(c => c.id === activeConvId) ?? null
  const convMsgs     = activeConvId ? (localMsgs[activeConvId] ?? []) : []
  const filteredConvs = mockConvs.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    if (activeConvId) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }, [activeConvId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMsgs])

  function closeConv() {
    setActiveConvId(null)
    setShowEventPicker(false)
    setPendingEvent(null)
    setMessageText('')
  }

  function sendMessage() {
    if (!messageText.trim() && !pendingEvent) return
    if (!activeConvId) return
    const newMsg: MockMsg = {
      id: `m${Date.now()}`,
      senderId: 'me',
      content: messageText.trim() || null,
      eventId: pendingEvent?.id,
      ts: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }
    setLocalMsgs(prev => ({ ...prev, [activeConvId]: [...(prev[activeConvId] ?? []), newMsg] }))
    setMessageText('')
    setPendingEvent(null)
    setShowEventPicker(false)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Content area — panels are absolute children of this */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── INBOX ── */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Header — shared PlasterHeader handles env(safe-area-inset-top) */}
          <PlasterHeader
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {import.meta.env.DEV && (
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 9, color: '#A855F7', letterSpacing: '0.1em', border: '1px solid #A855F7', borderRadius: 4, padding: '2px 5px' }}>MOCK</span>
                )}
                <button
                  onClick={() => setShowCompose(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: 4, display: 'flex', alignItems: 'center' }}
                >
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </div>
            }
          />

          {/* Quick-access bar */}
          <div style={{ padding: '0 16px 12px', overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' }}>
            <div style={{ display: 'flex', gap: 16, width: 'max-content' }}>
              {mockConvs.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                >
                  <div style={{ position: 'relative', width: 44, height: 44 }}>
                    {conv.unread && (
                      <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: '#A855F7', border: '1.5px solid var(--bg)', zIndex: 2 }} />
                    )}
                    {conv.isGroup && conv.avatar2
                      ? <StackedDiamondAvatar color1={conv.avatar} color2={conv.avatar2} size={44} />
                      : <DiamondAvatar color={conv.avatar} size={44} />
                    }
                  </div>
                  <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-55)', maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.name.length > 8 ? conv.name.slice(0, 8) : conv.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: '0 16px 10px', flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Search conversations"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 20, border: '1px solid var(--fg-15)', background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredConvs.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 20px', cursor: 'pointer', borderBottom: '1px solid var(--fg-08)', position: 'relative' }}
              >
                {conv.unread && (
                  <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: '#A855F7' }} />
                )}
                {conv.isGroup && conv.avatar2
                  ? <StackedDiamondAvatar color1={conv.avatar} color2={conv.avatar2} size={36} />
                  : <DiamondAvatar color={conv.avatar} size={36} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: conv.unread ? 700 : 500, fontSize: 14, color: 'var(--fg)' }}>
                      {conv.name}
                    </span>
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'var(--fg-30)', flexShrink: 0 }}>
                      {conv.timestamp}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: conv.unread ? 'var(--fg-65)' : 'var(--fg-30)', fontWeight: conv.unread ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.lastMessage}
                  </p>
                </div>
              </div>
            ))}
            {filteredConvs.length === 0 && (
              <p style={{ padding: '40px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
                No conversations yet
              </p>
            )}
          </div>
        </div>

        {/* ── CONVERSATION PANEL (slides in from RIGHT) ── */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'var(--bg)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          transform: activeConv ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {activeConv && (
            <>
              {/* Conversation header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 10px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)' }}>
                <button
                  onClick={closeConv}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: '0 8px 0 0', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}
                >← BACK</button>
                {activeConv.isGroup && activeConv.avatar2
                  ? <StackedDiamondAvatar color1={activeConv.avatar} color2={activeConv.avatar2} size={30} />
                  : <DiamondAvatar color={activeConv.avatar} size={30} />
                }
                <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>
                  {activeConv.name}
                </span>
              </div>

              {/* Message thread */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {convMsgs.map((msg, i) => {
                  const isMine = msg.senderId === 'me'
                  const prevMsg = convMsgs[i - 1]
                  const showTs = i === 0 || msg.ts !== prevMsg?.ts
                  const event = msg.eventId
                    ? (mockEventCards[msg.eventId] ?? upcomingEvents.find(e => e.id === msg.eventId) ?? null)
                    : null

                  return (
                    <div key={msg.id}>
                      {showTs && i > 0 && (
                        <p style={{ textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 10, color: 'var(--fg-25)', margin: '10px 0 4px', letterSpacing: '0.05em' }}>
                          {msg.ts}
                        </p>
                      )}
                      <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                        {event ? (
                          <EventCard event={event} />
                        ) : msg.content ? (
                          <div style={{
                            maxWidth: '75%',
                            padding: '9px 14px',
                            borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            background: isMine ? '#A855F7' : 'var(--fg-08)',
                            color: isMine ? '#fff' : 'var(--fg)',
                            fontFamily: 'Space Grotesk, sans-serif',
                            fontSize: 14,
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                          }}>
                            {msg.content}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Event picker (slides in above input bar) */}
              {showEventPicker && (
                <div style={{ flexShrink: 0, borderTop: '1px solid var(--fg-18)', background: 'var(--bg)', maxHeight: 220, overflowY: 'auto' }}>
                  <p style={{ margin: 0, padding: '10px 16px 6px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
                    Share a show
                  </p>
                  {upcomingEvents.map(ev => (
                    <div
                      key={ev.id}
                      onClick={() => { setPendingEvent(ev); setShowEventPicker(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid var(--fg-08)' }}
                    >
                      <div style={{ width: 28, height: 42, borderRadius: 3, background: ev.color, flexShrink: 0 }} />
                      <div>
                        <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--fg)' }}>{ev.title}</p>
                        <p style={{ margin: '2px 0 0', fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>{ev.venue} · {fmtDate(ev.starts_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Input bar */}
              <div style={{ flexShrink: 0, borderTop: '1px solid var(--fg-08)', padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingEvent && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EventCard event={pendingEvent} compact />
                    <button onClick={() => setPendingEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-40)', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setShowEventPicker(v => !v)}
                    style={{ background: showEventPicker ? 'var(--fg-15)' : 'none', border: '1px solid var(--fg-15)', borderRadius: 8, cursor: 'pointer', color: 'var(--fg-55)', padding: '6px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="3" width="7" height="10" rx="1" />
                      <rect x="14" y="3" width="7" height="10" rx="1" />
                      <rect x="3" y="17" width="18" height="4" rx="1" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    placeholder="Message…"
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: '1px solid var(--fg-15)', background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, outline: 'none' }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!messageText.trim() && !pendingEvent}
                    style={{ background: (messageText.trim() || pendingEvent) ? '#A855F7' : 'var(--fg-15)', border: 'none', borderRadius: '50%', width: 38, height: 38, cursor: (messageText.trim() || pendingEvent) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
                  >
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── COMPOSE OVERLAY (new conversation) ── */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'var(--bg)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          transform: showCompose ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 10px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)' }}>
            <button
              onClick={() => { setShowCompose(false); setComposeSearch('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: '0 8px 0 0', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}
            >← BACK</button>
            <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 18, color: 'var(--fg)' }}>New Message</span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <input
              type="text"
              placeholder="Search @username"
              value={composeSearch}
              onChange={e => setComposeSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 20, border: '1px solid var(--fg-15)', background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <p style={{ padding: '4px 16px', margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', fontStyle: 'italic' }}>
            Search for a friend to start a conversation.
          </p>
        </div>

      </div>

      <BottomNav />
    </div>
  )
}

export default MsgScreen
