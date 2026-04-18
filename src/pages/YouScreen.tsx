import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BottomNav } from '@/components/BottomNav'
import { AnimatePresence, motion } from 'framer-motion'
import { PlasterHeader } from '@/components/PlasterHeader'

const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY
)

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

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function getTouchDist(touches: TouchList) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

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

  // Avatar preview (after upload)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // Avatar crop editor state
  const [editSrc,  setEditSrc]  = useState<string | null>(null)
  const [, setEditFile] = useState<File | null>(null)
  const [panX,         setPanX]         = useState(0)
  const [panY,         setPanY]         = useState(0)
  const [scale,        setScale]        = useState(1)
  const [uploadBusy,   setUploadBusy]   = useState(false)

  // Search state
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; avatar_url: string | null }[]>([])
  const [searchBusy,    setSearchBusy]    = useState(false)
  const [following,     setFollowing]     = useState<Set<string>>(new Set())

  // Refs
  const fileRef    = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef    = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const pinchRef   = useRef<{ dist: number; startScale: number } | null>(null)

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

  // ── Avatar — file select (opens editor) ────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setEditFile(file)
    setEditSrc(URL.createObjectURL(file))
    setPanX(0); setPanY(0); setScale(1)
  }

  function cancelEdit() {
    if (editSrc) URL.revokeObjectURL(editSrc)
    setEditSrc(null); setEditFile(null)
    setPanX(0); setPanY(0); setScale(1)
  }

  // ── Avatar — canvas export + upload ───────────────────────────────────

  async function saveCroppedAvatar() {
    if (!editSrc || !user) return
    setUploadBusy(true)

    const SIZE = 240
    const canvas = document.createElement('canvas')
    canvas.width = SIZE; canvas.height = SIZE
    const ctx = canvas.getContext('2d')!

    // Diamond clip
    ctx.beginPath()
    ctx.moveTo(SIZE / 2, 0)
    ctx.lineTo(SIZE, SIZE / 2)
    ctx.lineTo(SIZE / 2, SIZE)
    ctx.lineTo(0, SIZE / 2)
    ctx.closePath()
    ctx.clip()

    const img = new Image()
    img.src = editSrc
    await new Promise<void>(res => { img.onload = () => res() })

    const coverScale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)

    // Blurred backdrop
    ctx.save()
    ctx.filter = 'blur(16px) brightness(0.5)'
    const bw = img.naturalWidth * coverScale
    const bh = img.naturalHeight * coverScale
    ctx.drawImage(img, (SIZE - bw) / 2, (SIZE - bh) / 2, bw, bh)
    ctx.restore()

    // Main image with pan + scale (display is 120px, canvas is 240 → ratio 2)
    const RATIO = SIZE / 120
    const totalScale = coverScale * scale
    const sw = img.naturalWidth  * totalScale
    const sh = img.naturalHeight * totalScale
    ctx.drawImage(img, (SIZE - sw) / 2 + panX * RATIO, (SIZE - sh) / 2 + panY * RATIO, sw, sh)

    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.9))

    const filePath = `${user.id}/avatar.jpg`
    const { error } = await supabaseAdmin.storage.from('avatars').upload(filePath, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) { console.error('[Avatar] upload error:', error); setUploadBusy(false); return }

    const { data: urlData } = supabaseAdmin.storage.from('avatars').getPublicUrl(filePath)
    const avatarUrl = urlData.publicUrl + '?t=' + Date.now()
    await supabaseAdmin.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)
    setAvatarPreview(avatarUrl)
    cancelEdit()
    await refreshProfile()
    setUploadBusy(false)
  }

  // ── Touch handlers for preview ─────────────────────────────────────────

  // Register non-passive touchmove to allow preventDefault (prevents scroll during drag)
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && dragRef.current) {
        const dx = e.touches[0].clientX - dragRef.current.startX
        const dy = e.touches[0].clientY - dragRef.current.startY
        setPanX(clamp(dragRef.current.startPanX + dx, -80, 80))
        setPanY(clamp(dragRef.current.startPanY + dy, -80, 80))
      } else if (e.touches.length === 2 && pinchRef.current) {
        const newDist = getTouchDist(e.touches)
        setScale(clamp((newDist / pinchRef.current.dist) * pinchRef.current.startScale, 0.5, 3))
      }
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [editSrc])

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: panX, startPanY: panY }
      pinchRef.current = null
    } else if (e.touches.length === 2) {
      pinchRef.current = { dist: getTouchDist(e.nativeEvent.touches), startScale: scale }
      dragRef.current = null
    }
  }

  function handleTouchEnd() { dragRef.current = null; pinchRef.current = null }

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY }
  }, [panX, panY])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    setPanX(clamp(dragRef.current.startPanX + (e.clientX - dragRef.current.startX), -80, 80))
    setPanY(clamp(dragRef.current.startPanY + (e.clientY - dragRef.current.startY), -80, 80))
  }, [])

  const handleMouseUp = useCallback(() => { dragRef.current = null }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(prev => clamp(prev - e.deltaY * 0.003, 0.5, 3))
  }, [])

  // ── Search + follow ────────────────────────────────────────────────────

  async function searchUsers(q: string) {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    setSearchBusy(true)
    const clean = q.replace(/^@/, '').trim()
    const { data } = await supabase.from('profiles').select('id, username, avatar_url')
      .ilike('username', `${clean}%`).neq('id', user?.id ?? '').limit(8)
    setSearchResults((data ?? []) as { id: string; username: string; avatar_url: string | null }[])
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

  const avatarSrc = avatarPreview ?? profile?.avatar_url ?? null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      <PlasterHeader />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 0' }}>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>

          {/* Diamond avatar */}
          <div onClick={() => fileRef.current?.click()} style={{ flexShrink: 0, cursor: 'pointer' }}>
            {avatarSrc ? (
              <div style={{ width: 80, height: 80, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden' }}>
                <img src={avatarSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              </div>
            ) : (
              <div style={{ width: 80, height: 80 }}>
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                  <polygon points="40,4 76,40 40,76 4,40" fill="var(--bg)" stroke="var(--fg-25)" strokeWidth="1.5" strokeDasharray="4 3" />
                </svg>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />

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
                  <div style={{ width: 38, height: 38, flexShrink: 0 }}>
                    {u.avatar_url ? (
                      <div style={{ width: 38, height: 38, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden' }}>
                        <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    ) : (
                      <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                        <polygon points="19,2 36,19 19,36 2,19" fill="var(--bg)" stroke="var(--fg-25)" strokeWidth="1.5" strokeDasharray="4 3" />
                      </svg>
                    )}
                  </div>
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

      {/* ── Avatar crop editor overlay ── */}
      {editSrc && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(12,11,11,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>

          <p style={{ margin: 0, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>
            Position your photo
          </p>

          {/* Diamond preview */}
          <div
            ref={previewRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ width: 120, height: 120, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', overflow: 'hidden', position: 'relative', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
          >
            {/* Blurred backdrop */}
            <img src={editSrc} draggable={false}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(12px) brightness(0.5)', pointerEvents: 'none' }} />
            {/* Main image */}
            <img src={editSrc} draggable={false}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: 'center center', pointerEvents: 'none' }} />
          </div>

          <p style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, color: 'var(--fg-30)', letterSpacing: '0.03em' }}>
            Drag to reposition · Pinch or scroll to zoom
          </p>

          {/* Scale slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 200 }}>
            <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, color: 'var(--fg-30)', letterSpacing: '0.08em' }}>−</span>
            <input type="range" min={0.5} max={3} step={0.01} value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#A855F7', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, color: 'var(--fg-30)', letterSpacing: '0.08em' }}>+</span>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={cancelEdit}
              style={{ padding: '11px 28px', borderRadius: 8, border: '1.5px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={saveCroppedAvatar} disabled={uploadBusy}
              style={{ padding: '11px 28px', borderRadius: 8, border: 'none', background: uploadBusy ? 'var(--fg-25)' : '#A855F7', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 600, cursor: uploadBusy ? 'not-allowed' : 'pointer', minWidth: 90 }}>
              {uploadBusy ? 'Saving…' : 'Save'}
            </button>
          </div>

        </div>
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
