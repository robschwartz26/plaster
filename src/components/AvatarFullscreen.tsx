import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'

interface Profile {
  username: string | null
  avatar_url: string | null
  bio: string | null
}

interface Props {
  userId: string
  onClose: () => void
}

export function AvatarFullscreen({ userId, onClose }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.from('profiles').select('username, avatar_url, bio').eq('id', userId).single()
      .then(({ data }) => setProfile(data ?? null))
  }, [userId])

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
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(240,236,227,0.55)', fontSize: 28, lineHeight: 1,
          padding: 8,
        }}
      >×</button>

      {/* Content — stopPropagation so tapping image/text doesn't close */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            style={{
              maxHeight: '80vh', maxWidth: '90vw',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div style={{
            width: 180, height: 240,
            background: 'rgba(240,236,227,0.08)',
            borderRadius: 4,
          }} />
        )}

        {profile?.username && (
          <p style={{
            margin: 0,
            fontFamily: '"Playfair Display", serif',
            fontWeight: 900, fontSize: 22,
            color: '#f0ece3',
          }}>
            @{profile.username}
          </p>
        )}
        {profile?.bio && (
          <p style={{
            margin: 0,
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 14, color: 'rgba(240,236,227,0.6)',
            textAlign: 'center', maxWidth: 280, lineHeight: 1.5,
          }}>
            {profile.bio}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
