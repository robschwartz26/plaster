import React from 'react'

const mockFeed = [
  { id: 1, avatar: '#7c3aed', name: 'neonrose', text: 'is going to Low Bar Chorale', poster: '#4c1d95' },
  { id: 2, avatar: '#1a1a2e', name: 'Holocene', text: 'just added Weird Nightmare · Apr 28', poster: '#0c4a6e' },
  { id: 3, avatar: '#ec4899', name: 'bobbybones', text: 'liked Drag Extravaganza', poster: '#831843' },
  { id: 4, avatar: '#1a1a2e', name: 'Mississippi Studios', text: 'Stumpfest XI lineup is wild this year', poster: '#3730a3' },
  { id: 5, avatar: '#a3e635', name: 'jazzfan99', text: 'went to Gallery Opening last night', poster: '#365314' },
  { id: 6, avatar: '#f97316', name: 'salsamove', text: 'is going to Bachata Night', poster: '#7c2d12' },
  { id: 7, avatar: '#818cf8', name: 'The Wallflowers', text: 'see you tonight Portland', poster: '#0c4a6e' },
  { id: 8, avatar: '#1a1a2e', name: 'Revolution Hall', text: 'doors at 7, show at 8 — sold out tonight', poster: '#7c2d12' },
  { id: 9, avatar: '#f472b6', name: 'glitterqueen', text: 'was crowned Queen of Holocene', poster: '#831843' },
  { id: 10, avatar: '#7dd3fc', name: 'pdxnights', text: 'wrote on the Banff wall: best film fest in years', poster: '#0c4a6e' },
  { id: 11, avatar: '#fb923c', name: 'drummerboy', text: 'is going to Stumpfest XI', poster: '#3730a3' },
  { id: 12, avatar: '#1a1a2e', name: 'Showbar', text: 'Low Bar Chorale tonight — get there early', poster: '#4c1d95' },
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px' }}>
              <div style={{ width: 28, height: 28, background: item.avatar, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', flexShrink: 0 }} />
              <div style={{ flex: 1, fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.35 }}>
                <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{item.name}</span> {item.text}
              </div>
              <div style={{ width: 18, height: 27, background: item.poster, borderRadius: 2, flexShrink: 0 }} />
            </div>
            {(i + 1) % 4 === 0 && <div style={{ height: 1, background: 'rgba(128,128,128,0.15)', margin: '0 14px' }} />}
          </React.Fragment>
        ))}
      </div>

    </div>
  )
}
