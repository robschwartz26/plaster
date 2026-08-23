/**
 * UserActionsMenu
 *
 * 3-dot icon button that opens a bottom sheet with Block / Mute / Report
 * actions for a target user. All confirms and the report-reason picker
 * are contained inside this component.
 *
 * Used in YouScreen header (non-self profile) and ProfileSubPanel.
 *
 * Block + Mute are mutually-aware: blocking auto-removes any existing mute
 * (block is the stronger constraint), and unblocking does NOT auto-restore
 * a mute. Mute does not affect block state.
 *
 * Reports are submitted to content_reports table; an Edge Function emails
 * plasterpdx@gmail.com on insert (handled in Phase 3).
 */

import { useState, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { headerIconBtn } from '@/components/PlasterHeader'
import { useUserBlocks } from '@/hooks/useUserBlocks'
import { useUserMutes } from '@/hooks/useUserMutes'
import {
  submitReport,
  REPORT_REASON_LABELS,
  type ReportReason,
} from '@/lib/reports'

interface Props {
  targetUserId: string
  targetUsername?: string | null
  /**
   * Optional callback called after a successful block/mute/unblock/unmute.
   * The parent may want to navigate away (e.g. close the profile after block).
   */
  onActionComplete?: () => void
  /**
   * Where to render the trigger button. Default 'header' uses the
   * existing headerIconBtn style. 'inline' renders a simple icon
   * suitable for action rows.
   */
  variant?: 'header' | 'inline'
  /**
   * Controlled mode: when true, the action sheet opens without its own
   * trigger being tapped (e.g. opened from a message context menu). Pair
   * with hideTrigger + onControlledClose so the parent owns visibility.
   */
  controlledOpen?: boolean
  onControlledClose?: () => void
  /** Hide the built-in trigger button (parent drives open state). */
  hideTrigger?: boolean
}

type ScreenState =
  | { kind: 'closed' }
  | { kind: 'menu' }
  | { kind: 'confirm-block' }
  | { kind: 'confirm-unblock' }
  | { kind: 'confirm-mute' }
  | { kind: 'confirm-unmute' }
  | { kind: 'report-reason' }
  | { kind: 'report-notes'; reason: ReportReason }
  | { kind: 'report-success' }

export function UserActionsMenu({
  targetUserId,
  targetUsername,
  onActionComplete,
  variant = 'header',
  controlledOpen = false,
  onControlledClose,
  hideTrigger = false,
}: Props) {
  const [screen, setScreen] = useState<ScreenState>({ kind: 'closed' })
  const [reportNotes, setReportNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { isBlocked, block, unblock } = useUserBlocks()
  const { isMuted, mute, unmute } = useUserMutes()
  const blocked = isBlocked(targetUserId)
  const muted = isMuted(targetUserId)

  // Controlled open: parent flips controlledOpen → jump straight to the menu.
  useEffect(() => {
    if (controlledOpen) setScreen({ kind: 'menu' })
  }, [controlledOpen])

  function close() {
    setScreen({ kind: 'closed' })
    setReportNotes('')
    setSubmitting(false)
    onControlledClose?.()
  }

  async function handleBlock() {
    setSubmitting(true)
    const { error } = await block(targetUserId)
    setSubmitting(false)
    if (error) return
    close()
    onActionComplete?.()
  }

  async function handleUnblock() {
    setSubmitting(true)
    const { error } = await unblock(targetUserId)
    setSubmitting(false)
    if (error) return
    close()
    onActionComplete?.()
  }

  async function handleMute() {
    setSubmitting(true)
    const { error } = await mute(targetUserId)
    setSubmitting(false)
    if (error) return
    close()
    onActionComplete?.()
  }

  async function handleUnmute() {
    setSubmitting(true)
    const { error } = await unmute(targetUserId)
    setSubmitting(false)
    if (error) return
    close()
    onActionComplete?.()
  }

  async function handleReportSubmit(reason: ReportReason) {
    setSubmitting(true)
    const { error } = await submitReport({
      targetKind: 'profile',
      targetId: targetUserId,
      targetUserId,
      reason,
      notes: reportNotes.trim() || undefined,
    })
    setSubmitting(false)
    if (error) return
    setScreen({ kind: 'report-success' })
  }

  // ── Trigger button ──────────────────────────────────────────
  const triggerButton = variant === 'header' ? (
    <button
      style={headerIconBtn()}
      onClick={() => setScreen({ kind: 'menu' })}
      aria-label="More actions"
    >
      <MoreHorizontal size={16} />
    </button>
  ) : (
    <button
      onClick={() => setScreen({ kind: 'menu' })}
      aria-label="More actions"
      style={{
        background: 'none', border: 'none', padding: 4,
        cursor: 'pointer', color: 'var(--fg-40)',
        display: 'inline-flex', alignItems: 'center',
      }}
    >
      <MoreHorizontal size={14} />
    </button>
  )

  return (
    <>
      {!hideTrigger && triggerButton}

      {screen.kind !== 'closed' && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
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
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            {screen.kind === 'menu' && renderMenu()}
            {screen.kind === 'confirm-block' && renderConfirmBlock()}
            {screen.kind === 'confirm-unblock' && renderConfirmUnblock()}
            {screen.kind === 'confirm-mute' && renderConfirmMute()}
            {screen.kind === 'confirm-unmute' && renderConfirmUnmute()}
            {screen.kind === 'report-reason' && renderReportReason()}
            {screen.kind === 'report-notes' && renderReportNotes(screen.reason)}
            {screen.kind === 'report-success' && renderReportSuccess()}
          </div>
        </div>
      )}
    </>
  )

  // ── Inner renderers ─────────────────────────────────────────
  function renderMenu() {
    return (
      <>
        <p style={titleStyle}>
          {targetUsername ? `@${targetUsername}` : 'Account actions'}
        </p>
        <button
          onClick={() => setScreen({ kind: muted ? 'confirm-unmute' : 'confirm-mute' })}
          style={menuItemStyle}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button
          onClick={() => setScreen({ kind: blocked ? 'confirm-unblock' : 'confirm-block' })}
          style={{ ...menuItemStyle, color: blocked ? 'var(--fg)' : '#ef4444' }}
        >
          {blocked ? 'Unblock' : 'Block'}
        </button>
        <button
          onClick={() => setScreen({ kind: 'report-reason' })}
          style={{ ...menuItemStyle, color: '#ef4444' }}
        >
          Report
        </button>
        <button onClick={close} style={cancelBtnStyle}>Cancel</button>
      </>
    )
  }

  function renderConfirmBlock() {
    return (
      <>
        <p style={titleStyle}>
          Block {targetUsername ? `@${targetUsername}` : 'this user'}?
        </p>
        <p style={bodyStyle}>
          They won't be able to see your profile, posts, or messages.
          You won't see theirs either. They won't be notified.
        </p>
        <button onClick={handleBlock} disabled={submitting} style={destructiveBtnStyle}>
          {submitting ? 'Blocking…' : 'Block'}
        </button>
        <button onClick={() => setScreen({ kind: 'menu' })} style={cancelBtnStyle}>
          Cancel
        </button>
      </>
    )
  }

  function renderConfirmUnblock() {
    return (
      <>
        <p style={titleStyle}>
          Unblock {targetUsername ? `@${targetUsername}` : 'this user'}?
        </p>
        <p style={bodyStyle}>
          You'll be able to see each other's content again.
          Previous follows are not restored.
        </p>
        <button onClick={handleUnblock} disabled={submitting} style={primaryBtnStyle}>
          {submitting ? 'Unblocking…' : 'Unblock'}
        </button>
        <button onClick={() => setScreen({ kind: 'menu' })} style={cancelBtnStyle}>
          Cancel
        </button>
      </>
    )
  }

  function renderConfirmMute() {
    return (
      <>
        <p style={titleStyle}>
          Mute {targetUsername ? `@${targetUsername}` : 'this user'}?
        </p>
        <p style={bodyStyle}>
          You won't see their posts in your feed. They can still see and message you.
          They won't be notified.
        </p>
        <button onClick={handleMute} disabled={submitting} style={primaryBtnStyle}>
          {submitting ? 'Muting…' : 'Mute'}
        </button>
        <button onClick={() => setScreen({ kind: 'menu' })} style={cancelBtnStyle}>
          Cancel
        </button>
      </>
    )
  }

  function renderConfirmUnmute() {
    return (
      <>
        <p style={titleStyle}>
          Unmute {targetUsername ? `@${targetUsername}` : 'this user'}?
        </p>
        <p style={bodyStyle}>You'll see their posts in your feed again.</p>
        <button onClick={handleUnmute} disabled={submitting} style={primaryBtnStyle}>
          {submitting ? 'Unmuting…' : 'Unmute'}
        </button>
        <button onClick={() => setScreen({ kind: 'menu' })} style={cancelBtnStyle}>
          Cancel
        </button>
      </>
    )
  }

  function renderReportReason() {
    return (
      <>
        <p style={titleStyle}>
          Why are you reporting {targetUsername ? `@${targetUsername}` : 'this user'}?
        </p>
        {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map(reason => (
          <button
            key={reason}
            onClick={() => setScreen({ kind: 'report-notes', reason })}
            style={menuItemStyle}
          >
            {REPORT_REASON_LABELS[reason]}
          </button>
        ))}
        <button onClick={close} style={cancelBtnStyle}>Cancel</button>
      </>
    )
  }

  function renderReportNotes(reason: ReportReason) {
    return (
      <>
        <p style={titleStyle}>Add details (optional)</p>
        <p style={bodyStyle}>
          Reporting for: <strong>{REPORT_REASON_LABELS[reason]}</strong>
        </p>
        <textarea
          value={reportNotes}
          onChange={e => setReportNotes(e.target.value)}
          placeholder="Add anything that might help us review (optional)…"
          rows={4}
          maxLength={500}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--fg-25)',
            background: 'var(--fg-08)',
            color: 'var(--fg)',
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 14,
            outline: 'none',
            resize: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => handleReportSubmit(reason)}
          disabled={submitting}
          style={destructiveBtnStyle}
        >
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
        <button onClick={() => setScreen({ kind: 'report-reason' })} style={cancelBtnStyle}>
          Back
        </button>
      </>
    )
  }

  function renderReportSuccess() {
    return (
      <>
        <p style={titleStyle}>Report submitted</p>
        <p style={bodyStyle}>
          Thanks. We review every report and take action when warranted.
          You can also block this user to stop seeing their content.
        </p>
        <button onClick={close} style={primaryBtnStyle}>Done</button>
      </>
    )
  }
}

// ── Shared bottom-sheet styles ────────────────────────────────
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 15, fontWeight: 700,
  color: 'var(--fg)',
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 13, color: 'var(--fg-65)',
  lineHeight: 1.5,
}

const menuItemStyle: React.CSSProperties = {
  padding: '13px 16px',
  borderRadius: 10,
  border: '1px solid var(--fg-15)',
  background: 'transparent',
  color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600, fontSize: 14,
  textAlign: 'left',
  cursor: 'pointer',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: 13, borderRadius: 10, border: 'none',
  background: 'var(--fg)', color: 'var(--bg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
}

const destructiveBtnStyle: React.CSSProperties = {
  padding: 13, borderRadius: 10, border: 'none',
  background: '#ef4444', color: '#fff',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: 13, borderRadius: 10,
  border: '1px solid var(--fg-15)',
  background: 'none', color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600, fontSize: 14,
  cursor: 'pointer',
}
