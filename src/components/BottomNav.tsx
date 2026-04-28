import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const NAV_ITEMS = [
  {
    label: 'Line Up',
    path: '/lineup',
    center: false,
    icon: (size: number) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    label: 'Map',
    path: '/map',
    center: false,
    icon: (size: number) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    label: 'Wall',
    path: '/',
    center: true,
    icon: (size: number) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'MSG',
    path: '/msg',
    center: false,
    icon: (size: number) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    label: 'You',
    path: '/you',
    center: false,
    icon: (size: number) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingConnects, setPendingConnects] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchCount = async () => {
      const { data, error } = await supabase.rpc('get_unread_count')
      if (!cancelled && !error && typeof data === 'number') {
        setUnreadCount(data)
      }
    }

    const fetchPendingConnects = async () => {
      const { data, error } = await supabase.rpc('pending_connect_request_count')
      if (!cancelled && !error && typeof data === 'number') {
        setPendingConnects(data)
      }
    }

    fetchCount()
    fetchPendingConnects()

    const notifChannel = supabase
      .channel(`unread-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, () => { fetchCount() })
      .subscribe()

    const msgChannel = supabase
      .channel(`unread-messages-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { fetchCount() })
      .subscribe()

    const memberChannel = supabase
      .channel(`unread-member-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${user.id}` }, () => { fetchCount() })
      .subscribe()

    const friendshipChannel = supabase
      .channel(`pending-connects-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `recipient_id=eq.${user.id}` }, () => { fetchPendingConnects() })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(notifChannel)
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(memberChannel)
      supabase.removeChannel(friendshipChannel)
    }
  }, [user?.id])

  return (
    <nav
      className="shrink-0 flex items-center justify-around"
      style={{
        height: 'calc(var(--nav-height) + env(safe-area-inset-bottom))',
        background: 'var(--bg)',
        borderTop: '1px solid var(--fg-08)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV_ITEMS.map(({ label, path, center, icon }) => {
        const active = path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(path)
        const iconSize = center ? 26 : 20
        const isMSG = path === '/msg'
        const isYOU = path === '/you'
        const badgeCount = isMSG ? unreadCount : isYOU ? pendingConnects : 0

        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex flex-col items-center gap-1"
            style={{
              color: 'var(--fg)',
              minWidth: center ? 56 : 44,
            }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <div style={{ opacity: active ? 1 : 0.3, display: 'inline-flex' }}>
                {icon(iconSize)}
              </div>
              {badgeCount > 0 && (
                <div style={{
                  position: 'absolute',
                  top: -3,
                  right: -7,
                  background: 'var(--badge-bg)',
                  color: 'var(--badge-fg)',
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: '"Space Grotesk", sans-serif',
                  lineHeight: 1,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 9,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  pointerEvents: 'none',
                }}>
                  {badgeCount > 9 ? '9+' : badgeCount}
                </div>
              )}
            </div>
            <span
              className="font-body font-medium uppercase"
              style={{ fontSize: 9, letterSpacing: '0.08em', opacity: active ? 1 : 0.3 }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
