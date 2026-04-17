import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { PlasterHeader } from '@/components/PlasterHeader'

// ── Types ──────────────────────────────────────────────────────────────────

type FeedType = 'going' | 'liked' | 'post' | 'superlative' | 'past_attended'
              | 'venue_shout' | 'artist_shout' | 'group_activity' | 'new_regular'

type PanelType = 'user' | 'venue' | 'artist'

interface FeedItem {
  id: string; type: FeedType; created_at: string
  avatar_img: string | null; avatar_name: string; avatar_color: string
  username?: string; event_title?: string; venue_name?: string; starts_at?: string
  poster_url?: string | null; post_content?: string; superlative_title?: string
  message?: string; group_name?: string
  panel_type: PanelType | null; panel_id: string | null
}

interface RsvpItem {
  event_id: string; title: string; venue_name: string; starts_at: string
  poster_url: string | null; color1: string; color2: string
  focal_x: number; focal_y: number; fill_frame: boolean
}

interface PanelEntry { type: PanelType; id: string; name: string; color: string; img: string | null }

// ── Helpers ────────────────────────────────────────────────────────────────

const PALETTE = ['#4c1d95','#831843','#0c4a6e','#365314','#3730a3','#7c2d12','#064e3b','#1e3a5f']
function nameColor(s: string) { let h = 0; for (const c of s) h = (h << 5) - h + c.charCodeAt(0); return PALETTE[Math.abs(h) % PALETTE.length] }
function fmtTime(iso: string) { const d = new Date(iso), h = d.getHours(), m = d.getMinutes(), h12 = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'; return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2,'0')}${ap}` }
function fmtDate(iso: string) { const d = new Date(iso); return `${d.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()} ${d.toLocaleDateString('en-US',{month:'short'}).toUpperCase()} ${d.getDate()}` }
function timeAgo(iso: string) { const diff = Date.now() - new Date(iso).getTime(), m = Math.floor(diff/60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m`; const hr = Math.floor(m/60); if (hr < 24) return `${hr}h`; return `${Math.floor(hr/24)}d` }

function feedText(item: FeedItem): { bold: string; rest: string } {
  switch (item.type) {
    case 'going':         return { bold: `@${item.username}`, rest: ` is going to ${item.event_title}${item.venue_name ? ` · ${item.venue_name}` : ''}` }
    case 'liked':         return { bold: `@${item.username}`, rest: ` liked ${item.event_title}` }
    case 'post':          return { bold: `@${item.username}`, rest: ` on the ${item.event_title} wall: "${(item.post_content??'').slice(0,60)}"` }
    case 'superlative':   return { bold: `@${item.username}`, rest: ` 👑 crowned ${item.superlative_title} at ${item.venue_name}` }
    case 'past_attended': return { bold: `@${item.username}`, rest: ` went to ${item.event_title} last night` }
    case 'venue_shout':   return { bold: item.venue_name??item.avatar_name, rest: `: ${item.message??''}` }
    case 'artist_shout':  return { bold: item.username??item.avatar_name, rest: `: ${item.message??''}` }
    case 'group_activity':return { bold: `Your ${item.group_name}`, rest: ` is going to ${item.event_title}${item.venue_name ? ` · ${item.venue_name}` : ''}` }
    case 'new_regular':   return { bold: `@${item.username}`, rest: ` is now a Regular at ${item.venue_name}` }
    default:              return { bold: '', rest: '' }
  }
}
const showPoster = (t: FeedType) => ['going','liked','post','past_attended','group_activity'].includes(t)

// ── Shared panel chrome ────────────────────────────────────────────────────

function PanelBack({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 16, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, zIndex: 2, padding: 0 }}>
      <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', color: 'var(--fg-55)' }}>← BACK</span>
    </button>
  )
}

const btnPrimary: React.CSSProperties = { flex: 1, padding: '11px 0', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { flex: 1, padding: '11px 0', background: 'transparent', color: 'var(--fg-55)', border: '1px solid var(--fg-18)', borderRadius: 6, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer' }

// ── Person panel ───────────────────────────────────────────────────────────

function PersonPanel({ entry, onBack, onMessage }: { entry: PanelEntry; onBack: () => void; onOpen?: (p: PanelEntry) => void; onMessage: () => void }) {
  const [profile, setProfile] = useState<{ username: string; avatar_url: string | null; bio: string | null } | null>(null)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [posters, setPosters] = useState<Array<{ poster_url: string | null; color1: string; color2: string; title: string }>>([])
  const [superlatives, setSuperlatives] = useState<Array<{ title: string; venue_name?: string }>>([])

  useEffect(() => {
    if (entry.id.startsWith('dev-')) {
      setProfile({ username: entry.name, avatar_url: null, bio: null })
      setPosters(Array.from({ length: 8 }, (_, i) => ({ poster_url: null, color1: PALETTE[i % 4], color2: PALETTE[(i+4) % 8], title: '' })))
      setSuperlatives([{ title: 'Most Likely to Know All the Words' }, { title: 'Last One Dancing' }])
      return
    }
    Promise.all([
      supabase.from('profiles').select('username, avatar_url, bio').eq('id', entry.id).single(),
      supabase.from('friends').select('id', { count: 'exact', head: true }).eq('friend_id', entry.id).eq('status', 'accepted'),
      supabase.from('friends').select('id', { count: 'exact', head: true }).eq('user_id', entry.id).eq('status', 'accepted'),
      supabase.from('attendees').select('events(poster_url, title)').eq('user_id', entry.id).order('created_at', { ascending: false }).limit(12),
      supabase.from('superlatives').select('title, venues(name)').eq('user_id', entry.id).limit(5),
    ]).then(([prof, flrs, flwg, att, sup]) => {
      if (prof.data) setProfile(prof.data as any)
      setFollowerCount(flrs.count ?? 0)
      setFollowingCount(flwg.count ?? 0)
      setPosters(((att.data ?? []) as any[]).map((r, i) => ({ poster_url: r.events?.poster_url ?? null, color1: PALETTE[i%4], color2: PALETTE[(i+4)%8], title: r.events?.title ?? '' })))
      setSuperlatives(((sup.data ?? []) as any[]).map(r => ({ title: r.title, venue_name: (r.venues as any)?.name })))
    })
  }, [entry.id, entry.name])

  return (
    <div style={{ minHeight: '100%', paddingBottom: 24, position: 'relative' }}>
      <PanelBack onBack={onBack} />
      {/* Diamond avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60, paddingBottom: 16 }}>
        <DiamondAvatar img={profile?.avatar_url ?? entry.img} name={entry.name} color={entry.color} size={64} />
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--fg)', margin: '12px 0 4px 0' }}>@{profile?.username ?? entry.name}</p>
        <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: 0 }}>
          {followerCount} followers · {followingCount} following
        </p>
        {profile?.bio && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', margin: '8px 16px 0', textAlign: 'center', lineHeight: 1.4 }}>{profile.bio}</p>}
      </div>
      {/* Poster grid */}
      {posters.length > 0 && (
        <div style={{ padding: '0 12px 12px' }}>
          <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '0 0 8px 4px' }}>Attended</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {posters.map((p, i) => (
              <div key={i} style={{ aspectRatio: '2/3', borderRadius: 3, overflow: 'hidden', background: `linear-gradient(160deg, ${p.color1}, ${p.color2})` }}>
                {p.poster_url && <img src={p.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Superlatives */}
      {superlatives.length > 0 && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {superlatives.map((s, i) => (
            <span key={i} style={{ padding: '3px 8px', borderRadius: 20, border: '1px solid rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'rgba(234,179,8,0.9)' }}>
              👑 {s.title}
            </span>
          ))}
        </div>
      )}
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, padding: '0 16px' }}>
        <button style={btnPrimary}>Follow</button>
        <button style={btnSecondary} onClick={onMessage}>Message</button>
      </div>
    </div>
  )
}

// ── Venue panel ────────────────────────────────────────────────────────────

function VenuePanel({ entry, onBack, onMessage }: { entry: PanelEntry; onBack: () => void; onOpen?: (p: PanelEntry) => void; onMessage: () => void }) {
  const [venue, setVenue] = useState<{ name: string; neighborhood: string | null; cover_url: string | null } | null>(null)
  const [events, setEvents] = useState<Array<{ id: string; title: string; starts_at: string; poster_url: string | null }>>([])

  useEffect(() => {
    if (entry.id.startsWith('dev-')) {
      setVenue({ name: entry.name, neighborhood: 'Northeast', cover_url: null })
      setEvents(Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, title: ['Neon Wolves','Drag Night','Jazz Trio','Film Club'][i], starts_at: new Date(Date.now() + (i+1)*86400000).toISOString(), poster_url: null })))
      return
    }
    Promise.all([
      supabase.from('venues').select('name, neighborhood, cover_url').eq('id', entry.id).single(),
      supabase.from('events').select('id, title, starts_at, poster_url').eq('venue_id', entry.id).gte('starts_at', new Date().toISOString()).order('starts_at').limit(10),
    ]).then(([v, ev]) => {
      if (v.data) setVenue(v.data as any)
      setEvents((ev.data ?? []) as any[])
    })
  }, [entry.id, entry.name])

  return (
    <div style={{ minHeight: '100%', paddingBottom: 24, position: 'relative' }}>
      <PanelBack onBack={onBack} />
      {/* Cover */}
      <div style={{ width: '100%', height: 120, background: entry.color, overflow: 'hidden', position: 'relative' }}>
        {venue?.cover_url && <img src={venue.cover_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px' }}>
        <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 2px 0' }}>{venue?.name ?? entry.name}</p>
        {venue?.neighborhood && <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: 0 }}>{venue.neighborhood}</p>}
      </div>
      {/* Upcoming events */}
      {events.length > 0 && (
        <div style={{ borderTop: '1px solid var(--fg-08)' }}>
          <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '12px 16px 8px' }}>Upcoming</p>
          {events.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--fg-08)' }}>
              <div style={{ width: 30, height: 45, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: entry.color }}>
                {ev.poster_url && <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0 }}>{ev.title}</p>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{fmtDate(ev.starts_at)} · {fmtTime(ev.starts_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {events.length === 0 && !entry.id.startsWith('dev-') && (
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', padding: '16px', margin: 0 }}>No upcoming events</p>
      )}
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, padding: '16px 16px 0' }}>
        <button style={btnPrimary}>Follow</button>
        <button style={btnSecondary} onClick={onMessage}>Message</button>
      </div>
    </div>
  )
}

// ── Artist panel ────────────────────────────────────────────────────────────

function ArtistPanel({ entry, onBack, onMessage }: { entry: PanelEntry; onBack: () => void; onOpen?: (p: PanelEntry) => void; onMessage: () => void }) {
  const [shows, setShows] = useState<Array<{ id: string; title: string; starts_at: string; poster_url: string | null; venue_name: string }>>([])

  useEffect(() => {
    if (entry.id.startsWith('dev-')) {
      setShows([{ id: 'e1', title: `${entry.name} live`, starts_at: new Date(Date.now() + 86400000).toISOString(), poster_url: null, venue_name: 'Mississippi Studios' }])
      return
    }
    supabase.from('events')
      .select('id, title, starts_at, poster_url, venues(name)')
      .ilike('title', `%${entry.name}%`)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at').limit(8)
      .then(({ data }) => setShows(((data ?? []) as any[]).map(r => ({ id: r.id, title: r.title, starts_at: r.starts_at, poster_url: r.poster_url, venue_name: r.venues?.name ?? '' }))))
  }, [entry.id, entry.name])

  return (
    <div style={{ minHeight: '100%', paddingBottom: 24, position: 'relative' }}>
      <PanelBack onBack={onBack} />
      <div style={{ width: '100%', height: 120, background: entry.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DiamondAvatar img={entry.img} name={entry.name} color={entry.color} size={64} />
      </div>
      <div style={{ padding: '14px 16px 12px' }}>
        <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 2px 0' }}>{entry.name}</p>
        <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: 0 }}>Artist</p>
      </div>
      {shows.length > 0 && (
        <div style={{ borderTop: '1px solid var(--fg-08)' }}>
          <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '12px 16px 8px' }}>Portland Shows</p>
          {shows.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--fg-08)' }}>
              <div style={{ width: 30, height: 45, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: entry.color }}>
                {s.poster_url && <img src={s.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0 }}>{s.title}</p>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{s.venue_name} · {fmtDate(s.starts_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, padding: '16px 16px 0' }}>
        <button style={btnPrimary}>Follow</button>
        <button style={btnSecondary} onClick={onMessage}>Message</button>
      </div>
    </div>
  )
}

// ── Diamond avatar (shared) ────────────────────────────────────────────────

function DiamondAvatar({ img, name, color, size = 28, onTap }: { img: string | null; name: string; color: string; size?: number; onTap?: () => void }) {
  return (
    <div
      onClick={onTap}
      style={{ width: size, height: size, flexShrink: 0, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden', background: color, cursor: onTap ? 'pointer' : 'default' }}
    >
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

// ── Feed row ───────────────────────────────────────────────────────────────

function FeedRow({ item, blurred, onAvatarTap }: { item: FeedItem; blurred?: boolean; onAvatarTap?: () => void }) {
  const { bold, rest } = feedText(item)
  const isLarge = item.type === 'new_regular'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px 9px 14px', filter: blurred ? 'blur(4px)' : 'none', opacity: blurred ? 0.5 : 1 }}>
      <DiamondAvatar img={item.avatar_img} name={item.avatar_name} color={item.avatar_color} onTap={!blurred && item.panel_type ? onAvatarTap : undefined} />
      <p style={{ flex: 1, minWidth: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: isLarge ? 12 : 11, color: 'var(--fg-55)', margin: 0, lineHeight: 1.4 }}>
        <span style={{ fontWeight: 700, color: 'var(--fg)' }}>{bold}</span>
        <span>{rest}</span>
        <span style={{ color: 'var(--fg-25)', marginLeft: 6, fontSize: 10 }}>{timeAgo(item.created_at)}</span>
      </p>
      {showPoster(item.type) && (
        <div style={{ width: 18, height: 27, borderRadius: 2, flexShrink: 0, background: 'var(--fg-08)', overflow: 'hidden' }}>
          {item.poster_url && <img src={item.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
      )}
    </div>
  )
}

// ── Mock data ──────────────────────────────────────────────────────────────

const off = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
const MOCK_FEED: FeedItem[] = [
  { id:'m1', type:'going',         created_at:off(0),  avatar_img:null, avatar_name:'spacecadet',         avatar_color:nameColor('spacecadet'),         username:'spacecadet',         event_title:'Neon Wolves',        venue_name:'Mississippi Studios', poster_url:null, panel_type:'user',   panel_id:'dev-user-1' },
  { id:'m2', type:'liked',         created_at:off(0),  avatar_img:null, avatar_name:'pdxnightowl',        avatar_color:nameColor('pdxnightowl'),        username:'pdxnightowl',        event_title:'Drag Spectacular',   venue_name:"Dante's",             poster_url:null, panel_type:'user',   panel_id:'dev-user-2' },
  { id:'m3', type:'post',          created_at:off(0),  avatar_img:null, avatar_name:'rosebudpdx',         avatar_color:nameColor('rosebudpdx'),         username:'rosebudpdx',         event_title:'Neon Wolves',        post_content:'This band is incredible live, do not miss', poster_url:null, panel_type:'user', panel_id:'dev-user-3' },
  { id:'m4', type:'superlative',   created_at:off(-1), avatar_img:null, avatar_name:'groovewitch',        avatar_color:nameColor('groovewitch'),        username:'groovewitch',        superlative_title:'Most Likely to Know All the Words', venue_name:'Mississippi Studios', poster_url:null, panel_type:'user', panel_id:'dev-user-4' },
  { id:'m5', type:'past_attended', created_at:off(-1), avatar_img:null, avatar_name:'groovewitch',        avatar_color:nameColor('groovewitch'),        username:'groovewitch',        event_title:'Late Cinema',        venue_name:'Clinton St. Theater', poster_url:null, panel_type:'user',   panel_id:'dev-user-4' },
  { id:'m6', type:'venue_shout',   created_at:off(0),  avatar_img:null, avatar_name:'Mississippi Studios',avatar_color:nameColor('Mississippi Studios'),venue_name:'Mississippi Studios',message:'Tonight: half price well drinks before 9pm', poster_url:null, panel_type:'venue',  panel_id:'dev-venue-1' },
  { id:'m7', type:'artist_shout',  created_at:off(0),  avatar_img:null, avatar_name:'Neon Wolves',        avatar_color:nameColor('Neon Wolves'),        username:'Neon Wolves',        message:'Portland we love you — new merch at the door tonight', poster_url:null, panel_type:'artist', panel_id:'dev-artist-1' },
  { id:'m8', type:'group_activity',created_at:off(0),  avatar_img:null, avatar_name:'NE crew',            avatar_color:nameColor('NE crew'),           group_name:'NE crew',          event_title:'Drag Spectacular',   venue_name:"Dante's",             poster_url:null, panel_type:null,     panel_id:null },
  { id:'m9', type:'new_regular',   created_at:off(-2), avatar_img:null, avatar_name:'pdxnightowl',        avatar_color:nameColor('pdxnightowl'),        username:'pdxnightowl',        venue_name:'Mississippi Studios', poster_url:null, panel_type:'user',   panel_id:'dev-user-2' },
]
const MOCK_RSVPS: RsvpItem[] = [
  { event_id:'r1', title:'Neon Wolves',      venue_name:'Mississippi Studios', starts_at:off(0.4), poster_url:null, color1:'#4c1d95', color2:'#7c3aed', focal_x:0.5, focal_y:0.5, fill_frame:false },
  { event_id:'r2', title:'Drag Spectacular', venue_name:"Dante's",             starts_at:off(1.2), poster_url:null, color1:'#831843', color2:'#ec4899', focal_x:0.5, focal_y:0.5, fill_frame:false },
  { event_id:'r3', title:'Late Cinema',      venue_name:'Clinton St. Theater', starts_at:off(2.8), poster_url:null, color1:'#312e81', color2:'#a5b4fc', focal_x:0.5, focal_y:0.5, fill_frame:false },
]

// ── Main ───────────────────────────────────────────────────────────────────

export function LineUpScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Start with mock data so the screen looks great immediately, for everyone
  const [feed, setFeed] = useState<FeedItem[]>(MOCK_FEED)
  const [rsvps, setRsvps] = useState<RsvpItem[]>(MOCK_RSVPS)
  const [lineupOpen, setLineupOpen] = useState(false)
  const [panelStack, setPanelStack] = useState<PanelEntry[]>([])

  const pushPanel = (p: PanelEntry) => setPanelStack(prev => [...prev, p])
  const popPanel  = () => setPanelStack(prev => prev.slice(0, -1))
  const handleMessage = () => navigate('/you')

  // Replace mock data with real data once user is available
  useEffect(() => {
    if (!user) return
    const load = async () => {
      const now = new Date().toISOString()
      const { data: friends } = await supabase.from('friends').select('friend_id').eq('user_id', user.id).eq('status', 'accepted')
      const followingIds = (friends ?? []).map((f: any) => f.friend_id)
      const items: FeedItem[] = []

      if (followingIds.length > 0) {
        const [rsvpAct, likeAct, postAct, supAct] = await Promise.all([
          supabase.from('attendees').select('user_id, event_id, created_at, profiles(id, username, avatar_url), events(title, starts_at, poster_url, venues(name))').in('user_id', followingIds).order('created_at', { ascending: false }).limit(20),
          supabase.from('event_likes').select('user_id, event_id, created_at, profiles(id, username, avatar_url), events(title, poster_url, venues(name))').in('user_id', followingIds).order('created_at', { ascending: false }).limit(20),
          supabase.from('event_wall_posts').select('id, user_id, body, created_at, profiles(id, username, avatar_url), events(title, poster_url)').in('user_id', followingIds).order('created_at', { ascending: false }).limit(10),
          supabase.from('superlatives').select('id, user_id, awarded_at, title, venues(name), profiles(id, username, avatar_url)').order('awarded_at', { ascending: false }).limit(10),
        ])
        for (const r of rsvpAct.data ?? []) {
          const ev = r.events as any, p = r.profiles as any
          items.push({ id: `rsvp-${r.user_id}-${r.event_id}`, type: ev?.starts_at < now ? 'past_attended' : 'going', created_at: r.created_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, event_title: ev?.title, venue_name: ev?.venues?.name, starts_at: ev?.starts_at, poster_url: ev?.poster_url ?? null, panel_type: 'user', panel_id: r.user_id })
        }
        for (const r of likeAct.data ?? []) {
          const ev = r.events as any, p = r.profiles as any
          items.push({ id: `like-${r.user_id}-${r.event_id}`, type: 'liked', created_at: r.created_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, event_title: ev?.title, poster_url: ev?.poster_url ?? null, venue_name: ev?.venues?.name, panel_type: 'user', panel_id: r.user_id })
        }
        for (const r of postAct.data ?? []) {
          const ev = r.events as any, p = r.profiles as any
          items.push({ id: `post-${r.id}`, type: 'post', created_at: r.created_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, event_title: ev?.title, post_content: r.body, poster_url: ev?.poster_url ?? null, panel_type: 'user', panel_id: r.user_id })
        }
        for (const r of supAct.data ?? []) {
          const p = r.profiles as any, v = r.venues as any
          items.push({ id: `sup-${r.id}`, type: 'superlative', created_at: r.awarded_at, avatar_img: p?.avatar_url ?? null, avatar_name: p?.username ?? '?', avatar_color: nameColor(p?.username ?? ''), username: p?.username, superlative_title: r.title, venue_name: v?.name, poster_url: null, panel_type: 'user', panel_id: r.user_id })
        }
      }

      if (items.length > 0) {
        items.sort((a, b) => b.created_at.localeCompare(a.created_at))
        setFeed(items)
      }

      const { data: rsvpData } = await supabase.from('attendees').select('event_id, events(title, starts_at, poster_url, fill_frame, focal_x, focal_y, venues(name))').eq('user_id', user.id)
      const myRsvps = ((rsvpData ?? []) as any[]).filter(r => r.events?.starts_at >= now).map(r => { const ev = r.events as any; return { event_id: r.event_id, title: ev.title ?? 'Event', venue_name: ev.venues?.name ?? '', starts_at: ev.starts_at, poster_url: ev.poster_url ?? null, color1: '#2e1065', color2: '#7c3aed', focal_x: ev.focal_x ?? 0.5, focal_y: ev.focal_y ?? 0.5, fill_frame: ev.fill_frame ?? false } }).sort((a: any, b: any) => a.starts_at.localeCompare(b.starts_at))
      if (myRsvps.length > 0) setRsvps(myRsvps)
    }
    load()
  }, [user])

  const topPanel = panelStack.length > 0 ? panelStack[panelStack.length - 1] : null

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlasterHeader actions={
        <button onClick={() => setLineupOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', color: lineupOpen ? 'var(--fg)' : 'var(--fg-40)', textTransform: 'uppercase', transition: 'color 0.2s' }}>Line Up</span>
          <span style={{ color: lineupOpen ? 'var(--fg)' : 'var(--fg-40)', fontSize: 11 }}>{lineupOpen ? '✕' : rsvps.length}</span>
        </button>
      } />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Activity feed */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 54, paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 8px)' }}>
          {feed.map((item, i) => (
            <div key={item.id}>
              <FeedRow
                item={item}
                onAvatarTap={item.panel_type ? () => pushPanel({ type: item.panel_type!, id: item.panel_id!, name: item.avatar_name, color: item.avatar_color, img: item.avatar_img }) : undefined}
              />
              {(i + 1) % 4 === 0 && <div style={{ height: 1, background: 'var(--fg-08)', margin: '0 14px' }} />}
            </div>
          ))}
        </div>

        {/* Passive diamond queue */}
        <div style={{ position: 'absolute', right: 10, top: 52, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none', zIndex: 4 }}>
          {rsvps.map(r => (
            <div key={r.event_id} style={{ width: 34, height: 34, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden', background: `linear-gradient(160deg,${r.color1},${r.color2})` }}>
              {r.poster_url && <img src={r.poster_url} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            </div>
          ))}
        </div>

        {/* LINE UP panel — slides from RIGHT */}
        <div style={{ position: 'absolute', inset: 0, right: lineupOpen ? 0 : '-100%', background: 'var(--bg)', transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)', zIndex: 20, overflowY: 'auto', paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 8px)' }}>
          <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--fg-08)' }}>
            <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: 0 }}>
              {rsvps.length} upcoming show{rsvps.length !== 1 ? 's' : ''}
            </p>
          </div>
          {rsvps.map((r, i) => (
            <div key={r.event_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid var(--fg-08)' }}>
              {/* Diamond + poster */}
              <div style={{ width: 36, height: 36, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden', flexShrink: 0, background: `linear-gradient(160deg,${r.color1},${r.color2})` }}>
                {r.poster_url && <img src={r.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{r.venue_name}</p>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-25)', margin: '1px 0 0 0' }}>{fmtDate(r.starts_at)} · {fmtTime(r.starts_at)}</p>
              </div>
              <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--fg-18)' }}>{i + 1}</span>
            </div>
          ))}
        </div>

        {/* Person / Venue / Artist panels — slide from LEFT */}
        <div style={{ position: 'absolute', inset: 0, left: panelStack.length > 0 ? 0 : '-100%', background: 'var(--bg)', transition: 'left 0.35s cubic-bezier(0.4,0,0.2,1)', zIndex: 30, overflowY: 'auto', paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 8px)' }}>
          {topPanel && topPanel.type === 'user'   && <PersonPanel key={topPanel.id} entry={topPanel} onBack={popPanel} onMessage={handleMessage} />}
          {topPanel && topPanel.type === 'venue'  && <VenuePanel  key={topPanel.id} entry={topPanel} onBack={popPanel} onMessage={handleMessage} />}
          {topPanel && topPanel.type === 'artist' && <ArtistPanel key={topPanel.id} entry={topPanel} onBack={popPanel} onMessage={handleMessage} />}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
