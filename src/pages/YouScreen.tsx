import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AnimatePresence, motion } from 'framer-motion'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { SettingsPanel } from '@/components/SettingsPanel'
import { Diamond } from '@/components/Diamond'
import { AvatarUploader, type AvatarUploaderRef } from '@/components/AvatarUploader'
import { AvatarFullscreen } from '@/components/AvatarFullscreen'
import { FollowListPanel } from '@/components/FollowListPanel'
import { SocialDiamondRow } from '@/components/SocialDiamondRow'

// ── Types ──────────────────────────────────────────────────────────────────

interface AttendedEvent {
  event_id: string
  events: {
    id: string
    title: string
    poster_url: string | null
    starts_at: string
    category: string | null
  }
}

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  Music:    ['#4c1d95', '#7c3aed'],
  Drag:     ['#831843', '#ec4899'],
  Dance:    ['#7c2d12', '#f97316'],
  Literary: ['#3730a3', '#818cf8'],
  Art:      ['#365314', '#a3e635'],
  Film:     ['#0c4a6e', '#38bdf8'],
  Trivia:   ['#7c2d12', '#fb923c'],
  Other:    ['#2e1065', '#a855f7'],
}
function catGradient(cat: string | null | undefined): string {
  const [c1, c2] = CATEGORY_GRADIENTS[cat ?? ''] ?? CATEGORY_GRADIENTS.Other
  return `conic-gradient(from 0deg at 50% 50%, ${c1}, ${c2}, ${c1})`
}

interface FollowCounts { followers: number; following: number }

type DisplayProfile = {
  username: string
  bio: string | null
  avatar_url: string | null
  avatar_diamond_url: string | null
  is_public: boolean
}

// ── Follow button (for person profiles) ───────────────────────────────────

type FollowStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'following' | 'mutual' | 'self'

