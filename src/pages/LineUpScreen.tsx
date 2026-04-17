import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { PlasterHeader } from '@/components/PlasterHeader'

const IS_DEV = window.location.hostname === 'localhost'

// ── Types ─────────────────────────────────────────────────────

interface RsvpItem {
  event_id: string
  title: string
  venue_name: string
  starts_at: string
  poster_url: string | null
  fill_frame: boolean
  focal_x: number
  focal_y: number
  color1: string
  color2: string
}

interface ActivityItem {
  id: string
  type: 'like' | 'rsvp'
  username: string
  avatar_url: string | null
  event_id: string
  event_title: string
  poster_url: string | null
  created_at: string
}

// ── Dev mock data ─────────────────────────────────────────────

const offset = (days: number) => new Date(Date.now() + days * 86400000).toISOString()

const MOCK_RSVPS: RsvpItem[] = [
  { event_id: 'mk1', title: 'Neon Wolves', venue_name: 'Mississippi Studios', starts_at: offset(0.4), poster_url: null, fill_frame: false, focal_x: 0.5, focal_y: 0.5, color1: '#4c1d95', color2: '#7c3aed' },
  { event_id: 'mk2', title: 'Drag Spectacular', venue_name: "Dante's", starts_at: offset(1.2), poster_url: null, fill_frame: false, focal_x: 0.5, focal_y: 0.5, color1: '#831843', color2: '#ec4899' },
  { event_id: 'mk3', title: 'Late Cinema', venue_name: 'Clinton St. Theater', starts_at: offset(2.8), poster_url: null, fill_frame: false, focal_x: 0.5, focal_y: 0.5, color1: '#312e81', color2: '#a5b4fc' },
]
const MOCK_ACTIVITY: ActivityItem[] = [
  { id: 'a1', type: 'rsvp', username: 'spacecadet', avatar_url: null, event_id: 'mk1', event_title: 'Neon Wolves', poster_url: null, created_at: offset(0) },
  { id: 'a2', type: 'like', username: 'pdxnightowl', avatar_url: null, event_id: 'mk2', event_title: 'Drag Spectacular', poster_url: null, created_at: offset(1) },
]

