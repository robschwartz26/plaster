import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { AnimatePresence, motion } from 'framer-motion'
import { PlasterHeader } from '@/components/PlasterHeader'
import { Diamond } from '@/components/Diamond'
import { AvatarUploader, type AvatarUploaderRef } from '@/components/AvatarUploader'
import { AvatarFullscreen } from '@/components/AvatarFullscreen'

// ── Types ──────────────────────────────────────────────────────────────────

interface AttendedEvent {
  event_id: string
  events: {
    id: string
    title: string
    poster_url: string | null
    starts_at: string
  }
}

interface FollowCounts { followers: number; following: number }

// ── Main component ─────────────────────────────────────────────────────────

export function YouScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // Profile edit state
  const [editing,  setEditing]  = useState(false)
  const [bio,      setBio]      = useState(profile?.bio ?? '')
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true)
  const [busy,     setBusy]     = useState(false)

  // Data state
  const [attended, setAttended] = useState<AttendedEvent[]>([])
  const [counts,   setCounts]   = useState<FollowCounts>({ followers: 0, following: 0 })

  // Avatar state
  const uploaderRef = useRef<AvatarUploaderRef>(null)
  const [avatarPreview,         setAvatarPreview]         = useState<string | null>(null)
  const [avatarFullscreenOpen,  setAvatarFullscreenOpen]  = useState(false)
  const [avatarFullscreenId,    setAvatarFullscreenId]    = useState<string | null>(null)

  // Search state
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; avatar_url: string | null; avatar_diamond_url: string | null }[]>([])
  const [searchBusy,    setSearchBusy]    = useState(false)
  const [following,     setFollowing]     = useState<Set<string>>(new Set())

  // ── Data fetching ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    setBio(profile?.bio ?? '')
    setIsPublic(profile?.is_public ?? true)
    fetchAttended()
    fetchCounts()
    fetchFollowing()
  }, [user, profile])

  async function fetchAttended() {
    if (!user) return
    const { data } = await supabase.from('attendees')
      .select('event_id, events(id, title, poster_url, starts_at)')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(24)
    setAttended((data as AttendedEvent[] | null) ?? [])
  }

  async function fetchCounts() {
    if (!user) return
    const [{ count: followers }, { count: fwing }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id).eq('status', 'accepted'),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id',  user.id).eq('status', 'accepted'),
    ])
    setCounts({ followers: followers ?? 0, following: fwing ?? 0 })
  }

  async function fetchFollowing() {
    if (!user) return
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    setFollowing(new Set((data ?? []).map((r: { following_id: string }) => r.following_id)))
  }

  // ── Profile save ───────────────────────────────────────────────────────

  async function saveProfile() {
    if (!user) return
    setBusy(true)
    await supabase.from('profiles').update({ bio, is_public: isPublic }).eq('id', user.id)
    await refreshProfile()
    setBusy(false)
    setEditing(false)
  }

  // ── Search + follow ────────────────────────────────────────────────────

  async function searchUsers(q: string) {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    setSearchBusy(true)
    const clean = q.replace(/^@/, '').trim()
    const { data } = await supabase.from('profiles')
      .select('id, username, avatar_url, avatar_diamond_url')
      .ilike('username', `${clean}%`).neq('id', user?.id ?? '').limit(8)
    setSearchResults((data ?? []) as typeof searchResults)
    setSearchBusy(false)
  }

  async function toggleFollow(targetId: string, targetIsPublic: boolean) {
    if (!user) return
    if (following.has(targetId)) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId)
      setFollowing(prev => { const next = new Set(prev); next.delete(targetId); return next })
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId, status: targetIsPublic ? 'accepted' : 'pending' })
      setFollowing(prev => new Set([...prev, targetId]))
    }
    fetchCounts()
  }

  // ── Derived ────────────────────────────────────────────────────────────

  const diamondSrc = avatarPreview ?? profile?.avatar_diamond_url ?? profile?.avatar_url ?? null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      <PlasterHeader />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 0' }}>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>

          {/* Diamond avatar — tap to view fullscreen; plus icon corner opens uploader */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Diamond
              diamondUrl={diamondSrc}
              size={80}
              onClick={() => setAvatarFullscreenOpen(true)}
            />
            <button
              onClick={() => uploaderRef.current?.open()}
              style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--bg)', border: '1px solid var(--fg-25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0,
              }}
            >
              <Plus size={12} color="var(--fg-65)" />
            </button>
          </div>

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
            <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
              {[
                { label: 'followers', count: counts.followers },
                { label: 'following', count: counts.following },
                { label: 'attended',  count: attended.length  },
              ].map(({ label, count }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: 10, color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', marginTop: 2 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Edit / sign out row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setEditing(!editing)} style={outlineBtn}>{editing ? 'Cancel' : 'Edit profile'}</button>
          <button onClick={() => { signOut(); navigate('/auth', { replace: true }) }} style={{ ...outlineBtn, color: 'var(--fg-40)', borderColor: 'var(--fg-15)' }}>Sign out</button>
        </div>

        {/* Editing panel */}
        <AnimatePresence>
          {editing && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginBottom: 20 }}>
              <textarea placeholder="Bio (optional)" value={bio} onChange={e => setBio(e.target.value)} rows={3}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--fg-18)', background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 14, color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif' }}>Public profile</span>
                <div onClick={() => setIsPublic(!isPublic)} style={{ width: 44, height: 26, borderRadius: 13, background: isPublic ? 'var(--fg)' : 'var(--fg-25)', cursor: 'pointer', position: 'relative', transition: 'background 200ms ease' }}>
                  <div style={{ position: 'absolute', top: 3, left: isPublic ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--bg)', transition: 'left 200ms ease' }} />
                </div>
              </div>
              <button onClick={saveProfile} disabled={busy} style={saveBtnStyle(busy)}>{busy ? 'Saving…' : 'Save changes'}</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Find people */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Find people</p>
          <input type="text" placeholder="Search @username" value={searchQuery} onChange={e => searchUsers(e.target.value)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--fg-18)', background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: searchResults.length > 0 ? 10 : 0 }} />
          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {searchResults.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--fg-08)' }}>
                  <Diamond
                    diamondUrl={u.avatar_diamond_url}
                    fallbackUrl={u.avatar_url}
                    size={38}
                    onClick={() => setAvatarFullscreenId(u.id)}
                  />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif' }}>@{u.username}</span>
                  <button onClick={() => toggleFollow(u.id, true)}
                    style={{ padding: '6px 14px', borderRadius: 20, border: following.has(u.id) ? '1.5px solid var(--fg-25)' : 'none', background: following.has(u.id) ? 'transparent' : 'var(--fg)', color: following.has(u.id) ? 'var(--fg-55)' : 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {following.has(u.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchBusy && <p style={{ fontSize: 13, color: 'var(--fg-30)', margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif' }}>Searching…</p>}
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
                    : <div style={{ width: '100%', height: '100%', background: 'var(--fg-18)' }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 'var(--nav-height)' }} />
      </div>

      <BottomNav />

      {/* Own avatar fullscreen — pencil opens uploader */}
      {user && avatarFullscreenOpen && (
        <AvatarFullscreen
          userId={user.id}
          onClose={() => setAvatarFullscreenOpen(false)}
          onUpdatePhoto={() => { setAvatarFullscreenOpen(false); uploaderRef.current?.open() }}
        />
      )}

      {/* Other user avatar fullscreen viewer */}
      {avatarFullscreenId && (
        <AvatarFullscreen userId={avatarFullscreenId} onClose={() => setAvatarFullscreenId(null)} />
      )}

      {/* Avatar uploader — always mounted so open() is available on first gesture */}
      {user && (
        <AvatarUploader
          ref={uploaderRef}
          userId={user.id}
          onDone={(_fullUrl, diamondUrl) => {
            setAvatarPreview(diamondUrl)
            refreshProfile()
          }}
          onCancel={() => {}}
        />
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const outlineBtn: React.CSSProperties = {
  flex: 1, padding: '9px 0', borderRadius: 10, border: '1.5px solid var(--fg-25)',
  background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const sectionLabel: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase' as const, color: 'var(--fg-30)', fontFamily: '"Space Grotesk", sans-serif',
}

function saveBtnStyle(busy: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
    background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif',
    fontSize: 15, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
  }
}
