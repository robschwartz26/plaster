import { useEffect, useState } from 'react'
import { detectMobileOS, storeUrl, storeName, APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appStore'

/**
 * /get — one short link that lands everybody on the right store listing.
 *
 * A QR code can't branch by device, and the posters go up where we have no idea
 * what anyone is carrying. So the QR points here and the redirect happens on
 * arrival: iPhone to the App Store, Android to Google Play, anything else to a
 * page with both. Printable on its own too — "plasterthewall.com/get" fits on a
 * flyer better than a store URL does.
 *
 * The page still renders behind the redirect, so a blocked or slow jump leaves
 * a real page rather than a white screen, and a phone that lands here by hand
 * can still pick for itself.
 */
export default function GetTheApp() {
  const os = detectMobileOS()
  const [redirecting, setRedirecting] = useState(!!os)

  useEffect(() => {
    if (!os) return
    // A beat before leaving: an instant location change during the first paint
    // gets swallowed by some in-app browsers, and it reads as a crash.
    const t = setTimeout(() => window.location.replace(storeUrl(os)), 250)
    const give = setTimeout(() => setRedirecting(false), 2500)
    return () => { clearTimeout(t); clearTimeout(give) }
  }, [os])

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--fg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 18, padding: 28, textAlign: 'center',
    }}>
      <p style={{ margin: 0, fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 38, lineHeight: 1 }}>
        plaster
      </p>
      <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, lineHeight: 1.5, color: 'var(--fg-65)', maxWidth: 320 }}>
        {redirecting && os
          ? `Opening ${storeName(os)}…`
          : 'Portland’s living poster wall. Get it on your phone.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
        <a href={APP_STORE_URL} style={storeBtn}>iPhone — App Store</a>
        <a href={PLAY_STORE_URL} style={storeBtn}>Android — Google Play</a>
        <a href="/" style={{
          padding: '8px 0', color: 'var(--fg-55)', textDecoration: 'underline',
          fontFamily: '"Space Grotesk", sans-serif', fontSize: 13,
        }}>
          or browse the wall here
        </a>
      </div>
    </div>
  )
}

const storeBtn: React.CSSProperties = {
  padding: '14px 0', borderRadius: 14, background: '#A855F7', color: '#fff',
  textDecoration: 'none', textAlign: 'center',
  fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700,
}
