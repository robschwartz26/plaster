import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { AvatarFullscreen } from '@/components/AvatarFullscreen'
import { Diamond } from '@/components/Diamond'
import { PlasterHeader } from '@/components/PlasterHeader'

// ── Mock feed ──────────────────────────────────────────────────────────────

const mockFeed = [
  { id: 1,  type: 'friend', avatar: '#7c3aed', name: 'neonrose',           text: 'is going to Low Bar Chorale at Showbar' },
  { id: 2,  type: 'venue',  avatar: '#0f172a', name: 'Holocene',            text: "Small Skies, My Body & Frecks on the same bill Friday — don't sleep" },
  { id: 3,  type: 'friend', avatar: '#ec4899', name: 'bobbybones',          text: 'liked Disco Always: A Harry Styles Dance Night' },
  { id: 4,  type: 'friend', avatar: '#fb923c', name: 'drummerboy',          text: 'is going to Stumpfest XI at Mississippi Studios' },
  { id: 5,  type: 'friend', avatar: '#a3e635', name: 'jazzfan99',           text: 'went to the Charlie Brown III Quartet at The 1905 last night' },
  { id: 6,  type: 'artist', avatar: '#818cf8', name: 'The Wallflowers',     text: 'Portland. Revolution Hall. Tonight. See you there.' },
  { id: 7,  type: 'friend', avatar: '#7dd3fc', name: 'pdxnights',           text: 'wrote on the Banff Mountain Film Festival wall: "the ski BASE jump segment had the whole room holding its breath"' },
  { id: 8,  type: 'venue',  avatar: '#0f172a', name: 'Revolution Hall',     text: "Jenny Lawson tonight — doors 7pm, show 8pm. We're already crying." },
  { id: 9,  type: 'friend', avatar: '#f472b6', name: 'glitterqueen',        text: '👑 was crowned Most Likely to Know Every Word at Holocene' },
  { id: 10, type: 'friend', avatar: '#2dd4bf', name: 'NE crew',             text: 'Your NE crew is going to Weird Nightmare at Polaris Hall' },
  { id: 11, type: 'friend', avatar: '#f97316', name: 'salsamove',           text: 'is going to Laffy Taffy: Freaknik Edition at Holocene' },
  { id: 12, type: 'friend', avatar: '#7c3aed', name: 'neonrose',            text: 'is now a Regular at Showbar' },
  { id: 13, type: 'friend', avatar: '#fb923c', name: 'drummerboy',          text: 'liked Marshall Crenshaw at Polaris Hall' },
  { id: 14, type: 'friend', avatar: '#a3e635', name: 'jazzfan99',           text: 'is going to Babes in Canyon at Holocene' },
  { id: 15, type: 'venue',  avatar: '#0f172a', name: 'Mississippi Studios', text: 'Stumpfest XI presale ends tonight — 12 bands, 2 days, all ages' },
]

const mockLineup = [
  { id: 'ml1', title: 'Low Bar Chorale',               venue: 'Showbar',             starts_at: '2026-04-18T20:00:00', poster_url: null, color: '#4c1d95' },
  { id: 'ml2', title: 'Stumpfest XI',                  venue: 'Mississippi Studios',  starts_at: '2026-04-19T19:00:00', poster_url: null, color: '#3730a3' },
  { id: 'ml3', title: 'Weird Nightmare',               venue: 'Polaris Hall',         starts_at: '2026-04-22T20:00:00', poster_url: null, color: '#0c4a6e' },
  { id: 'ml4', title: 'Laffy Taffy: Freaknik Edition', venue: 'Holocene',             starts_at: '2026-04-25T22:00:00', poster_url: null, color: '#7c2d12' },
  { id: 'ml5', title: 'Babes in Canyon',               venue: 'Holocene',             starts_at: '2026-04-26T20:00:00', poster_url: null, color: '#365314' },
  { id: 'ml6', title: 'Marshall Crenshaw',             venue: 'Polaris Hall',         starts_at: '2026-04-28T19:30:00', poster_url: null, color: '#1e3a5f' },
]

const diamondQueue = ['#4c1d95', '#831843', '#0c4a6e', '#365314', '#7c2d12']

// ── Types ──────────────────────────────────────────────────────────────────

