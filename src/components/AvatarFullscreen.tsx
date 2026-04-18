import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Profile {
  username: string | null
  avatar_url: string | null
  avatar_full_url: string | null
  bio: string | null
}

interface Props {
  userId: string
  onClose: () => void
  onUpdatePhoto?: () => void
}

export function AvatarFullscreen({ userId, onClose, onUpdatePhoto }: Props) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const isSelf = user?.id === userId

  useEffect(() => {
    supabase.from('profiles').select('username, avatar_url, avatar_full_url, bio').eq('id', userId).single()
      .then(({ data }) => setProfile(data ?? null))
  }, [userId])

  const displaySrc = profile?.avatar_full_url ?? profile?.avatar_url ?? null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(240,236,227,0.55)', fontSize: 28, lineHeight: 1, padding: 8,
        }}
      >×</button>

      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
      >
        {displaySrc ? (
          <img
            src={displaySrc}
            style={{ maxHeight: '70vh', maxWidth: '90vw', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <div style={{ width: 180, height: 240, background: 'rgba(240,236,227,0.08)', borderRadius: 4 }} />
        )}

        {profile?.username && (
          <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 22, color: '#f0ece3' }}>
            @{profile.username}
          </p>
        )}
        {profile?.bio && (
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'rgba(240,236,227,0.6)', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
            {profile.bio}
          </p>
        )}

        {isSelf && onUpdatePhoto && (
          <button
            onClick={onUpdatePhoto}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: '#A855F7', color: '#fff',
              fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Update profile photo
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
