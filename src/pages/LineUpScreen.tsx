import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { PlasterHeader } from '@/components/PlasterHeader'

const IS_DEV = window.location.hostname === 'localhost'

// ── Types ──────────────────────────────────────────────────────────────────

type FeedType = 'going' | 'liked' | 'post' | 'superlative' | 'past_attended'
              | 'venue_shout' | 'artist_shout' | 'group_activity' | 'new_regular'

interface FeedItem {
  id: string
  type: FeedType
  created_at: string
  avatar_img: string | null
  avatar_name: string
  avatar_color: string
  username?: string
  event_title?: string
  venue_name?: string
  starts_at?: string
  poster_url?: string | null
  post_content?: string
  superlative_title?: string
  message?: string
  group_name?: string
}

interface RsvpItem {
  event_id: string
  title: string
  venue_name: string
  starts_at: string
  poster_url: string | null
  color1: string
  color2: string
  focal_x: number
  focal_y: number
  fill_frame: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PALETTE = ['#4c1d95','#831843','#0c4a6e','#365314','#3730a3','#7c2d12','#064e3b','#1e3a5f']
function nameColor(s: string) {
  let h = 0; for (const c of s) h = (h << 5) - h + c.charCodeAt(0)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function fmtTime(iso: string) {
  const d = new Date(iso), h = d.getHours(), m = d.getMinutes()
  const h12 = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2,'0')}${ap}`
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const mo = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return `${wd} ${mo} ${d.getDate()}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const hr = Math.floor(m / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

function feedText(item: FeedItem): { bold: string; rest: string } {
  switch (item.type) {
    case 'going':          return { bold: `@${item.username}`, rest: ` is going to ${item.event_title}${item.venue_name ? ` · ${item.venue_name}` : ''}` }
    case 'liked':          return { bold: `@${item.username}`, rest: ` liked ${item.event_title}` }
    case 'post':           return { bold: `@${item.username}`, rest: ` on the ${item.event_title} wall: "${(item.post_content ?? '').slice(0, 60)}"` }
    case 'superlative':    return { bold: `@${item.username}`, rest: ` 👑 crowned ${item.superlative_title} at ${item.venue_name}` }
    case 'past_attended':  return { bold: `@${item.username}`, rest: ` went to ${item.event_title} last night` }
    case 'venue_shout':    return { bold: item.venue_name ?? item.avatar_name, rest: `: ${item.message ?? ''}` }
    case 'artist_shout':   return { bold: item.username ?? item.avatar_name, rest: `: ${item.message ?? ''}` }
    case 'group_activity': return { bold: `Your ${item.group_name}`, rest: ` is going to ${item.event_title}${item.venue_name ? ` · ${item.venue_name}` : ''}` }
    case 'new_regular':    return { bold: `@${item.username}`, rest: ` is now a Regular at ${item.venue_name}` }
    default:               return { bold: '', rest: '' }
  }
}

const showPoster = (type: FeedType) =>
  ['going', 'liked', 'post', 'past_attended', 'group_activity'].includes(type)

// ── Mock data (all 9 types) ────────────────────────────────────────────────

const off = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
const MOCK_FEED: FeedItem[] = [
  { id: 'm1', type: 'going',          created_at: off(0),   avatar_img: null, avatar_name: 'spacecadet',    avatar_color: nameColor('spacecadet'),    username: 'spacecadet',    event_title: 'Neon Wolves',        venue_name: 'Mississippi Studios', poster_url: null },
  { id: 'm2', type: 'liked',          created_at: off(0),   avatar_img: null, avatar_name: 'pdxnightowl',  avatar_color: nameColor('pdxnightowl'),   username: 'pdxnightowl',   event_title: 'Drag Spectacular',   venue_name: "Dante's",             poster_url: null },
  { id: 'm3', type: 'post',           created_at: off(0),   avatar_img: null, avatar_name: 'rosebudpdx',   avatar_color: nameColor('rosebudpdx'),    username: 'rosebudpdx',    event_title: 'Neon Wolves',        post_content: 'This band is incredible live, do not miss', poster_url: null },
  { id: 'm4', type: 'superlative',    created_at: off(-1),  avatar_img: null, avatar_name: 'groovewitch',  avatar_color: nameColor('groovewitch'),   username: 'groovewitch',   superlative_title: 'Most Likely to Know All the Words', venue_name: 'Mississippi Studios', poster_url: null },
  { id: 'm5', type: 'past_attended',  created_at: off(-1),  avatar_img: null, avatar_name: 'groovewitch',  avatar_color: nameColor('groovewitch'),   username: 'groovewitch',   event_title: 'Late Cinema',        venue_name: 'Clinton St. Theater', poster_url: null },
  { id: 'm6', type: 'venue_shout',    created_at: off(0),   avatar_img: null, avatar_name: 'Mississippi Studios', avatar_color: nameColor('Mississippi Studios'), venue_name: 'Mississippi Studios', message: 'Tonight only: half price well drinks before 9pm', poster_url: null },
  { id: 'm7', type: 'artist_shout',   created_at: off(0),   avatar_img: null, avatar_name: 'Neon Wolves',  avatar_color: nameColor('Neon Wolves'),   username: 'Neon Wolves',   message: 'Portland we love you — new merch at the door tonight', poster_url: null },
  { id: 'm8', type: 'group_activity', created_at: off(0),   avatar_img: null, avatar_name: 'NE crew',      avatar_color: nameColor('NE crew'),       group_name: 'NE crew',     event_title: 'Drag Spectacular',   venue_name: "Dante's",             poster_url: null },
  { id: 'm9', type: 'new_regular',    created_at: off(-2),  avatar_img: null, avatar_name: 'pdxnightowl',  avatar_color: nameColor('pdxnightowl'),   username: 'pdxnightowl',   venue_name: 'Mississippi Studios', poster_url: null },
]
const MOCK_RSVPS: RsvpItem[] = [
  { event_id: 'r1', title: 'Neon Wolves',      venue_name: 'Mississippi Studios', starts_at: off(0.4), poster_url: null, color1: '#4c1d95', color2: '#7c3aed', focal_x: 0.5, focal_y: 0.5, fill_frame: false },
  { event_id: 'r2', title: 'Drag Spectacular', venue_name: "Dante's",             starts_at: off(1.2), poster_url: null, color1: '#831843', color2: '#ec4899', focal_x: 0.5, focal_y: 0.5, fill_frame: false },
  { event_id: 'r3', title: 'Late Cinema',      venue_name: 'Clinton St. Theater', starts_at: off(2.8), poster_url: null, color1: '#312e81', color2: '#a5b4fc', focal_x: 0.5, focal_y: 0.5, fill_frame: false },
]

// Placeholder items for logged-out state
const PLACEHOLDER_FEED: FeedItem[] = Array.from({ length: 8 }, (_, i) => ({
  id: `ph${i}`, type: 'going' as FeedType, created_at: new Date().toISOString(),
  avatar_img: null, avatar_name: '·····', avatar_color: PALETTE[i % PALETTE.length],
  username: '·········', event_title: '··················', venue_name: '·············', poster_url: null,
}))

// ── Sub-components ─────────────────────────────────────────────────────────

function DiamondAvatar({ img, name, color, size = 28 }: { img: string | null; name: string; color: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 0, flexShrink: 0, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden', background: color }}>
      {img
        ? <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: size * 0.32, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', lineHeight: 1 }}>
              {name.replace(/^@/, '').slice(0, 1)}
            </span>
          </div>
      }
    </div>
  )
}

function FeedRow({ item, blurred }: { item: FeedItem; blurred?: boolean }) {
  const { bold, rest } = feedText(item)
  const isLarge = item.type === 'new_regular'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px 9px 14px', filter: blurred ? 'blur(4px)' : 'none', opacity: blurred ? 0.5 : 1 }}>
      <DiamondAvatar img={item.avatar_img} name={item.avatar_name} color={item.avatar_color} />
      <p style={{ flex: 1, minWidth: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: isLarge ? 12 : 11, color: 'var(--fg-55)', margin: 0, lineHeight: 1.4 }}>
        <span style={{ fontWeight: 700, color: 'var(--fg-80, var(--fg))' }}>{bold}</span>
        <span>{rest}</span>
        <span style={{ color: 'var(--fg-25)', marginLeft: 6, fontSize: 10 }}>{timeAgo(item.created_at)}</span>
      </p>
      {showPoster(item.type) && item.poster_url && (
        <div style={{ width: 18, height: 27, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <img src={item.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      {showPoster(item.type) && !item.poster_url && (
        <div style={{ width: 18, height: 27, borderRadius: 2, flexShrink: 0, background: 'var(--fg-08)' }} />
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export function LineUpScreen() {
  const { user } = useAuth()
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [rsvps, setRsvps] = useState<RsvpItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lineupOpen, setLineupOpen] = useState(false)

  // ── Data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return }
    if (IS_DEV) { setFeed(MOCK_FEED); setRsvps(MOCK_RSVPS); setLoading(false); return }

    const load = async () => {
      const now = new Date().toISOString()

      // Friend IDs
      const { data: friends } = await supabase
        .from('friends').select('friend_id').eq('user_id', user.id).eq('status', 'accepted')
      const followingIds = (friends ?? []).map((f: any) => f.friend_id)

      const items: FeedItem[] = []

      if (followingIds.length > 0) {
        // Going / past attended
        const { data: rsvpAct } = await supabase
          .from('attendees')
          .select('user_id, event_id, created_at, profiles(username, avatar_url), events(title, starts_at, poster_url, venues(name))')
          .in('user_id', followingIds).order('created_at', { ascending: false }).limit(20)
        for (const r of rsvpAct ?? []) {
          const ev = r.events as any, p = r.profiles as any
          const isPast = ev?.starts_at < now
          items.push({ id: `rsvp-${r.user_id}-${r.event_id}`, type: isPast ? 'past_attended' : 'going', created_at: r.created_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, event_title: ev?.title, venue_name: ev?.venues?.name, starts_at: ev?.starts_at, poster_url: ev?.poster_url ?? null })
        }

        // Liked
        const { data: likeAct } = await supabase
          .from('event_likes')
          .select('user_id, event_id, created_at, profiles(username, avatar_url), events(title, poster_url, venues(name))')
          .in('user_id', followingIds).order('created_at', { ascending: false }).limit(20)
        for (const r of likeAct ?? []) {
          const ev = r.events as any, p = r.profiles as any
          items.push({ id: `like-${r.user_id}-${r.event_id}`, type: 'liked', created_at: r.created_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, event_title: ev?.title, poster_url: ev?.poster_url ?? null, venue_name: ev?.venues?.name })
        }

        // Wall posts
        const { data: postAct } = await supabase
          .from('event_wall_posts')
          .select('id, user_id, body, created_at, profiles(username, avatar_url), events(title, poster_url, venues(name))')
          .in('user_id', followingIds).order('created_at', { ascending: false }).limit(10)
        for (const r of postAct ?? []) {
          const ev = r.events as any, p = r.profiles as any
          items.push({ id: `post-${r.id}`, type: 'post', created_at: r.created_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, event_title: ev?.title, post_content: r.body, poster_url: ev?.poster_url ?? null })
        }

        // Superlatives
        const { data: supAct } = await supabase
          .from('superlatives')
          .select('id, user_id, awarded_at, title, venues(name), profiles(username, avatar_url)')
          .order('awarded_at', { ascending: false }).limit(10)
        for (const r of supAct ?? []) {
          const p = r.profiles as any, v = r.venues as any
          items.push({ id: `sup-${r.id}`, type: 'superlative', created_at: r.awarded_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, superlative_title: r.title, venue_name: v?.name, poster_url: null })
        }
      }

      // Sort merged feed
      items.sort((a, b) => b.created_at.localeCompare(a.created_at))
      setFeed(items)

      // User's RSVPs
      const { data: rsvpData } = await supabase
        .from('attendees')
        .select('event_id, events(title, starts_at, poster_url, fill_frame, focal_x, focal_y, venues(name))')
        .eq('user_id', user.id)
      const myRsvps: RsvpItem[] = (rsvpData ?? [])
        .filter(r => r.events && (r.events as any).starts_at >= now)
        .map(r => {
          const ev = r.events as any
          return { event_id: r.event_id, title: ev.title ?? 'Event', venue_name: ev.venues?.name ?? '', starts_at: ev.starts_at, poster_url: ev.poster_url ?? null, color1: '#2e1065', color2: '#7c3aed', focal_x: ev.focal_x ?? 0.5, focal_y: ev.focal_y ?? 0.5, fill_frame: ev.fill_frame ?? false }
        })
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      setRsvps(myRsvps)
      setLoading(false)
    }
    load()
  }, [user])

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoggedOut = !user

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlasterHeader actions={
        <button
          onClick={() => setLineupOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', color: lineupOpen ? 'var(--fg)' : 'var(--fg-40)', textTransform: 'uppercase', transition: 'color 0.2s' }}>
            Line Up
          </span>
          <span style={{ color: lineupOpen ? 'var(--fg)' : 'var(--fg-40)', fontSize: 11, transition: 'color 0.2s' }}>
            {lineupOpen ? '✕' : `${rsvps.length || ''}`}
          </span>
        </button>
      } />

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── Activity feed ──────────────────────────────────────── */}
        <div style={{ height: '100%', overflowY: 'auto', paddingRight: 54, paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 8px)' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, gap: 10 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--fg-18)', borderTopColor: 'var(--fg)', animation: 'lu-spin 0.8s linear infinite' }} />
              <style>{`@keyframes lu-spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : (
            <>
              {(isLoggedOut ? PLACEHOLDER_FEED : feed).map((item, i) => (
                <div key={item.id}>
                  <FeedRow item={item} blurred={isLoggedOut} />
                  {(i + 1) % 4 === 0 && <div style={{ height: 1, background: 'var(--fg-08)', margin: '0 14px' }} />}
                </div>
              ))}
              {!isLoggedOut && feed.length === 0 && (
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 18, color: 'var(--fg)', margin: '0 0 8px 0' }}>Nothing here yet</p>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', margin: 0, lineHeight: 1.5 }}>Follow people to see their activity</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sign-in prompt for logged-out */}
        {isLoggedOut && (
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: '80%', maxWidth: 280, background: 'var(--bg)', border: '1px solid var(--fg-18)', borderRadius: 10, padding: '20px 20px', textAlign: 'center', zIndex: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              {PALETTE.slice(0, 3).map((c, i) => <div key={i} style={{ width: 28, height: 28, background: c, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />)}
            </div>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', margin: 0, lineHeight: 1.5 }}>Sign in to see what your friends are up to</p>
          </div>
        )}

        {/* ── Passive diamond queue ──────────────────────────────── */}
        {!isLoggedOut && rsvps.length > 0 && (
          <div style={{ position: 'absolute', right: 10, top: 52, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none', zIndex: 4 }}>
            {rsvps.map(r => (
              <div key={r.event_id} style={{ width: 34, height: 34, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden', background: `linear-gradient(160deg, ${r.color1}, ${r.color2})` }}>
                {r.poster_url && <img src={r.poster_url} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${r.focal_x * 100}% ${r.focal_y * 100}%`, display: 'block' }} />}
              </div>
            ))}
          </div>
        )}

        {/* ── LINE UP panel (slides in from right) ──────────────── */}
        <div style={{ position: 'absolute', inset: 0, right: lineupOpen ? 0 : '-100%', background: 'var(--bg)', transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)', zIndex: 20, overflowY: 'auto', paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 8px)' }}>
          <div style={{ padding: '16px 16px 0' }}>
            <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '0 0 16px 0' }}>
              {rsvps.length === 0 ? 'No upcoming RSVPs' : `${rsvps.length} upcoming`}
            </p>
          </div>
          {rsvps.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', margin: 0 }}>RSVP to events on the wall to build your lineup</p>
            </div>
          ) : (
            rsvps.map(r => (
              <div key={r.event_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--fg-08)' }}>
                <div style={{ width: 30, height: 45, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: `linear-gradient(160deg, ${r.color1}, ${r.color2})` }}>
                  {r.poster_url && <img src={r.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                  <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '3px 0 0 0' }}>
                    {r.venue_name} · {fmtTime(r.starts_at)}
                  </p>
                  <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-25)', margin: '2px 0 0 0' }}>
                    {fmtDate(r.starts_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* DEV button */}
        {IS_DEV && (
          <button onClick={() => { setFeed(MOCK_FEED); setRsvps(MOCK_RSVPS) }} style={{ position: 'absolute', bottom: 80, left: 10, padding: '4px 10px', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.35)', borderRadius: 4, color: 'rgba(234,179,8,0.9)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, cursor: 'pointer', zIndex: 50 }}>
            DEV all types
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
