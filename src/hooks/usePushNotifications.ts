/**
 * usePushNotifications
 *
 * Registers the current device for push on app launch — APNs on iOS, FCM on
 * Android (Capacitor's push plugin picks the right transport per platform) —
 * captures the device token, and upserts it into device_tokens tied to the
 * current user, tagged with the correct platform. The server dispatches pushes
 * by querying this table per platform.
 *
 * Only runs on native (iOS/Android) — does nothing on web/dev server.
 */

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export function usePushNotifications() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return
    if (!Capacitor.isNativePlatform()) return

    let mounted = true

    async function setup() {
      const permResult = await PushNotifications.requestPermissions()
      if (permResult.receive !== 'granted') {
        console.log('[push] permission not granted:', permResult.receive)
        return
      }
      await PushNotifications.register()
    }

    const registrationListener = PushNotifications.addListener(
      'registration',
      async (token) => {
        if (!mounted) return
        // 'ios' → APNs token, 'android' → FCM token. getPlatform() returns 'ios'
        // on iOS (behavior unchanged) and 'android' on Android.
        const platform = Capacitor.getPlatform()
        console.log(`[push] ${platform} token:`, token.value.slice(0, 12) + '...')

        const { error } = await supabase
          .from('device_tokens')
          .upsert(
            {
              user_id: user!.id,
              token: token.value,
              platform,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,token' },
          )

        if (error) {
          console.error('[push] failed to upsert device token:', error)
        }
      },
    )

    const errorListener = PushNotifications.addListener(
      'registrationError',
      (error) => {
        console.error('[push] registration error:', error)
      },
    )

    const receivedListener = PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('[push] received in foreground:', notification)
        // TODO: surface in-app toast or update notification badge
      },
    )

    const actionListener = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        console.log('[push] tapped:', action)
        // TODO: navigate to relevant content based on action.notification.data
      },
    )

    setup()

    return () => {
      mounted = false
      registrationListener.then(l => l.remove())
      errorListener.then(l => l.remove())
      receivedListener.then(l => l.remove())
      actionListener.then(l => l.remove())
    }
  }, [user?.id])
}
