import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AvatarUploader, type AvatarUploaderRef } from '@/components/AvatarUploader'
import { BannerUploader } from '@/components/BannerUploader'
import { blobToBase64 } from '@/lib/cropUtils'
import { Diamond } from '@/components/Diamond'

interface VenueRow {
  venue_id: string
  venue_name: string
  neighborhood: string | null
  address: string | null
  has_account: boolean
  account_profile_id: string | null
  account_username: string | null
  account_banner_url: string | null
  account_avatar_diamond_url: string | null
}

interface CreatedCredentials {
  venue_id: string
  venue_name: string
  username: string
  email: string
  password: string
}

export function AdminVenueAccounts() {
  const navigate = useNavigate()
  const [rows,    setRows]    = useState<VenueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [busyId,  setBusyId]  = useState<string | null>(null)
  const [revealed,   setRevealed]   = useState<CreatedCredentials | null>(null)
  const [bulkBusy,   setBulkBusy]   = useState(false)
  const [bulkProgress, setBulkProgress] = useState<string | null>(null)
  const [bulkResults,  setBulkResults]  = useState<CreatedCredentials[]>([])
  const [imageryRow, setImageryRow] = useState<VenueRow | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_venues_with_account_status')
    if (error) {
      console.error('[AdminVenueAccounts] fetch failed', error)
      setRows([])
    } else {
      setRows((data ?? []) as VenueRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  async function createAccount(venue_id: string, venue_name: string) {
    setBusyId(venue_id)
    try {
      const { data, error } = await supabase.functions.invoke('create-venue-account', {
        body: { venue_id },
      })
      if (error) throw error
      if (data.already_exists) {
        alert(`@${data.username} already exists for this venue.`)
        fetchRows()
        return
      }
      setRevealed({ venue_id, venue_name, username: data.username, email: data.email, password: data.password })
      fetchRows()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[AdminVenueAccounts] createAccount failed:', msg)
      alert(`Failed: ${msg}`)
    } finally {
      setBusyId(null)
    }
  }

  async function createAllMissing() {
    const missing = rows.filter(r => !r.has_account)
    if (missing.length === 0) { alert('All venues already have accounts.'); return }
    if (!confirm(`Create accounts for ${missing.length} venues? This cannot be undone.`)) return

    setBulkBusy(true)
    setBulkResults([])
    const collected: CreatedCredentials[] = []

    for (let i = 0; i < missing.length; i++) {
      const r = missing[i]
      setBulkProgress(`Creating ${i + 1} of ${missing.length}: ${r.venue_name}…`)
      try {
        const { data, error } = await supabase.functions.invoke('create-venue-account', {
          body: { venue_id: r.venue_id },
        })
        if (error) throw error
        if (!data.already_exists) {
          collected.push({ venue_id: r.venue_id, venue_name: r.venue_name, username: data.username, email: data.email, password: data.password })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[AdminVenueAccounts] bulk create failed for', r.venue_name, ':', msg)
        collected.push({ venue_id: r.venue_id, venue_name: r.venue_name, username: '(failed)', email: '', password: msg })
      }
    }

    setBulkProgress(null)
    setBulkResults(collected)
    setBulkBusy(false)
    fetchRows()
  }

  function copyAll() {
    const text = bulkResults.map(c =>
      `${c.venue_name}\n  username: @${c.username}\n  email: ${c.email}\n  password: ${c.password}`
    ).join('\n\n')
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'))
  }

  const filtered = search.trim()
    ? rows.filter(r => r.venue_name.toLowerCase().includes(search.toLowerCase()))
    : rows

  const withAccount    = rows.filter(r => r.has_account).length
  const withoutAccount = rows.filter(r => !r.has_account).length

  if (loading) {
    return <p style={mutedStyle}>Loading venues…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Summary */}
      <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
        {withAccount} of {rows.length} venues have accounts
        {withoutAccount > 0 && (
          <span style={{ color: 'var(--fg-40)' }}> · {withoutAccount} missing</span>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search venues…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={inputStyle}
      />

      {/* Bulk create */}
      {withoutAccount > 0 && (
        <button
          onClick={createAllMissing}
          disabled={bulkBusy}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid var(--fg-25)',
            background: 'transparent',
            color: 'var(--fg-65)',
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 600,
            fontSize: 13,
            cursor: bulkBusy ? 'wait' : 'pointer',
            opacity: bulkBusy ? 0.6 : 1,
            textAlign: 'left',
          }}
        >
          {bulkBusy ? bulkProgress ?? 'Working…' : `Create accounts for all ${withoutAccount} missing venues`}
        </button>
      )}

      {/* Bulk results */}
      {bulkResults.length > 0 && (
        <div style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--fg-15)', background: 'var(--fg-08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--fg)' }}>
              Bulk results — save these credentials now
            </span>
            <button onClick={copyAll} style={smallBtnStyle}>Copy all</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {bulkResults.map(c => (
              <div key={c.venue_id} style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-65)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--fg)' }}>{c.venue_name}</strong><br />
                @{c.username} · {c.email}<br />
                <span style={{ fontFamily: 'monospace', color: 'var(--fg-55)' }}>{c.password}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Venue rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <p style={mutedStyle}>No venues match "{search}".</p>
        )}
        {filtered.map(r => (
          <div key={r.venue_id} style={cardStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>
                {r.venue_name}
              </div>
              {(r.neighborhood || r.address) && (
                <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', marginTop: 2 }}>
                  {[r.neighborhood, r.address].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {r.has_account ? (
                <>
                  <span style={pillStyle('#15803d', '#dcfce7')}>✓ @{r.account_username}</span>
                  {(r.account_banner_url === null || (r.account_avatar_diamond_url ?? '').includes('venue-initial')) && (
                    <span style={pillStyle('#92400e', '#fef3c7')}>needs imagery</span>
                  )}
                  <button
                    onClick={() => navigate(`/u/${r.account_username}`)}
                    style={smallBtnStyle}
                  >
                    View
                  </button>
                  <button
                    onClick={() => setImageryRow(r)}
                    style={smallBtnStyle}
                  >
                    Imagery
                  </button>
                </>
              ) : (
                <>
                  <span style={pillStyle('#6b7280', '#1f2937')}>No account</span>
                  <button
                    onClick={() => createAccount(r.venue_id, r.venue_name)}
                    disabled={busyId === r.venue_id}
                    style={{
                      ...smallBtnStyle,
                      background: busyId === r.venue_id ? 'var(--fg-15)' : 'var(--fg)',
                      color: busyId === r.venue_id ? 'var(--fg-40)' : 'var(--bg)',
                      border: 'none',
                      cursor: busyId === r.venue_id ? 'wait' : 'pointer',
                    }}
                  >
                    {busyId === r.venue_id ? '…' : 'Create'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Imagery modal */}
      {imageryRow && (
        <ImageryModal
          row={imageryRow}
          onClose={() => setImageryRow(null)}
          onSuccess={() => { setImageryRow(null); fetchRows() }}
        />
      )}

      {/* Single-creation credential reveal */}
      {revealed && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9000, padding: 24,
        }}>
          <div style={{
            background: 'var(--bg)', borderRadius: 14, padding: '24px 20px',
            width: '100%', maxWidth: 380, border: '1px solid var(--fg-15)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <h3 style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--fg)' }}>
              Account created — save these credentials
            </h3>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: '#f59e0b' }}>
              The password is shown only once. Store it now.
            </p>

            {[
              { label: 'Venue',    value: revealed.venue_name },
              { label: 'Username', value: `@${revealed.username}` },
              { label: 'Email',    value: revealed.email },
              { label: 'Password', value: revealed.password, mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-40)', marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{
                  fontFamily: mono ? 'monospace' : '"Space Grotesk", sans-serif',
                  fontSize: 13, color: 'var(--fg)', background: 'var(--fg-08)',
                  padding: '8px 10px', borderRadius: 6, wordBreak: 'break-all',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <span>{value}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(value)}
                    style={{ background: 'none', border: 'none', color: 'var(--fg-40)', cursor: 'pointer', fontSize: 11, fontFamily: '"Space Grotesk", sans-serif', flexShrink: 0 }}
                  >
                    copy
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => setRevealed(null)}
              style={{ ...smallBtnStyle, width: '100%', padding: '11px 0', borderRadius: 10, fontSize: 14 }}
            >
              Done — I've saved the credentials
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Imagery modal ─────────────────────────────────────────────────────────────

function ImageryModal({ row, onClose, onSuccess }: { row: VenueRow; onClose: () => void; onSuccess: () => void }) {
  const uploaderRef = useRef<AvatarUploaderRef>(null)
  const [diamondBlob,    setDiamondBlob]    = useState<Blob | null>(null)
  const [diamondPreview, setDiamondPreview] = useState<string | null>(row.account_avatar_diamond_url)
  const [bannerBlob,     setBannerBlob]     = useState<Blob | null>(null)
  const [bannerFocalY,   setBannerFocalY]   = useState(0.5)
  const [uploading,      setUploading]      = useState(false)

  function handleDiamondBlob(blob: Blob) {
    setDiamondBlob(blob)
    if (diamondPreview && !diamondPreview.startsWith('http')) URL.revokeObjectURL(diamondPreview)
    setDiamondPreview(URL.createObjectURL(blob))
  }

  function handleBannerConfirm(blob: Blob, focalY: number) {
    setBannerBlob(blob)
    setBannerFocalY(focalY)
  }

  async function upload() {
    if (!diamondBlob && !bannerBlob) return
    if (!row.account_profile_id) return
    setUploading(true)
    try {
      const body: Record<string, unknown> = { account_id: row.account_profile_id }
      if (diamondBlob) body.diamondBase64 = await blobToBase64(diamondBlob)
      if (bannerBlob)  { body.bannerBase64 = await blobToBase64(bannerBlob); body.bannerFocalY = bannerFocalY }
      const { error } = await supabase.functions.invoke('set-venue-imagery', { body })
      if (error) throw error
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ImageryModal] upload failed:', msg)
      alert(`Upload failed: ${msg}`)
      setUploading(false)
    }
  }

  const canUpload = (diamondBlob !== null || bannerBlob !== null) && !uploading

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: 20 }}>
      <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '22px 20px', width: '100%', maxWidth: 420, border: '1px solid var(--fg-15)', display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--fg)' }}>
            {row.venue_name} — imagery
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-40)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Diamond section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={sectionLabelStyle}>Diamond avatar</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Diamond diamondUrl={diamondPreview} size={72} />
            <button
              onClick={() => uploaderRef.current?.open()}
              style={smallBtnStyle}
            >
              {diamondBlob ? 'Change photo' : 'Pick photo'}
            </button>
            {diamondBlob && <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>ready</span>}
          </div>
          <AvatarUploader
            ref={uploaderRef}
            userId={row.account_profile_id ?? ''}
            onDone={() => {}}
            onCancel={() => {}}
            onCroppedBlob={handleDiamondBlob}
          />
        </div>

        {/* Banner section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={sectionLabelStyle}>Banner image</p>
          <BannerUploader
            onConfirm={handleBannerConfirm}
            currentBannerUrl={row.account_banner_url}
          />
          {bannerBlob && <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>Banner ready</span>}
        </div>

        {/* Upload button */}
        <button
          onClick={upload}
          disabled={!canUpload}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
            background: canUpload ? 'var(--fg)' : 'var(--fg-15)',
            color: canUpload ? 'var(--bg)' : 'var(--fg-40)',
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700,
            cursor: canUpload ? 'pointer' : 'not-allowed',
          }}
        >
          {uploading ? 'Uploading…' : 'Save to venue'}
        </button>
      </div>
    </div>
  )
}

const sectionLabelStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--fg-40)',
}

// ── Styles ─────────────────────────────────────────────────────────────────

const mutedStyle: React.CSSProperties = {
  color: 'var(--fg-55)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 13,
  fontStyle: 'italic',
  margin: 0,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--fg-15)',
  background: 'var(--fg-08)',
  color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--fg-15)',
  background: 'transparent',
}

const smallBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid var(--fg-25)',
  background: 'transparent',
  color: 'var(--fg-65)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

function pillStyle(color: string, bg: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: '"Space Grotesk", sans-serif',
    background: bg,
    color,
    whiteSpace: 'nowrap',
  }
}
