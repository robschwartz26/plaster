import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UploadRow {
  id: string
  title: string
  poster_url: string | null
  starts_at: string
  created_at: string
  status: string
  category: string | null
  venue_name: string | null
  neighborhood: string | null
  uploader: string | null
}

type ColKey = 'title' | 'venue' | 'neighborhood' | 'type' | 'uploader' | 'date'
type SortDir = 'asc' | 'desc'
type ViewMode = 'list' | 'thumbnails'
interface SortState { col: ColKey; dir: SortDir }

// ── Persist color-code preference ────────────────────────────
const COLOR_PREF_KEY = 'upload-history-color-code'
function loadColorOn(): boolean {
  try { return localStorage.getItem(COLOR_PREF_KEY) !== 'false' } catch { return true }
}
function saveColorOn(v: boolean) {
  try { localStorage.setItem(COLOR_PREF_KEY, v ? 'true' : 'false') } catch { /* noop */ }
}

// ── Color ramp: cool → warm ───────────────────────────────────
// Chosen to read clearly on both the dark night bg (#0c0b0b) and cream day bg (#f0ece3)
const COL_COLORS: Record<string, string> = {
  venue:        '#4a9eed', // blue
  neighborhood: '#29b87a', // emerald-green
  type:         '#d4960a', // amber-gold
  uploader:     '#e0671a', // orange
}
function colColor(col: string, on: boolean): string {
  return on ? (COL_COLORS[col] ?? 'var(--fg)') : 'var(--fg)'
}

// ── Table layout ──────────────────────────────────────────────
// poster | title | venue | neighborhood | type | uploader | date | status
const GRID = '44px minmax(110px,2fr) minmax(88px,1.5fr) minmax(80px,1.2fr) 74px 86px 66px 70px'
const MIN_TABLE_W = 620

