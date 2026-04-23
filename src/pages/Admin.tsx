import { useState, useEffect } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PlasterHeader } from '@/components/PlasterHeader'
import { AdminBottomNav } from '@/components/admin/AdminBottomNav'
import { VenueForm } from '@/components/admin/VenueForm'
import { EventForm } from '@/components/admin/EventForm'
import { AdminNotifications } from '@/components/admin/AdminNotifications'
import { DuplicateVenueMerger } from '@/components/admin/DuplicateVenueMerger'
import { ImportForm } from '@/components/admin/ImportForm'
import {
  findDuplicateVenueGroups,
  type Venue,
} from '@/components/admin/adminShared'

// ── Section wrapper ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid var(--fg-08)', paddingTop: 32, marginTop: 32 }}>
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 24px 0' }}>{title}</h2>
      {children}
    </section>
  )
}

// ── Main admin dashboard ─────────────────────────────────────

function AdminDashboard() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueFormOpen, setVenueFormOpen] = useState(false)
  const [manualFormOpen, setManualFormOpen] = useState(false)

  const fetchVenues = async () => {
    const { data } = await supabaseAdmin.from('venues').select('id, name, neighborhood, address, location_lat, location_lng, website, instagram, hours').order('name', { ascending: true })
    if (data) setVenues(data)
  }

  useEffect(() => { fetchVenues() }, [])

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PlasterHeader />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 24px 32px', width: '100%' }}>

          <DuplicateVenueMerger groups={findDuplicateVenueGroups(venues)} onMergeComplete={fetchVenues} />
          <AdminNotifications />

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
