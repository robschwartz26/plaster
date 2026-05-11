import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Status = 'open' | 'reviewing' | 'resolved' | 'dismissed'
type Action = 'dismiss' | 'delete_content' | 'warn_user' | 'suspend_user'

interface ReportRow {
  id: string
  target_kind: 'profile' | 'wall_post' | 'message'
  target_id: string
  target_user_id: string
  reason: string
  notes: string | null
  status: Status
  admin_notes: string | null
  reviewed_at: string | null
  created_at: string

  // Joined
  reporter_username: string | null
  target_username: string | null
  target_is_suspended: boolean | null
  content_body: string | null
  content_deleted_at: string | null
}

const STATUS_TABS: Status[] = ['open', 'reviewing', 'resolved', 'dismissed']

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  sexual_content: 'Sexual / inappropriate',
  violence: 'Violence or threats',
  self_harm: 'Self-harm / suicide',
  other: 'Other',
}

interface Props {
  onReportsChanged?: () => void
}

export function AdminReports({ onReportsChanged }: Props = {}) {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [filter, setFilter] = useState<Status>('open')
  const [loading, setLoading] = useState(true)
  const [activeReport, setActiveReport] = useState<ReportRow | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)

    const { data: rawReports, error } = await supabase
      .from('content_reports')
      .select('*')
      .eq('status', filter)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !rawReports) {
      console.error('[AdminReports] fetch failed', error)
      setReports([])
      setLoading(false)
      return
    }

    const userIds = new Set<string>()
    const wallPostIds: string[] = []
    const messageIds: string[] = []
    for (const r of rawReports) {
      userIds.add(r.reporter_id)
      userIds.add(r.target_user_id)
      if (r.target_kind === 'wall_post') wallPostIds.push(r.target_id)
      else if (r.target_kind === 'message') messageIds.push(r.target_id)
    }

    const [profilesResult, postsResult, messagesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, is_suspended')
        .in('id', [...userIds]),
      wallPostIds.length > 0
        ? supabase
            .from('event_wall_posts')
            .select('id, body, deleted_at')
            .in('id', wallPostIds)
        : Promise.resolve({ data: [], error: null }),
      messageIds.length > 0
        ? supabase
            .from('messages')
            .select('id, body, deleted_at')
            .in('id', messageIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    type ProfileLite = { id: string; username: string | null; is_suspended: boolean | null }
    type ContentLite = { id: string; body: string | null; deleted_at: string | null }

    const profileMap = new Map<string, ProfileLite>(
      ((profilesResult.data ?? []) as ProfileLite[]).map(p => [p.id, p])
    )
    const postMap = new Map<string, ContentLite>(
      ((postsResult.data ?? []) as ContentLite[]).map(p => [p.id, p])
    )
    const messageMap = new Map<string, ContentLite>(
      ((messagesResult.data ?? []) as ContentLite[]).map(m => [m.id, m])
    )

    const rows: ReportRow[] = (rawReports as any[]).map(r => {
      const reporter = profileMap.get(r.reporter_id)
      const targetUser = profileMap.get(r.target_user_id)
      let content: ContentLite | undefined
      if (r.target_kind === 'wall_post') content = postMap.get(r.target_id)
      else if (r.target_kind === 'message') content = messageMap.get(r.target_id)

      return {
        ...r,
        reporter_username: reporter?.username ?? null,
        target_username: targetUser?.username ?? null,
        target_is_suspended: targetUser?.is_suspended ?? false,
        content_body: content?.body ?? null,
        content_deleted_at: content?.deleted_at ?? null,
      }
    })

    setReports(rows)
    setLoading(false)
    onReportsChanged?.()
  }, [filter, onReportsChanged])

  useEffect(() => { fetchReports() }, [fetchReports])

  return (
    <>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--fg-15)',
        marginBottom: 16,
      }}>
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              borderBottom: filter === s ? '2px solid var(--fg)' : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: filter === s ? 700 : 500,
              fontSize: 13,
              color: filter === s ? 'var(--fg)' : 'var(--fg-55)',
              textTransform: 'capitalize',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
          Loading…
        </p>
      ) : reports.length === 0 ? (
        <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontStyle: 'italic' }}>
          No {filter} reports.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map(r => (
            <ReportCard
              key={r.id}
              report={r}
              onClick={() => setActiveReport(r)}
            />
          ))}
        </div>
      )}

      {activeReport && (
        <ReportDrawer
          report={activeReport}
          onClose={() => setActiveReport(null)}
          onResolved={() => { setActiveReport(null); fetchReports() }}
        />
      )}
    </>
  )
}

