import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Diamond } from '@/components/Diamond'
import { AccountTypeBadge } from '@/components/AccountTypeBadge'

interface VARequest {
  id: string
  username: string | null
  pending_account_type: 'artist' | 'venue'
  avatar_url: string | null
  avatar_diamond_url: string | null
  created_at: string
}

interface Props {
  onCountChange?: (count: number) => void
}

export function AdminVARequests({ onCountChange }: Props = {}) {
  const [requests, setRequests] = useState<VARequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, pending_account_type, avatar_url, avatar_diamond_url, created_at')
      .not('pending_account_type', 'is', null)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[AdminVARequests] fetch failed', error)
      setRequests([])
      onCountChange?.(0)
    } else {
      const rows = (data ?? []) as VARequest[]
      setRequests(rows)
      onCountChange?.(rows.length)
    }
    setLoading(false)
  }, [onCountChange])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  async function handleApprove(userId: string) {
    setBusyId(userId)
    const { error } = await supabase.rpc('admin_approve_va_request', { p_user_id: userId })
    setBusyId(null)
    if (error) {
      console.error('[AdminVARequests] approve failed', error)
      alert(`Approve failed: ${error.message}`)
      return
    }
    fetchRequests()
  }

  async function handleDecline(userId: string) {
    if (!confirm('Decline this VA request? The user will be notified.')) return
    setBusyId(userId)
    const { error } = await supabase.rpc('admin_decline_va_request', { p_user_id: userId })
    setBusyId(null)
    if (error) {
      console.error('[AdminVARequests] decline failed', error)
      alert(`Decline failed: ${error.message}`)
      return
    }
    fetchRequests()
  }

  if (loading) {
    return (
      <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13 }}>
        Loading…
      </p>
    )
  }

  if (requests.length === 0) {
    return (
      <p style={{ color: 'var(--fg-55)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontStyle: 'italic' }}>
        No pending VA requests.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {requests.map(r => (
        <div
          key={r.id}
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            border: '1px solid var(--fg-15)',
            background: 'transparent',
            fontFamily: '"Space Grotesk", sans-serif',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Diamond
              diamondUrl={r.avatar_diamond_url}
              fallbackUrl={r.avatar_url}
              size={42}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>
                  @{r.username ?? '(no username)'}
                </span>
                <AccountTypeBadge accountType={r.pending_account_type} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-40)', marginTop: 2 }}>
                Requested {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleApprove(r.id)}
              disabled={busyId === r.id}
              style={{
                flex: 1,
                padding: '9px 0',
                borderRadius: 8,
                border: 'none',
                background: 'var(--fg)',
                color: 'var(--bg)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                fontSize: 13,
                cursor: busyId === r.id ? 'wait' : 'pointer',
                opacity: busyId === r.id ? 0.6 : 1,
              }}
            >
              {busyId === r.id ? '…' : 'Approve'}
            </button>
            <button
              onClick={() => handleDecline(r.id)}
              disabled={busyId === r.id}
              style={{
                flex: 1,
                padding: '9px 0',
                borderRadius: 8,
                border: '1px solid var(--fg-25)',
                background: 'transparent',
                color: 'var(--fg-65)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600,
                fontSize: 13,
                cursor: busyId === r.id ? 'wait' : 'pointer',
                opacity: busyId === r.id ? 0.6 : 1,
              }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
