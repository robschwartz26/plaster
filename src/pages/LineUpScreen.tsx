import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { AvatarFullscreen } from '@/components/AvatarFullscreen'
import { Diamond } from '@/components/Diamond'
import { PlasterHeader } from '@/components/PlasterHeader'
import { createOrGetConversation } from '@/lib/messaging'

// ── Mock lineup (fallback for personal panel when user has zero RSVPs) ─────

const mockLineup = [
  { id: 'ml1', title: 'Low Bar Chorale',               venue: 'Showbar',             starts_at: '2026-04-18T20:00:00', poster_url: null, color: '#4c1d95' },
  { id: 'ml2', title: 'Stumpfest XI',                  venue: 'Mississippi Studios',  starts_at: '2026-04-19T19:00:00', poster_url: null, color: '#3730a3' },
  { id: 'ml3', title: 'Weird Nightmare',               venue: 'Polaris Hall',         starts_at: '2026-04-22T20:00:00', poster_url: null, color: '#0c4a6e' },
  { id: 'ml4', title: 'Laffy Taffy: Freaknik Edition', venue: 'Holocene',             starts_at: '2026-04-25T22:00:00', poster_url: null, color: '#7c2d12' },
  { id: 'ml5', title: 'Babes in Canyon',               venue: 'Holocene',             starts_at: '2026-04-26T20:00:00', poster_url: null, color: '#365314' },
  { id: 'ml6', title: 'Marshall Crenshaw',             venue: 'Polaris Hall',         starts_at: '2026-04-28T19:30:00', poster_url: null, color: '#1e3a5f' },
]

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string
  kind: 'rsvp' | 'like' | 'venue_post'
  actor: {
    id: string
    name: string
    avatar_diamond_url: string | null
    avatar_url: string | null
    banner_url: string | null
    diamond_focal_x: number | null
    diamond_focal_y: number | null
    type: 'friend' | 'venue'
  }
  event: {
    id: string
    title: string
    starts_at: string
    poster_url: string | null
    venue_name: string
  } | null
  body: string | null
  created_at: string
}

interface LineupItem { id: string; title: string; venue: string; starts_at: string; poster_url: string | null; color: string }
interface PanelEntry { type: 'venue' | 'artist' | 'friend'; name: string; color: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso), h = d.getHours(), m = d.getMinutes(), h12 = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

