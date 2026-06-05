import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Diamond } from '@/components/Diamond'
import { PlasterHeader } from '@/components/PlasterHeader'
import { GifMessage } from '@/components/GifMessage'
import { useUserBlocks } from '@/hooks/useUserBlocks'
import { useUserMutes } from '@/hooks/useUserMutes'
import { AccountProfile } from '@/components/AccountProfile'
import { publishSpineState } from '@/lib/lineupSpine'
import { SoldOutChip } from '@/components/SoldOutChip'

// ── Spine tunable constants ────────────────────────────────────────────────
const SPINE_MAX_H = 30  // px — max slice height; below this the line doesn't reach the bottom
const SPINE_GAP   = 6   // px — must match gap: in the spine JSX

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string
  kind: 'rsvp' | 'like' | 'venue_post' | 'wall_post' | 'venue_show'
  actor: {
    id: string
    name: string
    avatar_diamond_url: string | null
    avatar_url: string | null
    banner_url: string | null
    diamond_focal_x: number | null
    diamond_focal_y: number | null
    type: 'friend' | 'venue'
    account_type: string | null
  }
  event: {
    id: string
    title: string
    starts_at: string
    poster_url: string | null
    venue_name: string
  } | null
  body: string | null
  media_url: string | null
  media_type: string | null
  created_at: string
  sourceId: string
  likeCount: number
  viewerHasLiked: boolean
}

interface LineupItem { id: string; title: string; venue: string; starts_at: string; poster_url: string | null; color: string; sold_out?: boolean }
interface PanelEntry { type: 'venue' | 'artist' | 'friend'; id: string; name: string; color: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso), h = d.getHours(), m = d.getMinutes(), h12 = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

// ── Portland-time helpers for venue_show rows ─────────────────────────────

const DAY_NAMES_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function ptDateParts(d: Date) {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => raw.find(p => p.type === t)?.value ?? ''
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'))
  return { year: +get('year'), month: +get('month'), day: +get('day'), dow }
}

function ptMondayKey(d: Date): string {
  const { year, month, day, dow } = ptDateParts(d)
  const local = new Date(year, month - 1, day)
  local.setDate(local.getDate() - (dow === 0 ? 6 : dow - 1))
  return `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`
}

function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  return (['th','st','nd','rd'] as const)[n % 10] ?? 'th'
}

function venueShowLead(startsAt: string): { lead: string; detail: string } {
  const d = new Date(startsAt)
  const { day, dow } = ptDateParts(d)
  const weekDiff = Math.round(
    (new Date(ptMondayKey(d)).getTime() - new Date(ptMondayKey(new Date())).getTime()) /
    (7 * 24 * 60 * 60 * 1000)
  )
  let lead: string
  if (weekDiff === 0) {
    lead = `this ${DAY_NAMES_FULL[dow]}`
  } else if (weekDiff === 1) {
    lead = `next ${DAY_NAMES_FULL[dow]}`
  } else {
    const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short' }).format(d)
    lead = `${DAY_NAMES_SHORT[dow]}, ${monthShort} ${day}`
  }
  const monthLong = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'long' }).format(d)
  const timeStr  = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
  return { lead, detail: `${monthLong} ${day}${ordinalSuffix(day)} · ${timeStr}` }
}