// ── Helpers ───────────────────────────────────────────────────
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric',
  })
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    published: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)', label: 'LIVE' },
    pending:   { color: '#d97706', bg: 'rgba(217,119,6,0.12)',  border: 'rgba(217,119,6,0.3)',  label: 'PENDING' },
    rejected:  { color: '#8a9bb0', bg: 'rgba(138,155,176,0.1)', border: 'rgba(138,155,176,0.25)', label: 'REJECTED' },
  }
  const s = cfg[status] ?? cfg.pending
  return (
    <span style={{
      fontFamily: '"Barlow Condensed", sans-serif', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      padding: '2px 5px', borderRadius: 3, flexShrink: 0, lineHeight: 1.3, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ── Sort ──────────────────────────────────────────────────────
function applySortState(rows: UploadRow[], { col, dir }: SortState): UploadRow[] {
  const mult = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp = 0
    switch (col) {
      case 'title':        cmp = a.title.localeCompare(b.title); break
      case 'venue':        cmp = (a.venue_name ?? '').localeCompare(b.venue_name ?? ''); break
      case 'neighborhood':
        cmp = (a.neighborhood ?? '').localeCompare(b.neighborhood ?? '')
        if (cmp === 0) cmp = (a.venue_name ?? '').localeCompare(b.venue_name ?? '')
        break
      case 'type':         cmp = (a.category ?? '').localeCompare(b.category ?? ''); break
      case 'uploader':     cmp = (a.uploader ?? '').localeCompare(b.uploader ?? ''); break
      case 'date':         cmp = a.created_at.localeCompare(b.created_at); break
    }
    if (cmp === 0 && col !== 'date') {
      return b.created_at.localeCompare(a.created_at) // secondary: always date desc
    }
    return cmp * mult
  })
}

// ── Segmented button helper ───────────────────────────────────
function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 8px', borderRadius: 5, flexShrink: 0,
      border: active ? '1px solid rgba(168,85,247,0.4)' : '1px solid var(--fg-15)',
      background: active ? 'rgba(168,85,247,0.1)' : 'transparent',
      color: active ? '#A855F7' : 'var(--fg-55)',
      fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
      cursor: 'pointer', transition: 'all 0.12s',
    }}>
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────
export function UploadHistory() {
  const [rows, setRows] = useState<UploadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortState>({ col: 'date', dir: 'desc' })
  const [view, setView] = useState<ViewMode>('list')
  const [colorOn, setColorOn] = useState(loadColorOn)

  useEffect(() => {
    supabase.rpc('upload_history', { p_limit: 200 }).then(({ data }) => {
      setRows((data ?? []) as UploadRow[])
      setLoading(false)
    })
  }, [])

  function handleSort(col: ColKey) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { col, dir: col === 'date' ? 'desc' : 'asc' }
    )
  }

  function toggleColor() {
    setColorOn(v => { const next = !v; saveColorOn(next); return next })
  }

  const sorted = applySortState(rows, sort)

  // Arrow indicator for active sort column
  const arrow = (col: ColKey) => sort.col === col ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''

  // Header cell style
  const hdrCell = (col: ColKey, sortable: boolean, align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '5px 8px 6px',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 10, fontWeight: sort.col === col ? 800 : 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    color: sort.col === col ? colColor(col, colorOn) : 'var(--fg-55)',
    cursor: sortable ? 'pointer' : 'default',
    userSelect: 'none',
    textAlign: align,
    borderBottom: '2px solid var(--fg-15)',
    background: 'var(--bg)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
  })

  // Data cell style
  const dataCell = (col?: string): React.CSSProperties => ({
    padding: '6px 8px',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid var(--fg-08)',
    color: col ? colColor(col, colorOn) : 'var(--fg)',
    fontWeight: col ? 500 : 600,
  })

  // ── Top control bar ──
  const controls = (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-55)', flexShrink: 0 }}>
        {loading ? '…' : `${rows.length} upload${rows.length !== 1 ? 's' : ''}`}
      </span>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
        <SegBtn active={view === 'list'} onClick={() => setView('list')}>List</SegBtn>
        <SegBtn active={view === 'thumbnails'} onClick={() => setView('thumbnails')}>Thumbs</SegBtn>
      </div>

      {/* Color code toggle */}
      <button
        onClick={toggleColor}
        title={colorOn ? 'Turn off color coding' : 'Turn on color coding'}
        style={{
          padding: '3px 8px', borderRadius: 5, flexShrink: 0,
          border: colorOn ? '1px solid rgba(168,85,247,0.4)' : '1px solid var(--fg-15)',
          background: colorOn ? 'rgba(168,85,247,0.1)' : 'transparent',
          color: colorOn ? '#A855F7' : 'var(--fg-40)',
          fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.12s',
        }}
      >
        Color code
      </button>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {controls}
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>Loading…</p>
    </div>
  )

  if (rows.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {controls}
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', fontStyle: 'italic' }}>No uploads found.</p>
    </div>
  )

  // ── THUMBNAIL VIEW ──────────────────────────────────────────
  if (view === 'thumbnails') {
    const thumbSortCols: { col: ColKey; label: string }[] = [
      { col: 'date', label: 'Date' },
      { col: 'title', label: 'Title' },
      { col: 'venue', label: 'Venue' },
      { col: 'type', label: 'Type' },
      { col: 'uploader', label: 'Uploader' },
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {controls}
        {/* Compact sort row for thumbnails */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', marginRight: 4 }}>Sort</span>
          {thumbSortCols.map(({ col, label }) => (
            <SegBtn key={col} active={sort.col === col} onClick={() => handleSort(col)}>
              {label}{sort.col === col ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
            </SegBtn>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
            {sorted.map(row => (
              <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ position: 'relative', paddingBottom: '140%', borderRadius: 5, overflow: 'hidden', background: 'var(--fg-08)' }}>
                  {row.poster_url ? (
                    <img
                      src={row.poster_url} loading="lazy" alt={row.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, background: 'var(--fg-08)' }} />
                  )}
                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <StatusPill status={row.status} />
                  </div>
                </div>
                <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                  {row.title}
                </div>
                {row.venue_name && (
                  <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: colColor('venue', colorOn), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                    {row.venue_name}
                  </div>
                )}
                {row.category && (
                  <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: colColor('type', colorOn), lineHeight: 1.2 }}>
                    {row.category}
                  </div>
                )}
                <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'var(--fg-40)', lineHeight: 1.2 }}>
                  {fmtShort(row.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── LIST VIEW → column table ────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {controls}

      {/* Scrollable table area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, minWidth: MIN_TABLE_W }}>

          {/* ── Header row ── */}
          {/* Poster header: no label, no sort */}
          <div style={{ ...hdrCell('date', false), cursor: 'default' }} />

          <div style={hdrCell('title', true)} onClick={() => handleSort('title')}>
            <span style={{ color: sort.col === 'title' ? 'var(--fg)' : 'var(--fg-55)', fontWeight: sort.col === 'title' ? 800 : 700 }}>
              Title{arrow('title')}
            </span>
          </div>

          <div style={hdrCell('venue', true)} onClick={() => handleSort('venue')}>
            <span style={{ color: sort.col === 'venue' ? colColor('venue', colorOn) : (colorOn ? colColor('venue', colorOn) : 'var(--fg-55)'), fontWeight: sort.col === 'venue' ? 800 : 700 }}>
              Venue{arrow('venue')}
            </span>
          </div>

          <div style={hdrCell('neighborhood', true)} onClick={() => handleSort('neighborhood')}>
            <span style={{ color: sort.col === 'neighborhood' ? colColor('neighborhood', colorOn) : (colorOn ? colColor('neighborhood', colorOn) : 'var(--fg-55)'), fontWeight: sort.col === 'neighborhood' ? 800 : 700 }}>
              Neighborhood{arrow('neighborhood')}
            </span>
          </div>

          <div style={hdrCell('type', true)} onClick={() => handleSort('type')}>
            <span style={{ color: sort.col === 'type' ? colColor('type', colorOn) : (colorOn ? colColor('type', colorOn) : 'var(--fg-55)'), fontWeight: sort.col === 'type' ? 800 : 700 }}>
              Type{arrow('type')}
            </span>
          </div>

          <div style={hdrCell('uploader', true)} onClick={() => handleSort('uploader')}>
            <span style={{ color: sort.col === 'uploader' ? colColor('uploader', colorOn) : (colorOn ? colColor('uploader', colorOn) : 'var(--fg-55)'), fontWeight: sort.col === 'uploader' ? 800 : 700 }}>
              Uploader{arrow('uploader')}
            </span>
          </div>

          <div style={{ ...hdrCell('date', true), justifyContent: 'flex-end' }} onClick={() => handleSort('date')}>
            <span style={{ color: sort.col === 'date' ? 'var(--fg)' : 'var(--fg-55)', fontWeight: sort.col === 'date' ? 800 : 700 }}>
              Date{arrow('date')}
            </span>
          </div>

          <div style={{ ...hdrCell('date', false), cursor: 'default', justifyContent: 'center' }}>
            <span style={{ color: 'var(--fg-55)', fontWeight: 700 }}>Status</span>
          </div>

          {/* ── Data rows ── */}
          {sorted.map(row => (
            <React.Fragment key={row.id}>
              {/* Poster thumb */}
              <div style={{ ...dataCell(), padding: '5px 6px 5px 8px' }}>
                {row.poster_url ? (
                  <img
                    src={row.poster_url} loading="lazy" alt=""
                    style={{ width: 30, height: 42, borderRadius: 3, objectFit: 'cover', display: 'block', flexShrink: 0, border: '1px solid var(--fg-08)' }}
                  />
                ) : (
                  <div style={{ width: 30, height: 42, borderRadius: 3, background: 'var(--fg-08)', flexShrink: 0 }} />
                )}
              </div>

              {/* Title */}
              <div style={{ ...dataCell(), fontWeight: 600, color: 'var(--fg)' }}>
                {row.title}
              </div>

              {/* Venue */}
              <div style={{ ...dataCell('venue') }}>
                {row.venue_name ?? '—'}
              </div>

              {/* Neighborhood */}
              <div style={{ ...dataCell('neighborhood') }}>
                {row.neighborhood ?? '—'}
              </div>

              {/* Type */}
              <div style={{ ...dataCell('type') }}>
                {row.category ?? '—'}
              </div>

              {/* Uploader */}
              <div style={{ ...dataCell('uploader') }}>
                {row.uploader ? `@${row.uploader}` : '—'}
              </div>

              {/* Date */}
              <div style={{ ...dataCell(), justifyContent: 'flex-end', color: 'var(--fg-65)', fontWeight: 500 }}>
                {fmtShort(row.created_at)}
              </div>

              {/* Status */}
              <div style={{ ...dataCell(), justifyContent: 'center' }}>
                <StatusPill status={row.status} />
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

// Need React for React.Fragment
import React from 'react'
