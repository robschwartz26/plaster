/**
 * Shared image-picker helper backed by @capacitor/camera.
 * All avatar acquisition flows (onboarding, profile edit) funnel through here
 * so permission handling and cancellation detection behave identically everywhere.
 */
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export type PickImageOutcome =
  | { status: 'success'; file: File }
  | { status: 'cancelled' }
  | { status: 'denied'; which: 'camera' | 'photos' }
  | { status: 'error'; message: string }

/**
 * Opens the OS app-settings page for Plaster so the user can re-enable access.
 * Uses the `app-settings:` URL scheme, which Capacitor's WebView honours on iOS.
 * On Android this is a best-effort no-op until the Android project is set up.
 */
export function openAppSettings(): void {
  window.open('app-settings:', '_system')
}

async function webPathToFile(webPath: string, fallbackName: string): Promise<File> {
  const res = await fetch(webPath)
  const blob = await res.blob()
  return new File([blob], fallbackName, { type: blob.type || 'image/jpeg' })
}

function isCancelError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('cancel') ||
    msg.includes('user cancelled photos app') ||
    msg.includes('no image picked') ||
    msg.includes('user dismissed')
  )
}

/** Capture a photo with the device camera. */
export async function pickFromCamera(): Promise<PickImageOutcome> {
  try {
    const perms = await Camera.checkPermissions()

    if (perms.camera === 'denied') {
      return { status: 'denied', which: 'camera' }
    }
    if (perms.camera === 'prompt' || perms.camera === 'prompt-with-rationale') {
      const granted = await Camera.requestPermissions({ permissions: ['camera'] })
      if (granted.camera === 'denied') {
        return { status: 'denied', which: 'camera' }
      }
    }

    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
      allowEditing: false,
    })

    if (!photo.webPath) {
      return { status: 'error', message: 'No image path returned from camera' }
    }

    const file = await webPathToFile(photo.webPath, `avatar-${Date.now()}.jpeg`)
    return { status: 'success', file }
  } catch (err) {
    if (isCancelError(err)) return { status: 'cancelled' }
    return { status: 'error', message: err instanceof Error ? err.message : 'Camera error' }
  }
}

/** Pick a photo from the device photo library. */
export async function pickFromLibrary(): Promise<PickImageOutcome> {
  try {
    const perms = await Camera.checkPermissions()

    // 'limited' = user granted access to specific photos — treat as allowed
    if (perms.photos === 'denied') {
      return { status: 'denied', which: 'photos' }
    }
    if (perms.photos === 'prompt' || perms.photos === 'prompt-with-rationale') {
      const granted = await Camera.requestPermissions({ permissions: ['photos'] })
      if (granted.photos === 'denied') {
        return { status: 'denied', which: 'photos' }
      }
    }

    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 90,
      allowEditing: false,
    })

    if (!photo.webPath) {
      return { status: 'error', message: 'No image path returned from library' }
    }

    const file = await webPathToFile(photo.webPath, `avatar-${Date.now()}.jpeg`)
    return { status: 'success', file }
  } catch (err) {
    if (isCancelError(err)) return { status: 'cancelled' }
    return { status: 'error', message: err instanceof Error ? err.message : 'Library error' }
  }
}
