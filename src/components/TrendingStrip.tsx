import React, { useState } from 'react'
import { type WallEvent } from '@/types/event'
import { posterThumb } from '@/lib/posterThumb'

const OPEN_KEY = 'wall-trending-open'
const CURTAIN_W = 20  // px — solid bg band width for 'curtain' edgeStyle

function loadOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === 'true' } catch { return false }
}

interface Props {
  events: WallEvent[]
  onOpenEvent: (id: string) => void
  alwaysExpanded?: boolean
  // 'card'    — contained card with bg/border/radius; tiles scroll inside rounded edge
  // 'curtain' — no card; solid page-bg band + hairline seam at right boundary
  // undefined — bare look (Wall's collapsed-pill instance)
  edgeStyle?: 'card' | 'curtain'
}

// Exported so consumers (LINE UP) can check count before rendering a section header.
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

export function TrendingStrip({ events, onOpenEvent, alwaysExpanded, edgeStyle }: Props) {
  const [open, setOpen] = useState<boolean>(() => alwaysExpanded ? true : loadOpen())

  const top = computeTrendingTop(events)
  if (top.length < 3) return null

  function toggle() {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(OPEN_KEY, next ? 'true' : 'false') } catch { /* noop */ }
  }

  const tiles = top.map((e, i) => (
    <button
      key={e.id}
      onClick={() => onOpenEvent(e.id)}
      style={{
        flexShrink: 0, width: 72,
        background: 'none', border: 'none', padding: 0,
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{
        position: 'relative', width: 72, paddingBottom: '150%',
        borderRadius: 5, overflow: 'hidden', background: 'var(--fg-08)',
      }}>
        {e.poster_url ? (
          <img
            src={posterThumb(e.poster_url, 120) ?? e.poster_url}
            onError={ev => { const img = ev.currentTarget; img.onerror = null; img.src = e.poster_url! }}
            alt={e.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: e.color2 }} />
        )}
        <div style={{
          position: 'absolute', top: 4, left: 4, width: 18, height: 18,
          borderRadius: '50%', background: 'rgba(0,0,0,0.62)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700,
          color: '#f0ece3', lineHeight: 1,
        }}>
          {i + 1}
        </div>
      </div>
      <div style={{
        marginTop: 4, fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 10, fontWeight: 600, color: 'var(--fg-80)',
        lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', width: 72,
      }}>
        {e.title}
      </div>
    </button>
  ))

  // Standard scroll container — used by bare, card, and wall modes
  const tileRow = (
    <div style={{
      overflowX: 'auto',
      overflowY: 'hidden',
      paddingLeft: 12,
      paddingRight: 12,
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
    } as React.CSSProperties}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingBottom: 8 }}>
        {tiles}
      </div>
    </div>
  )

  // ── Card variant ──────────────────────────────────────────────────────────
  // Tiles scroll within the card's overflow-hidden rounded border.
  // Label lives inside the card. The caller (LINE UP) sets a right margin on
  // its wrapper so the card's right edge stops clear of the poster spine.
  if (edgeStyle === 'card') {
    return (
      <div style={{
        background: 'color-mix(in srgb, var(--bg) 85%, var(--fg) 15%)',
        border: '1px solid var(--fg-15)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 14px 4px',
          fontFamily: '"Barlow Condensed", sans-serif',
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--fg-40)',
        }}>
          Trending in Portland
        </div>
        {tileRow}
      </div>
    )
  }

  // ── Curtain variant ───────────────────────────────────────────────────────
  // No card — scroll container has extra right padding; an absolutely-positioned
  // solid band + hairline seam sits at the right boundary, tiles slide behind it.
  // Switch LINE UP to this with edgeStyle="curtain".
  if (edgeStyle === 'curtain') {
    return (
      <div style={{ position: 'relative', overflow: 'hidden', marginBottom: 4 }}>
        <div style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingLeft: 12,
          paddingRight: 12 + CURTAIN_W,
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingBottom: 8 }}>
            {tiles}
          </div>
        </div>
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: CURTAIN_W,
          background: 'var(--bg)',
          borderLeft: '1px solid var(--fg-15)',
          pointerEvents: 'none',
        }} />
      </div>
    )
  }

  // ── LINE UP bare mode ─────────────────────────────────────────────────────
  if (alwaysExpanded) {
    return <div style={{ marginBottom: 4 }}>{tileRow}</div>
  }

  // ── Wall mode: quiet pill + animated collapse ─────────────────────────────
  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--fg-08)' }}>
      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', background: 'none', border: 'none',
          cursor: 'pointer', width: '100%',
        }}
      >
        <span style={{
          fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10,
          fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#A855F7',
        }}>
          ▲ Trending
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--fg-40)" strokeWidth="2.5" strokeLinecap="round"
          style={{
            marginLeft: 2, flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div style={{
        maxHeight: open ? 220 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.2s ease, opacity 0.15s ease',
      }}>
        {tileRow}
      </div>
    </div>
  )
}
