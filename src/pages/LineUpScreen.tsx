import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const mockFeed = [
  { id: 1,  type: 'friend', avatar: '#7c3aed', name: 'neonrose',           text: 'is going to Low Bar Chorale at Showbar',                               poster: 'linear-gradient(160deg,#4c1d95,#7c3aed)' },
  { id: 2,  type: 'venue',  avatar: '#0f172a', name: 'Holocene',            text: 'Small Skies, My Body & Frecks on the same bill Friday — don\'t sleep', poster: 'linear-gradient(160deg,#0c4a6e,#38bdf8)' },
  { id: 3,  type: 'friend', avatar: '#ec4899', name: 'bobbybones',          text: 'liked Disco Always: A Harry Styles Dance Night',                      poster: 'linear-gradient(160deg,#831843,#ec4899)' },
  { id: 4,  type: 'friend', avatar: '#fb923c', name: 'drummerboy',          text: 'is going to Stumpfest XI at Mississippi Studios',                     poster: 'linear-gradient(160deg,#3730a3,#818cf8)' },
  { id: 5,  type: 'friend', avatar: '#a3e635', name: 'jazzfan99',           text: 'went to the Charlie Brown III Quartet at The 1905 last night',        poster: 'linear-gradient(160deg,#365314,#a3e635)' },
  { id: 6,  type: 'artist', avatar: '#818cf8', name: 'The Wallflowers',     text: 'Portland. Revolution Hall. Tonight. See you there.',                  poster: 'linear-gradient(160deg,#1e3a8a,#818cf8)' },
  { id: 7,  type: 'friend', avatar: '#7dd3fc', name: 'pdxnights',           text: 'wrote on the Banff Mountain Film Festival wall: "the ski BASE jump segment had the whole room holding its breath"', poster: 'linear-gradient(160deg,#0c4a6e,#7dd3fc)' },
  { id: 8,  type: 'venue',  avatar: '#0f172a', name: 'Revolution Hall',     text: 'Jenny Lawson tonight — doors 7pm, show 8pm. We\'re already crying.',  poster: 'linear-gradient(160deg,#7c2d12,#fb923c)' },
  { id: 9,  type: 'friend', avatar: '#f472b6', name: 'glitterqueen',        text: '👑 was crowned Most Likely to Know Every Word at Holocene',           poster: 'linear-gradient(160deg,#831843,#f472b6)' },
  { id: 10, type: 'friend', avatar: '#2dd4bf', name: 'NE crew',             text: 'Your NE crew is going to Weird Nightmare at Polaris Hall',            poster: 'linear-gradient(160deg,#064e3b,#2dd4bf)' },
  { id: 11, type: 'friend', avatar: '#f97316', name: 'salsamove',           text: 'is going to Laffy Taffy: Freaknik Edition at Holocene',              poster: 'linear-gradient(160deg,#7c2d12,#f97316)' },
  { id: 12, type: 'friend', avatar: '#7c3aed', name: 'neonrose',            text: 'is now a Regular at Showbar',                                        poster: 'linear-gradient(160deg,#4c1d95,#7c3aed)' },
  { id: 13, type: 'friend', avatar: '#fb923c', name: 'drummerboy',          text: 'liked Marshall Crenshaw at Polaris Hall',                            poster: 'linear-gradient(160deg,#1e3a5f,#38bdf8)' },
  { id: 14, type: 'friend', avatar: '#a3e635', name: 'jazzfan99',           text: 'is going to Babes in Canyon at Holocene',                            poster: 'linear-gradient(160deg,#365314,#a3e635)' },
  { id: 15, type: 'venue',  avatar: '#0f172a', name: 'Mississippi Studios', text: 'Stumpfest XI presale ends tonight — 12 bands, 2 days, all ages',     poster: 'linear-gradient(160deg,#3730a3,#818cf8)' },
]

const diamondQueue = ['#4c1d95', '#831843', '#0c4a6e', '#365314', '#7c2d12']

interface EventRow { id: string; title: string; poster_url: string; venue_name: string }

function matchPoster(item: typeof mockFeed[0], events: EventRow[]): string | null {
  if (!events.length) return null
  const needle = (item.name + ' ' + item.text).toLowerCase()
  // Try exact title or venue match first
  for (const ev of events) {
    if (needle.includes(ev.title.toLowerCase()) || needle.includes(ev.venue_name.toLowerCase())) {
      return ev.poster_url
    }
  }
  return null
}

function DiamondImg({ color, posterUrl, size = 28 }: { color: string; posterUrl: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, background: color, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      {posterUrl && (
        <img
          src={posterUrl}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          draggable={false}
        />
      )}
    </div>
  )
}

export default function LineUpScreen() {
  const [events, setEvents] = useState<EventRow[]>([])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 20, color: 'var(--fg)' }}>plaster</span>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', color: 'var(--fg-40)' }}>LINE UP</span>
      </div>

      {/* Diamond queue */}
      <div style={{ position: 'absolute', right: 10, top: 52, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 5, pointerEvents: 'none' }}>
        {diamondQueue.map((color, i) => (
          <DiamondImg key={i} color={color} posterUrl={events[i]?.poster_url ?? null} size={34} />
        ))}
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
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

    </div>
  )
}
