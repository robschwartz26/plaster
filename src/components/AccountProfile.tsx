import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase, type DbVenue } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Diamond } from '@/components/Diamond'
import { AvatarFullscreen } from '@/components/AvatarFullscreen'
import { FollowButton } from '@/components/FollowButton'
import { NotifyBell } from '@/components/NotifyBell'
import { AccountTypeBadge } from '@/components/AccountTypeBadge'
import { FollowListPanel } from '@/components/FollowListPanel'
import { createOrGetConversation } from '@/lib/messaging'

// ── Types ──────────────────────────────────────────────────────────────────

interface AccountData {
  id: string
  username: string | null
  bio: string | null
  account_type: string | null
  venue_id: string | null
  banner_url: string | null
  banner_focal_y: number
  avatar_diamond_url: string | null
}

interface VenueEvent {
  id: string
  title: string
  starts_at: string
  poster_url: string | null
  category: string | null
}

interface AttendedEvent {
  event_id: string
  events: { id: string; title: string; poster_url: string | null; category: string | null } | null
}

interface Props {
  venueId?: string
  accountProfileId?: string
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

// ── Component ──────────────────────────────────────────────────────────────

export function AccountProfile({ venueId: venueIdProp, accountProfileId: accountProfileIdProp }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [resolvedId,          setResolvedId]          = useState<string | null>(accountProfileIdProp ?? null)
  const [account,             setAccount]             = useState<AccountData | null>(null)
  const [venue,               setVenue]               = useState<DbVenue | null>(null)
  const [events,              setEvents]              = useState<VenueEvent[]>([])
  const [attendedEvents,      setAttendedEvents]      = useState<AttendedEvent[]>([])
  const [followerCount,       setFollowerCount]       = useState(0)
  const [followingCount,      setFollowingCount]      = useState(0)
  const [profileFollowsViewer, setProfileFollowsViewer] = useState(false)
  const [following,           setFollowing]           = useState<Set<string>>(new Set())
  const [followersListOpen,   setFollowersListOpen]   = useState(false)
  const [followListTab,       setFollowListTab]       = useState<'followers' | 'following'>('followers')
  const [loading,             setLoading]             = useState(true)
  const [avatarFullscreenOpen, setAvatarFullscreenOpen] = useState(false)

  // Step 1: resolve account profile id
  useEffect(() => {
    if (accountProfileIdProp) { setResolvedId(accountProfileIdProp); return }
    if (!venueIdProp) return
    supabase.from('profiles').select('id').eq('venue_id', venueIdProp).eq('account_type', 'venue').maybeSingle()
      .then(({ data }) => { if (data?.id) setResolvedId(data.id) })
  }, [accountProfileIdProp, venueIdProp])

  // Step 2: load profile + type-specific data
  useEffect(() => {
    if (!resolvedId) return
    setLoading(true)
    supabase.from('profiles')
      .select('id, username, bio, account_type, venue_id, banner_url, banner_focal_y, avatar_diamond_url')
      .eq('id', resolvedId)
      .single()
      .then(async ({ data: prof }) => {
        if (!prof) { setLoading(false); return }
        const p = prof as AccountData
        setAccount(p)

        const isVenue      = p.account_type === 'venue' && !!p.venue_id
        const isPerson     = p.account_type === 'person' || !p.account_type
        const isSelfProfile = user?.id === resolvedId

        const queries: any[] = [
          // 0: follower count
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', resolvedId).eq('status', 'accepted'),
          // 1: following count
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', resolvedId).eq('status', 'accepted'),
        ]

        if (isPerson) {
          // 2: attended events
          queries.push(
            supabase.from('attendees')
              .select('event_id, events(id, title, poster_url, category)')
              .eq('user_id', resolvedId)
              .order('created_at', { ascending: false })
              .limit(24)
          )
          // 3: does this profile follow the viewer? (mutual check)
          if (user?.id && !isSelfProfile) {
            queries.push(
              supabase.from('follows').select('id', { count: 'exact', head: true })
                .eq('follower_id', resolvedId).eq('following_id', user.id).eq('status', 'accepted')
            )
          }
        } else if (isVenue) {
          // 2: venue data
          queries.push(supabase.from('venues').select('*').eq('id', p.venue_id!).single())
          // 3: upcoming events
          queries.push(
            supabase.from('events')
              .select('id, title, starts_at, poster_url, category')
              .eq('status', 'published')
              .eq('venue_id', p.venue_id!)
              .gte('starts_at', new Date().toISOString())
              .order('starts_at', { ascending: true })
              .limit(20)
          )
        }

        const allResults = await Promise.all(queries)

        setFollowerCount(allResults[0].count ?? 0)
        setFollowingCount(allResults[1].count ?? 0)

        if (isPerson) {
          setAttendedEvents(((allResults[2] as any)?.data as AttendedEvent[] | null) ?? [])
          if (user?.id && !isSelfProfile && allResults[3]) {
            setProfileFollowsViewer(((allResults[3] as any).count ?? 0) > 0)
          }
        } else if (isVenue) {
          setVenue((allResults[2] as any)?.data as DbVenue ?? null)
          setEvents(((allResults[3] as any)?.data as VenueEvent[] | null) ?? [])
        }

        setLoading(false)
      })
  }, [resolvedId, user?.id])

  // Load current user's following set for FollowListPanel
  useEffect(() => {
    if (!user?.id) return
    supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted')
      .then(({ data }) => setFollowing(new Set((data ?? []).map((r: { following_id: string }) => r.following_id))))
  }, [user?.id])

  async function handleMessage() {
    if (!resolvedId) return
    const convId = await createOrGetConversation(resolvedId)
    if (convId) navigate('/msg', { state: { openConversationId: convId } })
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-30)' }}>Loading…</p>
      </div>
    )
  }

  if (!account) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-30)' }}>Not found</p>
      </div>
    )
  }

  const isVenue  = account.account_type === 'venue'
  const isArtist = account.account_type === 'artist'
  const isPerson = account.account_type === 'person' || !account.account_type
  const hasBanner   = !!account.banner_url
  const displayName = (isVenue && venue?.name) ? venue.name : (account.username ?? '')
  const subtitle    = isVenue ? venue?.neighborhood : null
  const isSelf      = user?.id === resolvedId
  // Follow list is gated for persons: viewer must be self or mutual follow
  const isMutualFollow    = following.has(resolvedId ?? '') && profileFollowsViewer
  const canSeeFollowList  = !isPerson || isSelf || isMutualFollow

  function openFollowList(tab: 'followers' | 'following') {
    if (!canSeeFollowList) return
    setFollowListTab(tab)
    setFollowersListOpen(true)
  }

  // ── Shared FollowListPanel portal ──────────────────────────────────────
  const followListPortal = resolvedId ? createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: followersListOpen ? 'auto' : 'none' }}>
      <FollowListPanel
        userId={resolvedId}
        initialTab={followListTab}
        open={followersListOpen}
        onClose={() => setFollowersListOpen(false)}
      />
    </div>,
    document.body
  ) : null

  // ── Shared avatar-fullscreen portal ────────────────────────────────────
  // AvatarFullscreen self-portals to body and gates on the profiles is_public
  // RLS (locked state for private profiles); we just hand it the user id.
  const avatarFullscreenPortal = resolvedId && avatarFullscreenOpen ? (
    <AvatarFullscreen userId={resolvedId} onClose={() => setAvatarFullscreenOpen(false)} />
  ) : null

  // ── Person branch ──────────────────────────────────────────────────────
  if (isPerson) {
    const attendedList = attendedEvents.map(r => r.events).filter(Boolean) as NonNullable<AttendedEvent['events']>[]

    return (
      <div style={{ padding: '20px 20px 0' }}>

        {/* Header: diamond + name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <Diamond diamondUrl={account.avatar_diamond_url} size={80} onClick={() => setAvatarFullscreenOpen(true)} />
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <h1 style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--fg)', lineHeight: 1.2 }}>
              @{account.username ?? '—'}
            </h1>
            {account.bio && (
              <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', lineHeight: 1.4 }}>
                {account.bio}
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
          {([
            { label: 'followers', count: followerCount, tab: 'followers' as const },
            { label: 'following', count: followingCount, tab: 'following' as const },
            { label: 'attended',  count: attendedList.length, tab: null },
          ] as const).map(({ label, count, tab }) => {
            const tappable = !!tab && canSeeFollowList
            return (
              <div
                key={label}
                onClick={tappable ? () => openFollowList(tab) : undefined}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', cursor: tappable ? 'pointer' : 'default' }}
              >
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{count}</span>
                <span style={{ fontSize: 10, color: tappable ? 'var(--fg-55)' : 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', marginTop: 2, textDecoration: tappable ? 'underline' : 'none', textUnderlineOffset: 2 }}>{label}</span>
              </div>
            )
          })}
        </div>

        {/* Action buttons (non-self only) */}
        {!isSelf && resolvedId && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
            <FollowButton targetUserId={resolvedId} />
            {user && (
              <button onClick={handleMessage} style={outlineBtn}>Message</button>
            )}
          </div>
        )}

        {/* Attended events grid */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Attended</p>
          {attendedList.length === 0 ? (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>No attended events yet</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {attendedList.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => navigate('/', { state: { openEventId: ev.id } })}
                  style={{ aspectRatio: '2/3', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', position: 'relative', background: catGradient(ev.category) }}
                >
                  {ev.poster_url && (
                    <img
                      src={ev.poster_url}
                      alt={ev.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Superlatives placeholder */}
        <div style={{ paddingBottom: 40 }}>
          <p style={sectionLabel}>Superlatives</p>
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-25)' }}>Coming soon</p>
        </div>

        {followListPortal}
        {avatarFullscreenPortal}
      </div>
    )
  }

  // ── Venue / Artist branch ──────────────────────────────────────────────

  const avatarRing = (
    <div style={{ position: 'absolute', bottom: -44, left: 20 }}>
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <div style={{
          position: 'absolute', inset: 0,
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          background: 'var(--bg)',
        }} />
        <div style={{ position: 'absolute', inset: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Diamond diamondUrl={account.avatar_diamond_url} size={88} onClick={() => setAvatarFullscreenOpen(true)} />
        </div>
      </div>
    </div>
  )

  return (
    <div>

      {/* ── Header ── */}
      <div style={{ width: '100%', position: 'relative' }}>
        {hasBanner ? (
          <div style={{ width: '100%', aspectRatio: '5/2', overflow: 'hidden' }}>
            <img
              src={account.banner_url!}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: `center ${(account.banner_focal_y ?? 0.5) * 100}%`,
                display: 'block',
              }}
            />
          </div>
        ) : (
          <div style={{ width: '100%', aspectRatio: '16/7', background: 'linear-gradient(160deg, #1a0533 0%, #3b0764 100%)', overflow: 'hidden' }}>
            {isVenue && venue?.cover_url && (
              <img src={venue.cover_url} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        )}
        {avatarRing}
      </div>

      {/* ── Name + badge ── */}
      <div style={{ marginTop: 56, padding: '0 20px' }}>
        <h1 style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 20, fontWeight: 800, color: 'var(--fg)', lineHeight: 1.2, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span>{displayName}</span>
          <AccountTypeBadge accountType={account.account_type} size="md" />
        </h1>
        {subtitle && (
          <p style={{ margin: '3px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* ── 3-stat row: followers / following / upcoming ── */}
      <div style={{ padding: '10px 20px 0', display: 'flex', gap: 20 }}>
        {([
          { label: 'followers', count: followerCount, tab: 'followers' as const },
          { label: 'following', count: followingCount, tab: 'following' as const },
          { label: 'upcoming',  count: events.length,  tab: null },
        ] as const).map(({ label, count, tab }) => (
          <div
            key={label}
            onClick={tab ? () => openFollowList(tab) : undefined}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', cursor: tab ? 'pointer' : 'default' }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{count}</span>
            <span style={{ fontSize: 10, color: tab ? 'var(--fg-55)' : 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', marginTop: 2, textDecoration: tab ? 'underline' : 'none', textUnderlineOffset: 2 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Action buttons (non-self only) ── */}
      {!isSelf && resolvedId && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px 0' }}>
          <FollowButton targetUserId={resolvedId} />
          {user && (
            <button onClick={handleMessage} style={outlineBtn}>Message</button>
          )}
          <NotifyBell accountId={resolvedId} accountType={account.account_type} />
        </div>
      )}

      {/* ── Bio ── */}
      {account.bio && (
        <div style={{ padding: '10px 20px 0' }}>
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.5 }}>
            {account.bio}
          </p>
        </div>
      )}

      {/* ── Venue details ── */}
      {isVenue && venue && (
        <div style={{ padding: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {venue.description && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-65)', lineHeight: 1.5 }}>
              {venue.description}
            </p>
          )}
          {venue.address && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)' }}>
              📍 {venue.address}
            </p>
          )}
          {venue.website && (
            <a href={venue.website} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', textDecoration: 'none' }}>
              🌐 {venue.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {venue.instagram && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
              @{venue.instagram.replace(/^@/, '')}
            </p>
          )}
        </div>
      )}

      {/* ── Upcoming ── */}
      <div style={{ padding: '16px 20px 0' }}>
        <p style={sectionLabel}>Upcoming</p>
        {isVenue && events.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {events.map(ev => (
              <div
                key={ev.id}
                onClick={() => navigate('/', { state: { openEventId: ev.id } })}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--fg-08)', cursor: 'pointer' }}
              >
                <div style={{ width: 38, height: 57, borderRadius: 4, overflow: 'hidden', background: 'var(--fg-08)', flexShrink: 0 }}>
                  {ev.poster_url && <img src={ev.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{ev.title}</p>
                  <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>{formatEventDate(ev.starts_at)}</p>
                </div>
                {ev.category && (
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-30)', letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>
                    {ev.category}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-30)' }}>
            {isArtist ? 'No upcoming shows yet' : 'No upcoming shows'}
          </p>
        )}
      </div>

      {/* ── Superlatives placeholder ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <p style={sectionLabel}>Superlatives</p>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-25)' }}>Coming soon</p>
      </div>

      <div style={{ height: 40 }} />

      {followListPortal}
    </div>
  )
}

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (diffDays <= 0) return `Tonight · ${time}`
  if (diffDays === 1) return `Tomorrow · ${time}`
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`
}

const outlineBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 10, border: '1.5px solid var(--fg-25)',
  background: 'transparent', color: 'var(--fg-65)',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const sectionLabel: React.CSSProperties = {
  margin: '0 0 10px',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 11, fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase' as const,
  color: 'var(--fg-30)',
}
