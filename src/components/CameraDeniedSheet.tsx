import { BottomSheet } from '@/components/BottomSheet'
import { openAppSettings } from '@/lib/pickImage'

interface Props {
  open: boolean
  which: 'camera' | 'photos'
  onClose: () => void
  onChooseLibrary?: () => void
}

export function CameraDeniedSheet({ open, which, onClose, onChooseLibrary }: Props) {
  const isCamera = which === 'camera'
  const title = isCamera ? 'Camera access is off' : 'Photo access is off'
  const accessType = isCamera ? 'camera' : 'photos'

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
        <p style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 14,
          color: 'var(--fg-55)',
          lineHeight: 1.6,
          margin: 0,
        }}>
          To use this, enable {accessType} access for Plaster in Settings.
          {onChooseLibrary && ' You can also choose a photo from your library.'}
        </p>

        <button
          onClick={() => { openAppSettings(); onClose() }}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 14,
            border: 'none',
            background: 'var(--fg)',
            color: 'var(--bg)',
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Open Settings
        </button>

        {onChooseLibrary && (
          <button
            onClick={() => { onChooseLibrary(); onClose() }}
            style={{
              width: '100%',
              padding: '13px 0',
              borderRadius: 14,
              border: '1.5px solid var(--fg-25)',
              background: 'transparent',
              color: 'var(--fg)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Choose from library
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-55)',
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 14,
            cursor: 'pointer',
            padding: '8px 0',
          }}
        >
          Not now
        </button>
      </div>
    </BottomSheet>
  )
}