function FollowButton({ targetUserId, size = 'large' }: { targetUserId: string; size?: 'large' | 'small' }) {
  const { user } = useAuth()
  const [status,               setStatus]               = useState<FollowStatus | null>(null)
  const [loading,              setLoading]              = useState(false)
  const [expandedAcceptDecline, setExpandedAcceptDecline] = useState(false)

  const refreshStatus = useCallback(() => {
    if (!user) return
    supabase.rpc('follow_status', { other_user_id: targetUserId })
      .then(({ data }) => {
        if (typeof data === 'string') {
          setStatus(data as FollowStatus)
          if (data !== 'pending_incoming') setExpandedAcceptDecline(false)
        }
      })
  }, [user, targetUserId])

  useEffect(() => {
    if (!user) return
    refreshStatus()

    const channel = supabase
      .channel(`follow-status-${user.id}-${targetUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, () => refreshStatus())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, targetUserId, refreshStatus])

  if (!user || status === 'self' || status === null) return null

  async function handleClick() {
    if (loading || !user) return
    setLoading(true)
    if (status === 'none') {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId })
    } else if (status === 'pending_outgoing') {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId)
    } else if (status === 'following' || status === 'mutual') {
      await supabase.rpc('unfollow_user', { other_user_id: targetUserId })
    } else if (status === 'pending_incoming') {
      setExpandedAcceptDecline(true)
      setLoading(false)
      return
    }
    await refreshStatus()
    setLoading(false)
  }

  async function handleAccept() {
    if (loading || !user) return
    setLoading(true)
    await supabase.rpc('accept_follow_request', { follower_user_id: targetUserId })
    setExpandedAcceptDecline(false)
    await refreshStatus()
    setLoading(false)
  }

  async function handleDecline() {
    if (loading || !user) return
    setLoading(true)
    await supabase.rpc('decline_follow_request', { follower_user_id: targetUserId })
    setExpandedAcceptDecline(false)
    await refreshStatus()
    setLoading(false)
  }

  const btnSize: React.CSSProperties = size === 'small'
    ? { padding: '6px 14px', borderRadius: 20, fontSize: 12 }
    : { flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 13 }

  // Expanded accept/decline UI for pending_incoming
  if (status === 'pending_incoming' && expandedAcceptDecline) {
    return (
      <div style={{ display: 'flex', gap: 10, flex: 1 }}>
        <button
          onClick={handleAccept}
          disabled={loading}
          style={{
            flex: 1, ...btnSize,
            border: 'none', background: 'var(--fg)', color: 'var(--bg)',
            fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          disabled={loading}
          style={{
            flex: 1, ...btnSize,
            border: '1.5px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-55)',
            fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          Decline
        </button>
      </div>
    )
  }

  const label = status === 'pending_incoming' ? 'Pending request'
              : status === 'pending_outgoing'  ? 'Pending'
              : status === 'mutual'            ? 'Following'
              : status === 'following'         ? 'Following'
              : 'Follow'

  const isOutlineStyle = status !== 'none'

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        ...btnSize,
        border: isOutlineStyle ? '1.5px solid var(--fg-25)' : 'none',
        background: isOutlineStyle ? 'transparent' : 'var(--fg)',
        color: isOutlineStyle ? 'var(--fg-55)' : 'var(--bg)',
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function YouScreen({ userId: propUserId }: { userId?: string } = {}) {
  const { username: paramUsername } = useParams<{ username?: string }>()
  const { user, profile: selfProfile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // ── Resolve which user we're viewing ──────────────────────────────────
  const [targetUserId, setTargetUserId] = useState<string | null>(propUserId ?? null)
  const [notFound,     setNotFound]     = useState(false)

  useEffect(() => {
    if (propUserId) { setTargetUserId(propUserId); return }
    if (paramUsername) {
      supabase.from('profiles').select('id').eq('username', paramUsername).single()
        .then(({ data }) => { if (data) setTargetUserId(data.id); else setNotFound(true) })
      return
    }
    if (user?.id) setTargetUserId(user.id)
  }, [propUserId, paramUsername, user?.id])

  const isSelf = !!targetUserId && targetUserId === user?.id

  // ── Display profile ────────────────────────────────────────────────────
  const [displayProfile, setDisplayProfile] = useState<DisplayProfile | null>(null)

  useEffect(() => {
    if (!targetUserId) return
    if (isSelf && selfProfile) {
      setDisplayProfile({
        username: selfProfile.username ?? user?.email?.split('@')[0] ?? '',
        bio: selfProfile.bio ?? null,
        avatar_url: selfProfile.avatar_url ?? null,
        avatar_diamond_url: selfProfile.avatar_diamond_url ?? null,
        is_public: selfProfile.is_public ?? true,
      })
      return
    }
    supabase.from('profiles').select('username, bio, avatar_url, avatar_diamond_url, is_public')
      .eq('id', targetUserId).single()
      .then(({ data }) => { if (data) setDisplayProfile(data as DisplayProfile) })
  }, [targetUserId, isSelf, selfProfile, user?.email])

  // Profile edit state (self only)
  const [editing,  setEditing]  = useState(false)
  const [bio,      setBio]      = useState(selfProfile?.bio ?? '')
  const [isPublic, setIsPublic] = useState(selfProfile?.is_public ?? true)
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    setBio(selfProfile?.bio ?? '')
    setIsPublic(selfProfile?.is_public ?? true)
  }, [selfProfile?.bio, selfProfile?.is_public])

  // Data state
  const [attended, setAttended] = useState<AttendedEvent[]>([])
  const [counts,   setCounts]   = useState<FollowCounts>({ followers: 0, following: 0 })

  // Avatar state (self only)
  const uploaderRef = useRef<AvatarUploaderRef>(null)
  const [avatarPreview,        setAvatarPreview]        = useState<string | null>(null)
  const [avatarFullscreenOpen, setAvatarFullscreenOpen] = useState(false)
  const [avatarFullscreenId,   setAvatarFullscreenId]   = useState<string | null>(null)

  // Follow list panel state
  const [followListOpen, setFollowListOpen] = useState(false)
  const [followListTab,  setFollowListTab]  = useState<'followers' | 'following'>('followers')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Search state (self only)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; avatar_url: string | null; avatar_diamond_url: string | null }[]>([])
  const [searchBusy,    setSearchBusy]    = useState(false)
  const [following,     setFollowing]     = useState<Set<string>>(new Set())

  // ── Data fetching ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!targetUserId) return
    fetchAttended()
    fetchCounts()
  }, [targetUserId])

  useEffect(() => {
    if (!user || !isSelf) return
    fetchFollowing()
  }, [user?.id, isSelf])

  async function fetchAttended() {
    if (!targetUserId) return
    const { data } = await supabase.from('attendees')
      .select('event_id, events(id, title, poster_url, starts_at, category)')
      .eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(24)
    setAttended((data as AttendedEvent[] | null) ?? [])
  }

  async function fetchCounts() {
    if (!targetUserId) return
    const [{ count: followers }, { count: fwing }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetUserId).eq('status', 'accepted'),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetUserId).eq('status', 'accepted'),
    ])
    setCounts({ followers: followers ?? 0, following: fwing ?? 0 })
  }

  async function fetchFollowing() {
    if (!user) return
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted')
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

  async function toggleFollow(targetId: string) {
    if (!user) return
    if (following.has(targetId)) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId)
      setFollowing(prev => { const next = new Set(prev); next.delete(targetId); return next })
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId })
      setFollowing(prev => new Set([...prev, targetId]))
    }
    fetchCounts()
  }

  // ── Derived ────────────────────────────────────────────────────────────

  const diamondSrc = isSelf
    ? (avatarPreview ?? selfProfile?.avatar_diamond_url ?? selfProfile?.avatar_url ?? null)
    : (displayProfile?.avatar_diamond_url ?? displayProfile?.avatar_url ?? null)

  // ── Early returns ──────────────────────────────────────────────────────

  if (notFound) return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--fg-30)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14 }}>User not found</p>
    </div>
  )

  if (!targetUserId || !displayProfile) return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--fg-30)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14 }}>Loading…</p>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      <PlasterHeader
        actions={
          <button
            style={headerIconBtn()}
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
        }
      />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 0' }}>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>

          {/* Diamond avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Diamond
              diamondUrl={diamondSrc}
              size={80}
              onClick={() => isSelf ? setAvatarFullscreenOpen(true) : setAvatarFullscreenId(targetUserId)}
            />
            {isSelf && (
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
            )}
          </div>

          {/* Name + stats */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2 }}>
              @{displayProfile.username}
            </p>
            {displayProfile.bio && !editing && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.4 }}>
                {displayProfile.bio}
              </p>
            )}
            <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
              {[
                { label: 'followers', count: counts.followers, tab: isSelf ? 'followers' as const : null },
                { label: 'following', count: counts.following, tab: isSelf ? 'following' as const : null },
                { label: 'attended',  count: attended.length,  tab: null },
              ].map(({ label, count, tab }) => (
                <div
                  key={label}
                  onClick={tab ? () => { setFollowListTab(tab); setFollowListOpen(true) } : undefined}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: tab ? 'pointer' : 'default' }}
                >
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: 10, color: tab ? 'var(--fg-55)' : 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', marginTop: 2, textDecoration: tab ? 'underline' : 'none', textUnderlineOffset: 2 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Edit / sign out (self) — Follow button (other) */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {isSelf ? (
            <>
              <button onClick={() => setEditing(!editing)} style={outlineBtn}>{editing ? 'Cancel' : 'Edit profile'}</button>
              <button onClick={() => { signOut(); navigate('/auth', { replace: true }) }} style={{ ...outlineBtn, color: 'var(--fg-40)', borderColor: 'var(--fg-15)' }}>Sign out</button>
            </>
          ) : (
            <FollowButton targetUserId={targetUserId} />
          )}
        </div>

        {/* Social diamond row — who this user follows + pending requests (self only) */}
        <SocialDiamondRow targetUserId={targetUserId} />

        {/* Editing panel (self only) */}
        {isSelf && (
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
        )}

        {/* Find people (self only) */}
        {isSelf && (
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
                    <FollowButton targetUserId={u.id} size="small" />
                  </div>
                ))}
              </div>
            )}
            {searchBusy && <p style={{ fontSize: 13, color: 'var(--fg-30)', margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif' }}>Searching…</p>}
          </div>
        )}

        {/* Attended events grid */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Attended</p>
          {attended.length === 0 ? (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>No attended events yet</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {attended.slice(0, 9).map(({ event_id, events: ev }) => (
                  <div
                    key={event_id}
                    onClick={() => ev && navigate('/', { state: { openEventId: ev.id } })}
                    style={{ aspectRatio: '2/3', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', position: 'relative', background: catGradient(ev?.category) }}
                  >
                    {ev?.poster_url && (
                      <img
                        src={ev.poster_url}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                    )}
                  </div>
                ))}
              </div>
              {attended.length > 9 && (
                <p style={{ margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', textAlign: 'right' }}>see all</p>
              )}
            </>
          )}
        </div>

        <div style={{ height: 'var(--nav-height)' }} />
      </div>

      {/* Follow list panel (self only) */}
      {isSelf && user && (
        <FollowListPanel
          userId={user.id}
          currentUserId={user.id}
          initialTab={followListTab}
          open={followListOpen}
          onClose={() => setFollowListOpen(false)}
          following={following}
          onFollowToggle={async (targetId) => { await toggleFollow(targetId) }}
        />
      )}

      {/* Own avatar fullscreen */}
      {isSelf && user && avatarFullscreenOpen && (
        <AvatarFullscreen
          userId={user.id}
          onClose={() => setAvatarFullscreenOpen(false)}
          onUpdatePhoto={() => { setAvatarFullscreenOpen(false); uploaderRef.current?.open() }}
        />
      )}

      {/* Other user avatar fullscreen */}
      {avatarFullscreenId && (
        <AvatarFullscreen userId={avatarFullscreenId} onClose={() => setAvatarFullscreenId(null)} />
      )}

      {/* Avatar uploader (self only) */}
      {isSelf && user && (
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
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
