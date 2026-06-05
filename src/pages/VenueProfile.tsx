import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PlasterHeader, headerIconBtn } from '@/components/PlasterHeader'
import { AccountProfile } from '@/components/AccountProfile'

export function VenueProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PlasterHeader
        leftAction={
          <button style={headerIconBtn()} onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {id && <AccountProfile venueId={id} />}
      </div>
    </div>
  )
}
