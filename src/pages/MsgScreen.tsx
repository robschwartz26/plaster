import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PencilLine, Plus, MoreHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { Diamond } from '@/components/Diamond'
import { markConversationRead } from '@/lib/messaging'
import { UserPicker, type PickedUser } from '@/components/UserPicker'
import { BottomSheet } from '@/components/BottomSheet'
import { GifPicker } from '@/components/GifPicker'
import { GifMessage } from '@/components/GifMessage'
import { SlapHand } from '@/components/SlapHand'
import { GroupEditSheet } from '@/components/GroupEditSheet'
import { AvatarFullscreen } from '@/components/AvatarFullscreen'
import { createPortal } from 'react-dom'
import { reportGifShare, type SelectedGif } from '@/lib/klipy'
import { getKlipyId } from '@/lib/klipyId'
import { SwipeableConversationRow } from '@/components/SwipeableConversationRow'
import { ReportContentSheet } from '@/components/ReportContentSheet'
import { UserActionsMenu } from '@/components/UserActionsMenu'
import { moderateText, moderationMessage } from '@/lib/contentFilter'
import { posterThumb } from '@/lib/posterThumb'

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
  avatarUrl: string | null
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
  message_type?: string | null
  event_id?: string | null
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
  target_community_post_id: string | null
  target_conversation_id: string | null
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
    poster_url: string | null
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

