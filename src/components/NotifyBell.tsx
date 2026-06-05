import { useState, useEffect, useRef } from 'react'
import { BellOff, BellRing } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  accountId: string
  accountType: string | null | undefined
  size?: 'large' | 'small'
}

export function NotifyBell({ accountId, accountType, size = 'large' }: Props) {
  const { user } = useAuth()
  const [subscribed,  setSubscribed]  = useState(false)
  const [busy,        setBusy]        = useState(false)
  const [wiggling,    setWiggling]    = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipFade, setTooltipFade] = useState<'in' | 'out' | 'hidden'>('hidden')
  const teaserRan = useRef(false)

  const applicable =
    !!user &&
    user.id !== accountId &&
    (accountType === 'venue' || accountType === 'artist')

  useEffect(() => {
    if (!applicable) return

    let cancelled = false

    Promise.all([
      supabase
        .from('show_alert_subscriptions')
        .select('id')
        .eq('subscriber_id', user!.id)
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase.rpc('follow_status', { other_user_id: accountId }),
    ]).then(([subRes, followRes]) => {
      if (cancelled) return
      const alreadySubscribed = !!subRes.data
      const followSt = followRes.data as string | null
      const alreadyFollowing = followSt === 'following' || followSt === 'mutual'
      setSubscribed(alreadySubscribed)

      if (!alreadySubscribed && !alreadyFollowing && !teaserRan.current) {
        teaserRan.current = true
        const t = setTimeout(() => {
          if (cancelled) return
          setWiggling(true)
          setShowTooltip(true)
          setTooltipFade('in')

          // stop wiggle after animation duration
          setTimeout(() => { if (!cancelled) setWiggling(false) }, 900)

          // hold tooltip then fade out
          setTimeout(() => { if (!cancelled) setTooltipFade('out') }, 2400 + 300)
          setTimeout(() => { if (!cancelled) { setShowTooltip(false); setTooltipFade('hidden') } }, 2400 + 300 + 400)
        }, 700)
        return () => clearTimeout(t)
      }
    })

    return () => { cancelled = true }
  }, [applicable, user?.id, accountId])

  if (!applicable) return null

  async function toggle() {
    if (busy || !user) return
    setBusy(true)
    // dismiss teaser if still showing
    setWiggling(false)
    setShowTooltip(false)
    setTooltipFade('hidden')
    const next = !subscribed
    setSubscribed(next)
    if (next) {
      await supabase.from('show_alert_subscriptions').insert({
        subscriber_id: user.id,
        account_id: accountId,
      })
    } else {
      await supabase.from('show_alert_subscriptions').delete()
        .eq('subscriber_id', user.id)
        .eq('account_id', accountId)
    }
    setBusy(false)
  }

  const iconSize = size === 'small' ? 14 : 16

  const btnSize: React.CSSProperties = size === 'small'
    ? { padding: '6px 10px', borderRadius: 20 }
    : { padding: '9px 12px', borderRadius: 10 }

  const subscribedStyle: React.CSSProperties = {
    ...btnSize,
    border: 'none',
    background: '#A855F7',
    color: '#fff',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  const unsubscribedStyle: React.CSSProperties = {
    ...btnSize,
    border: '1.5px solid var(--fg-25)',
    background: 'transparent',
    color: 'var(--fg-55)',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  const tooltipOpacity = tooltipFade === 'in' ? 1 : 0
  const tooltipTranslate = tooltipFade === 'in' ? 'translateY(0)' : 'translateY(-4px)'

  return (
    <>
      <style>{`
        @keyframes bellWiggle {
          0%   { transform: rotate(0deg); }
          10%  { transform: rotate(18deg); }
          25%  { transform: rotate(-16deg); }
          40%  { transform: rotate(14deg); }
          55%  { transform: rotate(-10deg); }
          70%  { transform: rotate(7deg); }
          85%  { transform: rotate(-4deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={toggle}
          disabled={busy}
          aria-label={subscribed ? 'Turn off show alerts' : 'Get show alerts'}
          style={subscribed ? subscribedStyle : unsubscribedStyle}
        >
          <span style={{
            display: 'flex',
            alignItems: 'center',
            transformOrigin: '50% 5px',
            animation: wiggling ? 'bellWiggle 0.9s ease both' : 'none',
          }}>
            {subscribed
              ? <BellRing size={iconSize} strokeWidth={1.75} />
              : wiggling
                ? <BellRing size={iconSize} strokeWidth={1.75} />
                : <BellOff  size={iconSize} strokeWidth={1.75} />
            }
          </span>
        </button>

        {showTooltip && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 9px)',
            right: 0,
            zIndex: 120,
            background: 'rgba(26,25,24,0.98)',
            border: '1px solid rgba(240,236,227,0.12)',
            borderRadius: 8,
            padding: '7px 11px',
            whiteSpace: 'nowrap',
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(240,236,227,0.75)',
            pointerEvents: 'none',
            opacity: tooltipOpacity,
            transform: tooltipTranslate,
            transition: 'opacity 300ms ease, transform 300ms ease',
          }}>
            {/* Pointer arrow at top */}
            <div style={{
              position: 'absolute',
              top: -5,
              right: 14,
              width: 8,
              height: 8,
              background: 'rgba(26,25,24,0.98)',
              border: '1px solid rgba(240,236,227,0.12)',
              borderRight: 'none',
              borderBottom: 'none',
              transform: 'rotate(45deg)',
            }} />
            Get notified for shows &amp; events
          </div>
        )}
      </div>
    </>
  )
}
