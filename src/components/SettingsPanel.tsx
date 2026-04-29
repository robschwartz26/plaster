import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface Props {
  open: boolean
  onClose: () => void
}

const APP_VERSION = '0.1.0'

export function SettingsPanel({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { user, signOut } = useAuth()
  const [showSocial, setShowSocial] = useState<boolean>(true)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user) return
    supabase.from('profiles')
      .select('show_social_publicly')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setShowSocial(data.show_social_publicly ?? true)
      })
  }, [open, user])

  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false)
      setConfirmText('')
      setDeleteError(null)
    }
  }, [open])

  async function performDelete() {
    if (confirmText !== 'DELETE' || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const { error } = await supabase.functions.invoke('delete-my-account')
      if (error) throw error
      await signOut()
      navigate('/auth')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setDeleteError(msg)
      setDeleting(false)
    }
  }

  function cancelDelete() {
    setConfirmingDelete(false)
    setConfirmText('')
    setDeleteError(null)
  }

  async function togglePrivacy() {
    if (!user || savingPrivacy) return
    const next = !showSocial
    setSavingPrivacy(true)
    setShowSocial(next)
    const { error } = await supabase.from('profiles')
      .update({ show_social_publicly: next })
      .eq('id', user.id)
    if (error) {
      setShowSocial(!next)
      console.error('[SettingsPanel] privacy update failed:', error)
    }
    setSavingPrivacy(false)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Settings">
      <SettingRow
        label="Night theme"
        description={theme === 'night' ? 'On — using dark colors' : 'Off — using light colors'}
        checked={theme === 'night'}
        onToggle={toggle}
      />

      <SettingRow
        label="Show social activity publicly"
        description={showSocial ? 'Anyone can see your followers and following' : 'Only you and mutual follows can see'}
        checked={showSocial}
        onToggle={togglePrivacy}
        disabled={savingPrivacy}
      />

      <div style={{ height: 24 }} />

      <p style={{ margin: '0 0 8px', fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
        About
      </p>
      <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
        Plaster v{APP_VERSION}
      </p>
      <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-40)' }}>
        Portland's event poster wall.
      </p>

      <div style={{ height: 32 }} />

      <p style={{ margin: '0 0 8px', fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-40)' }}>
        Danger zone
      </p>

      {!confirmingDelete ? (
        <button
          onClick={() => setConfirmingDelete(true)}
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 8,
            border: '1px solid rgba(220,38,38,0.4)',
            background: 'transparent',
            color: 'rgb(220,38,38)',
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Delete account
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.5 }}>
            This permanently deletes your account, RSVPs, and activity. Your wall posts will be anonymized. This cannot be undone.
          </p>
          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)' }}>
            Type <strong style={{ color: 'var(--fg)' }}>DELETE</strong> to confirm:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoCapitalize="characters"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--fg-25)',
              background: 'var(--fg-08)',
              color: 'var(--fg)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {deleteError && (
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgb(220,38,38)' }}>
              {deleteError}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={cancelDelete}
              disabled={deleting}
              style={{
                flex: 1,
                padding: '11px 0',
                borderRadius: 8,
                border: '1px solid var(--fg-25)',
                background: 'transparent',
                color: 'var(--fg-55)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={performDelete}
              disabled={confirmText !== 'DELETE' || deleting}
              style={{
                flex: 1,
                padding: '11px 0',
                borderRadius: 8,
                border: 'none',
                background: confirmText === 'DELETE' && !deleting ? 'rgb(220,38,38)' : 'var(--fg-15)',
                color: confirmText === 'DELETE' && !deleting ? '#fff' : 'var(--fg-40)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600,
                fontSize: 14,
                cursor: confirmText === 'DELETE' && !deleting ? 'pointer' : 'default',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {deleting ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

interface SettingRowProps {
  label: string
  description?: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}

function SettingRow({ label, description, checked, onToggle, disabled }: SettingRowProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '12px 0',
      borderBottom: '1px solid var(--fg-08)',
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>
          {label}
        </p>
        {description && (
          <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)' }}>
            {description}
          </p>
        )}
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={checked}
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          border: 'none',
          background: checked ? '#A855F7' : 'var(--fg-15)',
          position: 'relative',
          cursor: disabled ? 'default' : 'pointer',
          padding: 0,
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}
