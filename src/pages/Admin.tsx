import { useState, useEffect, useCallback } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader } from '@/components/PlasterHeader'
import { AdminBottomNav } from '@/components/admin/AdminBottomNav'
import { VenueForm } from '@/components/admin/VenueForm'
import { EventForm } from '@/components/admin/EventForm'
import { AdminNotifications } from '@/components/admin/AdminNotifications'
import { AdminReports } from '@/components/admin/AdminReports'
import { AdminVARequests } from '@/components/admin/AdminVARequests'
import { AdminVenueAccounts } from '@/components/admin/AdminVenueAccounts'
import { AdminPendingEvents } from '@/components/admin/AdminPendingEvents'
import { DuplicateVenueMerger } from '@/components/admin/DuplicateVenueMerger'
import { DuplicateEventMerger } from '@/components/admin/DuplicateEventMerger'
import { ImportForm } from '@/components/admin/ImportForm'
import {
  findDuplicateVenueGroups,
  findDuplicateEventGroups,
  type Venue,
  type EventSummary,
} from '@/components/admin/adminShared'

// ── Section wrapper ──────────────────────────────────────────

function Section({ title, badge, children, collapsible = false, defaultCollapsed = false }:
  { title: string; badge?: string; children: React.ReactNode; collapsible?: boolean; defaultCollapsed?: boolean }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  return (
    <section style={{ borderTop: '1px solid var(--fg-08)', paddingTop: 32, marginTop: 32 }}>
      <div
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 12, margin: open ? '0 0 24px 0' : 0,
                 cursor: collapsible ? 'pointer' : 'default', userSelect: 'none' }}
      >
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{title}</h2>
        {badge && (
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600,
            color: '#dc2626', background: 'rgba(239,68,68,0.12)', padding: '3px 10px',
            borderRadius: 999, letterSpacing: '0.02em' }}>{badge}</span>
        )}
        {collapsible && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--fg-40)"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{ marginLeft: 'auto', flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>
      {(!collapsible || open) && children}
    </section>
  )
}

// ── Main admin dashboard ─────────────────────────────────────

function AdminDashboard() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [events, setEvents] = useState<EventSummary[]>([])
  const [venueFormOpen, setVenueFormOpen] = useState(false)
  const [manualFormOpen, setManualFormOpen] = useState(false)
  const [openReportCount, setOpenReportCount] = useState<number>(0)
  const [pendingVACount, setPendingVACount] = useState<number>(0)
  const [pendingEventCount, setPendingEventCount] = useState<number>(0)

  const fetchVenues = useCallback(async () => {
    const { data } = await supabaseAdmin.from('venues').select('id, name, neighborhood, address, location_lat, location_lng, website, instagram, hours').order('name', { ascending: true })
    if (data) setVenues(data)
  }, [])

  const fetchEvents = useCallback(async () => {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const { data } = await supabaseAdmin.from('events')
      .select('id, title, starts_at, venue_id, poster_url, show_times')
      .eq('status', 'published')
      .gte('starts_at', cutoff)
      .order('starts_at', { ascending: true })
    if (data) setEvents(data)
  }, [])

  const fetchOpenReportCount = useCallback(async () => {
    const { count } = await supabaseAdmin
      .from('content_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
    setOpenReportCount(count ?? 0)
  }, [])

  useEffect(() => { fetchVenues(); fetchEvents(); fetchOpenReportCount() }, [])

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PlasterHeader />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 24px 32px', width: '100%' }}>

          <DuplicateVenueMerger groups={findDuplicateVenueGroups(venues)} onMergeComplete={fetchVenues} />
          <DuplicateEventMerger groups={findDuplicateEventGroups(events)} onMergeComplete={fetchEvents} />
          <AdminNotifications />

          <Section
            title="Pending Uploads"
            badge={pendingEventCount > 0 ? `${pendingEventCount} to review` : undefined}
          >
            <AdminPendingEvents onCountChange={setPendingEventCount} />
          </Section>

          <Section
            title="Reports"
            badge={openReportCount > 0 ? `${openReportCount} open` : undefined}
          >
            <AdminReports onReportsChanged={fetchOpenReportCount} />
          </Section>

          <Section
            title="VA Requests"
            badge={pendingVACount > 0 ? `${pendingVACount} pending` : undefined}
          >
            <AdminVARequests onCountChange={setPendingVACount} />
          </Section>

          <Section title="Venue Accounts" collapsible defaultCollapsed>
            <AdminVenueAccounts />
          </Section>

          <Section title="Import Poster">
            <ImportForm />
          </Section>

          <section style={{ borderTop: '1px solid var(--fg-08)', paddingTop: 32, marginTop: 32 }}>
            <button
              onClick={() => setVenueFormOpen(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: venueFormOpen ? 24 : 0 }}
            >
              <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--fg-55)', margin: 0 }}>Add a Venue</h2>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 16, color: 'var(--fg-40)' }}>{venueFormOpen ? '▾' : '▸'}</span>
            </button>
            {venueFormOpen && <VenueForm onVenueAdded={fetchVenues} />}
          </section>

          <section style={{ borderTop: '1px solid var(--fg-08)', paddingTop: 32, marginTop: 32 }}>
            <button
              onClick={() => setManualFormOpen(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: manualFormOpen ? 24 : 0 }}
            >
              <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--fg-55)', margin: 0 }}>Add an Event</h2>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 16, color: 'var(--fg-40)' }}>{manualFormOpen ? '▾' : '▸'}</span>
            </button>
            {manualFormOpen && <EventForm venues={venues} />}
          </section>

        </div>
      </div>
      <AdminBottomNav />
    </div>
  )
}

// ── Entry point ──────────────────────────────────────────────

export function Admin() {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily: '"Space Grotesk", sans-serif',
        color: 'var(--fg)',
        background: 'var(--bg)',
      }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
          plaster
        </div>
        <p style={{ margin: '8px 0', fontSize: 15, maxWidth: 320 }}>
          This page is for admins only.
        </p>
      </div>
    )
  }
  return <AdminDashboard />
}
