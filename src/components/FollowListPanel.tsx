import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Diamond } from '@/components/Diamond'
import { AvatarFullscreen } from '@/components/AvatarFullscreen'

interface FollowUser {
  id: string
  username: string | null
  avatar_diamond_url: string | null
  avatar_url: string | null
  bio: string | null
}

interface Props {
  userId: string
  currentUserId: string
  initialTab: 'followers' | 'following'
  open: boolean
  onClose: () => void
  following: Set<string>
  onFollowToggle: (targetId: string) => Promise<void>
}

export function FollowListPanel({ userId, currentUserId, initialTab, open, onClose, following, onFollowToggle }: Props) {
  const [tab,           setTab]           = useState<'followers' | 'following'>(initialTab)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [followersData, setFollowersData] = useState<FollowUser[] | null>(null)
  const [followingData, setFollowingData] = useState<FollowUser[] | null>(null)
  const [profileUser,   setProfileUser]   = useState<FollowUser | null>(null)
  const [profileCounts, setProfileCounts] = useState<{ followers: number; following: number } | null>(null)
  const [avatarFsId,    setAvatarFsId]    = useState<string | null>(null)

  // When opened, sync to the tab that was tapped, reset search
  useEffect(() => {
    if (open) { setTab(initialTab); setSearchQuery('') }
  }, [open, initialTab])

  // Fetch whichever tab is active if not yet cached
  useEffect(() => {
    if (!open) return
    if (tab === 'followers' && followersData === null) fetchFollowers()
    if (tab === 'following' && followingData === null) fetchFollowingList()
  }, [tab, open])

  async function fetchFollowers() {
    const { data } = await supabase
      .from('follows')
      .select('user:follower_id(id, username, avatar_diamond_url, avatar_url, bio)')
      .eq('following_id', userId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
    setFollowersData(((data ?? []) as any[]).map(r => r.user).filter(Boolean))
  }

  async function fetchFollowingList() {
    const { data } = await supabase
      .from('follows')
      .select('user:following_id(id, username, avatar_diamond_url, avatar_url, bio)')
      .eq('follower_id', userId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
    setFollowingData(((data ?? []) as any[]).map(r => r.user).filter(Boolean))
  }

  function openProfile(user: FollowUser) {
    setProfileUser(user)
    Promise.all([
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', user.id).eq('status', 'accepted'),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id',  user.id).eq('status', 'accepted'),
    ]).then(([{ count: followers }, { count: fwing }]) => {
      setProfileCounts({ followers: followers ?? 0, following: fwing ?? 0 })
    })
  }

  function closeProfile() { setProfileUser(null); setProfileCounts(null) }

  const currentList = (tab === 'followers' ? followersData : followingData) ?? []
  const loading     = tab === 'followers' ? followersData === null : followingData === null
  const needle      = searchQuery.replace(/^@/, '').toLowerCase()
  const filtered    = needle ? currentList.filter(u => u.username?.toLowerCase().includes(needle)) : currentList

  return (
    <>
      {/* ── Main list panel — slides from RIGHT ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 30,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Back row */}
        <div style={{
          display: 'flex', alignItems: 'center',
          paddingTop: 'max(14px, env(safe-area-inset-top))',
          paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search @username"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 20, border: '1px solid var(--fg-15)', background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Tab toggle */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--fg-08)', flexShrink: 0, paddingLeft: 8 }}>
          {(['followers', 'following'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 16px 8px', marginBottom: -1,
                fontFamily: 'Space Grotesk, sans-serif', fontWeight: tab === t ? 700 : 500, fontSize: 14,
                color: tab === t ? 'var(--fg)' : 'var(--fg-40)',
                borderBottom: tab === t ? '2px solid var(--fg)' : '2px solid transparent',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* User list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <p style={{ margin: 0, padding: '24px 16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>Loading…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p style={{ margin: 0, padding: '24px 16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>
              {needle ? 'No results' : tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </p>
          )}
          {filtered.map(user => (
            <div
              key={user.id}
              onClick={() => openProfile(user)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--fg-08)', cursor: 'pointer' }}
            >
              <Diamond diamondUrl={user.avatar_diamond_url} fallbackUrl={user.avatar_url} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 15, color: 'var(--fg)' }}>
                  @{user.username ?? '—'}
                </p>
                {user.bio && (
                  <p style={{ margin: '2px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: 'var(--fg-40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.bio}
                  </p>
                )}
              </div>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--fg-25)', flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          ))}
        </div>

        {/* ── Profile sub-panel — slides from LEFT ── */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'var(--bg)',
          display: 'flex', flexDirection: 'column',
          transform: profileUser ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {profileUser && (
            <ProfileSubPanel
              user={profileUser}
              counts={profileCounts}
              isSelf={profileUser.id === currentUserId}
              isFollowing={following.has(profileUser.id)}
              onFollowToggle={() => onFollowToggle(profileUser.id)}
              onBack={closeProfile}
              onAvatarTap={() => setAvatarFsId(profileUser.id)}
            />
          )}
        </div>
      </div>

      {avatarFsId && (
        <AvatarFullscreen userId={avatarFsId} onClose={() => setAvatarFsId(null)} />
      )}
    </>
  )
}

// ── Profile sub-panel ──────────────────────────────────────────────────────

function ProfileSubPanel({ user, counts, isSelf, isFollowing, onFollowToggle, onBack, onAvatarTap }: {
  user: FollowUser
  counts: { followers: number; following: number } | null
  isSelf: boolean
  isFollowing: boolean
  onFollowToggle: () => Promise<void>
  onBack: () => void
  onAvatarTap: () => void
}) {
  const [toggling, setToggling] = useState(false)

  async function handleToggle() {
    setToggling(true)
    await onFollowToggle()
    setToggling(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Back */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
        flexShrink: 0, borderBottom: '1px solid var(--fg-08)',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          BACK
        </button>
      </div>

      {/* Identity */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 16px', flexShrink: 0 }}>
        <Diamond diamondUrl={user.avatar_diamond_url} fallbackUrl={user.avatar_url} size={80} onClick={onAvatarTap} />
        <p style={{ margin: '14px 0 0', fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 22, color: 'var(--fg)', textAlign: 'center' }}>
          @{user.username ?? '—'}
        </p>
        {user.bio && (
          <p style={{ margin: '6px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-55)', textAlign: 'center', lineHeight: 1.4, padding: '0 24px' }}>
            {user.bio}
          </p>
        )}
        <div style={{ display: 'flex', gap: 28, marginTop: 16 }}>
          {[
            { label: 'followers', value: counts?.followers ?? '—' },
            { label: 'following', value: counts?.following ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-40)', fontFamily: 'Space Grotesk, sans-serif', marginTop: 2 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Follow button */}
      {!isSelf && (
        <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
          <button
            onClick={handleToggle}
            disabled={toggling}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 12,
              border: isFollowing ? '1.5px solid var(--fg-25)' : 'none',
              background: isFollowing ? 'transparent' : 'var(--fg)',
              color: isFollowing ? 'var(--fg-55)' : 'var(--bg)',
              fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700,
              cursor: toggling ? 'not-allowed' : 'pointer', opacity: toggling ? 0.6 : 1,
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      )}
    </div>
  )
}