interface EventRow   { id: string; title: string; poster_url: string; venue_name: string }
interface LineupItem { id: string; title: string; venue: string; starts_at: string; poster_url: string | null; color: string }
interface PanelEntry { type: 'venue' | 'artist' | 'friend'; name: string; color: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function matchPoster(item: typeof mockFeed[0], events: EventRow[]): string | null {
  if (!events.length) return null
  const needle = (item.name + ' ' + item.text).toLowerCase()
  for (const ev of events) {
    if (needle.includes(ev.title.toLowerCase()) || needle.includes(ev.venue_name.toLowerCase())) return ev.poster_url
  }
  return null
}

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

// Shared panel header: ← BACK left, name centered
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

function LineupRow({ item }: { item: LineupItem }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--fg-08)' }}>
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

      {/* Identity block */}
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

      {/* Upcoming events */}
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

      {/* Identity block */}
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

      {/* Upcoming shows */}
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

        // Attended posters + count
        supabase.from('attendees').select('events(poster_url, title)').eq('user_id', p.id).limit(12)
          .then(({ data: a }) => {
            if (a) {
              const items = (a as any[]).map(r => ({ url: r.events?.poster_url, title: r.events?.title ?? '' })).filter(r => r.url)
              setPosters(items)
              setAttendedCount(items.length)
            }
          })

        // Follower count (people following this user)
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', p.id).eq('status', 'accepted')
          .then(({ count }) => setFollowerCount(count ?? 0))

        // Following count (people this user follows)
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', p.id).eq('status', 'accepted')
          .then(({ count }) => setFollowingCount(count ?? 0))

        // Superlatives
        supabase.from('superlatives').select('title').eq('user_id', p.id).limit(6)
          .then(({ data: s }) => { if (s) setSuperlatives((s as any[]).map(r => r.title)) })
      })
  }, [entry.name])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PanelHeader name={profile?.username ? `@${profile.username}` : entry.name} onBack={onBack} />

      {/* Identity block */}
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

        {/* Superlatives pills */}
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

      {/* Attended poster grid */}
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
        <button style={btnSecondary} onClick={() => navigate('/msg')}>Message</button>
      </div>

      {avatarFullscreenId && (
        <AvatarFullscreen userId={avatarFullscreenId} onClose={() => setAvatarFullscreenId(null)} />
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function LineUpScreen() {
  const { user } = useAuth()
  const [events,     setEvents]     = useState<EventRow[]>([])
  const [lineup,     setLineup]     = useState<LineupItem[]>(mockLineup)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelStack, setPanelStack] = useState<PanelEntry[]>([])

  const pushPanel = (e: PanelEntry) => setPanelStack(prev => [...prev, e])
  const popPanel  = () => setPanelStack(prev => prev.slice(0, -1))
  const topPanel  = panelStack[panelStack.length - 1] ?? null

  useEffect(() => {
    supabase.from('events').select('id, title, poster_url, venues(name)').not('poster_url', 'is', null)
      .order('starts_at', { ascending: true }).limit(20)
      .then(({ data }) => {
        if (data) setEvents(data.map((e: any) => ({ id: e.id, title: e.title, poster_url: e.poster_url, venue_name: e.venues?.name ?? '' })))
      })
  }, [])

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
        <div style={{ position: 'absolute', right: 10, top: 4, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5, pointerEvents: 'none' }}>
          {diamondQueue.map((color, i) => (
            <DiamondImg key={i} color={color} posterUrl={events[i]?.poster_url ?? null} size={34} />
          ))}
        </div>

        {/* Feed */}
        <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
          {mockFeed.map((item, i) => (
            <React.Fragment key={item.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 9, paddingBottom: 9, paddingRight: 54, paddingLeft: item.type === 'venue' ? 14 : item.type === 'artist' ? 24 : 36 }}>
                <DiamondImg
                  color={item.avatar}
                  posterUrl={matchPoster(item, events)}
                  size={item.type === 'venue' ? 36 : item.type === 'artist' ? 28 : 22}
                  onTap={() => pushPanel({ type: item.type as PanelEntry['type'], name: item.name, color: item.avatar })}
                />
                <div style={{ flex: 1, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.35 }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{item.name}</span> {item.text}
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
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {lineup.map(item => <LineupRow key={item.id} item={item} />)}
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
