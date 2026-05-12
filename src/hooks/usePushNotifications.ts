/**
 * usePushNotifications
 *
 * Registers the current device with APNS (iOS) on app launch, captures the
 * device token, and upserts it into the device_tokens table tied to the
 * current user. The server can then dispatch pushes by querying this table.
 *
 * Only runs on native iOS — does nothing on web/dev server.
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
        console.log('[push] APNS token:', token.value.slice(0, 12) + '...')

        const { error } = await supabase
          .from('device_tokens')
          .upsert(
            {
              user_id: user!.id,
              token: token.value,
              platform: 'ios',
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
