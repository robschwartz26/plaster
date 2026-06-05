import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Diamond } from '@/components/Diamond'
import { FollowButton } from '@/components/FollowButton'

interface Props {
  onDone: () => void
}

interface NearbyVenue {
  profile_id: string
  username: string
  venue_name: string
  neighborhood: string | null
  avatar_diamond_url: string | null
  distance_km: number
}

type ScreenState = 'softening' | 'loading' | 'results' | 'error'

export function NearbyVenues({ onDone }: Props) {
  const [screen,  setScreen]  = useState<ScreenState>('softening')
  const [venues,  setVenues]  = useState<NearbyVenue[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true
    const timer = setTimeout(() => requestAndLoad(), 700)
    return () => clearTimeout(timer)
  }, [])

  function requestAndLoad() {
    setScreen('loading')

    if (!navigator.geolocation) {
      setMessage("Location isn't available on this device.")
      setScreen('error')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { data, error } = await supabase.rpc('nearby_venue_accounts', {
            user_lat: pos.coords.latitude,
            user_lng: pos.coords.longitude,
            max_results: 12,
          })
          if (error) throw error
          const results = (data ?? []) as NearbyVenue[]
          if (results.length === 0) {
            setMessage("No venue accounts near you yet — more are being added all the time.")
          }
          setVenues(results)
          setScreen('results')
        } catch (err) {
          console.error('[NearbyVenues] RPC error:', err)
          setMessage("Couldn't load nearby venues. You can continue and explore them on the map.")
          setScreen('error')
        }
      },
      (err) => {
        console.log('[NearbyVenues] geolocation error:', err.code, err.message)
        if (err.code === 1) {
          setMessage("Location access is off. You can follow venues from the map anytime.")
        } else {
          setMessage("We couldn't determine your location right now.")
        }
        setVenues([])
        setScreen('results')
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    )
  }

  const isLoading = screen === 'softening' || screen === 'loading'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0c0b0b',
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* Wordmark */}
      <div style={{
        paddingLeft: 24,
        paddingBottom: 18,
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        fontWeight: 700,
        color: '#f0ece3',
        flexShrink: 0,
      }}>
        plaster
      </div>

      {/* Header */}
      <div style={{ paddingLeft: 24, paddingRight: 24, paddingBottom: 16, flexShrink: 0 }}>
        <h2 style={{
          margin: '0 0 6px',
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 700,
          fontSize: 22,
          color: '#f0ece3',
        }}>
          Find your venues
        </h2>
        <p style={{
          margin: 0,
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 14,
          color: 'rgba(240,236,227,0.55)',
          lineHeight: 1.5,
        }}>
          Follow local venues to see their shows on your wall. Your location is used only to suggest nearby spots — it's never stored.
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}>
          <Spinner />
          <p style={{
            margin: 0,
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 14,
            color: 'rgba(240,236,227,0.45)',
          }}>
            Finding venues near you…
          </p>
        </div>
      ) : screen === 'error' ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 32px',
          gap: 14,
        }}>
          <p style={{
            margin: 0,
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 15,
            color: 'rgba(240,236,227,0.65)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            {message ?? "Couldn't load nearby venues."}
          </p>
          <button onClick={requestAndLoad} style={outlineBtn}>Try again</button>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {message && (
            <p style={{
              margin: 0,
              padding: '0 24px 16px',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 14,
              color: 'rgba(240,236,227,0.5)',
              lineHeight: 1.5,
            }}>
              {message}
            </p>
          )}
          {venues.map(v => (
            <div key={v.profile_id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 24px',
              borderBottom: '1px solid rgba(240,236,227,0.07)',
            }}>
              <Diamond diamondUrl={v.avatar_diamond_url} size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#f0ece3',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {v.venue_name}
                </div>
                {v.neighborhood && (
                  <div style={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontSize: 12,
                    color: 'rgba(240,236,227,0.45)',
                    marginTop: 2,
                  }}>
                    {v.neighborhood}
                  </div>
                )}
              </div>
              <FollowButton targetUserId={v.profile_id} size="small" />
            </div>
          ))}
          <div style={{ height: 24 }} />
        </div>
      )}

      {/* Footer */}
      <div style={{
        flexShrink: 0,
        padding: '12px 24px 16px',
        borderTop: '1px solid rgba(240,236,227,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <button onClick={onDone} style={primaryBtn}>Continue</button>
        <button onClick={onDone} style={skipBtn}>Skip for now</button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 28,
      height: 28,
      borderRadius: '50%',
      border: '2.5px solid rgba(240,236,227,0.12)',
      borderTopColor: 'rgba(240,236,227,0.55)',
      animation: 'nvSpin 0.8s linear infinite',
    }}>
      <style>{`@keyframes nvSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '14px 0',
  borderRadius: 14,
  border: 'none',
  background: '#f0ece3',
  color: '#0c0b0b',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
}

const skipBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(240,236,227,0.40)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  padding: '4px',
  cursor: 'pointer',
  textAlign: 'center',
  width: '100%',
}

const outlineBtn: React.CSSProperties = {
  padding: '11px 28px',
  borderRadius: 10,
  border: '1.5px solid rgba(240,236,227,0.25)',
  background: 'transparent',
  color: 'rgba(240,236,227,0.75)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
