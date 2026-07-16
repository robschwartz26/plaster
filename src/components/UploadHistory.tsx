import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { posterThumb } from '@/lib/posterThumb'
import { ReviewRowEditor } from '@/components/admin/ReviewRowEditor'
import { type PendingEvent } from '@/components/admin/reviewShared'

interface VenueLite { id: string; name: string; neighborhood: string | null; address: string | null }

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
  rejection_reason: string | null
  rejection_note: string | null
}

// Neutral, lowercase reason labels — no admin name, just the house-standard signal.
const REASON_LABELS: Record<string, string> = {
  duplicate: 'duplicate',
  wrong_date: 'wrong date',
  bad_image: 'bad image',
  not_an_event: 'not an event',
  other: 'other',
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
// poster | title | venue | neighborhood | type | uploader | date | status | actions
const GRID = '44px minmax(110px,2fr) minmax(88px,1.5fr) minmax(80px,1.2fr) 74px 86px 66px 70px 66px'
const MIN_TABLE_W = 686

// ── Row delete button styles (quick-delete with a single "are you sure") ──────
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }
const confirmYes: React.CSSProperties = { ...iconBtn, color: '#e05555', fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }
const confirmNo: React.CSSProperties = { ...iconBtn, color: 'var(--fg-40)', fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

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
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)   // row awaiting delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteErr, setDeleteErr] = useState<{ id: string; msg: string } | null>(null)
  // Inline edit: double-click a row → edit it in a modal → it floats to the top.
  const [venues, setVenues] = useState<VenueLite[]>([])
  const [editRow, setEditRow] = useState<PendingEvent | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [recentlyEdited, setRecentlyEdited] = useState<string[]>([]) // most-recent first

  function refetch() {
    return supabase.rpc('upload_history', { p_limit: 200 }).then(({ data }) => setRows((data ?? []) as UploadRow[]))
  }

  useEffect(() => {
    supabase.rpc('upload_history', { p_limit: 200 }).then(({ data }) => {
      setRows((data ?? []) as UploadRow[])
      setLoading(false)
    })
    supabase.from('venues').select('id, name, neighborhood, address').order('name')
      .then(({ data }) => setVenues((data ?? []) as VenueLite[]))
  }, [])

  // Double-click → fetch the full event and open the editor.
  async function openEdit(id: string) {
    setEditLoading(true); setEditRow(null)
    const { data } = await supabase.from('events').select('*, venues(name)').eq('id', id).single()
    setEditLoading(false)
    if (!data) return
    const d = data as Record<string, unknown>
    setEditRow({
      id: d.id as string, title: (d.title as string) ?? '', starts_at: d.starts_at as string,
      venue_id: (d.venue_id as string | null) ?? null, venue_name: ((d.venues as { name?: string } | null)?.name) ?? null,
      poster_url: (d.poster_url as string | null) ?? null, category: (d.category as string | null) ?? null,
      description: (d.description as string | null) ?? null, address: (d.address as string | null) ?? null,
      sold_out: (d.sold_out as boolean | null) ?? false,
      created_by: (d.created_by as string) ?? '', uploader: null, created_at: (d.created_at as string) ?? '',
      is_duplicate: false, duplicate_of: null, source_url: (d.source_url as string | null) ?? null,
      ai_confidence: (d.ai_confidence as number | null) ?? null, flag_note: null, passed_review: false,
    })
  }

  function onEdited(id: string) {
    setRecentlyEdited(prev => [id, ...prev.filter(x => x !== id)]) // float to top
    refetch()
  }

  // Quick-delete a recently-uploaded event. Admin-only via RLS (events_delete);
  // .select('id') makes an RLS-blocked delete detectable (0 rows) rather than a
  // silent no-op. Child rows cascade-delete, so no FK cleanup needed here.
  async function handleDelete(id: string) {
    setDeletingId(id); setDeleteErr(null)
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id')
    setDeletingId(null); setConfirmId(null)
    if (error || !data || data.length === 0) {
      setDeleteErr({ id, msg: error?.message || 'delete blocked (0 rows) — are you admin?' })
      return
    }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function handleSort(col: ColKey) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { col, dir: col === 'date' ? 'desc' : 'asc' }
    )
  }

  function toggleColor() {
    setColorOn(v => { const next = !v; saveColorOn(next); return next })
  }

  const sortedBase = applySortState(rows, sort)
  // Rows edited this session float to the top (most-recently edited first).
  const sorted = recentlyEdited.length === 0 ? sortedBase : [
    ...recentlyEdited.map(id => sortedBase.find(r => r.id === id)).filter((r): r is UploadRow => !!r),
    ...sortedBase.filter(r => !recentlyEdited.includes(r.id)),
  ]

  // Edit modal (double-click a row → edit it here → it floats to the top)
  const editOverlay = (editRow || editLoading) ? createPortal(
    <div onClick={() => { setEditRow(null); setEditLoading(false) }} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 96vw)', margin: '24px 0', background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--fg-15)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Edit event</span>
          <button onClick={() => { setEditRow(null); setEditLoading(false) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg-55)', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }} title="Close">×</button>
        </div>
        {editLoading ? <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>Loading…</p>
          : editRow ? <ReviewRowEditor row={editRow} venues={venues} onSaved={() => onEdited(editRow.id)} />
          : null}
      </div>
    </div>, document.body) : null

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
              <div key={row.id} onDoubleClick={() => openEdit(row.id)} title="Double-click to edit" style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
                <div style={{ position: 'relative', paddingBottom: '140%', borderRadius: 5, overflow: 'hidden', background: 'var(--fg-08)' }}>
                  {row.poster_url ? (
                    <img
                      src={posterThumb(row.poster_url, 300) ?? row.poster_url} loading="lazy" alt={row.title}
                      onError={e => { const img = e.currentTarget; img.onerror = null; img.src = row.poster_url! }}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, background: 'var(--fg-08)' }} />
                  )}
                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <StatusPill status={row.status} />
                  </div>
                  {/* Quick delete (confirm once) */}
                  <div style={{ position: 'absolute', top: 4, left: 4 }} onDoubleClick={e => e.stopPropagation()}>
                    {confirmId === row.id ? (
                      <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 4px' }}>
                        <button onClick={e => { e.stopPropagation(); handleDelete(row.id) }} disabled={deletingId === row.id} style={confirmYes}>{deletingId === row.id ? '…' : 'Yes'}</button>
                        <button onClick={e => { e.stopPropagation(); setConfirmId(null) }} style={{ ...confirmNo, color: '#ddd' }}>No</button>
                      </div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setConfirmId(row.id); setDeleteErr(null) }} title="Delete this event" style={{ ...iconBtn, color: '#fff', background: 'rgba(0,0,0,0.45)', borderRadius: 4, padding: 3 }}>
                        <TrashIcon />
                      </button>
                    )}
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
                {row.status === 'rejected' && row.rejection_reason && (
                  <div title={row.rejection_note ?? undefined} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 600, color: '#8a9bb0', lineHeight: 1.2, cursor: row.rejection_note ? 'help' : 'default' }}>
                    rejected · {REASON_LABELS[row.rejection_reason] ?? row.rejection_reason}
                  </div>
                )}
                {deleteErr?.id === row.id && (
                  <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, color: '#e05555', lineHeight: 1.2 }}>delete failed</div>
                )}
              </div>
            ))}
          </div>
        </div>
        {editOverlay}
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

          {/* Actions header (empty) */}
          <div style={{ ...hdrCell('date', false), cursor: 'default' }} />

          {/* ── Data rows (double-click a row → pop it up in the live-app view) ── */}
          {sorted.map(row => (
            <div key={row.id} style={{ display: 'contents' }} onDoubleClick={() => openEdit(row.id)} title="Double-click to edit">
              {/* Poster thumb */}
              <div style={{ ...dataCell(), padding: '5px 6px 5px 8px' }}>
                {row.poster_url ? (
                  <img
                    src={posterThumb(row.poster_url, 120) ?? row.poster_url} loading="lazy" alt=""
                    onError={e => { const img = e.currentTarget; img.onerror = null; img.src = row.poster_url! }}
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

              {/* Status + rejection reason chip (note on tap/hover) */}
              <div style={{ ...dataCell(), justifyContent: 'center', flexDirection: 'column', gap: 2, overflow: 'visible' }}>
                <StatusPill status={row.status} />
                {row.status === 'rejected' && row.rejection_reason && (
                  <button
                    onClick={() => row.rejection_note && setExpandedNoteId(prev => prev === row.id ? null : row.id)}
                    title={row.rejection_note ?? undefined}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      fontFamily: '"Space Grotesk", sans-serif', fontSize: 9, fontWeight: 600,
                      color: '#8a9bb0', lineHeight: 1.2, textAlign: 'center',
                      cursor: row.rejection_note ? 'pointer' : 'default',
                      textDecoration: row.rejection_note ? 'underline dotted' : 'none',
                    }}
                  >
                    {REASON_LABELS[row.rejection_reason] ?? row.rejection_reason}
                  </button>
                )}
              </div>

              {/* Actions — quick delete with a single "are you sure" */}
              <div style={{ ...dataCell(), justifyContent: 'center', overflow: 'visible', gap: 5 }} onDoubleClick={e => e.stopPropagation()}>
                {confirmId === row.id ? (
                  <>
                    <button onClick={e => { e.stopPropagation(); handleDelete(row.id) }} disabled={deletingId === row.id} style={confirmYes} title="Confirm delete">{deletingId === row.id ? '…' : 'Yes'}</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmId(null) }} style={confirmNo} title="Cancel">No</button>
                  </>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setConfirmId(row.id); setDeleteErr(null) }} style={{ ...iconBtn, color: 'var(--fg-40)' }} title="Delete this event">
                    <TrashIcon />
                  </button>
                )}
              </div>

              {/* Full-width rejection note — revealed on tap of the reason chip */}
              {expandedNoteId === row.id && row.rejection_note && (
                <div style={{ gridColumn: '1 / -1', padding: '6px 12px 8px 52px', borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-55)', fontStyle: 'italic' }}>
                  rejected · {REASON_LABELS[row.rejection_reason ?? ''] ?? row.rejection_reason} — {row.rejection_note}
                </div>
              )}

              {/* Full-width delete error, if the delete was blocked */}
              {deleteErr?.id === row.id && (
                <div style={{ gridColumn: '1 / -1', padding: '6px 12px 8px 52px', borderBottom: '1px solid var(--fg-08)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: '#e05555' }}>
                  delete failed — {deleteErr.msg}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {editOverlay}
    </div>
  )
}

// Need React for React.Fragment
import React from 'react'
