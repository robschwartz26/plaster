import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Pencil } from 'lucide-react'
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
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 14,
      }}
    >
      {/* Floating modal — natural image size within bounds */}
      <div style={{ position: 'relative', maxWidth: '75vw', maxHeight: '70vh', borderRadius: 8, overflow: 'hidden' }}>
        {displaySrc ? (
          <img
            src={displaySrc}
            style={{ display: 'block', maxWidth: '75vw', maxHeight: '70vh', width: 'auto', height: 'auto', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ width: 200, height: 260, background: 'rgba(240,236,227,0.08)' }} />
        )}

        {/* Close button inside modal */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)', border: 'none',
            cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Username + edit pencil (self only) */}
      {profile?.username && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 18, color: '#fff' }}>
            @{profile.username}
          </p>
          {isSelf && onUpdatePhoto && (
            <button
              onClick={() => { onClose(); onUpdatePhoto() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 2, display: 'flex', alignItems: 'center' }}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
