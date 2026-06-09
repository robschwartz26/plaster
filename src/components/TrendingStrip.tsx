import { type WallEvent } from '@/types/event'
import { posterThumb } from '@/lib/posterThumb'

interface Props {
  events: WallEvent[]
  onOpenEvent: (id: string) => void
}

// Exported so LINE UP can check the count before rendering a section header.
export function computeTrendingTop(events: WallEvent[]): WallEvent[] {
  const groups = new Map<string, WallEvent>()
  for (const e of events) {
    if (e.trending_score <= 0) continue
    const key = e.recurrence_group_id ?? `${e.venue_name}|${e.title.toLowerCase()}`
    const prev = groups.get(key)
    if (
      !prev
      || e.trending_score > prev.trending_score
      || (e.trending_score === prev.trending_score && e.starts_at < prev.starts_at)
    ) {
      groups.set(key, e)
    }
  }
  return Array.from(groups.values())
    .sort((a, b) => b.trending_score - a.trending_score)
    .slice(0, 10)
}

export function TrendingStrip({ events, onOpenEvent }: Props) {
  const top = computeTrendingTop(events)
  if (top.length < 3) return null

  return (
    <div style={{
      flexShrink: 0,
      borderBottom: '1px solid var(--fg-08)',
      paddingBottom: 8,
    }}>
      {/* Label */}
      <div style={{
        padding: '6px 12px 4px',
        fontFamily: '"Barlow Condensed", sans-serif',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--fg-40)',
      }}>
        Trending
      </div>

      {/* Horizontally scrollable tile row */}
      <div style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingLeft: 12,
        paddingRight: 12,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {top.map((e, i) => (
            <button
              key={e.id}
              onClick={() => onOpenEvent(e.id)}
              style={{
                flexShrink: 0,
                width: 72,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {/* Poster */}
              <div style={{
                position: 'relative',
                width: 72,
                paddingBottom: '150%',
                borderRadius: 5,
                overflow: 'hidden',
                background: 'var(--fg-08)',
              }}>
                {e.poster_url ? (
                  <img
                    src={posterThumb(e.poster_url, 120) ?? e.poster_url}
                    onError={ev => { const img = ev.currentTarget; img.onerror = null; img.src = e.poster_url! }}
                    alt={e.title}
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      objectFit: 'cover', display: 'block',
                    }}
                  />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, background: e.color2 }} />
                )}
                {/* Rank badge */}
                <div style={{
                  position: 'absolute', top: 4, left: 4,
                  width: 18, height: 18,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.62)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: '"Barlow Condensed", sans-serif',
                  fontSize: 10, fontWeight: 700, color: '#f0ece3',
                  lineHeight: 1,
                }}>
                  {i + 1}
                </div>
              </div>

              {/* Title */}
              <div style={{
                marginTop: 4,
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 10, fontWeight: 600,
                color: 'var(--fg-80)',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: 72,
              }}>
                {e.title}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import React from 'react'