const btnPrimary: React.CSSProperties   = { flex: 1, padding: '11px 0', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { flex: 1, padding: '11px 0', background: 'transparent', color: 'var(--fg-55)', border: '1px solid var(--fg-18)', borderRadius: 6, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, cursor: 'pointer' }

// ── Shared sub-components ──────────────────────────────────────────────────

function DiamondImg({ color, posterUrl, size = 28, onTap }: { color: string; posterUrl: string | null; size?: number; onTap?: () => void }) {
  return (
    <div onClick={onTap} style={{ width: size, height: size, background: color, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', flexShrink: 0, overflow: 'hidden', position: 'relative', cursor: onTap ? 'pointer' : 'default' }}>
      {posterUrl && <img src={posterUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />}
    </div>
  )
}

function PanelHeader({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)', position: 'relative' }}>
      <button onClick={onBack} style={{ position: 'absolute', left: 16, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', color: 'var(--fg-55)', padding: 0 }}>
        ← BACK
      </button>
      <span style={{ flex: 1, textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 60px' }}>
        {name}
      </span>
    </div>
  )
}

function LineupRow({ item, highlighted }: { item: LineupItem; highlighted?: boolean }) {
  return (
    <div
      data-event-id={item.id}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--fg-08)', background: highlighted ? 'rgba(255, 220, 180, 0.4)' : 'transparent', transition: 'background 0.4s ease' }}
    >
      <div style={{ width: 36, height: 54, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: item.color, position: 'relative' }}>
        {item.poster_url && <img src={item.poster_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{item.venue} · {fmtTime(item.starts_at)}</p>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-25)', margin: '1px 0 0 0' }}>{fmtDate(item.starts_at)}</p>
      </div>
    </div>
  )
}

// ── Venue panel ────────────────────────────────────────────────────────────

function VenuePanel({ entry, onBack }: { entry: PanelEntry; onBack: () => void; onPush: (e: PanelEntry) => void }) {
  const navigate = useNavigate()
  const [venue, setVenue] = useState<any>(null)
  const [evts,  setEvts]  = useState<any[]>([])

  useEffect(() => {
    supabase.from('venues').select('id, name, neighborhood, cover_url').ilike('name', `%${entry.name}%`).limit(1)
      .then(({ data }) => {
        const v = data?.[0]; if (!v) return
        setVenue(v)
        supabase.from('events').select('id, title, starts_at, poster_url').eq('venue_id', v.id)
          .gte('starts_at', new Date().toISOString()).order('starts_at').limit(10)
          .then(({ data: e }) => { if (e) setEvts(e) })
      })
  }, [entry.name])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PanelHeader name={venue?.name ?? entry.name} onBack={onBack} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 16px', flexShrink: 0 }}>
        <DiamondImg color={entry.color} posterUrl={venue?.cover_url ?? null} size={80} />
        <p style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 20, color: 'var(--fg)', margin: '12px 0 0 0', textAlign: 'center' }}>
          {venue?.name ?? entry.name}
        </p>
        {venue?.neighborhood && (
          <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '4px 0 0 0' }}>
            {venue.neighborhood}
          </p>
        )}
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-30)', margin: '4px 0 0 0' }}>
          {evts.length} upcoming {evts.length === 1 ? 'show' : 'shows'}
        </p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--fg-08)' }}>
        {evts.length === 0 && (
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-40)', padding: '16px', margin: 0 }}>No upcoming events</p>
        )}
        {evts.map(ev => (
          <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--fg-08)' }}>
            <div style={{ width: 30, height: 45, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: entry.color, position: 'relative' }}>
              {ev.poster_url && <img src={ev.poster_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
              <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{fmtDate(ev.starts_at)} · {fmtTime(ev.starts_at)}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0, borderTop: '1px solid var(--fg-08)' }}>
        <button style={btnPrimary}>Follow</button>
        <button style={btnSecondary} onClick={() => navigate('/msg')}>Message</button>
      </div>
    </div>
  )
}

// ── Artist panel ───────────────────────────────────────────────────────────

function ArtistPanel({ entry, onBack }: { entry: PanelEntry; onBack: () => void; onPush: (e: PanelEntry) => void }) {
  const navigate = useNavigate()
  const [shows, setShows] = useState<any[]>([])

  useEffect(() => {
    supabase.from('events').select('id, title, starts_at, poster_url, venues(name)').ilike('title', `%${entry.name}%`)
      .gte('starts_at', new Date().toISOString()).order('starts_at').limit(10)
      .then(({ data }) => { if (data) setShows(data) })
  }, [entry.name])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PanelHeader name={entry.name} onBack={onBack} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 16px', flexShrink: 0 }}>
        <DiamondImg color={entry.color} posterUrl={null} size={80} />
        <p style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 20, color: 'var(--fg)', margin: '12px 0 0 0', textAlign: 'center' }}>
          {entry.name}
        </p>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '4px 0 0 0' }}>
          Artist
        </p>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-30)', margin: '4px 0 0 0' }}>
          {shows.length} upcoming Portland {shows.length === 1 ? 'show' : 'shows'}
        </p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--fg-08)' }}>
        {shows.length === 0 && (
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-40)', padding: '16px', margin: 0 }}>No upcoming Portland shows found</p>
        )}
        {shows.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--fg-08)' }}>
            <div style={{ width: 30, height: 45, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: entry.color, position: 'relative' }}>
              {s.poster_url && <img src={s.poster_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
              <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '2px 0 0 0' }}>
                {(s.venues as any)?.name ?? ''} · {fmtDate(s.starts_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0, borderTop: '1px solid var(--fg-08)' }}>
        <button style={btnPrimary}>Follow</button>
        <button style={btnSecondary} onClick={() => navigate('/msg')}>Message</button>
      </div>
    </div>
  )
}

// ── Friend panel ───────────────────────────────────────────────────────────

