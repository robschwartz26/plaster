import { useAuth } from '@/contexts/AuthContext'
import { ImportForm } from '@/components/admin/ImportForm'

export function StaffScreen() {
  const { canIngest, loading, signOut } = useAuth()

  if (loading) return null

  if (!canIngest) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily: '"Space Grotesk", sans-serif',
        color: 'var(--fg)',
        background: 'var(--bg)',
      }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
          plaster
        </div>
        <p style={{ margin: '8px 0', fontSize: 15, maxWidth: 320 }}>
          This page is for Plaster staff.
        </p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--fg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px',
        paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
        borderBottom: '1px solid var(--fg-08)',
        background: 'var(--bg)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 26, fontWeight: 900, color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            plaster
          </span>
          <span style={{
            fontFamily: '"Barlow Condensed", sans-serif', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#A855F7', background: 'rgba(168,85,247,0.12)',
            border: '1px solid rgba(168,85,247,0.3)',
            padding: '2px 8px', borderRadius: 4,
          }}>STAFF</span>
        </div>
        <button
          onClick={signOut}
          style={{ background: 'none', border: 'none', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, cursor: 'pointer', padding: '4px 0' }}
        >
          Sign out
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 48px', width: '100%' }}>
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, color: 'var(--fg-55)', margin: '0 0 28px 0' }}>
            Upload shows here — they go live once they're approved.
          </p>
          <ImportForm staffMode />
        </div>
      </div>
    </div>
  )
}
