import { useState } from 'react'
import {
  submitReport,
  REPORT_REASON_LABELS,
  type ReportTargetKind,
  type ReportReason,
} from '@/lib/reports'

interface Props {
  open: boolean
  targetKind: ReportTargetKind
  targetId: string
  targetUserId: string
  onClose: () => void
}

type Screen = 'reason' | 'notes' | 'success'

export function ReportContentSheet({ open, targetKind, targetId, targetUserId, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('reason')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function handleClose() {
    setScreen('reason')
    setReason(null)
    setNotes('')
    setError(null)
    onClose()
  }

  async function handleSubmit() {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    const { error: err } = await submitReport({ targetKind, targetId, targetUserId, reason, notes: notes.trim() || undefined })
    setSubmitting(false)
    if (err) {
      setError('Something went wrong. Please try again.')
    } else {
      setScreen('success')
    }
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
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
        {screen === 'reason' && (
          <>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
              Report content
            </p>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', lineHeight: 1.5 }}>
              What's the issue?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map(r => (
                <button
                  key={r}
                  onClick={() => { setReason(r); setScreen('notes') }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '13px 0',
                    background: 'none', border: 'none',
                    borderBottom: '1px solid var(--fg-08)',
                    cursor: 'pointer',
                    fontFamily: '"Space Grotesk", sans-serif', fontSize: 14,
                    color: 'var(--fg)', textAlign: 'left',
                  }}
                >
                  {REPORT_REASON_LABELS[r]}
                  <span style={{ color: 'var(--fg-40)', fontSize: 16 }}>›</span>
                </button>
              ))}
            </div>
            <button
              onClick={handleClose}
              style={{
                marginTop: 4, padding: 13, borderRadius: 10,
                border: '1px solid var(--fg-15)', background: 'none',
                color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </>
        )}

        {screen === 'notes' && (
          <>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
              Add details (optional)
            </p>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', lineHeight: 1.5 }}>
              Help us understand what happened.
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional context…"
              rows={4}
              style={{
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--fg-25)', background: 'var(--fg-08)',
                color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 14, resize: 'none', outline: 'none',
              }}
            />
            {error && (
              <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'rgb(220,38,38)' }}>
                {error}
              </p>
            )}
            <button
              onClick={handleSubmit}
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
              {submitting ? 'Sending…' : 'Submit report'}
            </button>
            <button
              onClick={() => setScreen('reason')}
              disabled={submitting}
              style={{
                padding: 13, borderRadius: 10,
                border: '1px solid var(--fg-15)', background: 'none',
                color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              Back
            </button>
          </>
        )}

        {screen === 'success' && (
          <>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
              Report submitted
            </p>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', lineHeight: 1.5 }}>
              Thanks for letting us know. We review all reports and take action when needed.
            </p>
            <button
              onClick={handleClose}
              style={{
                padding: 13, borderRadius: 10, border: 'none',
                background: 'var(--fg)', color: 'var(--bg)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