// Parses body text and wraps @-mentions in a medium-bold span.
function renderBodyWithMentions(body: string): React.ReactNode {
  const parts = body.split(/(@[A-Za-z0-9_.]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} style={{ fontWeight: 500, color: 'var(--fg)', fontStyle: 'normal' }}>
          {part}
        </span>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

// ── Shared sub-components ──────────────────────────────────────────────────


function ActivityHeart({ isLiked, onToggle }: { isLiked: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '4px 4px',
        cursor: 'pointer',
        userSelect: 'none',
        color: isLiked ? '#A855F7' : 'var(--fg-40)',
        flexShrink: 0,
      }}
    >
      <svg width="14" height="13" viewBox="0 0 24 22"
        fill={isLiked ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21C12 21 2 13.5 2 7a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-10 14-10 14z" />
      </svg>
    </div>
  )
}

function LineupRow({ item, highlighted, onTap }: { item: LineupItem; highlighted?: boolean; onTap?: () => void }) {
  return (
    <div
      data-event-id={item.id}
      onClick={onTap}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--fg-08)', background: highlighted ? 'rgba(255, 220, 180, 0.4)' : 'transparent', transition: 'background 0.4s ease', cursor: onTap ? 'pointer' : 'default' }}
    >
      <div style={{ width: 36, height: 54, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: item.color, position: 'relative' }}>
        {item.poster_url && <img src={item.poster_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{item.title}</p>
          {item.sold_out && <SoldOutChip />}
        </div>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{item.venue} · {fmtTime(item.starts_at)}</p>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-25)', margin: '1px 0 0 0' }}>{fmtDate(item.starts_at)}</p>
      </div>
    </div>
  )
}

// ── Calendar helpers ───────────────────────────────────────────────────────

function buildMonthGrid(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: (Date | null)[] = []
  for (let i = 0; i < firstDay.getDay(); i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function LineUpScreen() {
  const { user } = useAuth()
  const { blockedIds } = useUserBlocks()
  const { mutedIds } = useUserMutes()
  const navigate = useNavigate()
  const [feed,       setFeed]       = useState<FeedItem[]>([])
  const [feedState,  setFeedState]  = useState<'loading' | 'ready'>('loading')
  const [lineup,     setLineup]     = useState<LineupItem[]>([])
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelStack, setPanelStack] = useState<PanelEntry[]>([])
  const [displayMonth, setDisplayMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(new Set())
  const panelListRef    = useRef<HTMLDivElement>(null)
  const spineContainerRef = useRef<HTMLDivElement>(null)

  const pushPanel = (e: PanelEntry) => setPanelStack(prev => [...prev, e])
  const popPanel  = () => setPanelStack(prev => prev.slice(0, -1))

  async function toggleActivityLike(item: FeedItem) {
    if (item.kind === 'like') return
    if (!user) return

    const newLiked = !item.viewerHasLiked
    const delta = newLiked ? 1 : -1

    setFeed(prev => prev.map(f =>
      f.id === item.id
        ? { ...f, viewerHasLiked: newLiked, likeCount: Math.max(0, f.likeCount + delta) }
        : f
    ))

    const { error } = newLiked
      ? await supabase.rpc('like_activity',   { in_activity_type: item.kind, in_source_id: item.sourceId })
      : await supabase.rpc('unlike_activity', { in_activity_type: item.kind, in_source_id: item.sourceId })

    if (error) {
      setFeed(prev => prev.map(f =>
        f.id === item.id
          ? { ...f, viewerHasLiked: item.viewerHasLiked, likeCount: item.likeCount }
          : f
      ))
      console.error('toggleActivityLike failed:', error)
    }
  }
  const topPanel  = panelStack[panelStack.length - 1] ?? null

  const eventsByDate = useMemo(() => {
    const map = new Map<string, LineupItem[]>()
    for (const item of lineup) {
      const key = toDateKey(new Date(item.starts_at))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [lineup])

  function highlightDate(date: Date) {
    const events = eventsByDate.get(toDateKey(date)) ?? []
    setHighlightedEventIds(new Set(events.map(e => e.id)))
    if (events.length > 0) {
      setTimeout(() => {
        const el = panelListRef.current?.querySelector(`[data-event-id="${events[0].id}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
    }
    setTimeout(() => setHighlightedEventIds(new Set()), 2000)
  }

  function focusLineupItem(item: LineupItem) {
    const d = new Date(item.starts_at)
    setDisplayMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setHighlightedEventIds(new Set([item.id]))
    setPanelOpen(true)
    // scroll after panel slide-in (350ms transition)
    setTimeout(() => {
      const el = panelListRef.current?.querySelector(`[data-event-id="${item.id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 400)
    setTimeout(() => setHighlightedEventIds(new Set()), 2400)
  }

  // ── Real feed fetch ──────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    if (!user) return
    setFeedState('loading')

    const [{ data, error }, { data: showsData }] = await Promise.all([
      supabase.rpc('activity_feed', { page_size: 50 }),
      (supabase.rpc as any)('lineup_open_weekend_shows', { p_user: user.id, p_limit: 12 }),
    ])

    if (error) {
      console.error('[LineUpScreen] activity_feed RPC error:', error)
      setFeed([])
      setFeedState('ready')
      return
    }

    if (!Array.isArray(data)) {
      setFeed([])
      setFeedState('ready')
      return
    }

    // Filter out blocked + muted actors. RLS doesn't apply to SECURITY DEFINER RPCs,
    // so we filter client-side. blockedIds / mutedIds are managed by useUserBlocks/Mutes.
    const filtered = (data as any[]).filter(row =>
      !blockedIds.has(row.actor_id) && !mutedIds.has(row.actor_id)
    )

    // Adapt flat RPC shape to existing nested FeedItem shape so existing render code keeps working
    const adapted: FeedItem[] = filtered.map(row => ({
      id: `${row.activity_type}-${row.source_id}`,
      kind: row.activity_type as FeedItem['kind'],
      actor: {
        id: row.actor_id,
        name: row.actor_username ?? '',
        avatar_diamond_url: row.actor_avatar_diamond_url ?? null,
        avatar_url: null,
        banner_url: null,
        diamond_focal_x: null,
        diamond_focal_y: null,
        // venues and artists both render with the larger diamond at left edge;
        // persons get the smaller indented diamond. Map account_type to the legacy 'venue'/'friend' divide.
        type: (row.actor_account_type === 'venue' || row.actor_account_type === 'artist') ? 'venue' : 'friend',
        account_type: row.actor_account_type ?? null,
      },
      event: row.target_event_id ? {
        id: row.target_event_id,
        title: row.target_event_title ?? '',
        starts_at: row.target_event_starts_at ?? '',
        poster_url: row.target_event_poster_url ?? null,
        venue_name: '',
      } : null,
      body: row.body_preview ?? null,
      media_url: row.media_url ?? null,
      media_type: row.media_type ?? null,
      created_at: row.created_at,
      sourceId: row.source_id,
      likeCount: row.like_count ?? 0,
      viewerHasLiked: row.viewer_has_liked ?? false,
    }))

    // Map open-weekend venue shows into synthetic feed items
    const showItems: FeedItem[] = ((showsData ?? []) as any[]).map(row => ({
      id: `venueshow-${row.event_id}`,
      kind: 'venue_show' as const,
      actor: {
        id: row.venue_account_id,
        name: row.venue_name,
        avatar_diamond_url: row.venue_diamond_url ?? null,
        avatar_url: null,
        banner_url: null,
        diamond_focal_x: null,
        diamond_focal_y: null,
        type: 'venue' as const,
        account_type: 'venue',
      },
      event: {
        id: row.event_id,
        title: row.title,
        starts_at: row.starts_at,
        poster_url: row.poster_url ?? null,
        venue_name: row.venue_name,
      },
      body: null,
      media_url: null,
      media_type: null,
      created_at: row.starts_at,
      sourceId: row.event_id,
      likeCount: 0,
      viewerHasLiked: false,
    }))

    // Weave venue shows into the activity feed at ~1 per 4 items
    const woven: FeedItem[] = []
    let showIdx = 0
    adapted.forEach((item, i) => {
      woven.push(item)
      if ((i + 1) % 4 === 0 && showIdx < showItems.length) {
        woven.push(showItems[showIdx++])
      }
    })
    while (showIdx < showItems.length) woven.push(showItems[showIdx++])

    setFeed(woven)
    setFeedState('ready')
  }, [user, blockedIds, mutedIds])

  useEffect(() => {
    if (!user) return
    fetchFeed()

    // Realtime: refetch when source tables change. Four channels because postgres_changes
    // doesn't support OR filters, and we care about all four source tables.
    const channels = [
      supabase.channel(`lineup-feed-attendees-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendees' }, () => fetchFeed())
        .subscribe(),
      supabase.channel(`lineup-feed-wall-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_wall_posts' }, () => fetchFeed())
        .subscribe(),
      supabase.channel(`lineup-feed-likes-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_likes' }, () => fetchFeed())
        .subscribe(),
      supabase.channel(`lineup-feed-follows-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, () => fetchFeed())
        .subscribe(),
    ]

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [user, fetchFeed])

  // ── Personal lineup (real RSVPs, falls back to mock) ─────────────────────
  useEffect(() => {
    if (!user) return
    const now = new Date().toISOString()
    supabase.from('attendees').select('event_id, events(id, title, starts_at, poster_url, sold_out, venues(name))').eq('user_id', user.id)
      .then(({ data }) => {
        const items: LineupItem[] = ((data ?? []) as any[]).filter(r => r.events?.starts_at >= now)
          .map(r => { const ev = r.events as any; return { id: r.event_id, title: ev.title ?? 'Event', venue: ev.venues?.name ?? '', starts_at: ev.starts_at, poster_url: ev.poster_url ?? null, color: '#2e1065', sold_out: ev.sold_out ?? false } })
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        setLineup(items)
      })
  }, [user?.id])

  // Publish spine state (count + reachesBottom) for BottomNav YOU icon
  useEffect(() => {
    const n = lineup.length
    if (n === 0) { publishSpineState(0, false); return }
    const el = spineContainerRef.current
    if (!el) { publishSpineState(n, false); return }
    const compute = () => {
      const naturalH = n * SPINE_MAX_H + (n - 1) * SPINE_GAP
      publishSpineState(n, naturalH >= el.clientHeight)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [lineup.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      <PlasterHeader actions={
        <button
          onClick={() => setPanelOpen(v => !v)}
          aria-label={panelOpen ? 'Close set list' : 'Open set list'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: panelOpen ? 'var(--fg)' : 'var(--fg-55)',
            transition: 'color 0.2s',
          }}
        >
          <span style={{
            fontFamily: 'Barlow Condensed, sans-serif',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            SET LIST
          </span>
          <span
            style={{
              width: 16,
              height: 14,
              position: 'relative',
              display: 'inline-block',
            }}
          >
            {[0, 1, 2, 3].map(i => {
              const lineHeight = 1.5
              const gap = 2
              const defaultTop = i * (lineHeight + gap)
              const closedStyle: React.CSSProperties = {
                top: defaultTop,
                left: 0,
                width: '100%',
                opacity: 1,
                transform: 'rotate(0deg)',
              }
              const openStyle: React.CSSProperties =
                i === 0 ? { top: 6, left: 0, width: '100%', opacity: 1, transform: 'rotate(45deg)' }
                : i === 3 ? { top: 6, left: 0, width: '100%', opacity: 1, transform: 'rotate(-45deg)' }
                : { top: defaultTop, left: 0, width: '100%', opacity: 0, transform: 'rotate(0deg)' }
              const s = panelOpen ? openStyle : closedStyle
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    height: lineHeight,
                    background: 'currentColor',
                    transformOrigin: 'center',
                    transition: 'top 0.25s ease, opacity 0.2s ease, transform 0.25s ease',
                    ...s,
                  }}
                />
              )
            })}
          </span>
        </button>
      } />

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Poster-slice spine — fixed track (top→bottom of feed area) */}
        {lineup.length > 0 && (
          <div ref={spineContainerRef} style={{ position: 'absolute', right: 20, top: 0, bottom: 0, width: 8, zIndex: 5, display: 'flex', flexDirection: 'column' }}>

            {/* Slices fill from top; maxHeight caps each slice so with few nights the line
                doesn't reach the bottom. Once count grows enough to overflow maxHeight,
                flex shrinks them to fit — they always fill exactly to the bottom. */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: SPINE_GAP }}>
              {lineup.map(item => (
                <div
                  key={item.id}
                  onClick={() => focusLineupItem(item)}
                  style={{
                    flex: 1, minHeight: 0, maxHeight: SPINE_MAX_H, width: '100%', cursor: 'pointer',
                    backgroundColor: item.color,
                    backgroundImage: item.poster_url ? `url(${item.poster_url})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
              ))}
            </div>

          </div>
        )}

        {/* Feed */}
        <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
          {feedState === 'loading' && (
            <p style={{ margin: 0, padding: '40px 20px', textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
              Loading…
            </p>
          )}

          {feedState === 'ready' && feed.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, color: 'var(--fg-55)', lineHeight: 1.5 }}>
                Follow venues and people to see their activity here
              </p>
              <p style={{ margin: '8px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>
                Browse venues on the Map · Find people on your profile
              </p>
            </div>
          )}

          {feedState === 'ready' && feed.map((item, i) => (
            <React.Fragment key={item.id}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  paddingTop: 9, paddingBottom: 9, paddingRight: 46,
                  paddingLeft: item.actor.type === 'venue' ? 14 : 28,
                }}
              >
                <div
                  onClick={() => pushPanel({ type: item.actor.type, id: item.actor.id, name: item.actor.name, color: '#2e1065' })}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                >
                  <Diamond
                    size={item.actor.type === 'venue' ? 36 : 26}
                    diamondUrl={item.actor.type === 'venue' ? (item.actor.banner_url ?? item.actor.avatar_diamond_url) : item.actor.avatar_diamond_url}
                    fallbackUrl={item.actor.avatar_url}
                    focalX={item.actor.diamond_focal_x}
                    focalY={item.actor.diamond_focal_y}
                  />
                </div>
                <div style={{ flex: 1, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.35 }}>
                  <>
                    <span
                      onClick={() => pushPanel({ type: item.actor.type, id: item.actor.id, name: item.actor.name, color: '#2e1065' })}
                      style={{ color: 'var(--fg)', fontWeight: 600, cursor: 'pointer', textDecoration: item.actor.type === 'venue' ? 'underline' : 'none' }}
                    >{item.actor.name}</span>
                  </>
                  {item.kind === 'rsvp' && (
                    <> is going to <span onClick={() => item.event && navigate('/', { state: { openEventId: item.event.id } })} style={{ fontWeight: 500, color: 'var(--fg)', cursor: 'pointer' }}>{item.event?.title}</span></>
                  )}
                  {item.kind === 'like' && (
                    <> liked <span onClick={() => item.event && navigate('/', { state: { openEventId: item.event.id } })} style={{ fontWeight: 500, color: 'var(--fg)', cursor: 'pointer' }}>{item.event?.title}</span></>
                  )}
                  {item.kind === 'venue_post' && (
                    <>
                      {item.body && <>: <span style={{ color: 'var(--fg-65)', fontStyle: 'italic' }}>{renderBodyWithMentions(item.body)}</span></>}
                      {item.media_url && item.media_type === 'gif' && (
                        <div style={{ marginTop: 4 }}><GifMessage url={item.media_url} maxWidth={140} /></div>
                      )}
                    </>
                  )}
                  {item.kind === 'wall_post' && (
                    <>
                      {' posted on '}
                      <span onClick={() => item.event && navigate('/', { state: { openEventId: item.event.id } })} style={{ fontWeight: 500, color: 'var(--fg)', cursor: 'pointer' }}>{item.event?.title}</span>
                      {item.body && (
                        <>: <span style={{ color: 'var(--fg-65)', fontStyle: 'italic' }}>{renderBodyWithMentions(item.body)}</span></>
                      )}
                      {item.media_url && item.media_type === 'gif' && (
                        <div style={{ marginTop: 4 }}><GifMessage url={item.media_url} maxWidth={140} /></div>
                      )}
                    </>
                  )}
                  {item.kind === 'venue_show' && item.event && (() => {
                    const { lead, detail } = venueShowLead(item.event.starts_at)
                    return (
                      <>
                        {' '}
                        <span
                          onClick={() => navigate('/', { state: { openEventId: item.event!.id } })}
                          style={{ fontWeight: 600, color: 'var(--fg)', cursor: 'pointer' }}
                        >{item.event.title}</span>
                        <span style={{ display: 'block', marginTop: 2 }}>
                          <span style={{ fontWeight: 500, color: 'var(--fg)' }}>{lead}</span>
                          <span style={{ color: 'var(--fg-55)', fontStyle: 'italic', fontSize: 11 }}>{' · '}{detail}</span>
                        </span>
                      </>
                    )
                  })()}
                </div>
                {item.kind !== 'like' && item.kind !== 'venue_show' && (
                  <ActivityHeart
                    isLiked={item.viewerHasLiked}
                    onToggle={() => toggleActivityLike(item)}
                  />
                )}
              </div>
              {(i + 1) % 4 === 0 && <div style={{ height: 1, background: 'rgba(128,128,128,0.15)', margin: '0 14px' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* LINE UP panel — slides from RIGHT */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'var(--bg)', zIndex: 10, display: 'flex', flexDirection: 'column', transform: panelOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)' }}>
            <div>
              <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0 }}>Your Set List</p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{lineup.length} upcoming</p>
            </div>
            <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--fg-40)', padding: '4px 8px', lineHeight: 1 }}>×</button>
          </div>
          <div ref={panelListRef} style={{ flex: 1, overflowY: 'auto' }}>
            {lineup.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, lineHeight: 1.5 }}>
                <p style={{ margin: 0 }}>No upcoming shows yet.</p>
                <p style={{ margin: '8px 0 0', color: 'var(--fg-40)' }}>Tap a poster on the wall to add it to your lineup.</p>
              </div>
            ) : (
              lineup.map(item => <LineupRow key={item.id} item={item} highlighted={highlightedEventIds.has(item.id)} onTap={() => navigate('/', { state: { openEventId: item.id } })} />)
            )}

            {/* Calendar */}
            <div style={{ borderTop: '1px solid var(--fg-15)', padding: '12px 16px' }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button onClick={() => setDisplayMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 16, color: 'var(--fg-55)' }}>◀</button>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                  {displayMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setDisplayMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 16, color: 'var(--fg-55)' }}>▶</button>
              </div>
              {/* Weekday headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700 }}>{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {buildMonthGrid(displayMonth).map((day, i) => {
                  if (!day) return <div key={i} />
                  const key = toDateKey(day)
                  const hasEvents = eventsByDate.has(key)
                  const today = new Date()
                  const isToday = day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate()
                  return (
                    <button key={i} onClick={() => hasEvents && highlightDate(day)} style={{ aspectRatio: '1', background: 'transparent', border: isToday ? '1px solid var(--fg-55)' : 'none', borderRadius: 6, cursor: hasEvents ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 0, position: 'relative', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: isToday ? 700 : 400 }}>
                      {day.getDate()}
                      {hasEvents && <div style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: '50%', background: 'var(--fg)' }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Profile panels — slide from LEFT */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'var(--bg)', zIndex: 20, transform: panelStack.length > 0 ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
          {topPanel?.type === 'venue' && (
            <div key={`venue-${topPanel.id}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                paddingTop: 'max(14px, env(safe-area-inset-top))',
                paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
                flexShrink: 0, borderBottom: '1px solid var(--fg-08)',
              }}>
                <button onClick={popPanel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                  BACK
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <AccountProfile accountProfileId={topPanel.id} />
              </div>
            </div>
          )}
          {topPanel?.type === 'artist' && (
            <div key={`artist-${topPanel.id}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                paddingTop: 'max(14px, env(safe-area-inset-top))',
                paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
                flexShrink: 0, borderBottom: '1px solid var(--fg-08)',
              }}>
                <button onClick={popPanel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                  BACK
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <AccountProfile accountProfileId={topPanel.id} />
              </div>
            </div>
          )}
          {topPanel?.type === 'friend' && (
            <div key={`friend-${topPanel.id}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                paddingTop: 'max(14px, env(safe-area-inset-top))',
                paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
                flexShrink: 0, borderBottom: '1px solid var(--fg-08)',
              }}>
                <button onClick={popPanel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                  BACK
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <AccountProfile accountProfileId={topPanel.id} />
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  )
}
