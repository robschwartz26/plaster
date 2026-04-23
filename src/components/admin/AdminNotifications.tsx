import { useState, useEffect } from 'react'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import { generateOccurrenceDates, type AdminNotification, type RecurrenceFrequency } from '@/components/admin/adminShared'

export function AdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [actioning, setActioning] = useState<string | null>(null)

  const fetchNotifications = async () => {
    const now = new Date().toISOString()
    const { data } = await supabaseAdmin
      .from('admin_notifications')
      .select('*')
      .eq('dismissed', false)
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
      .order('created_at', { ascending: false })
    if (data) setNotifications(data as AdminNotification[])
  }

  useEffect(() => { fetchNotifications() }, [])

  if (!notifications.length) return null

  const handleExtend = async (n: AdminNotification) => {
    if (!n.recurrence_group_id) return
    setActioning(n.id)
    try {
      const { data: events } = await supabaseAdmin
        .from('events')
        .select('starts_at, recurrence_frequency, venue_id, title, category, poster_url, description, fill_frame, focal_x, focal_y, neighborhood, address')
        .eq('recurrence_group_id', n.recurrence_group_id)
        .order('starts_at', { ascending: false })
        .limit(1)
      if (!events?.length) return
      const last = events[0]
      const freq = (last.recurrence_frequency ?? 'weekly') as RecurrenceFrequency
      const nextStart = new Date(last.starts_at)
      if (freq === 'weekly')        nextStart.setDate(nextStart.getDate() + 7)
      else if (freq === 'biweekly') nextStart.setDate(nextStart.getDate() + 14)
      else                          nextStart.setMonth(nextStart.getMonth() + 1)
      const newDates = generateOccurrenceDates(nextStart, freq)
      await supabaseAdmin.from('events').insert(newDates.map(d => ({
        venue_id: last.venue_id, title: last.title, category: last.category,
        poster_url: last.poster_url, starts_at: d.toISOString(),
        neighborhood: last.neighborhood, address: last.address,
        description: last.description, view_count: 0, like_count: 0,
        fill_frame: last.fill_frame, focal_x: last.focal_x, focal_y: last.focal_y,
        recurrence_group_id: n.recurrence_group_id, recurrence_frequency: freq,
      })))
      const newSnooze = new Date(newDates[newDates.length - 1])
      newSnooze.setMonth(newSnooze.getMonth() + 3)
      await supabaseAdmin.from('admin_notifications').update({ snoozed_until: newSnooze.toISOString() }).eq('id', n.id)
      await fetchNotifications()
    } finally { setActioning(null) }
  }

  const handleMarkEnded = async (id: string) => {
    await supabaseAdmin.from('admin_notifications').update({ dismissed: true }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const handleSnooze = async (id: string) => {
    const until = new Date(); until.setDate(until.getDate() + 14)
    await supabaseAdmin.from('admin_notifications').update({ snoozed_until: until.toISOString() }).eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <section style={{ marginBottom: 8 }}>
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: '0 0 14px 0' }}>Notifications</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notifications.map(n => (
          <div key={n.id} style={{ padding: '14px 16px', border: '1px solid rgba(234,179,8,0.35)', borderRadius: 8, background: 'rgba(234,179,8,0.05)' }}>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 6px 0' }}>{n.title}</p>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', margin: '0 0 12px 0', lineHeight: 1.5 }}>{n.message}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleExtend(n)}
                disabled={actioning === n.id}
                style={{ padding: '6px 12px', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: actioning === n.id ? 'default' : 'pointer', opacity: actioning === n.id ? 0.6 : 1 }}
              >
                {actioning === n.id ? 'Extending…' : 'Extend 3 months'}
              </button>
              <button
                onClick={() => handleMarkEnded(n.id)}
                style={{ padding: '6px 12px', background: 'transparent', color: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, cursor: 'pointer' }}
              >
                Mark as ended
              </button>
              <button
                onClick={() => handleSnooze(n.id)}
                style={{ padding: '6px 12px', background: 'transparent', color: 'var(--fg-40)', border: '1px solid var(--fg-18)', borderRadius: 5, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, cursor: 'pointer' }}
              >
                Dismiss for now
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
