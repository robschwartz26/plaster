import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { optimizeImage } from '@/lib/cropUtils'

// Rename a group chat + set a custom group image (Instagram/iMessage pattern).
// Only used for GROUP threads; 1-on-1s always show the other person. Members may
// update conversations.name/avatar_url (existing update_conversations_if_member RLS).
export function GroupEditSheet({ conversationId, currentName, currentAvatarUrl, onClose, onSaved }: {
  conversationId: string
  currentName: string | null
  currentAvatarUrl: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(currentName ?? '')
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    setBusy(true); setError('')
    try {
      let avatar_url = currentAvatarUrl
      if (pendingFile) {
        const optimized = await optimizeImage(pendingFile)
        const path = `group/${conversationId}-${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, optimized, { contentType: 'image/jpeg', upsert: true })
        if (upErr) throw upErr
        avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      }
      const { error: updErr } = await supabase.from('conversations').update({ name: name.trim() || null, avatar_url }).eq('id', conversationId)
      if (updErr) throw updErr
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, boxSizing: 'border-box', background: 'var(--bg)', borderRadius: '16px 16px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-55)' }}>Edit group</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <button onClick={() => fileRef.current?.click()} style={{ flexShrink: 0, width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', border: '1px dashed var(--fg-25)', background: 'var(--fg-08)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {preview
              ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 24, color: 'var(--fg-40)' }}>＋</span>}
          </button>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>Tap to set a group photo</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingFile(f); setPreview(URL.createObjectURL(f)) } }} />

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Group name (optional)"
          maxLength={60}
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(240,236,227,0.05)', border: '1px solid var(--fg-18)', borderRadius: 8, padding: '11px 14px', color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, outline: 'none' }}
        />
        <p style={{ margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-30)' }}>Leave the name blank to show members' names.</p>

        {error && <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgba(239,68,68,0.9)', margin: '10px 0 0' }}>{error}</p>}

        <button
          onClick={save}
          disabled={busy}
          style={{ width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 10, border: 'none', background: '#A855F7', color: '#fff', fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
