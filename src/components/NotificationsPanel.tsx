import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomSheet } from '@/components/BottomSheet'

// Notification controls — the anti-bombardment stance, made personal.
// Every category defaults ON; turning one off means those notifications are
// never even created (in-app and push both stay silent, enforced by the DB
// gate in migration 102). "Push notifications" is the master device switch:
// off = everything still appears in the app's notification panel, but the
// phone never buzzes. Moderation/safety notices can't be muted.

interface Prefs {
  messages: boolean
  replies: boolean
  follows: boolean
  likes: boolean
  slaps: boolean
  new_shows: boolean
  reminders: boolean
  community: boolean
  push_enabled: boolean
}

const DEFAULTS: Prefs = {
  messages: true, replies: true, follows: true, likes: true,
  slaps: true, new_shows: true, reminders: true, community: true,
  push_enabled: true,
}

const ROWS: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  { key: 'messages',  label: 'Messages',                 hint: 'DMs and group chats' },
  { key: 'slaps',     label: 'Slaps',                    hint: 'When a friend slaps a show to you' },
  { key: 'replies',   label: 'Replies & mentions',       hint: 'Someone replies to or mentions you on a wall' },
  { key: 'follows',   label: 'New followers',            hint: 'Follows and accepted requests' },
  { key: 'likes',     label: 'Likes on your activity',   hint: '♥ on your RSVPs and posts' },
  { key: 'new_shows', label: 'New shows',                hint: 'Venues & artists you follow add a show — max one a day, always' },
  { key: 'reminders', label: 'Show reminders',           hint: 'A heads-up before shows you RSVP’d to' },
  { key: 'community', label: 'Neighborhood alerts',      hint: 'Lost pets and community notices' },
]

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    supabase.from('user_notification_prefs').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setPrefs({ ...DEFAULTS, ...data })
        setLoaded(true)
      })
  }, [open, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(key: keyof Prefs) {
    if (!user || !loaded) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next) // optimistic
    const { error } = await supabase.from('user_notification_prefs').upsert({
      user_id: user.id,
      messages: next.messages, replies: next.replies, follows: next.follows,
      likes: next.likes, slaps: next.slaps, new_shows: next.new_shows,
      reminders: next.reminders, community: next.community,
      push_enabled: next.push_enabled, updated_at: new Date().toISOString(),
    })
    if (error) setPrefs(prefs) // revert on failure
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Notifications">
      <div style={{ padding: '0 4px 8px' }}>
        <p style={{ margin: '0 0 14px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12.5, color: 'var(--fg-55)', lineHeight: 1.5 }}>
          Your attention is yours. Anything you turn off simply never pings you — in the app or on your phone.
        </p>

        {/* master device-push switch */}
        <ToggleRow
          label="Push notifications"
          hint="Master switch — off means nothing ever buzzes your phone (you'll still see activity inside the app)"
          value={prefs.push_enabled}
          onToggle={() => toggle('push_enabled')}
          emphasized
        />
        <div style={{ height: 1, background: 'var(--fg-08)', margin: '6px 0 10px' }} />

        {ROWS.map(r => (
          <ToggleRow key={r.key} label={r.label} hint={r.hint} value={prefs[r.key]} onToggle={() => toggle(r.key)} />
        ))}

        <p style={{ margin: '12px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', lineHeight: 1.5 }}>
          Safety and account notices can't be turned off.
        </p>
      </div>
    </BottomSheet>
  )
}

function ToggleRow({ label, hint, value, onToggle, emphasized = false }: { label: string; hint: string; value: boolean; onToggle: () => void; emphasized?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: emphasized ? 700 : 600, color: 'var(--fg)' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11.5, color: 'var(--fg-55)', lineHeight: 1.4 }}>{hint}</p>
      </div>
      <div
        onClick={onToggle}
        style={{
          width: 44, height: 26, borderRadius: 13, flexShrink: 0,
          background: value ? 'var(--fg)' : 'var(--fg-25)',
          cursor: 'pointer', position: 'relative', transition: 'background 200ms ease',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 20, height: 20, borderRadius: '50%',
          background: 'var(--bg)', transition: 'left 200ms ease',
        }} />
      </div>
    </div>
  )
}