// ── Helpers ───────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso)
  const h = d.getHours(), m = d.getMinutes()
  const h12 = h % 12 || 12
  const ap = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`
}

function fmtDayLabel(isoDay: string) {
  const d = new Date(isoDay + 'T12:00:00')
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'TODAY'
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const mo = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return `${wd} ${mo} ${d.getDate()}`
}

function groupByDay(items: RsvpItem[]) {
  const m = new Map<string, RsvpItem[]>()
  for (const r of items) {
    const day = r.starts_at.slice(0, 10)
    const list = m.get(day) ?? []
    list.push(r)
    m.set(day, list)
  }
  return m
}

function daysRange(from: string, to: string) {
  const days: string[] = []
  const cur = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  end.setDate(end.getDate() + 1)
  while (cur <= end) { days.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1) }
  return days
}

// ── Main screen ───────────────────────────────────────────────

export function LineUpScreen() {
  const { user } = useAuth()
  const [rsvps, setRsvps] = useState<RsvpItem[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activated, setActivated] = useState<Set<string>>(new Set())
  const [rowTops, setRowTops] = useState<Record<string, number>>({})
  const [rowTopsReady, setRowTopsReady] = useState(false)
  const [containerWidth, setContainerWidth] = useState(375)

  const scrollRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Data fetch ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return }
    if (IS_DEV) { setRsvps(MOCK_RSVPS); setActivity(MOCK_ACTIVITY); setLoading(false); return }

    const load = async () => {
      const now = new Date().toISOString()

      const { data: rsvpData } = await supabase
        .from('attendees')
        .select('event_id, events(id, title, starts_at, poster_url, fill_frame, focal_x, focal_y, venues(name))')
        .eq('user_id', user.id)

      if (rsvpData) {
        const items: RsvpItem[] = rsvpData
          .filter(r => r.events && (r.events as any).starts_at >= now)
          .map(r => {
            const ev = r.events as any
            return {
              event_id: r.event_id,
              title: ev.title ?? 'Event',
              venue_name: ev.venues?.name ?? 'Unknown venue',
              starts_at: ev.starts_at,
              poster_url: ev.poster_url ?? null,
              fill_frame: ev.fill_frame ?? false,
              focal_x: ev.focal_x ?? 0.5,
              focal_y: ev.focal_y ?? 0.5,
              color1: '#2e1065',
              color2: '#7c3aed',
            }
          })
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        setRsvps(items)
      }

      // Friend activity
      try {
        const { data: friends } = await supabase
          .from('friends').select('friend_id').eq('user_id', user.id).eq('status', 'accepted')
        const friendIds = (friends ?? []).map((f: any) => f.friend_id)
        if (friendIds.length > 0) {
          const { data: rsvpAct } = await supabase
            .from('attendees')
            .select('user_id, event_id, created_at, events(title, poster_url), profiles(username, avatar_url)')
            .in('user_id', friendIds)
            .order('created_at', { ascending: false })
            .limit(20)
          if (rsvpAct) {
            setActivity(rsvpAct.map((r: any) => ({
              id: `rsvp-${r.user_id}-${r.event_id}`,
              type: 'rsvp' as const,
              username: r.profiles?.username ?? 'someone',
              avatar_url: r.profiles?.avatar_url ?? null,
              event_id: r.event_id,
              event_title: r.events?.title ?? '',
              poster_url: r.events?.poster_url ?? null,
              created_at: r.created_at,
            })))
          }
        }
      } catch { /* non-critical */ }

      setLoading(false)
    }
    load()
  }, [user])

  // ── Measure container & row tops ────────────────────────────
  useEffect(() => {
    if (scrollRef.current) setContainerWidth(scrollRef.current.clientWidth)
  }, [])

  useEffect(() => {
    if (rsvps.length === 0) return
    requestAnimationFrame(() => {
      const tops: Record<string, number> = {}
      Object.entries(rowRefs.current).forEach(([id, el]) => {
        if (el) tops[id] = el.offsetTop
      })
      setRowTops(tops)
      setRowTopsReady(true)
      // Initial activation check
      handleScroll()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rsvps])

  // ── Scroll → activate diamonds ──────────────────────────────
  const handleScroll = useCallback(() => {
    const c = scrollRef.current; if (!c) return
    const threshold = c.scrollTop + c.clientHeight * 0.6
    const next = new Set<string>()
    Object.entries(rowRefs.current).forEach(([id, el]) => {
      if (el && el.offsetTop < threshold) next.add(id)
    })
    setActivated(next)
  }, [])

  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // ── Layout ──────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const lastDay = rsvps.length > 0 ? rsvps[rsvps.length - 1].starts_at.slice(0, 10) : today
  const days = daysRange(today, lastDay)
  const grouped = groupByDay(rsvps)

  // Diamond positions
  const DIAMOND_W = 36
  const DIAMOND_H_ACTIVE = 54  // 2:3 ratio
  const ROW_H = 64
  const STACK_TOP = 12
  const STACK_GAP = 44  // 36 diamond + 8 gap
  const ACTIVE_LEFT = 16
  const INACTIVE_LEFT = containerWidth - 12 - DIAMOND_W  // right: 12px
  const inactiveTranslateX = INACTIVE_LEFT - ACTIVE_LEFT

  if (!user) return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlasterHeader actions={<span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', color: 'var(--fg-40)', textTransform: 'uppercase' }}>Line Up</span>} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {['#4c1d95','#831843','#0c4a6e'].map((c, i) => (
            <div key={i} style={{ width: 36, height: 36, background: c, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', opacity: 0.3 + i * 0.25 }} />
          ))}
        </div>
        <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: 0, textAlign: 'center' }}>Your lineup lives here</p>
        <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>Sign in to track RSVPs and see what's coming up</p>
      </div>
      <BottomNav />
    </div>
  )

  return (
    <div style={{ height: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlasterHeader actions={
        <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', color: 'var(--fg-40)', textTransform: 'uppercase' }}>
          Line Up
        </span>
      } />

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--fg-18)', borderTopColor: 'var(--fg)', animation: 'lineup-spin 0.8s linear infinite' }} />
            <style>{`@keyframes lineup-spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : rsvps.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 18, color: 'var(--fg)', margin: '0 0 8px 0' }}>No upcoming RSVPs</p>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', margin: 0 }}>RSVP to events on the wall to build your lineup</p>
          </div>
        ) : (
          <>
            {/* Calendar rows */}
            <div style={{ paddingRight: 56, paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom) + 24px)' }}>
              {days.map(day => {
                const dayEvents = grouped.get(day) ?? []
                return (
                  <div key={day}>
                    {/* Day label */}
                    <div style={{ height: dayEvents.length > 0 ? 28 : 20, display: 'flex', alignItems: 'center', paddingLeft: 16 }}>
                      <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg)', opacity: dayEvents.length > 0 ? 0.6 : 0.25 }}>
                        {fmtDayLabel(day)}
                      </span>
                    </div>

                    {/* Event rows */}
                    {dayEvents.map(ev => {
                      const isOn = activated.has(ev.event_id)
                      return (
                        <div
                          key={ev.event_id}
                          ref={el => { rowRefs.current[ev.event_id] = el }}
                          style={{ height: ROW_H, display: 'flex', alignItems: 'center', paddingLeft: 16 }}
                        >
                          {/* Spacer that expands when poster lands on left */}
                          <div style={{ width: isOn ? DIAMOND_W + 8 : 0, flexShrink: 0, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.title}
                            </p>
                            <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-40)', margin: '3px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.venue_name} · {fmtTime(ev.starts_at)}
                            </p>
                          </div>
                        </div>
                      )
                    })}

                    {/* Activity items for this day */}
                    {activity
                      .filter(a => a.created_at.slice(0, 10) === day)
                      .map(act => <ActivityRow key={act.id} item={act} />)
                    }
                  </div>
                )
              })}
            </div>

            {/* Diamond layer */}
            {rowTopsReady && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                {rsvps.map((ev, i) => {
                  const isOn = activated.has(ev.event_id)
                  const rowTop = rowTops[ev.event_id] ?? 0
                  // Activated: top is centered in the row, height is 2:3
                  const activeTop = rowTop + (ROW_H - DIAMOND_H_ACTIVE) / 2
                  // Stacked: top is at stack position
                  const stackedTop = STACK_TOP + i * STACK_GAP
                  const translateX = isOn ? 0 : inactiveTranslateX
                  const translateY = isOn ? 0 : stackedTop - activeTop

                  return (
                    <div
                      key={ev.event_id}
                      style={{
                        position: 'absolute',
                        left: ACTIVE_LEFT,
                        top: activeTop,
                        width: DIAMOND_W,
                        height: isOn ? DIAMOND_H_ACTIVE : DIAMOND_W,
                        overflow: 'hidden',
                        borderRadius: isOn ? 3 : 0,
                        clipPath: isOn
                          ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
                          : 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                        transform: `translate(${translateX}px, ${translateY}px)`,
                        transition: 'transform 0.5s cubic-bezier(0.4,0,0.2,1), clip-path 0.5s cubic-bezier(0.4,0,0.2,1), height 0.5s cubic-bezier(0.4,0,0.2,1), border-radius 0.5s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
                      {ev.poster_url ? (
                        <img
                          src={ev.poster_url}
                          draggable={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${ev.focal_x * 100}% ${ev.focal_y * 100}%`, display: 'block', pointerEvents: 'none', userSelect: 'none' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: `linear-gradient(160deg, ${ev.color1}, ${ev.color2})` }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* DEV button */}
        {IS_DEV && (
          <button
            onClick={() => { setRsvps(MOCK_RSVPS); setActivity(MOCK_ACTIVITY) }}
            style={{ position: 'fixed', bottom: 90, left: 12, padding: '5px 10px', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 4, color: 'rgba(234,179,8,0.9)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, cursor: 'pointer', zIndex: 50 }}
          >
            DEV mock
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

// ── Activity row ──────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', opacity: 0.65 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--fg-18)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {item.avatar_url
          ? <img src={item.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, color: 'var(--fg-55)', textTransform: 'uppercase' }}>{item.username[0]}</span>
        }
      </div>
      <p style={{ flex: 1, minWidth: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-55)', margin: 0, lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600, color: 'var(--fg-65)' }}>@{item.username}</span>
        {' '}{item.type === 'like' ? 'liked' : 'is going to'}{' '}
        <span>{item.event_title}</span>
      </p>
      {item.poster_url && (
        <div style={{ width: 20, height: 30, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <img src={item.poster_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
    </div>
  )
}
