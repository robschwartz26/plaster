import React from 'react'

const mockFeed = [
  // going
  { id: 1,  avatar: '#7c3aed', name: 'neonrose',        text: 'is going to Low Bar Chorale at Showbar',                               poster: 'linear-gradient(160deg,#4c1d95,#7c3aed)' },
  // venue shout
  { id: 2,  avatar: '#0f172a', name: 'Holocene',         text: 'Small Skies, My Body & Frecks on the same bill Friday — don\'t sleep', poster: 'linear-gradient(160deg,#0c4a6e,#38bdf8)' },
  // liked
  { id: 3,  avatar: '#ec4899', name: 'bobbybones',       text: 'liked Disco Always: A Harry Styles Dance Night',                      poster: 'linear-gradient(160deg,#831843,#ec4899)' },
  // going
  { id: 4,  avatar: '#fb923c', name: 'drummerboy',       text: 'is going to Stumpfest XI at Mississippi Studios',                     poster: 'linear-gradient(160deg,#3730a3,#818cf8)' },
  // past attended
  { id: 5,  avatar: '#a3e635', name: 'jazzfan99',        text: 'went to the Charlie Brown III Quartet at The 1905 last night',        poster: 'linear-gradient(160deg,#365314,#a3e635)' },
  // artist shout
  { id: 6,  avatar: '#818cf8', name: 'The Wallflowers',  text: 'Portland. Revolution Hall. Tonight. See you there.',                  poster: 'linear-gradient(160deg,#1e3a8a,#818cf8)' },
  // wall post
  { id: 7,  avatar: '#7dd3fc', name: 'pdxnights',        text: 'wrote on the Banff Mountain Film Festival wall: "the ski BASE jump segment had the whole room holding its breath"', poster: 'linear-gradient(160deg,#0c4a6e,#7dd3fc)' },
  // venue shout
  { id: 8,  avatar: '#0f172a', name: 'Revolution Hall',  text: 'Jenny Lawson tonight — doors 7pm, show 8pm. We\'re already crying.',  poster: 'linear-gradient(160deg,#7c2d12,#fb923c)' },
  // superlative
  { id: 9,  avatar: '#f472b6', name: 'glitterqueen',     text: '👑 was crowned Most Likely to Know Every Word at Holocene',           poster: 'linear-gradient(160deg,#831843,#f472b6)' },
  // group activity
  { id: 10, avatar: '#2dd4bf', name: 'NE crew',          text: 'Your NE crew is going to Weird Nightmare at Polaris Hall',            poster: 'linear-gradient(160deg,#064e3b,#2dd4bf)' },
  // going
  { id: 11, avatar: '#f97316', name: 'salsamove',        text: 'is going to Laffy Taffy: Freaknik Edition at Holocene',              poster: 'linear-gradient(160deg,#7c2d12,#f97316)' },
  // new regular
  { id: 12, avatar: '#7c3aed', name: 'neonrose',         text: 'is now a Regular at Showbar',                                        poster: 'linear-gradient(160deg,#4c1d95,#7c3aed)' },
  // liked
  { id: 13, avatar: '#fb923c', name: 'drummerboy',       text: 'liked Marshall Crenshaw at Polaris Hall',                            poster: 'linear-gradient(160deg,#1e3a5f,#38bdf8)' },
  // going
  { id: 14, avatar: '#a3e635', name: 'jazzfan99',        text: 'is going to Babes in Canyon at Holocene',                            poster: 'linear-gradient(160deg,#365314,#a3e635)' },
  // venue shout
  { id: 15, avatar: '#0f172a', name: 'Mississippi Studios', text: 'Stumpfest XI presale ends tonight — 12 bands, 2 days, all ages',  poster: 'linear-gradient(160deg,#3730a3,#818cf8)' },
]

const diamondQueue = ['#4c1d95', '#831843', '#0c4a6e', '#365314', '#7c2d12']

export default function LineUpScreen() {
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
          <div key={i} style={{ width: 34, height: 34, background: color, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
        ))}
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {mockFeed.map((item, i) => (
          <React.Fragment key={item.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', paddingRight: 54 }}>
              <div style={{ width: 28, height: 28, background: item.avatar, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', flexShrink: 0 }} />
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
