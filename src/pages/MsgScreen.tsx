import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PencilLine, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { Diamond } from '@/components/Diamond'
import { markConversationRead } from '@/lib/messaging'
import { UserPicker, type PickedUser } from '@/components/UserPicker'
import { BottomSheet } from '@/components/BottomSheet'
import { GifPicker } from '@/components/GifPicker'
import { GifMessage } from '@/components/GifMessage'
import { reportGifShare, type SelectedGif } from '@/lib/klipy'
import { SwipeableConversationRow } from '@/components/SwipeableConversationRow'
import { ReportContentSheet } from '@/components/ReportContentSheet'

// ── Types ──────────────────────────────────────────────────────────────────

interface OtherUser {
  id: string
  username: string | null
  avatar_diamond_url: string | null
  avatar_url: string | null
}

interface ConversationRow {
  id: string
  name: string | null
  lastMessageAt: string
  lastReadAt: string
  members: OtherUser[]
  lastMessage: { body: string | null; sender_id: string; created_at: string; media_type?: string | null } | null
  unread: boolean
}

interface Message {
  id: string
  sender_id: string
  body: string | null
  created_at: string
  media_url?: string | null
  media_type?: string | null
  media_width?: number | null
  media_height?: number | null
  deleted_at?: string | null
}

interface MessageSearchHit {
  message_id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  rank: number
}

// ── Types ─────────────────────────────────────────────────────────────────

interface AppNotification {
  id: string
  sender_id: string | null
  kind: string
  target_event_id: string | null
  target_post_id: string | null
  body_preview: string | null
  read_at: string | null
  created_at: string
  sender: {
    username: string | null
    avatar_diamond_url: string | null
    avatar_url: string | null
  } | null
  event: {
    id: string
    title: string
    starts_at: string
  } | null
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

function isEventEnded(startsAt: string | undefined | null): boolean {
  if (!startsAt) return false
  const eventDate = new Date(startsAt)
  const eventDayEnd = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 23, 59, 59)
  return Date.now() > eventDayEnd.getTime()
}

function fmtEndedDate(startsAt: string): string {
  const d = new Date(startsAt)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}

function notifCopy(notif: AppNotification): JSX.Element {
  const senderNode = notif.sender?.username
    ? <span style={{ fontWeight: 700 }}>@{notif.sender.username}</span>
    : <span style={{ fontWeight: 700 }}>someone</span>
  const eventNode = <span style={{ fontWeight: 700 }}>{notif.event?.title ?? 'an event'}</span>
  switch (notif.kind) {
    case 'mention': return <>{senderNode} mentioned you on {eventNode}</>
    case 'activity_like:rsvp': return <>{senderNode} liked your RSVP to {eventNode}</>
    case 'activity_like:wall_post': return <>{senderNode} liked your post on {eventNode}</>
    case 'activity_like:venue_post': return <>{senderNode} liked your post</>
    case 'warning': return <>You received a warning from the Plaster team</>
    case 'follow':
      return notif.body_preview === 'accepted'
        ? <>{senderNode} followed you</>
        : <>{senderNode} wants to follow you</>
    case 'follow_accepted': return <>you're following {senderNode}</>
    case 'reply': return <>{senderNode} replied to your post on {eventNode}</>
    case 'message': return <>{senderNode} sent you a message</>
    default: return <>{senderNode} shouted you on {eventNode}</>
  }
}

function fmtMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function showTimestampBefore(cur: Message, prev: Message | undefined): boolean {
  if (!prev) return false
  return new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000
}

function getConversationDisplay(conv: ConversationRow): { title: string; isGroup: boolean; primaryUser: OtherUser | null } {
  if (conv.name) return { title: conv.name, isGroup: true, primaryUser: conv.members[0] ?? null }
  if (conv.members.length === 0) return { title: '(empty)', isGroup: false, primaryUser: null }
  if (conv.members.length === 1) return { title: `@${conv.members[0].username ?? 'user'}`, isGroup: false, primaryUser: conv.members[0] }
  const names = conv.members.slice(0, 3).map(m => `@${m.username ?? 'user'}`).join(', ')
  const more = conv.members.length > 3 ? `, +${conv.members.length - 3}` : ''
  return { title: `${names}${more}`, isGroup: true, primaryUser: conv.members[0] }
}

// Build a snippet centered on the matched query with surrounding context.
function buildSnippet(body: string, query: string, contextChars = 30): {
  text: string
  matchStart: number
  matchEnd: number
  hasLeadingEllipsis: boolean
  hasTrailingEllipsis: boolean
} {
  const q = query.toLowerCase()
  const haystack = body.toLowerCase()
  const matchIdx = haystack.indexOf(q)
  if (matchIdx === -1) {
    return { text: body.slice(0, 80), matchStart: -1, matchEnd: -1, hasLeadingEllipsis: false, hasTrailingEllipsis: body.length > 80 }
  }
  const matchEnd = matchIdx + query.length
  const sliceStart = Math.max(0, matchIdx - contextChars)
  const sliceEnd = Math.min(body.length, matchEnd + contextChars)
  return {
    text: body.slice(sliceStart, sliceEnd),
    matchStart: matchIdx - sliceStart,
    matchEnd: matchEnd - sliceStart,
    hasLeadingEllipsis: sliceStart > 0,
    hasTrailingEllipsis: sliceEnd < body.length,
  }
}

