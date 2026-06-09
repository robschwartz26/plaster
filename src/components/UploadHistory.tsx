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

type SortKey = 'recent' | 'venue' | 'neighborhood' | 'type'
type ViewMode = 'list' | 'thumbnails'

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    published: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)', label: 'LIVE' },
    pending:   { color: 'rgba(217,119,6,0.9)', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.3)', label: 'PENDING' },
    rejected:  { color: 'rgba(248,113,113,0.7)', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', label: 'REJECTED' },
  }
  const s = cfg[status] ?? cfg.pending
  return (
    <span style={{
      fontFamily: '"Barlow Condensed", sans-serif', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      padding: '2px 5px', borderRadius: 3, flexShrink: 0, lineHeight: 1.2,
    }}>
      {s.label}
    </span>
  )
}

function PosterThumb({ url, size = 40 }: { url: string | null; size?: number }) {
  const w = size; const h = Math.round(size * 1.4)
  if (!url) return (
    <div style={{ width: w, height: h, flexShrink: 0, borderRadius: 4, background: 'var(--fg-08)', border: '1px solid var(--fg-08)' }} />
  )
  return (
    <img
      src={url} loading="lazy" alt=""
      style={{ width: w, height: h, flexShrink: 0, borderRadius: 4, objectFit: 'cover', display: 'block', border: '1px solid var(--fg-08)' }}
    />
  )
}

function sortRows(rows: UploadRow[], sort: SortKey): UploadRow[] {
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'venue': {
        const vCmp = (a.venue_name ?? '').localeCompare(b.venue_name ?? '')
        if (vCmp !== 0) return vCmp
        return b.created_at.localeCompare(a.created_at)
      }
      case 'neighborhood': {
        const nCmp = (a.neighborhood ?? '').localeCompare(b.neighborhood ?? '')
        if (nCmp !== 0) return nCmp
        const vCmp = (a.venue_name ?? '').localeCompare(b.venue_name ?? '')
        if (vCmp !== 0) return vCmp
        return b.created_at.localeCompare(a.created_at)
      }
      case 'type': {
        const cCmp = (a.category ?? '').localeCompare(b.category ?? '')
        if (cCmp !== 0) return cCmp
        return b.created_at.localeCompare(a.created_at)
      }
      case 'recent':
      default:
        return b.created_at.localeCompare(a.created_at)
    }
  })
}

const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'venue', label: 'Venue' },
  { key: 'neighborhood', label: 'Neighborhood' },
  { key: 'type', label: 'Type' },
]

export function UploadHistory() {
  const [rows, setRows] = useState<UploadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('recent')
  const [view, setView] = useState<ViewMode>('list')

  useEffect(() => {
    supabase.rpc('upload_history', { p_limit: 200 }).then(({ data }) => {
      setRows((data ?? []) as UploadRow[])
      setLoading(false)
    })
  }, [])

  const sorted = sortRows(rows, sort)

  const segBtn = (active: boolean) => ({
    padding: '3px 9px', borderRadius: 5, flexShrink: 0,
    border: active ? '1px solid rgba(168,85,247,0.4)' : '1px solid var(--fg-15)',
    background: active ? 'rgba(168,85,247,0.1)' : 'transparent',
    color: active ? '#A855F7' : 'var(--fg-40)',
    fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.12s',
  } as React.CSSProperties)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Controls row */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', flexShrink: 0 }}>
          {loading ? '…' : `${rows.length} upload${rows.length !== 1 ? 's' : ''}`}
        </span>

        {/* Sort buttons */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {SORT_LABELS.map(({ key, label }) => (
            <button key={key} onClick={() => setSort(key)} style={segBtn(sort === key)}>{label}</button>
          ))}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          <button onClick={() => setView('list')} title="List view" style={segBtn(view === 'list')}>List</button>
          <button onClick={() => setView('thumbnails')} title="Thumbnail view" style={segBtn(view === 'thumbnails')}>Thumbs</button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)', fontStyle: 'italic' }}>No uploads found.</p>
      ) : view === 'list' ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 8px', borderRadius: 7, border: '1px solid var(--fg-08)', background: 'transparent' }}>
                <PosterThumb url={row.poster_url} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      {row.title}
                    </span>
                    <StatusPill status={row.status} />
                  </div>
                  <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[row.venue_name, row.neighborhood].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    {row.category && (
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)' }}>{row.category}</span>
                    )}
                    {row.uploader && (
                      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)' }}>@{row.uploader}</span>
                    )}
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-25)', marginLeft: 'auto' }}>
                      {fmtShort(row.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Thumbnails view */
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
                  {/* Status pill pinned top-right */}
                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <StatusPill status={row.status} />
                  </div>
                </div>
                <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                  {row.title}
                </div>
                <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: 'var(--fg-30)', lineHeight: 1.2 }}>
                  {fmtShort(row.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
