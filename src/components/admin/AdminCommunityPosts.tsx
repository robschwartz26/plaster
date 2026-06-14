import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { type CommunityPost } from '@/lib/communityPosts'

// Admin review for community posts that AI moderation flagged (or that failed
// moderation). Approve → published; Reject → rejected. Flagged posts get a
// reason line so the admin knows why it was held.
export function AdminCommunityPosts() {
  const { user } = useAuth()
  const [rows, setRows] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('community_posts')
      .select('*, author:profiles!author_id(username, avatar_diamond_url)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    const list = (data ?? []) as unknown as CommunityPost[]
    // Lost-pet posts to the top — time matters for a lost animal.
    list.sort((a, b) => (a.post_type === 'lost_pet' ? 0 : 1) - (b.post_type === 'lost_pet' ? 0 : 1))
    setRows(list)
    setLoading(false)
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  async function decide(id: string, status: 'published' | 'rejected') {
    if (!user) return
    setBusyId(id)
    const { error } = await supabase.from('community_posts')
      .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setBusyId(null)
    if (error) { console.error('[AdminCommunityPosts] decide failed', error); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return null
  if (rows.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        Community posts to review
        <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700, color: '#A855F7', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', padding: '1px 7px', borderRadius: 10 }}>{rows.length}</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(p => {
          const busy = busyId === p.id
          return (
            <div key={p.id} style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 10, border: `1px solid ${p.post_type === 'lost_pet' ? 'rgba(217,119,6,0.55)' : p.flagged ? 'rgba(239,68,68,0.35)' : 'var(--fg-15)'}`, background: p.post_type === 'lost_pet' ? 'rgba(217,119,6,0.06)' : p.flagged ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
              <div style={{ width: 56, height: 84, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--fg-08)' }}>
                {p.image_url && <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{p.title || '(no title)'}</span>
                  {p.post_type === 'lost_pet' && <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(217,119,6,0.95)', background: 'rgba(217,119,6,0.14)', border: '1px solid rgba(217,119,6,0.4)', padding: '1px 5px', borderRadius: 3 }}>🐾 Lost pet — alerts {p.neighborhood}</span>}
                  {p.flagged && <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', padding: '1px 5px', borderRadius: 3 }}>AI flagged</span>}
                </div>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>@{p.author?.username ?? 'someone'} · {p.neighborhood} · {p.post_type}</span>
                {p.body && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.body}</p>}
                {p.flagged && p.flag_reason && <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'rgba(239,68,68,0.9)' }}>⚑ {p.flag_reason}</p>}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={() => decide(p.id, 'published')} disabled={busy} style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: 'var(--fg)', color: 'var(--bg)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 12, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>Approve</button>
                  <button onClick={() => decide(p.id, 'rejected')} disabled={busy} style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: '1px solid var(--fg-25)', background: 'transparent', color: 'var(--fg-65)', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 12, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>Reject</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