function HighlightedSnippet({ body, query }: { body: string; query: string }) {
  if (!query) return <>{body.slice(0, 80)}{body.length > 80 ? '…' : ''}</>
  const { text, matchStart, matchEnd, hasLeadingEllipsis, hasTrailingEllipsis } = buildSnippet(body, query)
  if (matchStart === -1) return <>{text}{hasTrailingEllipsis ? '…' : ''}</>
  const before = text.slice(0, matchStart)
  const match  = text.slice(matchStart, matchEnd)
  const after  = text.slice(matchEnd)
  return (
    <>
      {hasLeadingEllipsis && '…'}
      {before}
      <span style={{ color: '#A855F7', fontWeight: 600 }}>{match}</span>
      {after}
      {hasTrailingEllipsis && '…'}
    </>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export function MsgScreen() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { openConversationId: routeConvId } = (location.state ?? {}) as { openConversationId?: string }

  const [notifications,    setNotifications]    = useState<AppNotification[]>([])
  const [conversations,    setConversations]    = useState<ConversationRow[]>([])
  const [convLoading,      setConvLoading]      = useState(true)
  const [openConvId,       setOpenConvId]       = useState<string | null>(routeConvId ?? null)
  const [messages,         setMessages]         = useState<Message[]>([])
  const [msgLoading,       setMsgLoading]       = useState(false)
  const [messageText,      setMessageText]      = useState('')
  const [sending,          setSending]          = useState(false)
  const messagesEndRef       = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesInnerRef     = useRef<HTMLDivElement>(null)
  const myConvIdsRef    = useRef<Set<string>>(new Set())
  const openConvIdRef   = useRef<string | null>(openConvId)

  // New chat state
  const [newChatOpen,       setNewChatOpen]       = useState(false)
  const [newChatPicked,     setNewChatPicked]     = useState<PickedUser[]>([])
  const [creatingChat,      setCreatingChat]      = useState(false)
  const [createChatError,   setCreateChatError]   = useState<string | null>(null)

  // Add people state
  const [addPeopleOpen,     setAddPeopleOpen]     = useState(false)
  const [addPeoplePicked,   setAddPeoplePicked]   = useState<PickedUser[]>([])
  const [addingPeople,      setAddingPeople]      = useState(false)
  const [addPeopleError,    setAddPeopleError]    = useState<string | null>(null)

  // Search state
  const [searchQuery,        setSearchQuery]        = useState('')
  const [messageHits,        setMessageHits]        = useState<MessageSearchHit[]>([])
  const [searchingMessages,  setSearchingMessages]  = useState(false)
  const messageSearchDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const realtimeRefetchDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSearchedQueryRef        = useRef<string>('')

  // Scroll-to-message state
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const messageRefs               = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const suppressNextAutoScrollRef = useRef(false)
  const initialScrollDoneRef = useRef(false)

  // GIF state
  const [gifPickerOpen, setGifPickerOpen] = useState(false)
  const [pendingGif,    setPendingGif]    = useState<SelectedGif | null>(null)
  const [pendingGifQuery, setPendingGifQuery] = useState<string>('')

  // Conversation dismiss state
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null)

  // Message long-press / delete / report state
  const [msgContextMenu, setMsgContextMenu] = useState<{ id: string; senderId: string; x: number; y: number } | null>(null)
  const [deleteConfirmMsgId, setDeleteConfirmMsgId] = useState<string | null>(null)
  const [reportingMessage, setReportingMessage] = useState<{ id: string; senderId: string } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { openConvIdRef.current = openConvId }, [openConvId])

  const openConv = conversations.find(c => c.id === openConvId) ?? null

  // Filtered conversations — computed inline, no effect needed
  const filteredConversations = (() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(conv => {
      if (conv.name && conv.name.toLowerCase().includes(q)) return true
      if (conv.members.some(m => m.username && m.username.toLowerCase().includes(q))) return true
      return false
    })
  })()

  // ── Notifications ────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        id, sender_id, kind, target_event_id, target_post_id,
        body_preview, read_at, created_at,
        sender:profiles!sender_id(username, avatar_diamond_url, avatar_url),
        event:events!target_event_id(id, title, starts_at)
      `)
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
    if (!error && data) setNotifications(data as AppNotification[])
  }, [user?.id])

  async function markNotificationRead(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function markAllNotificationsRead() {
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .is('read_at', null)
    setNotifications([])
  }

  async function openNotification(notif: AppNotification) {
    await markNotificationRead(notif.id)
    switch (notif.kind) {
      case 'follow':
        navigate('/you')
        return
      case 'follow_accepted':
        if (notif.sender?.username) {
          navigate(`/profile/${notif.sender.username}`)
        }
        return
      case 'warning':
      case 'message':
        return
      default:
        if (notif.target_event_id && !isEventEnded(notif.event?.starts_at)) {
          navigate('/', { state: { openEventId: notif.target_event_id } })
        }
    }
  }

  // ── Load inbox ──────────────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    if (!user) return
    setConvLoading(true)

    // 1. My memberships (exclude dismissed conversations)
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)

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
      .select('id, name, last_message_at')
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

    // Multi-member map: conversation_id → array of other user IDs
    const membersByConvId: Record<string, string[]> = {}
    for (const m of (allMembers ?? []) as { conversation_id: string; user_id: string }[]) {
      if (!membersByConvId[m.conversation_id]) membersByConvId[m.conversation_id] = []
      membersByConvId[m.conversation_id].push(m.user_id)
    }

    // 5. Last message per conversation
    const lastMsgResults = await Promise.all(
      convIds.map(cid =>
        supabase
          .from('messages')
          .select('body, sender_id, created_at, media_type')
          .eq('conversation_id', cid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    )

    type LastMsgRow = { body: string | null; sender_id: string; created_at: string; media_type: string | null }
    const lastMsgMap: Record<string, LastMsgRow | null> = {}
    convIds.forEach((cid, i) => { lastMsgMap[cid] = (lastMsgResults[i].data as LastMsgRow | null) ?? null })

    const membershipMap: Record<string, string> = {}
    for (const m of (memberships as { conversation_id: string; last_read_at: string }[])) {
      membershipMap[m.conversation_id] = m.last_read_at
    }

    const rows: ConversationRow[] = (convRows as { id: string; name: string | null; last_message_at: string }[]).map(conv => {
      const lastReadAt = membershipMap[conv.id] ?? conv.last_message_at
      const lastMsg = lastMsgMap[conv.id] ?? null
      const memberIds = membersByConvId[conv.id] ?? []
      const members = memberIds.map(id => profileMap[id]).filter((p): p is OtherUser => !!p)
      const unread = lastMsg
        ? new Date(lastMsg.created_at) > new Date(lastReadAt) && lastMsg.sender_id !== user.id
        : false
      return {
        id: conv.id,
        name: conv.name,
        lastMessageAt: conv.last_message_at,
        lastReadAt,
        members,
        lastMessage: lastMsg,
        unread,
      }
    })

    setConversations(rows)
    setConvLoading(false)
  }, [user?.id])

  useEffect(() => { loadInbox() }, [loadInbox])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchNotifications()
    const notifChannel = supabase
      .channel(`msgscreen-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, () => { if (!cancelled) fetchNotifications() })
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(notifChannel)
    }
  }, [user?.id])

  // ── Open conversation ────────────────────────────────────────────────────
  const openConversation = useCallback(async (convId: string) => {
    setOpenConvId(convId)
    setMsgLoading(true)
    setMessages([])

    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at, media_url, media_type, media_width, media_height, deleted_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    setMessages((data ?? []) as Message[])
    setMsgLoading(false)
    await markConversationRead(convId)

    setConversations(prev =>
      prev.map(c => c.id === convId ? { ...c, unread: false, lastReadAt: new Date().toISOString() } : c)
    )
  }, [])

  // Navigate from search hit to a specific message
  async function openConversationAtMessage(convId: string, messageId: string) {
    suppressNextAutoScrollRef.current = true

    if (openConvId === convId) {
      scrollToAndHighlight(messageId)
      return
    }

    await openConversation(convId)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToAndHighlight(messageId))
    })
  }

  function scrollToAndHighlight(messageId: string) {
    const el = messageRefs.current.get(messageId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setHighlightedMessageId(messageId)
    setTimeout(() => setHighlightedMessageId(null), 1800)
  }

  // If routed with a specific conversation, open it once inbox loads
  useEffect(() => {
    if (routeConvId && !convLoading) {
      openConversation(routeConvId)
    }
  }, [routeConvId, convLoading, openConversation])

  // ── Reset initial-scroll flag when conversation changes ──────────────────
  useEffect(() => {
    initialScrollDoneRef.current = false
  }, [openConvId])

  useEffect(() => {
    if (suppressNextAutoScrollRef.current) {
      suppressNextAutoScrollRef.current = false
      return
    }
    if (!openConvId || msgLoading || messages.length === 0) return

    const container = messagesContainerRef.current
    if (!container) return

    const isInitialScroll = !initialScrollDoneRef.current

    // Double rAF: first to commit DOM, second to commit layout. iOS WebKit
    // sometimes reports stale scrollHeight inside a single rAF after a
    // setMessages/setMsgLoading batch. Two frames guarantees layout has
    // settled before we measure.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isInitialScroll) {
          // 999999 gets clamped to actual max scrollTop — avoids measuring
          // scrollHeight on a flex container, which WebKit gets wrong.
          container.scrollTop = 999999
        } else {
          container.scrollTo({ top: 999999, behavior: 'smooth' })
        }

        initialScrollDoneRef.current = true
      })
    })
  }, [messages.length, openConvId, msgLoading])

  // ── Re-scroll when images/GIFs load and expand content ───────────────────
  // ResizeObserver on the inner message wrapper fires whenever content height
  // changes (e.g. GIF finishes loading). If the user is within 200px of the
  // bottom, snap down — otherwise leave them where they are (reading history).
  useEffect(() => {
    const container = messagesContainerRef.current
    const inner = messagesInnerRef.current
    if (!container || !inner) return
    const observer = new ResizeObserver(() => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      if (distanceFromBottom < 200) {
        container.scrollTop = 999999
      }
    })
    observer.observe(inner)
    return () => observer.disconnect()
  }, [openConvId, messages.length])

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
          setConversations(prev =>
            prev.map(c => c.id === openConvId
              ? { ...c, lastMessage: { body: msg.body, sender_id: msg.sender_id, created_at: msg.created_at, media_type: msg.media_type }, lastMessageAt: msg.created_at }
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
      .channel(`inbox-watcher:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message & { conversation_id: string }
          if (!myConvIdsRef.current.has(msg.conversation_id)) return
          if (msg.sender_id === user.id) return
          if (msg.conversation_id === openConvIdRef.current) return
          setConversations(prev => {
            const updated = prev.map(c => c.id === msg.conversation_id
              ? { ...c, unread: true, lastMessage: { body: msg.body, sender_id: msg.sender_id, created_at: msg.created_at, media_type: msg.media_type }, lastMessageAt: msg.created_at }
              : c
            )
            return [...updated].sort((a, b) =>
              new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
            )
          })
          // Re-run message search if user has an active query — debounced to avoid spam
          const currentQuery = lastSearchedQueryRef.current
          if (currentQuery && currentQuery.length >= 3) {
            if (realtimeRefetchDebounceRef.current) clearTimeout(realtimeRefetchDebounceRef.current)
            realtimeRefetchDebounceRef.current = setTimeout(async () => {
              const { data, error } = await supabase.rpc('search_my_messages', { p_query: currentQuery })
              if (error || !Array.isArray(data)) return
              setMessageHits(data as MessageSearchHit[])
            }, 500)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  // ── Debounced message search ─────────────────────────────────────────────
  useEffect(() => {
    if (messageSearchDebounceRef.current) clearTimeout(messageSearchDebounceRef.current)
    const q = searchQuery.trim()
    if (q.length < 3) {
      setMessageHits([])
      setSearchingMessages(false)
      lastSearchedQueryRef.current = ''
      return
    }
    setSearchingMessages(true)
    messageSearchDebounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_my_messages', { p_query: q })
      setSearchingMessages(false)
      if (error || !Array.isArray(data)) {
        setMessageHits([])
        return
      }
      setMessageHits(data as MessageSearchHit[])
      lastSearchedQueryRef.current = q
    }, 250)
    return () => { if (messageSearchDebounceRef.current) clearTimeout(messageSearchDebounceRef.current) }
  }, [searchQuery])

  // ── Cleanup stale message refs ───────────────────────────────────────────
  useEffect(() => {
    const validIds = new Set(messages.map(m => m.id))
    for (const id of Array.from(messageRefs.current.keys())) {
      if (!validIds.has(id)) {
        messageRefs.current.delete(id)
      }
    }
  }, [messages])

  // ── Send message ─────────────────────────────────────────────────────────
  async function sendMessage() {
    const body = messageText.trim()
    if ((!body && !pendingGif) || !openConvId || !user || sending) return
    setMessageText('')
    const gif = pendingGif
    const gifQuery = pendingGifQuery
    setPendingGif(null)
    setPendingGifQuery('')
    setGifPickerOpen(false)
    setSending(true)

    const insertRow = {
      conversation_id: openConvId,
      sender_id: user.id,
      body: body ? body : null,
      ...(gif ? {
        media_url: gif.url,
        media_type: 'gif',
        media_width: gif.width,
        media_height: gif.height,
        media_source_id: gif.sourceId,
      } : {}),
    }

    const { error } = await supabase.from('messages').insert(insertRow)

    if (!error) {
      if (gif) reportGifShare(gif.sourceId, user.id, gifQuery)
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

  // ── Create new chat ───────────────────────────────────────────────────────
  async function createNewChat() {
    if (newChatPicked.length === 0 || creatingChat) return
    setCreatingChat(true)
    setCreateChatError(null)

    const memberIds = newChatPicked.map(u => u.id)

    // For 1-on-1, reuse an existing 2-person conversation if one exists
    if (memberIds.length === 1 && user) {
      const otherId = memberIds[0]
      const { data: existing } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id)
      if (existing && existing.length > 0) {
        const myConvIds = existing.map(r => r.conversation_id)
        const { data: shared } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', otherId)
          .in('conversation_id', myConvIds)
        if (shared && shared.length > 0) {
          for (const row of shared) {
            const { count } = await supabase
              .from('conversation_members')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', row.conversation_id)
            if (count === 2) {
              setNewChatOpen(false)
              setNewChatPicked([])
              setCreatingChat(false)
              setOpenConvId(row.conversation_id)
              return
            }
          }
        }
      }
    }

    const { data, error } = await supabase.rpc('create_conversation_with_members', {
      p_member_ids: memberIds,
      p_name: undefined,
    })

    if (error) {
      setCreateChatError(error.message)
      setCreatingChat(false)
      return
    }

    setNewChatOpen(false)
    setNewChatPicked([])
    setCreatingChat(false)
    setOpenConvId(data as string)
    await loadInbox()
  }

  // ── Add people to existing chat ───────────────────────────────────────────
  async function addPeople() {
    if (!openConvId || addPeoplePicked.length === 0 || addingPeople) return
    setAddingPeople(true)
    setAddPeopleError(null)

    const { error } = await supabase.rpc('add_members_to_conversation', {
      p_conversation_id: openConvId,
      p_member_ids: addPeoplePicked.map(u => u.id),
    })

    if (error) {
      setAddPeopleError(error.message)
      setAddingPeople(false)
      return
    }

    setAddPeopleOpen(false)
    setAddPeoplePicked([])
    setAddingPeople(false)
    await loadInbox()
  }

  // ── Dismiss conversation ─────────────────────────────────────────────────
  async function confirmDismiss(convId: string) {
    setDismissConfirmId(null)
    await supabase.rpc('dismiss_conversation', { p_conversation_id: convId })
    setConversations(prev => prev.filter(c => c.id !== convId))
    if (openConvId === convId) closeConv()
  }

  // ── Delete message ────────────────────────────────────────────────────────
  function startLongPress(e: React.TouchEvent, msg: Message) {
    if (msg.deleted_at) return
    const touch = e.touches[0]
    longPressTimerRef.current = setTimeout(() => {
      setMsgContextMenu({ id: msg.id, senderId: msg.sender_id, x: touch.clientX, y: touch.clientY })
    }, 500)
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
  }

  async function confirmDeleteMessage(msgId: string) {
    setDeleteConfirmMsgId(null)
    setMsgContextMenu(null)
    await supabase.rpc('soft_delete_message', { p_message_id: msgId })
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      <PlasterHeader
        actions={
          <button
            style={headerIconBtn()}
            onClick={() => setNewChatOpen(true)}
            aria-label="New chat"
          >
            <PencilLine size={18} />
          </button>
        }
      />

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── INBOX ── */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Search */}
          <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Search conversations and messages"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 20,
                border: '1px solid var(--fg-15)', background: 'var(--fg-08)',
                color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Shouts section */}
          {notifications.length > 0 && (
            <div style={{ padding: '10px 16px 6px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--fg-40)' }}>
                shouts{notifications.length > 1 ? ` (${notifications.length})` : ''}
              </span>
              {notifications.length > 1 && (
                <button
                  onClick={markAllNotificationsRead}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', padding: 0 }}
                >
                  mark all read
                </button>
              )}
            </div>
          )}

          {/* Notification cards */}
          {notifications.map(notif => (
            <div key={notif.id} style={{ padding: '0 16px 10px', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  top: 4, left: 3, right: -3, bottom: -4,
                  background: 'var(--fg-15)',
                  borderRadius: 4,
                }} />
                <div
                  onClick={() => openNotification(notif)}
                  style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    background: 'var(--bg)',
                    border: '0.5px solid var(--fg-15)',
                    borderRadius: 4,
                  }}
                >
                  <Diamond
                    diamondUrl={notif.sender?.avatar_diamond_url ?? null}
                    fallbackUrl={notif.sender?.avatar_url ?? null}
                    size={40}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {notifCopy(notif)}
                    </p>
                    {notif.body_preview && (
                      <p style={{ margin: '2px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{notif.body_preview}"
                      </p>
                    )}
                    {isEventEnded(notif.event?.starts_at) && notif.event?.starts_at && (
                      <div style={{
                        display: 'inline-block', marginTop: 4, padding: '2px 8px',
                        borderRadius: 10, background: 'rgba(168, 85, 247, 0.12)',
                        color: '#A855F7', fontFamily: '"Space Grotesk", sans-serif',
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
                      }}>
                        Ended {fmtEndedDate(notif.event.starts_at)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); markNotificationRead(notif.id) }}
                    style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-40)', padding: '4px 2px', fontSize: 16, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Scrollable conversation + message results */}
          <div style={{ flex: 1, overflowY: 'auto' }}>

            {convLoading && (
              <p style={{ padding: '32px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
                Loading…
              </p>
            )}

            {/* Section header — "messages" normally, "people & chats" when searching */}
            {!convLoading && (
              <div style={{ padding: '10px 16px 6px' }}>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--fg-40)' }}>
                  {searchQuery.trim().length >= 1 ? 'people & chats' : 'messages'}
                </span>
              </div>
            )}

            {/* Empty state when no conversations */}
            {!convLoading && conversations.length === 0 && !searchQuery && (
              <p style={{ padding: '40px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
                No conversations yet — tap the pencil icon to start one.
              </p>
            )}

            {/* Conversation rows */}
            {filteredConversations.map(conv => {
              const display = getConversationDisplay(conv)
              const rowContent = (
                <div
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

                  {/* Avatar — stacked diamonds for groups */}
                  {display.isGroup && conv.members.length >= 2 ? (
                    <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 0, left: 0 }}>
                        <Diamond diamondUrl={conv.members[0]?.avatar_diamond_url ?? null} size={28} />
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, right: 0 }}>
                        <Diamond diamondUrl={conv.members[1]?.avatar_diamond_url ?? null} size={28} />
                      </div>
                    </div>
                  ) : (
                    <Diamond
                      diamondUrl={display.primaryUser?.avatar_diamond_url ?? null}
                      fallbackUrl={display.primaryUser?.avatar_url ?? null}
                      size={40}
                    />
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{
                        fontFamily: '"Playfair Display", serif',
                        fontWeight: 700, fontSize: 15,
                        color: 'var(--fg)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {display.title}
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
                        ? (conv.lastMessage.sender_id === user?.id ? 'You: ' : '') + (
                            conv.lastMessage.media_type === 'gif' && !conv.lastMessage.body
                              ? 'sent a GIF'
                              : (conv.lastMessage.body || 'sent a GIF')
                          )
                        : 'No messages yet'}
                    </p>
                  </div>
                </div>
              )
              return (
                <SwipeableConversationRow
                  key={conv.id}
                  onDismiss={() => setDismissConfirmId(conv.id)}
                >
                  {rowContent}
                </SwipeableConversationRow>
              )
            })}

            {/* Section header for message hits */}
            {searchQuery.trim().length >= 3 && messageHits.length > 0 && (
              <div style={{ padding: '14px 16px 6px' }}>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--fg-40)' }}>
                  messages
                </span>
              </div>
            )}

            {/* Message search hits */}
            {searchQuery.trim().length >= 3 && messageHits.map(hit => {
              const conv = conversations.find(c => c.id === hit.conversation_id)
              const display = conv ? getConversationDisplay(conv) : null
              const sender = conv?.members.find(m => m.id === hit.sender_id) ?? null
              const isFromMe = hit.sender_id === user?.id
              const senderLabel = isFromMe ? 'You' : sender?.username ? `@${sender.username}` : 'someone'
              return (
                <div
                  key={hit.message_id}
                  onClick={() => openConversationAtMessage(hit.conversation_id, hit.message_id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px',
                    cursor: 'pointer', borderBottom: '1px solid var(--fg-08)',
                  }}
                >
                  <Diamond
                    diamondUrl={sender?.avatar_diamond_url ?? null}
                    fallbackUrl={sender?.avatar_url ?? null}
                    size={36}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {senderLabel}
                        {display && <span style={{ fontWeight: 400, color: 'var(--fg-40)' }}> · {display.title}</span>}
                      </span>
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', flexShrink: 0 }}>
                        {fmtTimeAgo(hit.created_at)}
                      </span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.4 }}>
                      <HighlightedSnippet body={hit.body} query={searchQuery.trim()} />
                    </p>
                  </div>
                </div>
              )
            })}

            {/* Searching indicator */}
            {searchingMessages && messageHits.length === 0 && searchQuery.trim().length >= 3 && (
              <div style={{ padding: '20px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-30)' }}>
                Searching messages…
              </div>
            )}

            {/* No results at all */}
            {!searchingMessages && searchQuery.trim().length >= 3 && filteredConversations.length === 0 && messageHits.length === 0 && (
              <p style={{ padding: '40px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
                No matches.
              </p>
            )}

          </div>
        </div>

        {/* ── CONVERSATION PANEL (slides in from BOTTOM) ── */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'var(--bg)',
          display: 'flex', flexDirection: 'column',
          transform: openConvId ? 'translateY(0)' : 'translateY(100%)',
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
                    flexShrink: 0,
                  }}
                >← BACK</button>

                {openConv && (() => {
                  const display = getConversationDisplay(openConv)
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      {display.isGroup && openConv.members.length >= 2 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {openConv.members.slice(0, 3).map(m => (
                            <Diamond key={m.id} diamondUrl={m.avatar_diamond_url} size={28} />
                          ))}
                        </div>
                      ) : (
                        <Diamond
                          diamondUrl={display.primaryUser?.avatar_diamond_url ?? null}
                          fallbackUrl={display.primaryUser?.avatar_url ?? null}
                          size={36}
                        />
                      )}
                      <span style={{
                        fontFamily: '"Playfair Display", serif',
                        fontWeight: 700, fontSize: 16,
                        color: 'var(--fg)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1, minWidth: 0,
                      }}>
                        {display.title}
                      </span>
                    </div>
                  )
                })()}

                {/* Add people button */}
                <button
                  onClick={() => setAddPeopleOpen(true)}
                  style={{
                    ...headerIconBtn(),
                    flexShrink: 0,
                    marginLeft: 'auto',
                  }}
                  aria-label="Add people"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div ref={messagesInnerRef} style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                {msgLoading && (
                  <p style={{ textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: '24px 0' }}>
                    Loading…
                  </p>
                )}
                {!msgLoading && messages.map((msg, i) => {
                  const isMine = msg.sender_id === user?.id
                  const prev = messages[i - 1]
                  const isHighlighted = highlightedMessageId === msg.id
                  const isDeleted = !!msg.deleted_at
                  return (
                    <div
                      key={msg.id}
                      ref={el => { messageRefs.current.set(msg.id, el) }}
                      onTouchStart={e => startLongPress(e, msg)}
                      onTouchEnd={cancelLongPress}
                      onTouchMove={cancelLongPress}
                    >
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
                        {isDeleted ? (
                          <div style={{
                            maxWidth: '75%', padding: '9px 14px',
                            borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            border: '1px solid var(--fg-15)',
                            color: 'var(--fg-30)',
                            fontFamily: 'Space Grotesk, sans-serif', fontSize: 13,
                            fontStyle: 'italic', lineHeight: 1.4,
                          }}>
                            Message deleted
                          </div>
                        ) : msg.media_url && msg.media_type === 'gif' ? (
                          <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 4,
                            boxShadow: isHighlighted ? '0 0 0 4px rgba(168, 85, 247, 0.35)' : undefined,
                            borderRadius: 8, transition: 'box-shadow 0.4s ease',
                          }}>
                            <GifMessage url={msg.media_url} width={msg.media_width} height={msg.media_height} maxWidth={200} />
                            {msg.body && (
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
                            )}
                          </div>
                        ) : (
                          <div style={{
                            maxWidth: '75%', padding: '9px 14px',
                            borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            background: isMine ? '#A855F7' : 'var(--fg-08)',
                            color: isMine ? '#fff' : 'var(--fg)',
                            fontFamily: 'Space Grotesk, sans-serif', fontSize: 14,
                            lineHeight: 1.4, wordBreak: 'break-word',
                            boxShadow: isHighlighted ? '0 0 0 4px rgba(168, 85, 247, 0.35)' : '0 0 0 0 rgba(168, 85, 247, 0)',
                            transition: 'box-shadow 0.4s ease',
                          }}>
                            {msg.body}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Pending GIF preview */}
              {pendingGif && (
                <div style={{
                  flexShrink: 0, padding: '6px 12px 0',
                  display: 'flex', alignItems: 'flex-end', gap: 8,
                }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <GifMessage url={pendingGif.url} width={pendingGif.width} height={pendingGif.height} maxWidth={120} />
                    <button
                      onClick={() => setPendingGif(null)}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'var(--fg-55)', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--bg)', fontSize: 11, fontWeight: 700, lineHeight: 1,
                      }}
                    >×</button>
                  </div>
                </div>
              )}

              {/* Input bar */}
              <div style={{
                flexShrink: 0, borderTop: '1px solid var(--fg-08)',
                padding: '8px 12px',
                paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
                display: 'flex', alignItems: 'center', gap: 8,
                position: 'relative',
              }}>
                {/* GIF button */}
                <button
                  onClick={() => setGifPickerOpen(v => !v)}
                  style={{
                    flexShrink: 0, background: gifPickerOpen ? '#A855F7' : 'var(--fg-08)',
                    border: '1px solid var(--fg-15)', borderRadius: 8,
                    width: 34, height: 34, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700,
                    fontSize: 11, letterSpacing: '0.04em',
                    color: gifPickerOpen ? '#fff' : 'var(--fg-55)',
                  }}
                  aria-label="GIF"
                >GIF</button>

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
                  disabled={(!messageText.trim() && !pendingGif) || sending}
                  style={{
                    background: (messageText.trim() || pendingGif) ? '#A855F7' : 'var(--fg-15)',
                    border: 'none', borderRadius: '50%', width: 38, height: 38,
                    cursor: (messageText.trim() || pendingGif) ? 'pointer' : 'default',
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

              {/* GIF picker overlay */}
              <GifPicker
                open={gifPickerOpen}
                onSelect={(gif, q) => { setPendingGif(gif); setPendingGifQuery(q); setGifPickerOpen(false) }}
                onClose={() => setGifPickerOpen(false)}
              />
            </>
          )}
        </div>

      </div>

      {/* ── New chat modal ── */}
      <BottomSheet
        open={newChatOpen}
        onClose={() => {
          setNewChatOpen(false)
          setNewChatPicked([])
          setCreateChatError(null)
        }}
        title="New chat"
      >
        <p style={{ margin: '0 0 14px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
          Pick one or more people to start a chat.
        </p>

        <UserPicker
          initialSelected={[]}
          onChange={setNewChatPicked}
        />

        {createChatError && (
          <p style={{ margin: '12px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgb(220,38,38)' }}>
            {createChatError}
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            onClick={createNewChat}
            disabled={newChatPicked.length === 0 || creatingChat}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 8,
              border: 'none',
              background: newChatPicked.length > 0 && !creatingChat ? '#A855F7' : 'var(--fg-15)',
              color: newChatPicked.length > 0 && !creatingChat ? '#fff' : 'var(--fg-40)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: 14,
              cursor: newChatPicked.length > 0 && !creatingChat ? 'pointer' : 'default',
            }}
          >
            {creatingChat ? 'Creating…' : `Start chat (${newChatPicked.length} ${newChatPicked.length === 1 ? 'person' : 'people'})`}
          </button>
        </div>
      </BottomSheet>

      {/* ── Dismiss conversation confirm ── */}
      {dismissConfirmId && (
        <div
          onClick={() => setDismissConfirmId(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'var(--bg)',
              borderTop: '1px solid var(--fg-15)',
              borderRadius: '16px 16px 0 0',
              padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
              Dismiss this conversation?
            </p>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
              It will be hidden from your inbox. If someone sends a new message, it will reappear.
            </p>
            <button
              onClick={() => confirmDismiss(dismissConfirmId)}
              style={{
                padding: '13px', borderRadius: 10, border: 'none',
                background: '#ef4444', color: '#fff',
                fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
            <button
              onClick={() => setDismissConfirmId(null)}
              style={{
                padding: '13px', borderRadius: 10, border: '1px solid var(--fg-15)',
                background: 'none', color: 'var(--fg)',
                fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Message long-press context menu ── */}
      {msgContextMenu && (
        <div
          onClick={() => setMsgContextMenu(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: Math.min(msgContextMenu.y + 8, window.innerHeight - 120),
              left: Math.min(msgContextMenu.x, window.innerWidth - 160),
              background: 'var(--bg)',
              border: '1px solid var(--fg-15)',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              zIndex: 201,
            }}
          >
            {msgContextMenu.senderId === user?.id ? (
              <button
                onClick={() => { setDeleteConfirmMsgId(msgContextMenu.id); setMsgContextMenu(null) }}
                style={{
                  display: 'block', width: '100%', padding: '14px 20px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14,
                  color: '#ef4444', fontWeight: 600, textAlign: 'left',
                }}
              >
                Delete message
              </button>
            ) : (
              <button
                onClick={() => { setReportingMessage({ id: msgContextMenu.id, senderId: msgContextMenu.senderId }); setMsgContextMenu(null) }}
                style={{
                  display: 'block', width: '100%', padding: '14px 20px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: '"Space Grotesk", sans-serif', fontSize: 14,
                  color: 'var(--fg)', fontWeight: 600, textAlign: 'left',
                }}
              >
                Report message
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Delete message confirm ── */}
      {deleteConfirmMsgId && (
        <div
          onClick={() => setDeleteConfirmMsgId(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'var(--bg)',
              borderTop: '1px solid var(--fg-15)',
              borderRadius: '16px 16px 0 0',
              padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
              Delete this message?
            </p>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
              Everyone will see "Message deleted." This can't be undone.
            </p>
            <button
              onClick={() => confirmDeleteMessage(deleteConfirmMsgId)}
              style={{
                padding: '13px', borderRadius: 10, border: 'none',
                background: '#ef4444', color: '#fff',
                fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setDeleteConfirmMsgId(null)}
              style={{
                padding: '13px', borderRadius: 10, border: '1px solid var(--fg-15)',
                background: 'none', color: 'var(--fg)',
                fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Add people modal ── */}
      <BottomSheet
        open={addPeopleOpen}
        onClose={() => {
          setAddPeopleOpen(false)
          setAddPeoplePicked([])
          setAddPeopleError(null)
        }}
        title="Add people"
      >
        <p style={{ margin: '0 0 14px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
          {openConv && openConv.members.length > 0
            ? `Currently in this chat: ${openConv.members.map(m => '@' + (m.username ?? 'user')).join(', ')}`
            : 'Add people to this conversation.'}
        </p>

        <UserPicker
          initialSelected={[]}
          excludedIds={openConv ? new Set(openConv.members.map(m => m.id)) : undefined}
          onChange={setAddPeoplePicked}
        />

        {addPeopleError && (
          <p style={{ margin: '12px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgb(220,38,38)' }}>
            {addPeopleError}
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            onClick={addPeople}
            disabled={addPeoplePicked.length === 0 || addingPeople}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 8,
              border: 'none',
              background: addPeoplePicked.length > 0 && !addingPeople ? '#A855F7' : 'var(--fg-15)',
              color: addPeoplePicked.length > 0 && !addingPeople ? '#fff' : 'var(--fg-40)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: 14,
              cursor: addPeoplePicked.length > 0 && !addingPeople ? 'pointer' : 'default',
            }}
          >
            {addingPeople ? 'Adding…' : `Add ${addPeoplePicked.length} ${addPeoplePicked.length === 1 ? 'person' : 'people'}`}
          </button>
        </div>
      </BottomSheet>

      <ReportContentSheet
        open={!!reportingMessage}
        targetKind="message"
        targetId={reportingMessage?.id ?? ''}
        targetUserId={reportingMessage?.senderId ?? ''}
        onClose={() => setReportingMessage(null)}
      />

    </div>
  )
}

export default MsgScreen
