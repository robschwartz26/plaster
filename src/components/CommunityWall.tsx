import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/contexts/AuthContext'
import { optimizeImage, blobToBase64 } from '@/lib/cropUtils'
import { SEXTANT_LABELS, type Sextant } from '@/lib/neighborhoods'
import { Diamond } from '@/components/Diamond'
import { fetchRegionPosts, submitCommunityPost, type CommunityPost } from '@/lib/communityPosts'

// The neighborhood community wall — a region-scoped (sextant) board of free
// personal posts. Opened from the neighborhood chip on the Wall page. Posts are
// visually distinct from event posters (rounded cards, caption, COMMUNITY tag).
export function CommunityWall({ sextant, neighborhood, onClose }: {
  sextant: string; neighborhood: string; onClose: () => void
}) {
  const { user } = useAuth()
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [composeOpen, setComposeOpen] = useState(false)

  const region = SEXTANT_LABELS[sextant as Sextant] ?? sextant

  async function load() {
    setLoading(true)
    setPosts(await fetchRegionPosts(sextant))
    setLoading(false)
  }
  useEffect(() => { load() }, [sextant])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--fg-08)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-55)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 900, color: 'var(--fg)', lineHeight: 1.1 }}>{neighborhood}</p>
          <p style={{ margin: '1px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>{region} Portland · neighborhood wall</p>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>

          {/* Compose box — poster-sized, with blurb */}
          <button
            onClick={() => setComposeOpen(true)}
            style={{ aspectRatio: '2 / 3', borderRadius: 12, border: '2px dashed var(--fg-25)', background: 'rgba(168,85,247,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', padding: 16, textAlign: 'center' }}
          >
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(168,85,247,0.15)', color: '#A855F7', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</span>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Post to {neighborhood}</span>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', lineHeight: 1.4 }}>Yard sale, lost cat, free couch, a heads-up — share it with {region} Portland. Free.</span>
          </button>

          {/* Posts */}
          {posts.map(p => <CommunityCard key={p.id} post={p} isOwn={p.author_id === user?.id} />)}
        </div>

        {!loading && posts.length === 0 && (
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', textAlign: 'center', marginTop: 24 }}>
            Nothing on the wall yet — be the first to post.
          </p>
        )}
      </div>

      {composeOpen && (
        <ComposeSheet
          neighborhood={neighborhood}
          onClose={() => setComposeOpen(false)}
          onPosted={() => { setComposeOpen(false); load() }}
        />
      )}
    </div>
  )
}

