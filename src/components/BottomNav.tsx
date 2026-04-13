import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  {
    label: 'Wall',
    path: '/',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Map',
    path: '/map',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    label: 'Venues',
    path: '/venues',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'You',
    path: '/you',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav
      className="shrink-0 flex items-center justify-around"
      style={{
        height: 'var(--nav-height)',
        background: 'var(--bg)',
        borderTop: '1px solid var(--fg-08)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV_ITEMS.map(({ label, path, icon }) => {
        const active = location.pathname === path
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex flex-col items-center gap-1"
            style={{
              opacity: active ? 1 : 0.3,
              color: 'var(--fg)',
            }}
          >
            {icon}
            <span
              className="font-body font-medium uppercase"
              style={{ fontSize: 9, letterSpacing: '0.08em' }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
