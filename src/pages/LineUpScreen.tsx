import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'

// ── Mock feed ──────────────────────────────────────────────────────────────

const mockFeed = [
  { id: 1,  type: 'friend', avatar: '#7c3aed', name: 'neonrose',           text: 'is going to Low Bar Chorale at Showbar',                               poster: 'linear-gradient(160deg,#4c1d95,#7c3aed)' },
  { id: 2,  type: 'venue',  avatar: '#0f172a', name: 'Holocene',            text: "Small Skies, My Body & Frecks on the same bill Friday — don't sleep", poster: 'linear-gradient(160deg,#0c4a6e,#38bdf8)' },
  { id: 3,  type: 'friend', avatar: '#ec4899', name: 'bobbybones',          text: 'liked Disco Always: A Harry Styles Dance Night',                      poster: 'linear-gradient(160deg,#831843,#ec4899)' },
  { id: 4,  type: 'friend', avatar: '#fb923c', name: 'drummerboy',          text: 'is going to Stumpfest XI at Mississippi Studios',                     poster: 'linear-gradient(160deg,#3730a3,#818cf8)' },
  { id: 5,  type: 'friend', avatar: '#a3e635', name: 'jazzfan99',           text: 'went to the Charlie Brown III Quartet at The 1905 last night',        poster: 'linear-gradient(160deg,#365314,#a3e635)' },
  { id: 6,  type: 'artist', avatar: '#818cf8', name: 'The Wallflowers',     text: 'Portland. Revolution Hall. Tonight. See you there.',                  poster: 'linear-gradient(160deg,#1e3a8a,#818cf8)' },
  { id: 7,  type: 'friend', avatar: '#7dd3fc', name: 'pdxnights',           text: 'wrote on the Banff Mountain Film Festival wall: "the ski BASE jump segment had the whole room holding its breath"', poster: 'linear-gradient(160deg,#0c4a6e,#7dd3fc)' },
  { id: 8,  type: 'venue',  avatar: '#0f172a', name: 'Revolution Hall',     text: "Jenny Lawson tonight — doors 7pm, show 8pm. We're already crying.",   poster: 'linear-gradient(160deg,#7c2d12,#fb923c)' },
  { id: 9,  type: 'friend', avatar: '#f472b6', name: 'glitterqueen',        text: '👑 was crowned Most Likely to Know Every Word at Holocene',           poster: 'linear-gradient(160deg,#831843,#f472b6)' },
  { id: 10, type: 'friend', avatar: '#2dd4bf', name: 'NE crew',             text: 'Your NE crew is going to Weird Nightmare at Polaris Hall',            poster: 'linear-gradient(160deg,#064e3b,#2dd4bf)' },
  { id: 11, type: 'friend', avatar: '#f97316', name: 'salsamove',           text: 'is going to Laffy Taffy: Freaknik Edition at Holocene',              poster: 'linear-gradient(160deg,#7c2d12,#f97316)' },
  { id: 12, type: 'friend', avatar: '#7c3aed', name: 'neonrose',            text: 'is now a Regular at Showbar',                                        poster: 'linear-gradient(160deg,#4c1d95,#7c3aed)' },
  { id: 13, type: 'friend', avatar: '#fb923c', name: 'drummerboy',          text: 'liked Marshall Crenshaw at Polaris Hall',                            poster: 'linear-gradient(160deg,#1e3a5f,#38bdf8)' },
  { id: 14, type: 'friend', avatar: '#a3e635', name: 'jazzfan99',           text: 'is going to Babes in Canyon at Holocene',                            poster: 'linear-gradient(160deg,#365314,#a3e635)' },
  { id: 15, type: 'venue',  avatar: '#0f172a', name: 'Mississippi Studios', text: 'Stumpfest XI presale ends tonight — 12 bands, 2 days, all ages',     poster: 'linear-gradient(160deg,#3730a3,#818cf8)' },
]

// ── Mock lineup (fallback when not logged in / no RSVPs) ───────────────────

const mockLineup = [
  { id: 'ml1', title: 'Low Bar Chorale',                      venue: 'Showbar',            starts_at: '2026-04-18T20:00:00', poster_url: null, color: '#4c1d95' },
  { id: 'ml2', title: 'Stumpfest XI',                         venue: 'Mississippi Studios', starts_at: '2026-04-19T19:00:00', poster_url: null, color: '#3730a3' },
  { id: 'ml3', title: 'Weird Nightmare',                      venue: 'Polaris Hall',        starts_at: '2026-04-22T20:00:00', poster_url: null, color: '#0c4a6e' },
  { id: 'ml4', title: 'Laffy Taffy: Freaknik Edition',        venue: 'Holocene',            starts_at: '2026-04-25T22:00:00', poster_url: null, color: '#7c2d12' },
  { id: 'ml5', title: 'Babes in Canyon',                      venue: 'Holocene',            starts_at: '2026-04-26T20:00:00', poster_url: null, color: '#365314' },
  { id: 'ml6', title: 'Marshall Crenshaw',                    venue: 'Polaris Hall',        starts_at: '2026-04-28T19:30:00', poster_url: null, color: '#1e3a5f' },
]

