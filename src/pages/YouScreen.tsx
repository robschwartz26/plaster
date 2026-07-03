import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Settings, ArrowLeft } from 'lucide-react'
import { UserActionsMenu } from '@/components/UserActionsMenu'
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
import { createOrGetConversation } from '@/lib/messaging'
import { AccountTypeBadge } from '@/components/AccountTypeBadge'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { MusicEmbed } from '@/components/MusicEmbed'
import { parseMusicEmbed, isValidMusicUrl, isBandcampPageUrl } from '@/lib/musicEmbed'
import { resolveBandcamp } from '@/lib/resolveMusicEmbed'
import { SEXTANT_LABELS, type Sextant } from '@/lib/neighborhoods'
import { FollowButton } from '@/components/FollowButton'
import { NotifyBell } from '@/components/NotifyBell'
import { BannerUploader } from '@/components/BannerUploader'
import { AccountProfile } from '@/components/AccountProfile'

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
  account_type: string | null
  banner_url: string | null
  banner_focal_y: number
  home_neighborhood: string | null
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
        account_type: selfProfile.account_type ?? null,
        banner_url: (selfProfile as unknown as { banner_url?: string | null }).banner_url ?? null,
        banner_focal_y: (selfProfile as unknown as { banner_focal_y?: number }).banner_focal_y ?? 0.5,
        home_neighborhood: selfProfile.home_neighborhood ?? null,
      })
      return
    }
    supabase.from('profiles').select('username, bio, avatar_url, avatar_diamond_url, is_public, account_type, banner_url, banner_focal_y, home_neighborhood')
      .eq('id', targetUserId).single()
      .then(({ data }) => { if (data) setDisplayProfile(data as DisplayProfile) })
  }, [targetUserId, isSelf, selfProfile, user?.email])

  // Profile edit state (self only)
  const [editing,  setEditing]  = useState(false)
  const [bio,      setBio]      = useState(selfProfile?.bio ?? '')
  const [isPublic, setIsPublic] = useState(selfProfile?.is_public ?? true)
  const [busy,     setBusy]     = useState(false)
  const [pendingBannerBlob,   setPendingBannerBlob]   = useState<Blob | null>(null)
  const [pendingBannerFocalY, setPendingBannerFocalY] = useState(0.5)
  const [homeNbhd,    setHomeNbhd]    = useState<string | null>(null)
  const [homeSextant, setHomeSextant] = useState<Sextant | null>(null)
  const [musicUrl,      setMusicUrl]      = useState('')
  const [resolvedEmbed, setResolvedEmbed] = useState<string | null>(null) // Bandcamp page → EmbeddedPlayer
  const [resolving,     setResolving]     = useState(false)
  const [resolveError,  setResolveError]  = useState<string | null>(null)

  const savedMusic = (selfProfile as unknown as { music_embed_url?: string | null })?.music_embed_url ?? null

  useEffect(() => {
    setBio(selfProfile?.bio ?? '')
    setIsPublic(selfProfile?.is_public ?? true)
    setHomeNbhd(selfProfile?.home_neighborhood ?? null)
    setHomeSextant((selfProfile?.home_sextant ?? null) as Sextant | null)
    setMusicUrl(savedMusic ?? '')
  }, [selfProfile?.bio, selfProfile?.is_public, selfProfile?.home_neighborhood, selfProfile?.home_sextant, savedMusic])

  // Bandcamp page urls carry no player id, so resolve them via the edge function
  // (debounced). Spotify + already-resolved Bandcamp embeds parse client-side and
  // need no round-trip. resolvedEmbed holds the EmbeddedPlayer link on success.
  useEffect(() => {
    const raw = musicUrl.trim()
    setResolveError(null)
    if (!raw || parseMusicEmbed(raw) || !isBandcampPageUrl(raw)) {
      setResolvedEmbed(null); setResolving(false); return
    }
    setResolvedEmbed(null); setResolving(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const { embedSrc, error } = await resolveBandcamp(raw)
      if (cancelled) return
      setResolving(false)
      if (embedSrc && parseMusicEmbed(embedSrc)) setResolvedEmbed(embedSrc)
      else setResolveError(error ?? 'Could not load that Bandcamp link.')
    }, 600)
    return () => { cancelled = true; clearTimeout(t) }
  }, [musicUrl])

  // The value we actually store/render: the pasted url if it parses directly,
  // else the resolved Bandcamp embed.
  const effectiveMusic = parseMusicEmbed(musicUrl) ? musicUrl.trim() : (resolvedEmbed ?? '')

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
  const [pendingAccountType, setPendingAccountType] = useState<string | null>(null)

  // Search state (self only)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; avatar_url: string | null; avatar_diamond_url: string | null }[]>([])
  const [searchBusy,    setSearchBusy]    = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!targetUserId) return
    fetchAttended()
    fetchCounts()
  }, [targetUserId])

  useEffect(() => {
    if (!user?.id || !isSelf) { setPendingAccountType(null); return }

    supabase
      .from('profiles')
      .select('pending_account_type')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { setPendingAccountType(data?.pending_account_type ?? null) })

    // Realtime: when admin approves/declines, profile row UPDATEs.
    // Banner clears instantly without page reload.
    const channel = supabase
      .channel(`profile-pending-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, async () => {
        const { data } = await supabase
          .from('profiles')
          .select('pending_account_type')
          .eq('id', user.id)
          .single()
        setPendingAccountType(data?.pending_account_type ?? null)
        refreshProfile()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id, isSelf, refreshProfile])

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

  // ── Profile save ───────────────────────────────────────────────────────

  async function saveProfile() {
    if (!user) return
    setBusy(true)

    // Guard: never persist an invalid music link (empty clears it). A Bandcamp page
    // url is stored as its resolved EmbeddedPlayer link (effectiveMusic).
    const musicRaw = musicUrl.trim()
    const musicToSave = musicRaw === '' ? '' : effectiveMusic
    if (musicRaw !== '' && !isValidMusicUrl(musicToSave)) { setBusy(false); return }

    const updates: { bio: string; is_public: boolean; banner_url?: string; banner_focal_y?: number; home_neighborhood?: string | null; home_sextant?: string | null; music_embed_url?: string | null } = { bio, is_public: isPublic, home_neighborhood: homeNbhd, home_sextant: homeSextant, music_embed_url: musicToSave === '' ? null : musicToSave }

    if (pendingBannerBlob) {
      const path = `${user.id}/banner.jpg`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, pendingBannerBlob, { contentType: 'image/jpeg', upsert: true })
      if (!upErr) {
        const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?t=' + Date.now()
        updates.banner_url     = url
        updates.banner_focal_y = pendingBannerFocalY
      } else {
        console.error('[YouScreen] banner upload failed:', upErr.message)
      }
    }

    await supabase.from('profiles').update(updates).eq('id', user.id)
    await refreshProfile()
    setPendingBannerBlob(null)
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

  if (!isSelf) {
    return (
      <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <PlasterHeader
          leftAction={
            <button style={headerIconBtn()} onClick={() => navigate(-1)} aria-label="Back">
              <ArrowLeft size={16} />
            </button>
          }
        />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AccountProfile accountProfileId={targetUserId} />
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      <PlasterHeader
        leftAction={
          !isSelf ? (
            <button
              style={headerIconBtn()}
              onClick={() => navigate(-1)}
              aria-label="Back"
            >
              <ArrowLeft size={16} />
            </button>
          ) : undefined
        }
        actions={
          isSelf ? (
            <button
              style={headerIconBtn()}
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              <Settings size={16} />
            </button>
          ) : targetUserId ? (
            <UserActionsMenu
              targetUserId={targetUserId}
              targetUsername={displayProfile?.username ?? null}
              onActionComplete={() => navigate(-1)}
            />
          ) : null
        }
      />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 0' }}>

        {/* Profile header */}
        {(displayProfile.account_type === 'venue' || displayProfile.account_type === 'artist') && displayProfile.banner_url ? (
          <>
            {/* Full-width banner + avatar ring */}
            <div style={{ margin: '-12px -20px 0', position: 'relative' }}>
              <div style={{ width: '100%', aspectRatio: '5/2', overflow: 'hidden' }}>
                <img
                  src={displayProfile.banner_url}
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                    objectPosition: `center ${displayProfile.banner_focal_y * 100}%`,
                    display: 'block',
                  }}
                />
              </div>
              {/* Avatar overlapping banner bottom-left */}
              <div style={{ position: 'absolute', bottom: -44, left: 20 }}>
                <div style={{ position: 'relative', width: 96, height: 96 }}>
                  {/* --bg ring behind avatar */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                    background: 'var(--bg)',
                  }} />
                  <div style={{ position: 'absolute', inset: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Diamond
                      diamondUrl={diamondSrc}
                      size={88}
                      onClick={() => isSelf ? setAvatarFullscreenOpen(true) : setAvatarFullscreenId(targetUserId)}
                    />
                  </div>
                  {isSelf && (
                    <button
                      onClick={() => uploaderRef.current?.open()}
                      style={{
                        position: 'absolute', bottom: 4, right: 4, zIndex: 2,
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
              </div>
            </div>

            {/* Text section — clears the 44px avatar overhang */}
            <div style={{ marginTop: 56, marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span>@{displayProfile.username}</span>
                <AccountTypeBadge accountType={displayProfile.account_type} size="md" />
                {displayProfile.home_neighborhood && (
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, color: '#A855F7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', padding: '2px 9px', borderRadius: 20 }}>
                    {displayProfile.home_neighborhood}
                  </span>
                )}
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
          </>
        ) : (
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
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span>@{displayProfile.username}</span>
                <AccountTypeBadge accountType={displayProfile.account_type} size="md" />
                {displayProfile.home_neighborhood && (
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600, color: '#A855F7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', padding: '2px 9px', borderRadius: 20 }}>
                    {displayProfile.home_neighborhood}
                  </span>
                )}
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
        )}

        {isSelf && pendingAccountType && (
          <div style={{
            margin: '0 0 14px',
            padding: '12px 16px',
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: 8,
          }}>
            <p style={{
              margin: 0,
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--fg)',
              lineHeight: 1.4,
            }}>
              Your {pendingAccountType} application is being reviewed
            </p>
            <p style={{
              margin: '4px 0 0',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 12,
              color: 'var(--fg-55)',
              lineHeight: 1.5,
            }}>
              We'll update your account when an admin approves it. This usually takes a day or two.
            </p>
          </div>
        )}

        {/* Edit / sign out (self) — Follow + Message buttons (other) */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {isSelf ? (
            <>
              <button onClick={() => setEditing(!editing)} style={outlineBtn}>{editing ? 'Cancel' : 'Edit profile'}</button>
              <button onClick={() => { signOut(); navigate('/auth', { replace: true }) }} style={{ ...outlineBtn, color: 'var(--fg-40)', borderColor: 'var(--fg-15)' }}>Sign out</button>
            </>
          ) : (
            <>
              <FollowButton targetUserId={targetUserId} />
              <button
                style={outlineBtn}
                onClick={async () => {
                  if (!targetUserId) return
                  const convId = await createOrGetConversation(targetUserId)
                  if (convId) navigate('/msg', { state: { openConversationId: convId } })
                }}
              >
                Message
              </button>
              <NotifyBell accountId={targetUserId} accountType={displayProfile.account_type} />
            </>
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
                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: '0 0 8px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)' }}>
                    Neighborhood
                  </p>
                  {homeNbhd && homeSextant && (
                    <p style={{ margin: '0 0 8px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)' }}>
                      {homeNbhd} · community wall covers {SEXTANT_LABELS[homeSextant]} Portland
                    </p>
                  )}
                  <NeighborhoodPicker value={homeNbhd} onChange={(name, sx) => { setHomeNbhd(name); setHomeSextant(sx) }} />
                </div>
                {(selfProfile?.account_type === 'venue' || selfProfile?.account_type === 'artist') && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ margin: '0 0 8px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)' }}>
                      Banner image
                    </p>
                    <BannerUploader
                      onConfirm={(blob, focalY) => { setPendingBannerBlob(blob); setPendingBannerFocalY(focalY) }}
                      currentBannerUrl={pendingBannerBlob ? null : displayProfile.banner_url}
                      currentFocalY={displayProfile.banner_focal_y}
                    />
                    {pendingBannerBlob && <p style={{ margin: '6px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>Banner ready — will upload on Save</p>}
                  </div>
                )}
                {(selfProfile?.account_type === 'venue' || selfProfile?.account_type === 'artist') && (() => {
                  const musicDirty = musicUrl.trim() !== ''
                  const musicOk    = !!parseMusicEmbed(effectiveMusic)
                  const musicBad   = musicDirty && !musicOk && !resolving
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ margin: '0 0 8px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-30)' }}>
                        Music
                      </p>
                      <input
                        type="url"
                        inputMode="url"
                        placeholder="Paste a Spotify or Bandcamp link"
                        value={musicUrl}
                        onChange={e => setMusicUrl(e.target.value)}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${musicBad ? 'var(--sold-out)' : 'var(--fg-18)'}`, background: 'var(--fg-08)', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                      />
                      <p style={{ margin: '6px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', lineHeight: 1.5 }}>
                        Paste your Spotify or Bandcamp link — track, album, or artist.
                      </p>
                      {resolving && (
                        <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>Loading that Bandcamp link…</p>
                      )}
                      {musicBad && (
                        <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--sold-out)' }}>
                          {resolveError ?? 'Paste a Spotify or Bandcamp link.'}
                        </p>
                      )}
                      {window.location.hostname === 'localhost' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => setMusicUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')}
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px dashed var(--fg-25)', background: 'transparent', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer' }}>DEV: Spotify</button>
                          <button type="button" onClick={() => setMusicUrl('https://c418.bandcamp.com/album/minecraft-volume-alpha')}
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px dashed var(--fg-25)', background: 'transparent', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer' }}>DEV: Bandcamp page</button>
                          <button type="button" onClick={() => setMusicUrl('')}
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px dashed var(--fg-25)', background: 'transparent', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer' }}>DEV: clear</button>
                        </div>
                      )}
                      {musicOk && (
                        <div style={{ marginTop: 12 }}>
                          <p style={{ margin: '0 0 6px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>Preview</p>
                          <MusicEmbed url={effectiveMusic} autoLoad />
                        </div>
                      )}
                    </div>
                  )
                })()}
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

        {/* Listen — your saved music embed (shown on your own profile, click-to-load) */}
        {!editing && savedMusic && (displayProfile.account_type === 'artist' || displayProfile.account_type === 'venue') && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 10px', fontFamily: '"Barlow Condensed", sans-serif', fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>Listen</p>
            <MusicEmbed url={savedMusic} />
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
          initialTab={followListTab}
          open={followListOpen}
          onClose={() => setFollowListOpen(false)}
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
