import { BottomSheet } from './BottomSheet'

interface Props {
  open: boolean
  onClose: () => void
  context: 'wall' | 'map'
}

export function PreferencesPanel({ open, onClose, context }: Props) {
  const items = context === 'wall'
    ? [
        { label: 'Sort order', description: 'Chronological / Most liked / Most viewed' },
        { label: 'Time of day', description: 'Early shows / Late shows' },
        { label: 'Free events only', description: 'Hide ticketed shows' },
        { label: 'Age requirement', description: 'All ages / 21+' },
      ]
    : [
        { label: 'Followed venues only', description: "Hide venues you don't follow" },
        { label: 'Map style', description: 'Light / Dark / Satellite' },
      ]

  return (
    <BottomSheet open={open} onClose={onClose} title="Preferences">
      <div style={{
        background: 'var(--fg-08)',
        border: '1px solid var(--fg-15)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
      }}>
        <p style={{ margin: 0, fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A855F7' }}>
          Coming soon
        </p>
        <p style={{ margin: '4px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-65)', lineHeight: 1.4 }}>
          These controls are in design — they'll be live in a future update.
        </p>
      </div>

      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 0',
          borderBottom: '1px solid var(--fg-08)',
          opacity: 0.5,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>
              {item.label}
            </p>
            <p style={{ margin: '2px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)' }}>
              {item.description}
            </p>
          </div>
          <div style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            background: 'var(--fg-15)',
            position: 'relative',
            flexShrink: 0,
          }}>
            <span style={{
              position: 'absolute',
              top: 3,
              left: 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
            }} />
          </div>
        </div>
      ))}
    </BottomSheet>
  )
}
