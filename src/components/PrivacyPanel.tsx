/**
 * PrivacyPanel
 *
 * Bottom sheet showing the current user's blocked and muted lists.
 * Each row has username + avatar + unblock/unmute action.
 *
 * Privacy design: only the blocker/muter sees their own list.
 * Blocked or muted users never see they're on someone else's list.
 *
 * Reached via Settings → Privacy.
 */

import { useEffect, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { Diamond } from './Diamond'
import { useUserBlocks } from '@/hooks/useUserBlocks'
import { useUserMutes } from '@/hooks/useUserMutes'
import { supabase } from '@/lib/supabase'

interface Props {
  open: boolean
  onClose: () => void
}

interface UserRow {
  id: string
  username: string | null
  avatar_diamond_url: string | null
  avatar_url: string | null
}

export function PrivacyPanel({ open, onClose }: Props) {
  const { blockedIds, unblock, refresh: refreshBlocks } = useUserBlocks()
  const { mutedIds, unmute, refresh: refreshMutes } = useUserMutes()

  const [blockedUsers, setBlockedUsers] = useState<UserRow[]>([])
  const [mutedUsers, setMutedUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmAction, setConfirmAction] =
    useState<{ kind: 'unblock' | 'unmute'; user: UserRow } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    refreshBlocks()
    refreshMutes()
  }, [open, refreshBlocks, refreshMutes])

  useEffect(() => {
    if (!open) return
    const allIds = [...blockedIds, ...mutedIds]
    if (allIds.length === 0) {
      setBlockedUsers([])
      setMutedUsers([])
      return
    }

    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data, error } = await supabase.rpc('list_my_blocks_and_mutes')
      if (cancelled) return
      if (error || !data) {
        console.error('[PrivacyPanel] list rpc failed', error)
        setBlockedUsers([])
        setMutedUsers([])
        setLoading(false)
        return
      }

      const rows = data as Array<UserRow & { kind: 'block' | 'mute' }>
      setBlockedUsers(rows.filter(r => r.kind === 'block'))
      setMutedUsers(rows.filter(r => r.kind === 'mute'))
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [open, blockedIds, mutedIds])

  async function handleConfirm() {
    if (!confirmAction) return
    setSubmitting(true)
    if (confirmAction.kind === 'unblock') {
      await unblock(confirmAction.user.id)
      setBlockedUsers(prev => prev.filter(u => u.id !== confirmAction.user.id))
    } else {
      await unmute(confirmAction.user.id)
      setMutedUsers(prev => prev.filter(u => u.id !== confirmAction.user.id))
    }
    setSubmitting(false)
    setConfirmAction(null)
  }

  const isLoading = loading && blockedUsers.length === 0 && mutedUsers.length === 0

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Privacy">
        <p style={sectionLabelStyle}>Blocked users</p>
        <p style={hintStyle}>
          These users can't see your profile, posts, or messages.
          You can't see theirs either. They're not notified.
        </p>

        {isLoading ? (
          <p style={emptyStyle}>Loading…</p>
        ) : blockedUsers.length === 0 ? (
          <p style={emptyStyle}>You haven't blocked anyone.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {blockedUsers.map(u => (
              <UserManageRow
                key={u.id}
                user={u}
                actionLabel="Unblock"
                onAction={() => setConfirmAction({ kind: 'unblock', user: u })}
              />
            ))}
          </div>
        )}

        <div style={{ height: 24 }} />

        <p style={sectionLabelStyle}>Muted users</p>
        <p style={hintStyle}>
          You don't see their posts in your feed. They can still see and message you.
          They're not notified.
        </p>

        {isLoading ? null : mutedUsers.length === 0 ? (
          <p style={emptyStyle}>You haven't muted anyone.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mutedUsers.map(u => (
              <UserManageRow
                key={u.id}
                user={u}
                actionLabel="Unmute"
                onAction={() => setConfirmAction({ kind: 'unmute', user: u })}
              />
            ))}
          </div>
        )}
      </BottomSheet>

      {/* Confirm modal — zIndex 300 so it sits above the BottomSheet (200) */}
      {confirmAction && (
        <div
          onClick={() => !submitting && setConfirmAction(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'var(--bg)',
              borderTop: '1px solid var(--fg-15)',
              borderRadius: '16px 16px 0 0',
              padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
              {confirmAction.kind === 'unblock' ? 'Unblock' : 'Unmute'}{' '}
              {confirmAction.user.username ? `@${confirmAction.user.username}` : 'this user'}?
            </p>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.5 }}>
              {confirmAction.kind === 'unblock'
                ? "You'll be able to see each other's content again. Previous follows are not restored."
                : "You'll see their posts in your feed again."}
            </p>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                padding: 13, borderRadius: 10, border: 'none',
                background: 'var(--fg)', color: 'var(--bg)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700, fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Working…' : confirmAction.kind === 'unblock' ? 'Unblock' : 'Unmute'}
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              disabled={submitting}
              style={{
                padding: 13, borderRadius: 10,
                border: '1px solid var(--fg-15)',
                background: 'none', color: 'var(--fg)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Row component ────────────────────────────────────────────────
function UserManageRow({
  user, actionLabel, onAction,
}: {
  user: UserRow
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 0',
    }}>
      <Diamond
        diamondUrl={user.avatar_diamond_url}
        fallbackUrl={user.avatar_url}
        size={36}
      />
      <span style={{
        flex: 1,
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 14, fontWeight: 600, color: 'var(--fg)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        @{user.username ?? '—'}
      </span>
      <button
        onClick={onAction}
        style={{
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid var(--fg-25)',
          background: 'transparent',
          color: 'var(--fg-65)',
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

const sectionLabelStyle: React.CSSProperties = {
  margin: '0 0 4px',
  fontFamily: '"Barlow Condensed", sans-serif',
  fontWeight: 700, fontSize: 11,
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--fg-40)',
}

const hintStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 12, color: 'var(--fg-55)',
  lineHeight: 1.5,
}

const emptyStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 13, color: 'var(--fg-40)',
  fontStyle: 'italic',
}