function FriendPanel({ entry, onBack }: { entry: PanelEntry; onBack: () => void; onPush: (e: PanelEntry) => void }) {
  const navigate = useNavigate()
  const [avatarFullscreenId, setAvatarFullscreenId] = useState<string | null>(null)
  const [profile,        setProfile]        = useState<any>(null)
  const [posters,        setPosters]        = useState<{ url: string; title: string }[]>([])
  const [followerCount,  setFollowerCount]  = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [attendedCount,  setAttendedCount]  = useState(0)
  const [superlatives,   setSuperlatives]   = useState<string[]>([])

  useEffect(() => {
    supabase.from('profiles').select('id, username, avatar_url, avatar_diamond_url, bio').ilike('username', `%${entry.name}%`).limit(1)
      .then(({ data }) => {
        const p = data?.[0]; if (!p) return
        setProfile(p)
        supabase.from('attendees').select('events(poster_url, title)').eq('user_id', p.id).limit(12)
          .then(({ data: a }) => {
            if (a) {
              const items = (a as any[]).map(r => ({ url: r.events?.poster_url, title: r.events?.title ?? '' })).filter(r => r.url)
              setPosters(items)
              setAttendedCount(items.length)
            }
          })
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', p.id).eq('status', 'accepted')
          .then(({ count }) => setFollowerCount(count ?? 0))
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', p.id).eq('status', 'accepted')
          .then(({ count }) => setFollowingCount(count ?? 0))
        supabase.from('superlatives').select('title').eq('user_id', p.id).limit(6)
          .then(({ data: s }) => { if (s) setSuperlatives((s as any[]).map(r => r.title)) })
      })
  }, [entry.name])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PanelHeader name={profile?.username ? `@${profile.username}` : entry.name} onBack={onBack} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 16px', flexShrink: 0 }}>
        <Diamond
            diamondUrl={profile?.avatar_diamond_url ?? null}
            fallbackUrl={profile?.avatar_url ?? null}
            size={80}
            onClick={() => profile?.id && setAvatarFullscreenId(profile.id)}
          />
        <p style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 20, color: 'var(--fg)', margin: '12px 0 0 0' }}>
          @{profile?.username ?? entry.name}
        </p>
        <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '4px 0 0 0' }}>
          {followerCount} followers · {followingCount} following · {attendedCount} attended
        </p>
        {profile?.bio && (
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: '8px 16px 0', textAlign: 'center', lineHeight: 1.4 }}>
            {profile.bio}
          </p>
        )}
        {superlatives.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' }}>
            {superlatives.map((s, i) => (
              <span key={i} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A855F7', border: '1px solid #A855F7', borderRadius: 20, padding: '3px 10px' }}>
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--fg-08)' }}>
        {posters.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, padding: '2px' }}>
            {posters.map((p, i) => (
              <div key={i} style={{ aspectRatio: '2/3', borderRadius: 2, overflow: 'hidden', position: 'relative', background: entry.color }}>
                <img src={p.url} alt={p.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-40)', padding: '16px', margin: 0 }}>No attended events found</p>
        )}
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0, borderTop: '1px solid var(--fg-08)' }}>
        <button style={btnPrimary}>Follow</button>
        <button
          style={btnSecondary}
          onClick={async () => {
            if (!profile?.id) return
            const convId = await createOrGetConversation(profile.id)
            if (convId) navigate('/msg', { state: { openConversationId: convId } })
          }}
        >Message</button>
      </div>
      {avatarFullscreenId && (
        <AvatarFullscreen userId={avatarFullscreenId} onClose={() => setAvatarFullscreenId(null)} />
      )}
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
  const [feed,       setFeed]       = useState<FeedItem[]>([])
  const [feedState,  setFeedState]  = useState<'loading' | 'ready'>('loading')
  const [lineup,     setLineup]     = useState<LineupItem[]>(mockLineup)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelStack, setPanelStack] = useState<PanelEntry[]>([])
  const [displayMonth, setDisplayMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(new Set())
  const panelListRef = useRef<HTMLDivElement>(null)

  const pushPanel = (e: PanelEntry) => setPanelStack(prev => [...prev, e])
  const popPanel  = () => setPanelStack(prev => prev.slice(0, -1))
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

  // ── Real feed fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    async function fetchFeed() {
      setFeedState('loading')
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

      // Step A: IDs to query against
      const [{ data: myFollows }, { data: myVenueFollows }] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user!.id).eq('status', 'accepted'),
        supabase.from('venue_follows').select('venue_id').eq('user_id', user!.id),
      ])

      const followedUserIds  = (myFollows ?? []).map((f: any) => f.following_id)
      const followedVenueIds = (myVenueFollows ?? []).map((v: any) => v.venue_id)

      // Step B: three sources in parallel, skipping empty ID lists
      const rsvpsPromise = followedUserIds.length
        ? supabase.from('attendees')
            .select('id, created_at, user_id, profiles(id, username, avatar_diamond_url, avatar_url), events(id, title, starts_at, poster_url, venue_id, venues(name))')
            .in('user_id', followedUserIds)
            .gte('created_at', fourteenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] as any[] })

      const likesPromise = followedUserIds.length
        ? supabase.from('event_likes')
            .select('id, created_at, user_id, profiles(id, username, avatar_diamond_url, avatar_url), events(id, title, starts_at, poster_url, venue_id, venues(name))')
            .in('user_id', followedUserIds)
            .gte('created_at', fourteenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] as any[] })

      const venuePostsPromise = followedVenueIds.length
        ? supabase.from('event_wall_posts')
            .select('id, created_at, body, events(id, title, starts_at, poster_url, venue_id, venues(id, name, avatar_url, banner_url, diamond_focal_x, diamond_focal_y))')
            .eq('is_venue_post', true)
            .not('body', 'is', null)
            .gte('created_at', fourteenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] as any[] })

      const [rsvpsRes, likesRes, venuePostsRes] = await Promise.all([rsvpsPromise, likesPromise, venuePostsPromise])

      // Step C: transform to FeedItem[]
      const rsvpItems: FeedItem[] = ((rsvpsRes.data ?? []) as any[])
        .filter(r => r.profiles && r.events)
        .map(r => ({
          id: `${r.id}-rsvp`,
          kind: 'rsvp',
          actor: {
            id: r.profiles.id,
            name: r.profiles.username ?? '',
            avatar_diamond_url: r.profiles.avatar_diamond_url ?? null,
            avatar_url: r.profiles.avatar_url ?? null,
            banner_url: null,
            diamond_focal_x: null,
            diamond_focal_y: null,
            type: 'friend',
          },
          event: {
            id: r.events.id,
            title: r.events.title,
            starts_at: r.events.starts_at,
            poster_url: r.events.poster_url ?? null,
            venue_name: r.events.venues?.name ?? '',
          },
          body: null,
          created_at: r.created_at,
        }))

      const likeItems: FeedItem[] = ((likesRes.data ?? []) as any[])
        .filter(r => r.profiles && r.events)
        .map(r => ({
          id: `${r.id}-like`,
          kind: 'like',
          actor: {
            id: r.profiles.id,
            name: r.profiles.username ?? '',
            avatar_diamond_url: r.profiles.avatar_diamond_url ?? null,
            avatar_url: r.profiles.avatar_url ?? null,
            banner_url: null,
            diamond_focal_x: null,
            diamond_focal_y: null,
            type: 'friend',
          },
          event: {
            id: r.events.id,
            title: r.events.title,
            starts_at: r.events.starts_at,
            poster_url: r.events.poster_url ?? null,
            venue_name: r.events.venues?.name ?? '',
          },
          body: null,
          created_at: r.created_at,
        }))

      const venuePostItems: FeedItem[] = ((venuePostsRes.data ?? []) as any[])
        .filter(r => r.events?.venues && followedVenueIds.includes(r.events.venue_id))
        .map(r => {
          const v = r.events.venues
          return {
            id: `${r.id}-venue_post`,
            kind: 'venue_post',
            actor: {
              id: v.id,
              name: v.name ?? '',
              avatar_diamond_url: null,
              avatar_url: v.avatar_url ?? null,
              banner_url: v.banner_url ?? null,
              diamond_focal_x: v.diamond_focal_x ?? null,
              diamond_focal_y: v.diamond_focal_y ?? null,
              type: 'venue',
            },
            event: {
              id: r.events.id,
              title: r.events.title,
              starts_at: r.events.starts_at,
              poster_url: r.events.poster_url ?? null,
              venue_name: v.name ?? '',
            },
            body: r.body ?? null,
            created_at: r.created_at,
          }
        })

      // Step D: merge, sort, dedupe, limit
      const seen = new Set<string>()
      const merged = [...rsvpItems, ...likeItems, ...venuePostItems]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true })
        .slice(0, 50)

      setFeed(merged)
      setFeedState('ready')
    }

    fetchFeed()
  }, [user])

  // ── Personal lineup (real RSVPs, falls back to mock) ─────────────────────
  useEffect(() => {
    if (!user) return
    const now = new Date().toISOString()
    supabase.from('attendees').select('event_id, events(id, title, starts_at, poster_url, venues(name))').eq('user_id', user.id)
      .then(({ data }) => {
        const items: LineupItem[] = ((data ?? []) as any[]).filter(r => r.events?.starts_at >= now)
          .map(r => { const ev = r.events as any; return { id: r.event_id, title: ev.title ?? 'Event', venue: ev.venues?.name ?? '', starts_at: ev.starts_at, poster_url: ev.poster_url ?? null, color: '#2e1065' } })
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        if (items.length > 0) setLineup(items)
      })
  }, [user])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      <PlasterHeader actions={
        <button
          onClick={() => setPanelOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', color: panelOpen ? 'var(--fg)' : 'var(--fg-40)', textTransform: 'uppercase', transition: 'color 0.2s' }}
        >
          {panelOpen ? 'LINE UP ×' : 'LINE UP'}
        </button>
      } />

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Diamond queue (right edge) */}
        {lineup.length > 0 && (() => {
          const queueCount = lineup.length
          const computedSize = Math.max(8, Math.min(34, Math.floor(400 / queueCount) - 4))
          const queueGap = Math.max(2, Math.min(8, Math.floor(computedSize / 4)))
          return (
            <div style={{ position: 'absolute', right: 10, top: 4, bottom: 4, display: 'flex', flexDirection: 'column', gap: queueGap, zIndex: 5, pointerEvents: 'none', justifyContent: 'flex-start' }}>
              {lineup.map((item, i) => (
                <DiamondImg key={item.id ?? i} color={item.color} posterUrl={item.poster_url} size={computedSize} />
              ))}
            </div>
          )
        })()}

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
                  paddingTop: 9, paddingBottom: 9, paddingRight: 50,
                  paddingLeft: item.actor.type === 'venue' ? 14 : 28,
                }}
              >
                <div
                  onClick={() => pushPanel({ type: item.actor.type, name: item.actor.name, color: '#2e1065' })}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                >
                  <Diamond
                    size={item.actor.type === 'venue' ? 36 : 26}
                    diamondUrl={item.actor.type === 'venue' ? item.actor.banner_url : item.actor.avatar_diamond_url}
                    fallbackUrl={item.actor.avatar_url}
                    focalX={item.actor.diamond_focal_x}
                    focalY={item.actor.diamond_focal_y}
                  />
                </div>
                <div style={{ flex: 1, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.35 }}>
                  <span
                    onClick={() => pushPanel({ type: item.actor.type, name: item.actor.name, color: '#2e1065' })}
                    style={{ color: 'var(--fg)', fontWeight: 600, cursor: 'pointer' }}
                  >{item.actor.name}</span>
                  {item.kind === 'rsvp'       && <> is going to {item.event?.title} at {item.event?.venue_name}</>}
                  {item.kind === 'like'       && <> liked {item.event?.title}</>}
                  {item.kind === 'venue_post' && <>: <span style={{ color: 'var(--fg-65)', fontStyle: 'italic' }}>{item.body}</span></>}
                </div>
              </div>
              {(i + 1) % 4 === 0 && <div style={{ height: 1, background: 'rgba(128,128,128,0.15)', margin: '0 14px' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* LINE UP panel — slides from RIGHT */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'var(--bg)', zIndex: 10, display: 'flex', flexDirection: 'column', transform: panelOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)' }}>
            <div>
              <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0 }}>Your Line Up</p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{lineup.length} upcoming</p>
            </div>
            <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--fg-40)', padding: '4px 8px', lineHeight: 1 }}>×</button>
          </div>
          <div ref={panelListRef} style={{ flex: 1, overflowY: 'auto' }}>
            {lineup.map(item => <LineupRow key={item.id} item={item} highlighted={highlightedEventIds.has(item.id)} />)}

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
          {topPanel?.type === 'venue'  && <VenuePanel  key={`venue-${topPanel.name}`}  entry={topPanel} onBack={popPanel} onPush={pushPanel} />}
          {topPanel?.type === 'artist' && <ArtistPanel key={`artist-${topPanel.name}`} entry={topPanel} onBack={popPanel} onPush={pushPanel} />}
          {topPanel?.type === 'friend' && <FriendPanel key={`friend-${topPanel.name}`} entry={topPanel} onBack={popPanel} onPush={pushPanel} />}
        </div>

      </div>

      <BottomNav />
    </div>
  )
}
