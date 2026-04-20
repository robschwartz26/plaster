import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { PencilLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { Diamond } from '@/components/Diamond'
import { markConversationRead } from '@/lib/messaging'

// ── Types ──────────────────────────────────────────────────────────────────

interface OtherUser {
  id: string
  username: string | null
  avatar_diamond_url: string | null
  avatar_url: string | null
}

interface ConversationRow {
  id: string
  lastMessageAt: string
  lastReadAt: string
  otherUser: OtherUser | null
  lastMessage: { body: string; sender_id: string; created_at: string } | null
  unread: boolean
}

interface Message {
  id: string
  sender_id: string
  body: string
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso).getDay()]
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function showTimestampBefore(cur: Message, prev: Message | undefined): boolean {
  if (!prev) return false
  return new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000
}

// ── Main ───────────────────────────────────────────────────────────────────

export function MsgScreen() {
  const { user } = useAuth()
  const location = useLocation()
  const { openConversationId: routeConvId } = (location.state ?? {}) as { openConversationId?: string }

  const [conversations,    setConversations]    = useState<ConversationRow[]>([])
  const [convLoading,      setConvLoading]      = useState(true)
  const [openConvId,       setOpenConvId]       = useState<string | null>(routeConvId ?? null)
  const [messages,         setMessages]         = useState<Message[]>([])
  const [msgLoading,       setMsgLoading]       = useState(false)
  const [messageText,      setMessageText]      = useState('')
  const [sending,          setSending]          = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const myConvIdsRef   = useRef<Set<string>>(new Set())

  const openConv = conversations.find(c => c.id === openConvId) ?? null

  // ── Load inbox ──────────────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    if (!user) return
    setConvLoading(true)

    // 1. My memberships
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', user.id)

    if (!memberships || memberships.length === 0) {
      setConversations([])
      setConvLoading(false)
      return
    }

    const convIds = (memberships as { conversation_id: string; last_read_at: string }[])
      .map(m => m.conversation_id)
    myConvIdsRef.current = new Set(convIds)

    // 2. Conversations sorted by last_message_at
    const { data: convRows } = await supabase
      .from('conversations')
      .select('id, last_message_at')
      .in('id', convIds)
      .order('last_message_at', { ascending: false })

    if (!convRows) { setConvLoading(false); return }

    // 3. All members of all my conversations (excluding me — filtered client-side)
    const { data: allMembers } = await supabase
      .from('conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', convIds)
      .neq('user_id', user.id)

    // 4. Profiles for those users
    const otherUserIds = [...new Set((allMembers ?? []).map((m: { user_id: string }) => m.user_id))]
    const { data: profiles } = otherUserIds.length
      ? await supabase
          .from('profiles')
          .select('id, username, avatar_diamond_url, avatar_url')
          .in('id', otherUserIds)
      : { data: [] }

    const profileMap: Record<string, OtherUser> = {}
    for (const p of (profiles ?? []) as OtherUser[]) profileMap[p.id] = p

    const memberMap: Record<string, string> = {}
    for (const m of (allMembers ?? []) as { conversation_id: string; user_id: string }[]) {
      memberMap[m.conversation_id] = m.user_id
    }

    // 5. Last message per conversation (N parallel fetches — acceptable for v1)
    const lastMsgResults = await Promise.all(
      convIds.map(cid =>
        supabase
          .from('messages')
          .select('body, sender_id, created_at')
          .eq('conversation_id', cid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    )

    const lastMsgMap: Record<string, { body: string; sender_id: string; created_at: string } | null> = {}
    convIds.forEach((cid, i) => { lastMsgMap[cid] = (lastMsgResults[i].data as any) ?? null })

    const membershipMap: Record<string, string> = {}
    for (const m of (memberships as { conversation_id: string; last_read_at: string }[])) {
      membershipMap[m.conversation_id] = m.last_read_at
    }

    const rows: ConversationRow[] = (convRows as { id: string; last_message_at: string }[]).map(conv => {
      const lastReadAt = membershipMap[conv.id] ?? conv.last_message_at
      const lastMsg = lastMsgMap[conv.id] ?? null
      const otherUserId = memberMap[conv.id]
      const unread = lastMsg
        ? new Date(lastMsg.created_at) > new Date(lastReadAt) && lastMsg.sender_id !== user.id
        : false
      return {
        id: conv.id,
        lastMessageAt: conv.last_message_at,
        lastReadAt,
        otherUser: otherUserId ? (profileMap[otherUserId] ?? null) : null,
        lastMessage: lastMsg,
        unread,
      }
    })

    setConversations(rows)
    setConvLoading(false)
  }, [user])

  useEffect(() => { loadInbox() }, [loadInbox])

  // ── Open conversation ────────────────────────────────────────────────────
  const openConversation = useCallback(async (convId: string) => {
    setOpenConvId(convId)
    setMsgLoading(true)
    setMessages([])

    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    setMessages((data ?? []) as Message[])
    setMsgLoading(false)
    await markConversationRead(convId)

    // Mark as read in local state
    setConversations(prev =>
      prev.map(c => c.id === convId ? { ...c, unread: false, lastReadAt: new Date().toISOString() } : c)
    )
  }, [])

  // If routed with a specific conversation, open it once inbox loads
  useEffect(() => {
    if (routeConvId && !convLoading) {
      openConversation(routeConvId)
    }
  }, [routeConvId, convLoading, openConversation])

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  useEffect(() => {
    if (openConvId) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }, [openConvId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // ── Realtime: conversation open ──────────────────────────────────────────
  useEffect(() => {
    if (!openConvId) return

    const channel = supabase
      .channel(`messages:${openConvId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${openConvId}` },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // Update inbox preview
          setConversations(prev =>
            prev.map(c => c.id === openConvId
              ? { ...c, lastMessage: { body: msg.body, sender_id: msg.sender_id, created_at: msg.created_at }, lastMessageAt: msg.created_at }
              : c
            )
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [openConvId])

  // ── Realtime: inbox unread badge ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('inbox-watcher')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message & { conversation_id: string }
          if (!myConvIdsRef.current.has(msg.conversation_id)) return
          if (msg.sender_id === user.id) return
          if (msg.conversation_id === openConvId) return // already reading it
          setConversations(prev =>
            prev.map(c => c.id === msg.conversation_id
              ? { ...c, unread: true, lastMessage: { body: msg.body, sender_id: msg.sender_id, created_at: msg.created_at }, lastMessageAt: msg.created_at }
              : c
            )
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, openConvId])

  // ── Send message ─────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!messageText.trim() || !openConvId || !user || sending) return
    const body = messageText.trim()
    setMessageText('')
    setSending(true)

    const { error } = await supabase.from('messages').insert({
      conversation_id: openConvId,
      sender_id: user.id,
      body,
    })

    if (!error) {
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', openConvId)
    }

    setSending(false)
  }

  function closeConv() {
    setOpenConvId(null)
    setMessages([])
    setMessageText('')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      <PlasterHeader
        actions={
          <button
            style={headerIconBtn()}
            onClick={() => alert('Start new messages from a user\'s profile')}
            title="New message"
          >
            <PencilLine size={18} />
          </button>
        }
      />

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── INBOX ── */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Search (disabled v1) */}
          <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Search conversations"
              disabled
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 20,
                border: '1px solid var(--fg-08)', background: 'var(--fg-08)',
                color: 'var(--fg-25)', fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 14, outline: 'none', boxSizing: 'border-box', cursor: 'not-allowed',
              }}
            />
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {convLoading && (
              <p style={{ padding: '32px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
                Loading…
              </p>
            )}
            {!convLoading && conversations.length === 0 && (
              <p style={{ padding: '40px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
                No conversations yet — tap Message on someone's profile to start one.
              </p>
            )}
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => openConversation(conv.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px 12px 20px',
                  cursor: 'pointer', borderBottom: '1px solid var(--fg-08)',
                  position: 'relative',
                }}
              >
                {conv.unread && (
                  <div style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    width: 6, height: 6, borderRadius: '50%', background: '#A855F7',
                  }} />
                )}
                <Diamond
                  diamondUrl={conv.otherUser?.avatar_diamond_url ?? null}
                  fallbackUrl={conv.otherUser?.avatar_url ?? null}
                  size={40}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{
                      fontFamily: '"Playfair Display", serif',
                      fontWeight: 700, fontSize: 15,
                      color: 'var(--fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      @{conv.otherUser?.username ?? '—'}
                      {conv.unread && (
                        <span style={{
                          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                          background: '#A855F7', marginLeft: 6, verticalAlign: 'middle',
                        }} />
                      )}
                    </span>
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'var(--fg-30)', flexShrink: 0 }}>
                      {conv.lastMessage ? fmtTimeAgo(conv.lastMessage.created_at) : fmtTimeAgo(conv.lastMessageAt)}
                    </span>
                  </div>
                  <p style={{
                    margin: '2px 0 0',
                    fontFamily: 'Space Grotesk, sans-serif', fontSize: 12,
                    color: conv.unread ? 'var(--fg-65)' : 'var(--fg-30)',
                    fontWeight: conv.unread ? 500 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {conv.lastMessage
                      ? (conv.lastMessage.sender_id === user?.id ? 'You: ' : '') + conv.lastMessage.body
                      : 'No messages yet'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CONVERSATION PANEL (slides in from RIGHT) ── */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'var(--bg)',
          display: 'flex', flexDirection: 'column',
          transform: openConvId ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {openConvId && (
            <>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px 10px', flexShrink: 0,
                borderBottom: '1px solid var(--fg-08)',
              }}>
                <button
                  onClick={closeConv}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--fg-55)', padding: '0 8px 0 0',
                    fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700,
                    fontSize: 13, letterSpacing: '0.1em',
                  }}
                >← BACK</button>
                {openConv && (
                  <>
                    <Diamond
                      diamondUrl={openConv.otherUser?.avatar_diamond_url ?? null}
                      fallbackUrl={openConv.otherUser?.avatar_url ?? null}
                      size={32}
                    />
                    <span style={{
                      fontFamily: '"Playfair Display", serif', fontWeight: 700,
                      fontSize: 15, color: 'var(--fg)',
                    }}>
                      @{openConv.otherUser?.username ?? '—'}
                    </span>
                  </>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {msgLoading && (
                  <p style={{ textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: '24px 0' }}>
                    Loading…
                  </p>
                )}
                {!msgLoading && messages.map((msg, i) => {
                  const isMine = msg.sender_id === user?.id
                  const prev = messages[i - 1]
                  return (
                    <div key={msg.id}>
                      {showTimestampBefore(msg, prev) && (
                        <p style={{
                          textAlign: 'center', margin: '10px 0 4px',
                          fontFamily: 'Space Grotesk, sans-serif', fontSize: 10,
                          color: 'var(--fg-25)', letterSpacing: '0.05em',
                        }}>
                          {fmtMsgTime(msg.created_at)}
                        </p>
                      )}
                      <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                        <div style={{
                          maxWidth: '75%', padding: '9px 14px',
                          borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          background: isMine ? '#A855F7' : 'var(--fg-08)',
                          color: isMine ? '#fff' : 'var(--fg)',
                          fontFamily: 'Space Grotesk, sans-serif', fontSize: 14,
                          lineHeight: 1.4, wordBreak: 'break-word',
                        }}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div style={{
                flexShrink: 0, borderTop: '1px solid var(--fg-08)',
                padding: '8px 12px',
                paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <input
                  type="text"
                  placeholder="Message…"
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 20,
                    border: '1px solid var(--fg-15)', background: 'var(--fg-08)',
                    color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: 14, outline: 'none',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageText.trim() || sending}
                  style={{
                    background: messageText.trim() ? '#A855F7' : 'var(--fg-15)',
                    border: 'none', borderRadius: '50%', width: 38, height: 38,
                    cursor: messageText.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'background 0.15s',
                  }}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

      </div>

      <BottomNav />
    </div>
  )
}

export default MsgScreen