const diamondQueue = ['#4c1d95', '#831843', '#0c4a6e', '#365314', '#7c2d12']

// ── Types ──────────────────────────────────────────────────────────────────

interface EventRow { id: string; title: string; poster_url: string; venue_name: string }

interface LineupItem {
  id: string; title: string; venue: string; starts_at: string
  poster_url: string | null; color: string
}

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
  const d = new Date(iso), h = d.getHours(), m = d.getMinutes()
  const h12 = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2,'0')}${ap}`
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DiamondImg({ color, posterUrl, size = 28 }: { color: string; posterUrl: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, background: color, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      {posterUrl && <img src={posterUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />}
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

// ── Main ───────────────────────────────────────────────────────────────────

export default function LineUpScreen() {
  const { user } = useAuth()
  const [events, setEvents] = useState<EventRow[]>([])
  const [lineup, setLineup] = useState<LineupItem[]>(mockLineup)
  const [panelOpen, setPanelOpen] = useState(false)

  // Fetch poster images for feed diamonds and queue
  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, poster_url, venues(name)')
      .not('poster_url', 'is', null)
      .order('starts_at', { ascending: true })
      .limit(20)
      .then(({ data }) => {
        if (data) setEvents(data.map((e: any) => ({ id: e.id, title: e.title, poster_url: e.poster_url, venue_name: e.venues?.name ?? '' })))
      })
  }, [])

  // Fetch user's real RSVPs
  useEffect(() => {
    if (!user) return
    const now = new Date().toISOString()
    supabase
      .from('attendees')
      .select('event_id, events(id, title, starts_at, poster_url, venues(name))')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const items: LineupItem[] = ((data ?? []) as any[])
          .filter(r => r.events?.starts_at >= now)
          .map(r => {
            const ev = r.events as any
            return { id: r.event_id, title: ev.title ?? 'Event', venue: ev.venues?.name ?? '', starts_at: ev.starts_at, poster_url: ev.poster_url ?? null, color: '#2e1065' }
          })
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        if (items.length > 0) setLineup(items)
      })
  }, [user])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* Header — outside content area, always visible */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 20, color: 'var(--fg)' }}>plaster</span>
        <button
          onClick={() => setPanelOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', color: panelOpen ? 'var(--fg)' : 'var(--fg-40)', textTransform: 'uppercase', transition: 'color 0.2s' }}
        >
          {panelOpen ? 'LINE UP ×' : 'LINE UP'}
        </button>
      </div>

      {/* Content area — panels are constrained here, nav is never covered */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Diamond queue */}
        <div style={{ position: 'absolute', right: 10, top: 4, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5, pointerEvents: 'none' }}>
          {diamondQueue.map((color, i) => (
            <DiamondImg key={i} color={color} posterUrl={events[i]?.poster_url ?? null} size={34} />
          ))}
        </div>

        {/* Feed */}
        <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
          {mockFeed.map((item, i) => (
            <React.Fragment key={item.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 54px 9px', paddingLeft: item.type === 'friend' ? 24 : 14 }}>
                <DiamondImg color={item.avatar} posterUrl={matchPoster(item, events)} size={28} />
                <div style={{ flex: 1, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.35 }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{item.name}</span> {item.text}
                </div>
              </div>
              {(i + 1) % 4 === 0 && <div style={{ height: 1, background: 'rgba(128,128,128,0.15)', margin: '0 14px' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* LINE UP panel — slides in from right, constrained to content area */}
        <div style={{
          position: 'absolute', inset: 0, right: panelOpen ? 0 : '-100%',
          background: 'var(--bg)', zIndex: 10, display: 'flex', flexDirection: 'column',
          transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', flexShrink: 0, borderBottom: '1px solid var(--fg-08)' }}>
            <div>
              <p style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0 }}>Your Line Up</p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '2px 0 0 0' }}>{lineup.length} upcoming</p>
            </div>
            <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, color: 'var(--fg-40)', padding: '4px 8px', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {lineup.map(item => <LineupRow key={item.id} item={item} />)}
          </div>
        </div>

      </div>

      {/* Bottom nav — sibling of content area, never covered by panels */}
      <BottomNav />

    </div>
  )
}
