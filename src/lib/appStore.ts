import { Capacitor } from '@capacitor/core'

// Where to send someone who found Plaster on the web and should be holding the
// app instead. The poster QRs point at plasterthewall.com, so the visitor could
// be on anything — an iPhone outside the venue, an Android on the bus, a laptop.
// This is the one place that decides which.

export const APP_STORE_URL = 'https://apps.apple.com/us/app/plaster-the-wall/id6771572698'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.plaster.the.wall.app'

/** The App Store's numeric id, for the Smart App Banner meta tag in index.html. */
export const APPLE_APP_ID = '6771572698'

export type MobileOS = 'ios' | 'android'

/**
 * Which phone this is, or null for a desktop (and for anything we can't tell).
 *
 * User-agent sniffing, which is normally a mistake, but it is the only signal
 * that answers "which store listing do I link to" — there is no feature to
 * detect. Getting it wrong is cheap: the fallback is both links, never a dead
 * end. iPadOS is the awkward one; since iOS 13 it reports a Macintosh UA, so a
 * Mac that also reports touch points is an iPad.
 */
export function detectMobileOS(): MobileOS | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/macintosh/i.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios'
  return null
}

export function storeUrl(os: MobileOS): string {
  return os === 'ios' ? APP_STORE_URL : PLAY_STORE_URL
}

export function storeName(os: MobileOS): string {
  return os === 'ios' ? 'the App Store' : 'Google Play'
}

/**
 * Should this visitor be offered the app at all?
 *
 * Only on the web. Inside the native shell the answer is always no — the app is
 * what they are already holding, and a "get the app" button there would be
 * absurd (and, pointing at a store listing from inside the app, the kind of
 * thing review notices).
 */
export function canOfferApp(): boolean {
  return !Capacitor.isNativePlatform()
}