function notifCopy(notif: AppNotification) {
  const senderNode = notif.sender?.username
    ? <span style={{ fontWeight: 700 }}>@{notif.sender.username}</span>
    : <span style={{ fontWeight: 700 }}>someone</span>
  const eventNode = <span style={{ fontWeight: 700 }}>{notif.event?.title ?? 'an event'}</span>
  switch (notif.kind) {
    case 'mention': return <>{senderNode} mentioned you on {eventNode}</>
    case 'activity_like:rsvp': return <>{senderNode} likes that you're going to {eventNode}</>
    case 'activity_like:wall_post': return <>{senderNode} liked your post on {eventNode}</>
    case 'activity_like:venue_post': return <>{senderNode} liked your post</>
    case 'warning': return <>You received a warning from the Plaster team</>
    case 'follow':
      return notif.body_preview === 'accepted'
        ? <>{senderNode} followed you</>
        : <>{senderNode} wants to follow you</>
    case 'follow_accepted': return <>you're following {senderNode}</>
    case 'reply': return <>{senderNode} replied to you on {eventNode}</>
    case 'message': return <>{senderNode} sent you a message</>
    case 'va_approved': return <>Your {notif.body_preview ?? 'account'} account has been approved 🎉</>
    case 'va_declined': return <>Your {notif.body_preview ?? 'account'} account request was declined</>
    case 'show_reminder': return <>Show today: {eventNode}</>
    case 'venue_new_show': return <>{senderNode} added a show — {notif.body_preview ?? 'new show'}</>
    case 'lost_pet': return <>🐾 Lost pet in your neighborhood — {notif.body_preview ?? 'a neighbor needs help'}</>
    case 'slap': return (
      <>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{senderNode} slapped you <SlapHand size={15} /></span>
        <span style={{ display: 'block', marginTop: 2, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>to go to <strong style={{ fontWeight: 700, color: 'var(--fg)' }}>{notif.event?.title ?? 'a show'}</strong></span>
      </>
    )
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

function getConversationDisplay(conv: ConversationRow): { title: string; isGroup: boolean; primaryUser: OtherUser | null; avatarUrl: string | null } {
  // Identity is always PEOPLE (or a custom group name/image) — never an event.
  if (conv.name) return { title: conv.name, isGroup: true, primaryUser: conv.members[0] ?? null, avatarUrl: conv.avatarUrl }
  if (conv.members.length === 0) return { title: '(empty)', isGroup: false, primaryUser: null, avatarUrl: null }
  if (conv.members.length === 1) return { title: `@${conv.members[0].username ?? 'user'}`, isGroup: false, primaryUser: conv.members[0], avatarUrl: null }
  const names = conv.members.slice(0, 3).map(m => `@${m.username ?? 'user'}`).join(', ')
  const more = conv.members.length > 3 ? `, +${conv.members.length - 3}` : ''
  return { title: `${names}${more}`, isGroup: true, primaryUser: conv.members[0], avatarUrl: conv.avatarUrl }
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
  const { user, profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { openConversationId: routeConvId } = (location.state ?? {}) as { openConversationId?: string }

  const [notifications,    setNotifications]    = useState<AppNotification[]>([])
  const [conversations,    setConversations]    = useState<ConversationRow[]>([])
  const [convLoading,      setConvLoading]      = useState(true)
  const [slapEvents,   setSlapEvents]   = useState<Record<string, { id: string; title: string; poster_url: string | null }>>({})
  // Slap RSVP is DB-driven, not remembered in local UI state: goingSlapEventIds
  // is which of the open thread's slapped events the user actually attends, read
  // fresh from the attendees table on every mount (survives leaving/re-entering
  // and app restarts). slapChecked gates the button until the lookup resolves so
  // it never flashes at someone who's going. When you're going there is NO
  // floating element — a fixed "you're going" marker lives on the slap card in
  // the message stream instead (the chat just stays a chat).
  const [goingSlapEventIds, setGoingSlapEventIds] = useState<Set<string>>(new Set())
  const [slapChecked, setSlapChecked] = useState(false)
  const [slapRsvpError, setSlapRsvpError] = useState<string | null>(null)
  const [convSlapPoster, setConvSlapPoster] = useState<Record<string, string>>({})
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const [avatarFullscreenId, setAvatarFullscreenId] = useState<string | null>(null)
  const [openConvId,       setOpenConvId]       = useState<string | null>(routeConvId ?? null)
  const [messages,         setMessages]         = useState<Message[]>([])
  const [msgLoading,       setMsgLoading]       = useState(false)
  const [messageText,      setMessageText]      = useState('')
  const [composerError,    setComposerError]    = useState<string | null>(null)
  const [memberActionsOpen, setMemberActionsOpen] = useState(false)
  const [actionUser, setActionUser] = useState<{ id: string; username: string | null } | null>(null)
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
  const initialLoadWindowRef = useRef(false)

  // GIF state
  const [gifPickerOpen, setGifPickerOpen] = useState(false)
  const [pendingGif,    setPendingGif]    = useState<SelectedGif | null>(null)
  const [pendingGifQuery, setPendingGifQuery] = useState<string>('')

  // Conversation dismiss state
  const [dismissConfirmId, setDismissConfirmId] = useState<string | null>(null)

  // Shouts expand/collapse
  const [shoutsExpanded, setShoutsExpanded] = useState(false)

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
        id, sender_id, kind, target_event_id, target_post_id, target_community_post_id, target_conversation_id,
        body_preview, read_at, created_at,
        sender:profiles!sender_id(username, avatar_diamond_url, avatar_url),
        event:events!target_event_id(id, title, starts_at, poster_url)
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
      case 'va_approved':
      case 'va_declined':
        navigate('/you')
        return
      case 'warning':
      case 'message':
        return
      case 'venue_new_show':
        if (notif.target_event_id && !isEventEnded(notif.event?.starts_at)) {
          navigate('/', { state: { openEventId: notif.target_event_id } })
        }
        return
      case 'lost_pet':
        // Deep-link to the neighborhood wall, where the lost-pet post is shown.
        navigate('/', { state: { openCommunity: true } })
        return
      case 'slap':
        if (notif.target_conversation_id) navigate('/msg', { state: { openConversationId: notif.target_conversation_id } })
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
      .select('id, name, avatar_url, last_message_at')
      .in('id', convIds)
      .order('last_message_at', { ascending: false })

    if (!convRows) { setConvLoading(false); return }

    // 3. All members of all my conversations (excluding me — filtered client-side)
    const { data: allMembers } = await supabase
      .from('conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', convIds)
      .neq('user_id', user.id)

    // 4. Identity for co-members. Use the conversation-scoped SECURITY DEFINER
    //    RPC, not a plain profiles read — the is_public RLS would otherwise hide
    //    private members of your own groups, making them vanish from the roster,
    //    title, and message bubbles. Shared membership is the consent; this
    //    returns identity fields only (the full portrait stays is_public-gated).
    const { data: profiles } = await supabase.rpc('get_my_conversation_members')

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

    const rows: ConversationRow[] = (convRows as { id: string; name: string | null; avatar_url: string | null; last_message_at: string }[]).map(conv => {
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
        avatarUrl: conv.avatar_url,
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
      .select('id, sender_id, body, created_at, media_url, media_type, media_width, media_height, message_type, event_id, deleted_at')
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
    // Arm an initial-load window: for ~1.5s after opening a thread, ANY content
    // that expands height (async slap posters, GIFs finishing load) must pull the
    // view to the newest message. The steady-state "within 200px" guard is too
    // strict on a cold open — a slap poster + a couple GIFs can push content down
    // by more than 200px, and the old guard then stranded the user mid-thread.
    // After the window closes we honor the guard so scrolling history isn't yanked.
    initialLoadWindowRef.current = true
    const t = setTimeout(() => { initialLoadWindowRef.current = false }, 1500)
    return () => clearTimeout(t)
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
      // Initial-load window → always snap to newest (late slap poster / GIFs);
      // afterward → only snap if the user is already near the bottom.
      if (initialLoadWindowRef.current || distanceFromBottom < 200) {
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
    // Objectionable-content gate (Apple 1.2) — block before anything is sent.
    if (body) {
      const verdict = moderateText(body)
      if (!verdict.ok) { setComposerError(moderationMessage(verdict, 'message')); return }
    }
    setComposerError(null)
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
      if (gif) reportGifShare(gif.sourceId, getKlipyId(), gifQuery)
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', openConvId)
    }

    setSending(false)
  }

  // ── Plaster Slap: event details for banners + in-chat RSVP ──────────────────
  useEffect(() => {
    const ids = [...new Set(messages.filter(m => m.message_type === 'slap' && m.event_id).map(m => m.event_id as string))]
    const missing = ids.filter(id => !slapEvents[id])
    if (!missing.length) return
    supabase.from('events').select('id, title, poster_url').in('id', missing).then(({ data }) => {
      if (data?.length) setSlapEvents(prev => { const n = { ...prev }; for (const e of data) n[e.id] = e as { id: string; title: string; poster_url: string | null }; return n })
    })
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // The event the open thread was slapped to (most recent slap message) — this
  // is what the floating RSVP button acts on.
  const threadSlapEventId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) { const m = messages[i]; if (m.message_type === 'slap' && m.event_id) return m.event_id }
    return null
  })()

  // Every slapped event in the open thread (a thread can hold more than one),
  // as a stable key so the lookup only re-runs when that set actually changes.
  const slapEventIdsKey = messages
    .filter(m => m.message_type === 'slap' && m.event_id)
    .map(m => m.event_id as string)
    .join(',')

  // Read the truth from attendees on every mount / thread change — nothing is
  // cached across mounts. slapChecked flips false→true around the async read so
  // the button never flashes before we know whether the user is already going.
  useEffect(() => {
    setSlapChecked(false)
    setSlapRsvpError(null)
    const ids = slapEventIdsKey ? slapEventIdsKey.split(',') : []
    if (!user || ids.length === 0) { setGoingSlapEventIds(new Set()); setSlapChecked(true); return }
    let cancelled = false
    supabase.from('attendees').select('event_id').eq('user_id', user.id).in('event_id', ids)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Don't strand a going user: leave the set empty (button shows) so they
          // can re-confirm — a duplicate insert is treated as success below.
          console.error('[slap rsvp] attendees lookup failed:', error)
          setGoingSlapEventIds(new Set())
        } else {
          setGoingSlapEventIds(new Set((data ?? []).map(r => r.event_id as string)))
        }
        setSlapChecked(true)
      })
    return () => { cancelled = true }
  }, [slapEventIdsKey, user?.id])

  async function rsvpFromChat(eventId: string) {
    if (!user) return
    setSlapRsvpError(null)
    const { error } = await supabase.from('attendees').insert({ event_id: eventId, user_id: user.id })
    if (!error || error.code === '23505') {
      // Success, or already-going (unique violation) — both mean "you're in".
      // The card marker appears and the floating button drops away.
      setGoingSlapEventIds(prev => new Set([...prev, eventId]))
    } else {
      // Never swallow the failure — surface it so it can't hide as a dead button.
      console.error('[slap rsvp] insert failed:', error)
      setSlapRsvpError("Couldn't RSVP — tap to try again.")
    }
  }

  // Poster thumbnail for slap-originated conversations (shown at the row's right).
  const convIdsKey = conversations.map(c => c.id).join(',')
  useEffect(() => {
    const ids = conversations.map(c => c.id)
    if (!ids.length) { setConvSlapPoster({}); return }
    let cancelled = false
    supabase.from('messages').select('conversation_id, event_id, created_at').eq('message_type', 'slap').in('conversation_id', ids).order('created_at', { ascending: false })
      .then(async ({ data }) => {
        if (cancelled || !data?.length) return
        const evByConv: Record<string, string> = {}
        for (const m of data) { if (m.event_id && !evByConv[m.conversation_id]) evByConv[m.conversation_id] = m.event_id as string }
        const evIds = [...new Set(Object.values(evByConv))]
        if (!evIds.length) return
        const { data: evs } = await supabase.from('events').select('id, poster_url').in('id', evIds)
        if (cancelled) return
        const posterById: Record<string, string> = {}
        for (const e of evs ?? []) if (e.poster_url) posterById[e.id] = e.poster_url
        const map: Record<string, string> = {}
        for (const [cid, eid] of Object.entries(evByConv)) { const p = posterById[eid]; if (p) map[cid] = p }
        setConvSlapPoster(map)
      })
    return () => { cancelled = true }
  }, [convIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

          {/* Single scroll area — shouts + conversations together */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

          {/* Shouts section */}
          {notifications.length > 0 && (
            <div style={{ padding: '10px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--fg-70)' }}>
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

          {/* Notification cards — capped at 5 unless expanded */}
          {(shoutsExpanded ? notifications : notifications.slice(0, 3)).map(notif => (
            <div key={notif.id} style={{ padding: '0 16px 10px' }}>
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
                    <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: notif.kind === 'slap' ? 'normal' : 'nowrap' }}>
                      {notifCopy(notif)}
                    </p>
                    {notif.body_preview && notif.kind !== 'follow' && notif.kind !== 'venue_new_show' && notif.kind !== 'slap' && (
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
                  {notif.kind === 'venue_new_show' && notif.event?.poster_url && (
                    <img
                      src={posterThumb(notif.event.poster_url, 120) ?? notif.event.poster_url}
                      onError={ev => { const img = ev.currentTarget; img.onerror = null; img.src = notif.event!.poster_url! }}
                      alt=""
                      style={{ flexShrink: 0, width: 28, height: 42, borderRadius: 3, objectFit: 'cover', border: '1px solid var(--fg-08)' }}
                    />
                  )}
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

          {/* See more / show less */}
          {notifications.length > 3 && (
            <button
              onClick={() => setShoutsExpanded(v => !v)}
              style={{
                display: 'block', width: '100%', padding: '2px 16px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 11,
                color: 'var(--fg-40)', textAlign: 'left',
              }}
            >
              {shoutsExpanded ? 'show less' : `see ${notifications.length - 3} more`}
            </button>
          )}

            {convLoading && (
              <p style={{ padding: '32px 16px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)', margin: 0 }}>
                Loading…
              </p>
            )}

            {/* Section header — "messages" normally, "people & chats" when searching */}
            {!convLoading && (
              <div style={{ padding: '10px 16px 6px' }}>
                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--fg-70)' }}>
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

                  {/* Avatar — custom group image, else stacked diamonds, else single */}
                  {display.avatarUrl ? (
                    <img src={display.avatarUrl} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : display.isGroup && conv.members.length >= 2 ? (
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
                        fontWeight: 700, fontSize: 16,
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
                  {conv.unread && convSlapPoster[conv.id] && (
                    <img
                      src={posterThumb(convSlapPoster[conv.id], 120) ?? convSlapPoster[conv.id]}
                      onError={ev => { const img = ev.currentTarget; img.onerror = null; img.src = convSlapPoster[conv.id] }}
                      alt=""
                      style={{ flexShrink: 0, width: 38, height: 52, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--fg-08)' }}
                    />
                  )}
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
                  const plainBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexShrink: 0 } as const
                  const titleStyle = {
                    fontFamily: '"Playfair Display", serif',
                    fontWeight: 700, fontSize: 16,
                    color: 'var(--fg)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1, minWidth: 0,
                  } as const
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      {/* Avatar(s): diamonds open that person's photo; a custom group image edits the group */}
                      {display.avatarUrl ? (
                        <button onClick={() => setGroupEditOpen(true)} style={plainBtn} aria-label="Edit group">
                          <img src={display.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                        </button>
                      ) : display.isGroup && openConv.members.length >= 2 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {openConv.members.slice(0, 3).map(m => (
                            <button key={m.id} onClick={() => setAvatarFullscreenId(m.id)} style={plainBtn} aria-label={`View @${m.username ?? 'member'}'s photo`}>
                              <Diamond diamondUrl={m.avatar_diamond_url} fallbackUrl={m.avatar_url} size={28} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => { if (display.primaryUser) setAvatarFullscreenId(display.primaryUser.id) }}
                          style={plainBtn}
                          aria-label="View photo"
                        >
                          <Diamond
                            diamondUrl={display.primaryUser?.avatar_diamond_url ?? null}
                            fallbackUrl={display.primaryUser?.avatar_url ?? null}
                            size={36}
                          />
                        </button>
                      )}
                      {/* Title: groups open the editor (rename / group photo); 1-on-1 is plain text */}
                      {display.isGroup ? (
                        <button onClick={() => setGroupEditOpen(true)} style={{ ...titleStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                          {display.title}
                        </button>
                      ) : (
                        <span style={titleStyle}>{display.title}</span>
                      )}
                    </div>
                  )
                })()}

                {/* Block / report — reachable from inside the conversation (Apple 1.2) */}
                {openConv && (() => {
                  const d = getConversationDisplay(openConv)
                  if (!d.isGroup && d.primaryUser) {
                    return (
                      <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
                        <UserActionsMenu
                          targetUserId={d.primaryUser.id}
                          targetUsername={d.primaryUser.username}
                          onActionComplete={closeConv}
                        />
                      </div>
                    )
                  }
                  if (d.isGroup && openConv.members.length > 0) {
                    return (
                      <button
                        onClick={() => setMemberActionsOpen(true)}
                        style={{ ...headerIconBtn(), flexShrink: 0, marginLeft: 'auto' }}
                        aria-label="Member safety actions"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    )
                  }
                  return null
                })()}

                {/* Add people button */}
                <button
                  onClick={() => setAddPeopleOpen(true)}
                  style={{
                    ...headerIconBtn(),
                    flexShrink: 0,
                  }}
                  aria-label="Add people"
                >
                  <Plus size={16} />
                </button>
              </div>

              {groupEditOpen && openConv && createPortal(
                <GroupEditSheet
                  conversationId={openConv.id}
                  currentName={openConv.name}
                  currentAvatarUrl={openConv.avatarUrl}
                  onClose={() => setGroupEditOpen(false)}
                  onSaved={() => { setGroupEditOpen(false); loadInbox() }}
                />,
                document.body
              )}

              {avatarFullscreenId && (
                <AvatarFullscreen
                  userId={avatarFullscreenId}
                  onClose={() => setAvatarFullscreenId(null)}
                />
              )}

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

                  // Slap message — event poster centered above the same third-person
                  // line for everyone (including the sender). Poster + title → event.
                  if (msg.message_type === 'slap' && !isDeleted) {
                    const ev = msg.event_id ? slapEvents[msg.event_id] : null
                    const senderName = isMine
                      ? (profile?.username ?? 'someone')
                      : (openConv?.members.find(m => m.id === msg.sender_id)?.username ?? 'someone')
                    const goToEvent = () => { if (msg.event_id) navigate('/', { state: { openEventId: msg.event_id } }) }
                    return (
                      <div key={msg.id} ref={el => { messageRefs.current.set(msg.id, el) }} style={{ margin: '12px 0' }}>
                        {showTimestampBefore(msg, prev) && (
                          <p style={{ textAlign: 'center', margin: '10px 0 4px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 10, color: 'var(--fg-25)', letterSpacing: '0.05em' }}>{fmtMsgTime(msg.created_at)}</p>
                        )}
                        <div style={{ padding: '14px 36px 22px', textAlign: 'center' }}>
                          {ev?.poster_url && (
                            <button onClick={goToEvent} style={{ display: 'block', margin: '0 auto 12px', padding: 0, border: 'none', background: 'none', cursor: 'pointer', lineHeight: 0 }}>
                              <img src={ev.poster_url} alt="" style={{ height: 96, borderRadius: 8, objectFit: 'cover', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.28)' }} />
                            </button>
                          )}
                          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12.5, color: 'var(--fg-62)', lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700, color: 'var(--fg-82)' }}>@{senderName}</span> wants to go with you to
                          </p>
                          <button
                            onClick={goToEvent}
                            style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, margin: '6px 0 0', cursor: 'pointer', fontFamily: '"Playfair Display", serif', fontSize: 16, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25, textAlign: 'center' }}
                          >
                            {ev?.title ?? 'a show'}
                          </button>
                          <p style={{ margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>tap to see the event →</p>
                          {/* Fixed in-chat RSVP marker — stays part of the slap card
                              once you're going. No floating element; the thread just
                              carries on as a normal group chat. */}
                          {msg.event_id && goingSlapEventIds.has(msg.event_id) && (
                            <p style={{ margin: '12px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--slap-green-text)' }}>
                              ✓ You're going · in your Set List
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  }

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

              {/* Slap RSVP prompt — a transient call-to-action, shown only while
                  the user has NOT yet RSVP'd to the thread's latest slap. Once
                  they're going it disappears entirely (nothing floats here) and a
                  fixed "you're going" marker lives on the slap card instead. Gated
                  on slapChecked so it never flashes before the DB lookup resolves. */}
              {threadSlapEventId && slapChecked && !goingSlapEventIds.has(threadSlapEventId) && (
                <div style={{ flexShrink: 0, padding: '8px 12px 0' }}>
                  <button
                    onClick={() => rsvpFromChat(threadSlapEventId)}
                    style={{ width: '100%', padding: '11px 16px', borderRadius: 10, border: '1.5px solid var(--slap-green-border)', background: 'transparent', color: 'var(--slap-green-text)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }}
                  >
                    Going ✓
                  </button>
                  {slapRsvpError && (
                    <p style={{ margin: '6px 2px 0', color: 'var(--sold-out)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, textAlign: 'center' }}>{slapRsvpError}</p>
                  )}
                </div>
              )}

              {/* Objectionable-content rejection (Apple 1.2) */}
              {composerError && (
                <div style={{ flexShrink: 0, padding: '8px 16px 0' }}>
                  <p style={{ margin: 0, color: 'var(--sold-out)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, lineHeight: 1.4 }}>{composerError}</p>
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
                  onChange={e => { setMessageText(e.target.value); if (composerError) setComposerError(null) }}
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
              <>
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
                <button
                  onClick={() => {
                    const sid = msgContextMenu.senderId
                    const uname = openConv?.members.find(m => m.id === sid)?.username ?? null
                    setActionUser({ id: sid, username: uname })
                    setMsgContextMenu(null)
                  }}
                  style={{
                    display: 'block', width: '100%', padding: '14px 20px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderTop: '1px solid var(--fg-08)',
                    fontFamily: '"Space Grotesk", sans-serif', fontSize: 14,
                    color: '#ef4444', fontWeight: 600, textAlign: 'left',
                  }}
                >
                  Block or report user
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Controlled block/report for a specific user (from message menu or group list) ── */}
      {actionUser && (
        <UserActionsMenu
          key={actionUser.id}
          targetUserId={actionUser.id}
          targetUsername={actionUser.username}
          hideTrigger
          controlledOpen
          onControlledClose={() => setActionUser(null)}
          onActionComplete={() => {
            // If we just blocked the sole other person in a 1-on-1, leave the thread.
            if (openConv && !getConversationDisplay(openConv).isGroup) closeConv()
          }}
        />
      )}

      {/* ── Group: pick a member to block/report (Apple 1.2) ── */}
      {memberActionsOpen && openConv && (
        <div
          onClick={() => setMemberActionsOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: 'var(--bg)',
              borderTop: '1px solid var(--fg-15)', borderRadius: '16px 16px 0 0',
              padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <p style={{ margin: '0 0 4px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
              Block or report a member
            </p>
            {openConv.members.map(m => (
              <button
                key={m.id}
                onClick={() => { setActionUser({ id: m.id, username: m.username }); setMemberActionsOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '12px 14px', borderRadius: 10, border: '1px solid var(--fg-15)',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <Diamond diamondUrl={m.avatar_diamond_url} fallbackUrl={m.avatar_url} size={28} />
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                  @{m.username ?? 'user'}
                </span>
              </button>
            ))}
            <button
              onClick={() => setMemberActionsOpen(false)}
              style={{ padding: 13, borderRadius: 10, border: '1px solid var(--fg-15)', background: 'none', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 4 }}
            >
              Cancel
            </button>
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
