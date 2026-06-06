import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Diamond } from '@/components/Diamond'

interface ChatMessage {
  id: string
  sender_id: string
  body: string
  created_at: string
  sender: {
    username: string | null
    avatar_diamond_url: string | null
    avatar_url: string | null
    is_admin: boolean
  } | null
}

const LAST_READ_KEY = 'staff-chat-last-read'

function loadLastRead(): string {
  return localStorage.getItem(LAST_READ_KEY) ?? new Date(0).toISOString()
}
function saveLastRead(iso: string) {
  try { localStorage.setItem(LAST_READ_KEY, iso) } catch { /* noop */ }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })
}
function fmtDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' })
}

interface Props {
  onUnreadChange?: (hasUnread: boolean) => void
}

export function StaffChat({ onUnreadChange }: Props) {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [])

  const markRead = useCallback((msgs: ChatMessage[]) => {
    if (!msgs.length) return
    const latest = msgs[msgs.length - 1].created_at
    saveLastRead(latest)
    onUnreadChange?.(false)
  }, [onUnreadChange])

  // Initial load
  useEffect(() => {
    supabase
      .from('staff_chat_messages')
      .select('id, sender_id, body, created_at, sender:profiles(username, avatar_diamond_url, avatar_url, is_admin)')
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (!data) return
        const msgs = data as unknown as ChatMessage[]
        setMessages(msgs)
        markRead(msgs)
        setTimeout(scrollToBottom, 50)
      })
  }, [markRead, scrollToBottom])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('staff-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_chat_messages' }, async (payload) => {
        const row = payload.new as { id: string; sender_id: string; body: string; created_at: string }
        // Fetch sender profile for the new message
        const { data: senderData } = await supabase
          .from('profiles')
          .select('username, avatar_diamond_url, avatar_url, is_admin')
          .eq('id', row.sender_id)
          .single()
        const msg: ChatMessage = { ...row, sender: senderData ?? null }
        setMessages(prev => {
          const next = [...prev, msg]
          // Mark read only if this is own message or we're scrolled to bottom
          const el = scrollRef.current
          const atBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 80)
          if (row.sender_id === user?.id || atBottom) {
            markRead(next)
          } else {
            onUnreadChange?.(true)
          }
          return next
        })
        setTimeout(scrollToBottom, 30)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, markRead, onUnreadChange, scrollToBottom])

  // Check for unread on mount
  useEffect(() => {
    if (!messages.length) return
    const lastRead = loadLastRead()
    const latest = messages[messages.length - 1].created_at
    onUnreadChange?.(latest > lastRead)
  }, [messages, onUnreadChange])

  async function sendMessage() {
    if (!user || !body.trim()) return
    const text = body.trim()
    setBody('')
    setSending(true)
    await supabase.from('staff_chat_messages').insert({ sender_id: user.id, body: text })
    setSending(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // Group messages by day
  const grouped: { day: string; msgs: ChatMessage[] }[] = []
  for (const msg of messages) {
    const day = fmtDay(msg.created_at)
    if (!grouped.length || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, msgs: [] })
    }
    grouped[grouped.length - 1].msgs.push(msg)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Message list */}
      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        {messages.length === 0 ? (
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', fontStyle: 'italic', padding: '12px 0 0', margin: 0 }}>
            No messages yet. Say hello!
          </p>
        ) : (
          grouped.map(({ day, msgs }) => (
            <div key={day}>
              {/* Day divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--fg-08)' }} />
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-25)', flexShrink: 0 }}>
                  {day}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--fg-08)' }} />
              </div>
              {msgs.map(msg => {
                const isMine = msg.sender_id === user?.id
                return (
                  <div key={msg.id} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                    {!isMine && (
                      <Diamond
                        diamondUrl={msg.sender?.avatar_diamond_url ?? null}
                        fallbackUrl={msg.sender?.avatar_url ?? null}
                        size={24}
                        altText={msg.sender?.username ?? undefined}
                      />
                    )}
                    <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2 }}>
                      {!isMine && (
                        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, color: msg.sender?.is_admin ? '#A855F7' : 'var(--fg-40)', letterSpacing: '0.02em' }}>
                          @{msg.sender?.username ?? '?'}
                        </span>
                      )}
                      <div style={{
                        padding: '6px 10px', borderRadius: isMine ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                        background: isMine ? '#A855F7' : 'var(--fg-08)',
                        color: isMine ? '#fff' : 'var(--fg)',
                        fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, lineHeight: 1.45,
                        wordBreak: 'break-word',
                      }}>
                        {msg.body}
                      </div>
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'var(--fg-25)' }}>
                        {fmtTime(msg.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Input row */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 6, paddingTop: 10, borderTop: '1px solid var(--fg-08)', marginTop: 4 }}>
        <input
          ref={inputRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message as @${profile?.username ?? '…'}`}
          maxLength={500}
          style={{
            flex: 1, minWidth: 0, padding: '7px 10px',
            background: 'var(--fg-08)', border: '1px solid var(--fg-15)',
            borderRadius: 8, color: 'var(--fg)', outline: 'none',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 12,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!body.trim() || sending}
          style={{
            flexShrink: 0, padding: '7px 14px', borderRadius: 8,
            background: body.trim() ? '#A855F7' : 'var(--fg-08)',
            border: 'none', color: body.trim() ? '#fff' : 'var(--fg-30)',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600,
            cursor: body.trim() ? 'pointer' : 'default', transition: 'all 0.15s',
          }}
        >
          {sending ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}