function ReportCard({ report, onClick }: { report: ReportRow; onClick: () => void }) {
  const dt = new Date(report.created_at).toLocaleString()
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid var(--fg-15)',
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: '"Space Grotesk", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
          @{report.reporter_username ?? '—'} → @{report.target_username ?? '—'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--fg-40)' }}>{dt}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-65)' }}>
        <strong style={{ textTransform: 'capitalize' }}>{report.target_kind.replace('_', ' ')}</strong>
        {' • '}
        {REASON_LABELS[report.reason] ?? report.reason}
      </div>
      {report.content_body && (
        <div style={{
          padding: '8px 10px',
          background: 'var(--fg-08)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--fg-80)',
          fontStyle: report.content_deleted_at ? 'italic' : 'normal',
          lineHeight: 1.4,
          maxHeight: 100,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {report.content_deleted_at ? '[deleted] ' : ''}
          {report.content_body}
        </div>
      )}
      {report.notes && (
        <div style={{ fontSize: 11, color: 'var(--fg-55)', fontStyle: 'italic' }}>
          Reporter notes: {report.notes}
        </div>
      )}
    </button>
  )
}

function ReportDrawer({
  report, onClose, onResolved,
}: {
  report: ReportRow
  onClose: () => void
  onResolved: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [adminNotes, setAdminNotes] = useState(report.admin_notes ?? '')
  const [warningMessage, setWarningMessage] = useState('')
  const [showWarningInput, setShowWarningInput] = useState(false)

  async function handleAction(action: Action) {
    setSubmitting(true)
    const args: Record<string, unknown> = {
      p_report_id: report.id,
      p_action: action,
      p_admin_notes: adminNotes.trim() || null,
    }
    if (action === 'warn_user') {
      args.p_warning_message = warningMessage.trim() || null
    }
    const { error } = await supabase.rpc('admin_resolve_report', args as any)
    setSubmitting(false)
    if (error) {
      console.error('[AdminReports] resolve failed', error)
      return
    }
    onResolved()
  }

  async function handleSetReviewing() {
    setSubmitting(true)
    const { error } = await supabase.rpc('admin_set_report_reviewing', { p_report_id: report.id })
    setSubmitting(false)
    if (!error) onResolved()
  }

  async function handleUnsuspend() {
    if (!report.target_user_id) return
    setSubmitting(true)
    const { error } = await supabase.rpc('admin_unsuspend_user', { p_user_id: report.target_user_id })
    setSubmitting(false)
    if (!error) onResolved()
  }

  return (
    <div
      onClick={() => !submitting && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(0,0,0,0.6)',
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
          display: 'flex', flexDirection: 'column', gap: 14,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontSize: 20, fontWeight: 900 }}>
          Report details
        </p>

        <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.6 }}>
          <div><strong>Reporter:</strong> @{report.reporter_username ?? '—'}</div>
          <div>
            <strong>Target:</strong> @{report.target_username ?? '—'}{' '}
            {report.target_is_suspended && <span style={{ color: '#dc2626' }}>(suspended)</span>}
          </div>
          <div><strong>Kind:</strong> {report.target_kind}</div>
          <div><strong>Reason:</strong> {REASON_LABELS[report.reason] ?? report.reason}</div>
          <div><strong>Submitted:</strong> {new Date(report.created_at).toLocaleString()}</div>
          {report.reviewed_at && (
            <div><strong>Reviewed:</strong> {new Date(report.reviewed_at).toLocaleString()}</div>
          )}
          {report.notes && (
            <div style={{ marginTop: 4 }}><strong>Reporter notes:</strong> {report.notes}</div>
          )}
        </div>

        {report.content_body && (
          <div style={{
            padding: '10px 12px',
            background: 'var(--fg-08)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--fg-80)',
            lineHeight: 1.5,
            fontFamily: '"Space Grotesk", sans-serif',
            fontStyle: report.content_deleted_at ? 'italic' : 'normal',
          }}>
            <div style={{ fontSize: 10, color: 'var(--fg-40)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Reported content {report.content_deleted_at && '— DELETED'}
            </div>
            {report.content_body}
          </div>
        )}

        <textarea
          value={adminNotes}
          onChange={e => setAdminNotes(e.target.value)}
          placeholder="Admin notes (optional, internal)"
          rows={2}
          maxLength={500}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--fg-25)',
            background: 'var(--fg-08)',
            color: 'var(--fg)',
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 13,
            outline: 'none',
            resize: 'none',
          }}
        />

        {showWarningInput && (
          <textarea
            value={warningMessage}
            onChange={e => setWarningMessage(e.target.value)}
            placeholder={`Warning to send to @${report.target_username}`}
            rows={2}
            maxLength={500}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #f59e0b',
              background: '#fef3c7',
              color: '#78350f',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 13,
              outline: 'none',
              resize: 'none',
            }}
          />
        )}

        {(report.status === 'open' || report.status === 'reviewing') && (
          <>
            {report.status === 'open' && (
              <button onClick={handleSetReviewing} disabled={submitting} style={btnSecondary}>
                Mark as reviewing
              </button>
            )}
            <button onClick={() => handleAction('dismiss')} disabled={submitting} style={btnSecondary}>
              Dismiss (no action)
            </button>
            {report.target_kind !== 'profile' && (
              <button
                onClick={() => handleAction('delete_content')}
                disabled={submitting || !!report.content_deleted_at}
                style={btnDestructive}
              >
                {report.content_deleted_at ? 'Content already deleted' : 'Delete content'}
              </button>
            )}
            {!showWarningInput ? (
              <button onClick={() => setShowWarningInput(true)} disabled={submitting} style={btnSecondary}>
                Warn user
              </button>
            ) : (
              <button onClick={() => handleAction('warn_user')} disabled={submitting} style={btnDestructive}>
                Send warning
              </button>
            )}
            <button
              onClick={() => handleAction('suspend_user')}
              disabled={submitting || report.target_is_suspended === true}
              style={btnDestructive}
            >
              {report.target_is_suspended ? 'User already suspended' : 'Soft-suspend user'}
            </button>
          </>
        )}

        {(report.status === 'resolved' || report.status === 'dismissed') && report.target_is_suspended && (
          <button onClick={handleUnsuspend} disabled={submitting} style={btnSecondary}>
            Unsuspend @{report.target_username}
          </button>
        )}

        <button onClick={onClose} disabled={submitting} style={btnCancel}>
          Close
        </button>
      </div>
    </div>
  )
}

const btnSecondary: React.CSSProperties = {
  padding: 12, borderRadius: 10,
  border: '1px solid var(--fg-25)',
  background: 'transparent', color: 'var(--fg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600, fontSize: 14,
  cursor: 'pointer',
}

const btnDestructive: React.CSSProperties = {
  padding: 12, borderRadius: 10, border: 'none',
  background: '#ef4444', color: '#fff',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
}

const btnCancel: React.CSSProperties = {
  padding: 12, borderRadius: 10,
  border: '1px solid var(--fg-15)',
  background: 'none', color: 'var(--fg-65)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600, fontSize: 14,
  cursor: 'pointer',
}
