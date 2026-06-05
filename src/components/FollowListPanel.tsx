import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Diamond } from '@/components/Diamond'
import { AccountProfile } from '@/components/AccountProfile'
import { AccountTypeBadge } from '@/components/AccountTypeBadge'

interface FollowUser {
  id: string
  username: string | null
  avatar_diamond_url: string | null
  avatar_url: string | null
  bio: string | null
  account_type: string | null
}

interface Props {
  userId: string
  initialTab: 'followers' | 'following'
  open: boolean
  onClose: () => void
}

export function FollowListPanel({ userId, initialTab, open, onClose }: Props) {
  const [tab,             setTab]             = useState<'followers' | 'following'>(initialTab)
  const [searchQuery,     setSearchQuery]     = useState('')
  const [followersData,   setFollowersData]   = useState<FollowUser[] | null>(null)
  const [followingData,   setFollowingData]   = useState<FollowUser[] | null>(null)
  const [followingAccounts, setFollowingAccounts] = useState<FollowUser[] | null>(null)
  const [openAccountId,     setOpenAccountId]     = useState<string | null>(null)

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
      .select('user:follower_id(id, username, avatar_diamond_url, avatar_url, bio, account_type)')
      .eq('following_id', userId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
    setFollowersData(((data ?? []) as any[]).map(r => r.user).filter(Boolean))
  }

  async function fetchFollowingList() {
    const { data } = await supabase
      .from('follows')
      .select('user:following_id(id, username, avatar_diamond_url, avatar_url, bio, account_type)')
      .eq('follower_id', userId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
    const all = ((data ?? []) as any[]).map(r => r.user).filter(Boolean) as FollowUser[]
    setFollowingData(all.filter(u => !u.account_type || u.account_type === 'person'))
    setFollowingAccounts(all.filter(u => u.account_type === 'venue' || u.account_type === 'artist'))
  }

  function handleRowTap(user: FollowUser) {
    setOpenAccountId(user.id)
  }

  const currentList = (tab === 'followers' ? followersData : followingData) ?? []
  const loading     = tab === 'followers' ? followersData === null : (followingData === null || followingAccounts === null)
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

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <p style={{ margin: 0, padding: '24px 16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>Loading…</p>
          )}

          {/* Followers tab — flat list */}
          {!loading && tab === 'followers' && (
            <>
              {filtered.length === 0 && (
                <p style={{ margin: 0, padding: '24px 16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>
                  {needle ? 'No results' : 'No followers yet'}
                </p>
              )}
              {filtered.map(user => (
                <UserRow key={user.id} user={user} onTap={() => handleRowTap(user)} />
              ))}
            </>
          )}

          {/* Following tab — people + venues sections */}
          {!loading && tab === 'following' && (
            <>
              {/* People section */}
              <SectionHeader label="PEOPLE" count={filtered.length} />
              {filtered.length === 0 && (
                <p style={{ margin: 0, padding: '8px 16px 16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>
                  {needle ? 'No results' : 'Not following anyone yet'}
                </p>
              )}
              {filtered.map(user => (
                <UserRow key={user.id} user={user} onTap={() => handleRowTap(user)} />
              ))}

              {/* Accounts section (venues + artists) */}
              <SectionHeader label="ACCOUNTS" count={followingAccounts?.length ?? 0} />
              {(followingAccounts ?? []).length === 0 && (
                <p style={{ margin: 0, padding: '8px 16px 16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>
                  Not following any venues or artists yet
                </p>
              )}
              {(followingAccounts ?? []).map(account => (
                <UserRow key={account.id} user={account} onTap={() => setOpenAccountId(account.id)} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Account sub-panel — slides from LEFT ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 40,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        transform: (open && openAccountId) ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {openAccountId && (
          <div key={openAccountId} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              paddingTop: 'max(14px, env(safe-area-inset-top))',
              paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
              flexShrink: 0, borderBottom: '1px solid var(--fg-08)',
            }}>
              <button
                onClick={() => setOpenAccountId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-55)', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                BACK
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <AccountProfile accountProfileId={openAccountId} />
            </div>
          </div>
        )}
      </div>

    </>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ padding: '12px 16px 6px', borderBottom: '1px solid var(--fg-08)' }}>
      <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
        {label} · {count}
      </span>
    </div>
  )
}

function UserRow({ user, onTap }: { user: FollowUser; onTap: () => void }) {
  return (
    <div
      onClick={onTap}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--fg-08)', cursor: 'pointer' }}
    >
      <Diamond diamondUrl={user.avatar_diamond_url} fallbackUrl={user.avatar_url} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 15, color: 'var(--fg)', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span>@{user.username ?? '—'}</span>
          <AccountTypeBadge accountType={user.account_type} />
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
  )
}

