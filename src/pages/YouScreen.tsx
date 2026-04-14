import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { AnimatePresence, motion } from 'framer-motion'

interface AttendedEvent {
  event_id: string
  events: {
    id: string
    title: string
    poster_url: string | null
    starts_at: string
    color1?: string | null
    color2?: string | null
  }
}

interface FollowCounts {
  followers: number
  following: number
}

export function YouScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(false)
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true)
  const [busy, setBusy] = useState(false)
  const [attended, setAttended] = useState<AttendedEvent[]>([])
  const [counts, setCounts] = useState<FollowCounts>({ followers: 0, following: 0 })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; avatar_url: string | null }[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [following, setFollowing] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    console.log('[YouScreen] profile.avatar_url:', profile?.avatar_url)
    setBio(profile?.bio ?? '')
    setIsPublic(profile?.is_public ?? true)
    fetchAttended()
    fetchCounts()
    fetchFollowing()
  }, [user, profile])

  async function fetchAttended() {
    if (!user) return
    const { data } = await supabase
      .from('attendees')
      .select('event_id, events(id, title, poster_url, starts_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(24)
    setAttended((data as AttendedEvent[] | null) ?? [])
  }

  async function fetchCounts() {
    if (!user) return
    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true })
        .eq('following_id', user.id).eq('status', 'accepted'),
      supabase.from('follows').select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id).eq('status', 'accepted'),
    ])
    setCounts({ followers: followers ?? 0, following: following ?? 0 })
  }

  async function fetchFollowing() {
    if (!user) return
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
    setFollowing(new Set((data ?? []).map((r: { following_id: string }) => r.following_id)))
  }

  async function saveProfile() {
    if (!user) return
    setBusy(true)
    await supabase.from('profiles').update({ bio, is_public: isPublic }).eq('id', user.id)
    await refreshProfile()
    setBusy(false)
    setEditing(false)
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setAvatarPreview(URL.createObjectURL(file))
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
      await refreshProfile()
    }
  }

  async function searchUsers(q: string) {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    setSearchBusy(true)
    const clean = q.replace(/^@/, '').trim()
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `${clean}%`)
      .neq('id', user?.id ?? '')
      .limit(8)
    setSearchResults((data ?? []) as { id: string; username: string; avatar_url: string | null }[])
    setSearchBusy(false)
  }

  async function toggleFollow(targetId: string, targetIsPublic: boolean) {
    if (!user) return
    if (following.has(targetId)) {
      await supabase.from('follows').delete()
        .eq('follower_id', user.id).eq('following_id', targetId)
      setFollowing((prev) => { const next = new Set(prev); next.delete(targetId); return next })
    } else {
      const status = targetIsPublic ? 'accepted' : 'pending'
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId, status })
      setFollowing((prev) => new Set([...prev, targetId]))
    }
    fetchCounts()
  }

  const avatarSrc = avatarPreview ?? profile?.avatar_url ?? null

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 0' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          {/* Avatar */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              flexShrink: 0,
              background: avatarSrc ? 'transparent' : 'var(--fg-18)',
              overflow: 'hidden',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--fg-18)',
            }}
          >
            {avatarSrc
              ? <img src={avatarSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 28, color: 'var(--fg-30)' }}>+</span>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={uploadAvatar} style={{ display: 'none' }} />

          {/* Name + stats */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2 }}>
              @{profile?.username ?? user?.email?.split('@')[0]}
            </p>
            {profile?.bio && !editing && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.4 }}>
                {profile.bio}
              </p>
            )}

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
              {[
                { label: 'followers', count: counts.followers },
                { label: 'following', count: counts.following },
                { label: 'attended', count: attended.length },
              ].map(({ label, count }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>
                    {count}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', marginTop: 2 }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Edit / controls row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => setEditing(!editing)}
            style={outlineBtn}
          >
            {editing ? 'Cancel' : 'Edit profile'}
          </button>
          <button
            onClick={() => { signOut(); navigate('/auth', { replace: true }) }}
            style={{ ...outlineBtn, color: 'var(--fg-40)', borderColor: 'var(--fg-15)' }}
          >
            Sign out
          </button>
        </div>

        {/* Editing panel */}
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginBottom: 20 }}
            >
              <textarea
                placeholder="Bio (optional)"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1.5px solid var(--fg-18)',
                  background: 'var(--fg-08)',
                  color: 'var(--fg)',
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontSize: 14,
                  resize: 'none',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 10,
                }}
              />

              {/* Public toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 14, color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif' }}>
                  Public profile
                </span>
                <div
                  onClick={() => setIsPublic(!isPublic)}
                  style={{
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    background: isPublic ? 'var(--fg)' : 'var(--fg-25)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 200ms ease',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: isPublic ? 21 : 3,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'var(--bg)',
                      transition: 'left 200ms ease',
                    }}
                  />
                </div>
              </div>

              <button onClick={saveProfile} disabled={busy} style={saveBtnStyle(busy)}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Find people section */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Find people</p>
          <input
            type="text"
            placeholder="Search @username"
            value={searchQuery}
            onChange={(e) => searchUsers(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: 12,
              border: '1.5px solid var(--fg-18)',
              background: 'var(--fg-08)',
              color: 'var(--fg)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: searchResults.length > 0 ? 10 : 0,
            }}
          />
          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 4px',
                    borderBottom: '1px solid var(--fg-08)',
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: u.avatar_url ? 'transparent' : 'var(--fg-18)',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {u.avatar_url && <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif' }}>
                    @{u.username}
                  </span>
                  <button
                    onClick={() => toggleFollow(u.id, true)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: following.has(u.id) ? '1.5px solid var(--fg-25)' : 'none',
                      background: following.has(u.id) ? 'transparent' : 'var(--fg)',
                      color: following.has(u.id) ? 'var(--fg-55)' : 'var(--bg)',
                      fontFamily: '"Space Grotesk", sans-serif',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {following.has(u.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchBusy && (
            <p style={{ fontSize: 13, color: 'var(--fg-30)', margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif' }}>
              Searching…
            </p>
          )}
        </div>

        {/* Attended events grid */}
        {attended.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={sectionLabel}>Attended</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
              {attended.map(({ event_id, events: ev }) => (
                <div key={event_id} style={{ aspectRatio: '2/3', background: 'var(--fg-08)', borderRadius: 4, overflow: 'hidden' }}>
                  {ev?.poster_url
                    ? <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', background: 'var(--fg-18)' }} />
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spacer for nav */}
        <div style={{ height: 'var(--nav-height)' }} />
      </div>

      <BottomNav />
    </div>
  )
}

const outlineBtn: React.CSSProperties = {
  flex: 1,
  padding: '9px 0',
  borderRadius: 10,
  border: '1.5px solid var(--fg-25)',
  background: 'transparent',
  color: 'var(--fg-65)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const sectionLabel: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--fg-30)',
  fontFamily: '"Space Grotesk", sans-serif',
}

function saveBtnStyle(busy: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '13px 0',
    borderRadius: 14,
    border: 'none',
    background: 'var(--fg)',
    color: 'var(--bg)',
    fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 15,
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
  }
}
