import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface WorklogEvent {
  id: string
  title: string
  starts_at: string
  status: string
  created_at: string
  venue: { name: string } | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusPill({ status }: { status: string }) {
  const byStatus: Record<string, { color: string; bg: string; border: string; label: string }> = {
    pending:   { color: 'rgba(217,119,6,0.9)',  bg: 'rgba(217,119,6,0.1)',  border: 'rgba(217,119,6,0.3)',  label: 'Pending'  },
    published: { color: '#4ade80',              bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)', label: 'Live'     },
    rejected:  { color: 'var(--fg-40)',         bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)',  label: 'Rejected' },
  }
  const s = byStatus[status] ?? byStatus.pending
  return (
    <span style={{
      fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      padding: '2px 7px', borderRadius: 3, flexShrink: 0,
    }}>
      {s.label}
    </span>
  )
}

export function StaffWorklog() {
  const { user } = useAuth()
  const [rows, setRows] = useState<WorklogEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('events')
      .select('id, title, starts_at, status, created_at, venue:venue_id(name)')
      .eq('created_by', user.id)
      .order('starts_at', { ascending: true })
      .then(({ data }) => {
        setRows((data ?? []) as unknown as WorklogEvent[])
        setLoading(false)
      })
  }, [user])

  return (
    <div style={{ marginTop: 40 }}>
      <h3 style={{
        fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 700,
        color: 'var(--fg)', margin: '0 0 16px 0',
      }}>
        Your uploads
      </h3>

      {loading ? (
        <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontStyle: 'italic' }}>
          Your uploads will show up here as you add them.
        </p>
      ) : (
        <VenueGroups rows={rows} />
      )}
    </div>
  )
}

function VenueGroups({ rows }: { rows: WorklogEvent[] }) {
  const venueMap: Record<string, WorklogEvent[]> = {}
  const venueOrder: string[] = []
  for (const row of rows) {
    const key = row.venue?.name ?? '(No venue)'
    if (!venueMap[key]) { venueMap[key] = []; venueOrder.push(key) }
    venueMap[key].push(row)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {venueOrder.map(venueName => (
        <div key={venueName}>
          <p style={{
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--fg-40)', margin: '0 0 8px 0',
          }}>
            {venueName}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {venueMap[venueName].map(e => (
              <div
                key={e.id}
                style={{
                  padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--fg-08)', background: 'transparent',
                  fontFamily: '"Space Grotesk", sans-serif',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.title}
                    </span>
                    <StatusPill status={e.status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-40)', marginTop: 3 }}>
                    {fmtDate(e.starts_at)} at {fmtTime(e.starts_at)} · added {fmtShort(e.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
