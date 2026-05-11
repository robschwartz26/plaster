import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export function SuspendedBanner() {
  const { user } = useAuth()
  const [suspended, setSuspended] = useState(false)

  useEffect(() => {
    if (!user) { setSuspended(false); return }
    supabase
      .from('profiles')
      .select('is_suspended')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSuspended(!!data?.is_suspended)
      })
  }, [user?.id])

  if (!suspended) return null

  return (
    <div style={{
      background: '#fef3c7',
      borderBottom: '1px solid #f59e0b',
      padding: '10px 16px',
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: 13,
      color: '#78350f',
      lineHeight: 1.4,
      textAlign: 'center',
    }}>
      <strong>Your account is suspended.</strong> You can still browse Plaster, but you can't post, message, or like until your account is reinstated. Contact{' '}
      <a href="mailto:plasterpdx@gmail.com" style={{ color: '#78350f', textDecoration: 'underline' }}>
        plasterpdx@gmail.com
      </a>
      {' '}with questions.
    </div>
  )
}