// ── Post card ──
function CommunityCard({ post, isOwn }: { post: CommunityPost; isOwn: boolean }) {
  const pending = post.status === 'pending'
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--fg-12, var(--fg-15))', background: 'var(--bg)', display: 'flex', flexDirection: 'column', opacity: pending ? 0.85 : 1 }}>
      <div style={{ position: 'relative', aspectRatio: '2 / 3', background: 'var(--fg-08)' }}>
        {post.image_url && <img src={post.image_url} alt={post.title ?? ''} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {/* COMMUNITY tag — keeps these distinct from event posters */}
        <span style={{ position: 'absolute', top: 6, left: 6, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: 'rgba(168,85,247,0.85)', padding: '1px 6px', borderRadius: 3 }}>
          {post.post_type === 'business' ? 'Business' : post.post_type === 'lost_pet' ? 'Lost pet' : 'Community'}
        </span>
        {isOwn && pending && (
          <span style={{ position: 'absolute', top: 6, right: 6, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0c0b0b', background: 'rgba(217,119,6,0.95)', padding: '1px 6px', borderRadius: 3 }}>
            In review
          </span>
        )}
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {post.title && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.2 }}>{post.title}</p>}
        {post.body && <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.body}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Diamond diamondUrl={post.author?.avatar_diamond_url ?? null} size={16} />
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>@{post.author?.username ?? 'someone'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Compose sheet ──
function ComposeSheet({ neighborhood, onClose, onPosted }: { neighborhood: string; onClose: () => void; onPosted: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [postType, setPostType] = useState<'personal' | 'lost_pet' | 'business'>('personal')
  const [done, setDone] = useState<{ published: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function pick(f: File) {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError('')
  }

  async function submit() {
    if (!file) return
    setBusy(true); setError('')
    try {
      const optimized = await optimizeImage(file)
      const base64 = await blobToBase64(optimized)
      const result = await submitCommunityPost({ base64, mimeType: 'image/jpeg', title: title.trim() || undefined, body: body.trim() || undefined, post_type: postType })
      setDone({ published: result.status === 'published' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: '16px 16px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', maxHeight: '88vh', overflowY: 'auto' }}>
        {done ? (
          postType === 'business' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 34 }}>💳</span>
              <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontSize: 18, color: 'var(--fg)' }}>Almost there — complete payment</p>
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', lineHeight: 1.5 }}>
                Your business post is saved. Pay to send it for review — we'll publish it once it's approved.
              </p>
              {STRIPE_BUSINESS_POST_URL && !Capacitor.isNativePlatform() ? (
                <a href={STRIPE_BUSINESS_POST_URL} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}>Complete payment</a>
              ) : (
                <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(217,119,6,0.9)' }}>Payment isn't set up yet — an admin will reach out to finish it.</p>
              )}
              <button onClick={onPosted} style={ghostBtn}>Done</button>
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 36 }}>{done.published ? '✓' : '⏳'}</span>
            <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontSize: 18, color: 'var(--fg)' }}>
              {done.published ? `Posted to ${neighborhood}!` : 'Submitted for review'}
            </p>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-40)', lineHeight: 1.5 }}>
              {done.published
                ? "It's live on your neighborhood wall."
                : postType === 'lost_pet'
                  ? `As soon as it's approved, everyone in ${neighborhood} gets a lost-pet alert. We review these fast.`
                  : "We give some posts a quick look before they go public — yours will appear shortly. You can see it on your wall marked “In review.”"}
            </p>
            <button onClick={onPosted} style={primaryBtn}>Done</button>
          </div>
          )
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>Post to {neighborhood}</span>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {/* App Store 3.1.1: paid business posts settle via an external Stripe
                  link, which Apple forbids inside the iOS app — hide the type on
                  native. Web keeps it. */}
              {([['personal', 'Personal'], ['lost_pet', 'Lost pet'], ['business', 'Business']] as const)
                .filter(([val]) => val !== 'business' || !Capacitor.isNativePlatform())
                .map(([val, label]) => {
                const on = postType === val
                return (
                  <button key={val} onClick={() => setPostType(val)} style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${on ? 'var(--fg-55)' : 'var(--fg-15)'}`, background: on ? 'var(--fg-08)' : 'transparent', color: on ? 'var(--fg)' : 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                )
              })}
            </div>
            {postType === 'lost_pet' && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Animals only. Once an admin approves it, everyone in {neighborhood} gets an alert — so we review these fast.
              </p>
            )}
            {postType === 'business' && (
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Business posts are paid. After you submit, you'll complete a quick payment — we send it for review once it's paid.
              </p>
            )}

            {preview ? (
              <div style={{ position: 'relative', width: 140, margin: '0 auto 14px' }}>
                <img src={preview} alt="" style={{ width: 140, aspectRatio: '2 / 3', objectFit: 'cover', borderRadius: 10, display: 'block', border: '1px solid var(--fg-15)' }} />
                <button onClick={() => fileRef.current?.click()} style={{ ...ghostBtn, marginTop: 8, width: '100%' }}>Change image</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} style={{ width: '100%', aspectRatio: '3 / 2', borderRadius: 12, border: '2px dashed var(--fg-25)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}>
                <span style={{ fontSize: 30, color: 'var(--fg-40)' }}>＋</span>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>Add a photo</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }} />

            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g. Lost cat near Kenton Park)" maxLength={120} style={inputStyle} />
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="A few details…" maxLength={1000} rows={3} style={{ ...inputStyle, resize: 'vertical', marginTop: 8 }} />

            {error && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.9)', margin: '8px 0 0' }}>{error}</p>}

            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)', margin: '12px 0 0', lineHeight: 1.5 }}>
              Posts are free — a small tip helps keep Plaster running for the neighborhood, but it's never required.
            </p>

            <button onClick={submit} disabled={!file || busy} style={{ ...primaryBtn, width: '100%', marginTop: 12, opacity: (!file || busy) ? 0.5 : 1 }}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// TODO(business-billing): v1 stub — one Stripe Payment Link opened in the
// browser; an admin manually flips is_paid after payment. Later: per-post
// Checkout Session + webhook that sets is_paid automatically. Configure via
// VITE_STRIPE_BUSINESS_POST_URL.
const STRIPE_BUSINESS_POST_URL = import.meta.env.VITE_STRIPE_BUSINESS_POST_URL as string | undefined

const primaryBtn: React.CSSProperties = { padding: '11px 22px', background: '#A855F7', color: '#fff', border: 'none', borderRadius: 8, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '7px 0', background: 'transparent', border: '1px solid var(--fg-18)', borderRadius: 6, color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, cursor: 'pointer' }
const inputStyle: React.CSSProperties = { width: '100%', background: 'rgba(240,236,227,0.05)', border: '1px solid var(--fg-18)', borderRadius: 8, padding: '10px 12px', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
