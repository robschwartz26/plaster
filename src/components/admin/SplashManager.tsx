import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Splash rotation manager — the splash_images table is the source of truth.
// Every image (including the six bundled originals) has a Live/Hidden switch;
// only Live rows ever reach users' rotation (RLS enforces it — hidden rows
// are invisible to non-admin reads). New uploads land Hidden so releases are
// deliberate. Bundled originals can be hidden but never deleted; deleting an
// upload also removes its storage file.

interface SplashRow {
  id: string
  url: string
  is_bundled: boolean
  active: boolean
}

export function SplashManager() {
  const [rows, setRows] = useState<SplashRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('splash_images')
      .select('id, url, is_bundled, active')
      .order('is_bundled', { ascending: false })
      .order('created_at', { ascending: true })
    setRows(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(fileList: FileList | null) {
    if (!fileList?.length) return
    setBusy(true); setErr('')
    try {
      for (const f of Array.from(fileList)) {
        if (!f.type.startsWith('image/')) continue
        const safeName = f.name.replace(/[^a-z0-9.]+/gi, '-').slice(0, 50) || 'splash.png'
        const path = `splash/${Date.now()}-${safeName}`
        const { error: upErr } = await supabase.storage.from('posters')
          .upload(path, f, { contentType: f.type, upsert: false })
        if (upErr) throw upErr
        const url = supabase.storage.from('posters').getPublicUrl(path).data.publicUrl
        const { error: insErr } = await supabase.from('splash_images')
          .insert({ url, is_bundled: false, active: false })
        if (insErr) throw insErr
      }
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function toggle(row: SplashRow) {
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, active: !r.active } : r)) // optimistic
    const { error } = await supabase.from('splash_images')
      .update({ active: !row.active }).eq('id', row.id)
    if (error) { setErr(error.message); await load() }
  }

  async function remove(row: SplashRow) {
    if (row.is_bundled) return
    setBusy(true); setErr('')
    const storagePath = row.url.split('/object/public/posters/')[1]
    if (storagePath) await supabase.storage.from('posters').remove([decodeURIComponent(storagePath)])
    const { error } = await supabase.from('splash_images').delete().eq('id', row.id)
    if (error) setErr(error.message)
    await load()
    setBusy(false)
  }

  const liveCount = rows.filter(r => r.active).length

  return (
    <div style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--fg-55)', lineHeight: 1.5 }}>
        Only <strong>Live</strong> images appear in the app-open rotation — changes reach everyone on
        their next launch, no build needed. New uploads start <strong>Hidden</strong>; release them when
        you're ready. Originals can be hidden but not deleted.
      </p>

      <label style={{
        display: 'block', textAlign: 'center', padding: '18px 12px', borderRadius: 10,
        border: '2px dashed var(--fg-25)', cursor: busy ? 'wait' : 'pointer',
        color: 'var(--fg-55)', fontSize: 13, fontWeight: 600, marginBottom: 14,
      }}>
        {busy ? 'Working…' : '+ Add splash images (start hidden · tall, full-bleed)'}
        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { upload(e.target.files); e.target.value = '' }} disabled={busy} />
      </label>

      {err && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#e05555' }}>{err}</p>}

      <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--fg-40)' }}>
        {liveCount} live · {rows.length - liveCount} hidden
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {rows.map(r => (
          <div key={r.id} style={{
            position: 'relative', aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden',
            background: 'var(--fg-08)',
            outline: r.active ? '2px solid #A855F7' : '2px solid transparent', outlineOffset: -2,
          }}>
            <img src={r.url} alt="" loading="lazy" style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              opacity: r.active ? 1 : 0.35, filter: r.active ? 'none' : 'grayscale(60%)',
              transition: 'opacity 200ms ease, filter 200ms ease',
            }} />

            {r.is_bundled && (
              <span style={{
                position: 'absolute', top: 4, left: 4, padding: '2px 6px', borderRadius: 4,
                background: 'rgba(0,0,0,0.6)', color: 'rgba(240,236,227,0.85)',
                fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 700,
                letterSpacing: 0.5, textTransform: 'uppercase',
              }}>Original</span>
            )}

            {!r.is_bundled && (
              <button onClick={() => remove(r)} disabled={busy} title="Delete forever"
                style={{
                  position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                  borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)',
                  color: '#fff', fontSize: 12, lineHeight: 1, cursor: 'pointer',
                }}>✕</button>
            )}

            <button onClick={() => toggle(r)}
              style={{
                position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
                padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: r.active ? '#A855F7' : 'rgba(0,0,0,0.65)',
                color: '#fff', fontFamily: '"Barlow Condensed", sans-serif',
                fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              }}>
              {r.active ? 'Live' : 'Hidden'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
