import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Splash rotation manager — upload/remove the app-open art without a build.
// Files live in the public posters bucket under splash/; every phone re-syncs
// its splash pool in the background after launch, so additions appear in the
// rotation within a launch or two. The six bundled images always remain as
// the instant/offline floor and can't be removed from here.

interface SplashFile { name: string; url: string }

export function SplashManager() {
  const [files, setFiles] = useState<SplashFile[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.storage.from('posters').list('splash', { limit: 100 })
    setFiles((data ?? [])
      .filter(f => /\.(png|jpe?g|webp)$/i.test(f.name))
      .map(f => ({ name: f.name, url: supabase.storage.from('posters').getPublicUrl(`splash/${f.name}`).data.publicUrl })))
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(fileList: FileList | null) {
    if (!fileList?.length) return
    setBusy(true); setErr('')
    try {
      for (const f of Array.from(fileList)) {
        if (!f.type.startsWith('image/')) continue
        const ext = (f.name.split('.').pop() || 'png').toLowerCase()
        const path = `splash/${Date.now()}-${f.name.replace(/[^a-z0-9.]+/gi, '-').slice(0, 50) || `splash.${ext}`}`
        const { error } = await supabase.storage.from('posters').upload(path, f, { contentType: f.type, upsert: false })
        if (error) throw error
      }
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function remove(name: string) {
    setBusy(true); setErr('')
    const { error } = await supabase.storage.from('posters').remove([`splash/${name}`])
    if (error) setErr(error.message)
    await load()
    setBusy(false)
  }

  return (
    <div style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--fg-55)', lineHeight: 1.5 }}>
        Art added here joins the app-open rotation on everyone's next launch — no build, no review.
        The six original splashes are built in and always remain.
      </p>

      <label style={{
        display: 'block', textAlign: 'center', padding: '18px 12px', borderRadius: 10,
        border: '2px dashed var(--fg-25)', cursor: busy ? 'wait' : 'pointer',
        color: 'var(--fg-55)', fontSize: 13, fontWeight: 600, marginBottom: 14,
      }}>
        {busy ? 'Working…' : '+ Add splash images (tall, full-bleed)'}
        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { upload(e.target.files); e.target.value = '' }} disabled={busy} />
      </label>

      {err && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#e05555' }}>{err}</p>}

      {files.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-40)' }}>No added splashes yet — rotation is the built-in six.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {files.map(f => (
            <div key={f.name} style={{ position: 'relative', aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden', background: 'var(--fg-08)' }}>
              <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button
                onClick={() => remove(f.name)}
                disabled={busy}
                title="Remove from rotation"
                style={{
                  position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                  borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)',
                  color: '#fff', fontSize: 12, lineHeight: 1, cursor: 'pointer',
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
